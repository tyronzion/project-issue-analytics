import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPia, isHttpsUrl } from '../server/pia.js';

process.env.PIA_DB_PATH = ':memory:';
const TODAY = Date.parse('2026-10-15T02:00:00Z');
const policies = [
  { id: 'p1', product: 'NEO', state: 'approved', status: 'approved', version: '1', approvedAt: Date.parse('2025-04-24T00:42:19Z'), submittedAt: Date.parse('2024-10-28T06:36:11Z'), url: 'https://uberticket.cloudstaff.com/admin/policies/p1/view' },
  { id: 'p2', product: 'Jobs', state: 'approved', status: 'approved', version: '1', approvedAt: Date.parse('2026-06-01T02:00:00Z'), submittedAt: Date.parse('2026-05-01T02:00:00Z') },
];

// Stands in for auth/auth.js: the role comes from a test header.
async function server(opts = {}) {
  const pia = await createPia({ root: '/unused', getPolicies: () => policies, getTrackerApps: () => [{ name: 'NEO' }, { name: 'Jobs' }, { name: 'Payroll' }], isAdmin: (req) => req.user?.role === 'admin', now: () => TODAY, log: () => {}, ...opts });
  pia.sync();
  const outer = express();
  outer.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (role) req.user = { name: `Test ${role}`, email: `${role}@example.com`, role };
    next();
  });
  outer.use('/api/pia', pia.app);
  const http = outer.listen(0);
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${http.address().port}/api/pia`;
  const call = async (method, path, { role, body, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(role ? { 'x-test-role': role } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return { call, close: () => new Promise((r) => http.close(r)) };
}

let s;
before(async () => { s = await server(); });
after(() => s.close());

const appId = async (name) => (await s.call('GET', '/apps', { role: 'user' })).body.apps.find((a) => a.name === name).id;

test('the app list carries each app\'s reassessment status', async () => {
  const { status, body } = await s.call('GET', '/apps', { role: 'user' });
  assert.equal(status, 200);
  assert.equal(body.today, '2026-10-15');
  assert.equal(body.dueSoonDays, 30);
  const by = Object.fromEntries(body.apps.map((a) => [a.name, a]));
  assert.equal(by.NEO.status, 'overdue');
  assert.equal(by.NEO.dueOn, '2026-04-24');
  assert.equal(by.Jobs.status, 'current');
  assert.equal(by.Payroll.status, 'never');
});

test('users can read but every change is refused (403)', async () => {
  const id = await appId('NEO');
  const writes = [
    ['POST', '/apps', { name: 'New' }],
    ['PATCH', `/apps/${id}`, { hidden: true, hiddenReason: 'x' }],
    ['POST', `/apps/${id}/reassessments`, { assessedOn: '2026-10-01', reportUrl: 'https://x/r' }],
    ['DELETE', '/reassessments/1'],
    ['POST', '/sync'],
    ['POST', '/links', { product: 'X', appId: id }],
    ['DELETE', '/links/x'],
    ['PUT', '/settings', { dueSoonDays: 10 }],
  ];
  for (const [method, path, body] of writes) {
    assert.equal((await s.call(method, path, { role: 'user', body })).status, 403, `${method} ${path}`);
    assert.equal((await s.call(method, path, { body })).status, 403, `${method} ${path} without a user`);
  }
  assert.equal((await s.call('GET', `/apps/${id}`, { role: 'user' })).status, 200);
});

test('without an admin check, changes are refused (fails closed)', async () => {
  const open = await server({ isAdmin: null });
  try {
    assert.equal((await open.call('POST', '/apps', { role: 'admin', body: { name: 'X' } })).status, 403);
  } finally {
    await open.close();
  }
});

test('an admin records a reassessment; it resets the cycle and is logged under the signed-in user', async () => {
  const id = await appId('NEO');
  const bad = [
    { assessedOn: '2026-10-16', reportUrl: 'https://x/r' },           // future
    { assessedOn: '2026-02-30', reportUrl: 'https://x/r' },           // not a date
    { assessedOn: '2026-10-01', reportUrl: 'javascript:alert(1)' },   // not https
    { assessedOn: '2026-10-01', reportUrl: 'http://x/r' },
    { assessedOn: '2026-10-01' },
  ];
  for (const body of bad) assert.equal((await s.call('POST', `/apps/${id}/reassessments`, { role: 'admin', body })).status, 400, JSON.stringify(body));

  const ok = await s.call('POST', `/apps/${id}/reassessments`, { role: 'admin', body: { assessedOn: '2026-01-16', reportUrl: 'https://cloudstaff.sharepoint.com/report.docx' }, headers: { 'x-user': 'Someone Else' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.recordedBy, 'Test admin');
  const detail = (await s.call('GET', `/apps/${id}`, { role: 'user' })).body;
  assert.equal(detail.app.status, 'current');
  assert.equal(detail.app.lastSource, 'reassessment');
  assert.equal(detail.history[0].changedBy, 'Test admin');

  assert.equal((await s.call('DELETE', `/reassessments/${ok.body.id}`, { role: 'admin' })).status, 204);
  assert.equal((await s.call('GET', `/apps/${id}`, { role: 'user' })).body.app.status, 'overdue');
});

test('hiding an app needs a reason; adding an existing app is refused', async () => {
  const id = await appId('Payroll');
  assert.equal((await s.call('PATCH', `/apps/${id}`, { role: 'admin', body: { hidden: true } })).status, 400);
  const hidden = await s.call('PATCH', `/apps/${id}`, { role: 'admin', body: { hidden: true, hiddenReason: 'Covered by MyStaff' } });
  assert.equal(hidden.body.hidden, true);
  assert.equal((await s.call('POST', '/apps', { role: 'admin', body: { name: 'cloudstaff payroll' } })).status, 409);
  assert.equal((await s.call('POST', '/apps', { role: 'admin', body: { name: 'Brand New' } })).status, 201);
});

test('the coming-due window is admin-set within 1–365 days', async () => {
  assert.equal((await s.call('PUT', '/settings', { role: 'admin', body: { dueSoonDays: 0 } })).status, 400);
  assert.equal((await s.call('PUT', '/settings', { role: 'admin', body: { dueSoonDays: '60' } })).status, 400);
  assert.equal((await s.call('PUT', '/settings', { role: 'admin', body: { dueSoonDays: 250 } })).body.dueSoonDays, 250); // Jobs is due in 229 days
  assert.equal((await s.call('GET', '/apps', { role: 'user' })).body.apps.find((a) => a.name === 'Jobs').status, 'due-soon');
  await s.call('PUT', '/settings', { role: 'admin', body: { dueSoonDays: 30 } });
});

test('report links must be https', () => {
  assert.equal(isHttpsUrl('https://cloudstaff.sharepoint.com/x'), true);
  for (const bad of ['http://x', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x', '//x', 'x', `https://x/${'a'.repeat(2000)}`]) assert.equal(isHttpsUrl(bad), false, bad);
});
