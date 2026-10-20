import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../server/db.js';
import { readTargets, saveTargets, addTargetsFromRoe, cleanNames, addRowsForTargets, ignoreTargetRow } from '../server/targets.js';
import { syncTickets } from '../server/sync.js';
import { createTracker } from '../server/tracker.js';
import { targetKey, targetMatcher } from '../shared/targets.js';

const SEEDED = '2026-10-19T00:00:00.000Z';
const at = (iso) => Date.parse(iso);
const roe = (o) => ({ key: 'UB-1', state: 'open', product: 'New App', createdAt: at('2026-10-20T00:00:00Z'), ...o });

async function seeded(names = ['MyStaff', 'Payroll']) {
  const db = await openDb(':memory:');
  saveTargets(db, { names, seed: true, user: 'Admin', now: () => SEEDED });
  return db;
}

test('targetKey ignores platform and filler words, case, punctuation and a leading "Cloudstaff"', () => {
  assert.equal(targetKey('Doorspace Mobile AOS'), targetKey('Doorspace'));
  assert.equal(targetKey('[IOS] Doorspace'), targetKey('doorspace'));
  assert.equal(targetKey('Payroll App'), targetKey('Payroll'));
  assert.equal(targetKey('Cloudstaff Mobile iOS'), targetKey('Cloudstaff'));
  assert.equal(targetKey('Cloudstaff Mystaff'), targetKey('MyStaff'));
  assert.notEqual(targetKey('Appstore'), targetKey('store'));
  assert.notEqual(targetKey('CS Gems'), targetKey('CS Event'));
  const onList = targetMatcher(['Doorspace', 'Jobs 3.0']);
  assert.equal(onList('Doorspace AOS'), true);
  assert.equal(onList('Jobs 3.0'), true);
  assert.equal(onList('Jobs'), false);
});

test('a new database has no shared list yet; the first (seed) save sets it up once', async () => {
  const db = await openDb(':memory:');
  assert.equal(readTargets(db).seeded, false);
  assert.equal(readTargets(db).targetOnly, true);
  const first = saveTargets(db, { names: ['MyStaff', 'mystaff', ' Payroll ', ''], seed: true, user: 'Admin', now: () => SEEDED });
  assert.deepEqual(first.names, ['MyStaff', 'Payroll']);
  assert.equal(first.seeded, true);
  assert.deepEqual(saveTargets(db, { names: ['Other'], seed: true, user: 'Admin' }), { conflict: true });
  assert.deepEqual(readTargets(db).names, ['MyStaff', 'Payroll']);
});

test('admin save adds, removes and reorders, and records history', async () => {
  const db = await seeded();
  const out = saveTargets(db, { names: ['Payroll', 'Buzz'], targetOnly: false, user: 'Zion' });
  assert.deepEqual(out.names, ['Payroll', 'Buzz']);
  assert.equal(out.targetOnly, false);
  const history = readTargets(db, { history: true }).history.map((h) => `${h.action}:${h.name ?? ''}:${h.changedBy}`);
  assert.ok(history.includes('added:Buzz:Zion'));
  assert.ok(history.includes('removed:MyStaff:Zion'));
  assert.ok(history.includes('target only off::Zion'));
});

test('platform entries stay separate list entries (the analytics pages count them separately)', async () => {
  const db = await seeded(['Staffcentral', 'Staffcentral IOS', 'Staffcentral AOS']);
  assert.deepEqual(readTargets(db).names, ['Staffcentral', 'Staffcentral IOS', 'Staffcentral AOS']);
  // ...but an RoE ticket for one of its platforms is already covered.
  assert.deepEqual(addTargetsFromRoe(db, [roe({ product: 'Staffcentral Mobile AOS' })]), []);
});

test('invalid lists are refused', () => {
  assert.throws(() => cleanNames('MyStaff'), /list/);
  assert.throws(() => cleanNames([42]), /text/);
  assert.throws(() => cleanNames(['x'.repeat(121)]), /120/);
  assert.throws(() => cleanNames(Array.from({ length: 1001 }, (_, i) => `App ${i}`)), /1000/);
});

test('new Rules of Engagement products are added; old, rejected, ignored and known ones are not', async () => {
  const db = await seeded();
  db.prepare("INSERT INTO ticket_ignores (ticket_key, product) VALUES ('UB-5', 'Ignored App')").run();
  const added = addTargetsFromRoe(db, [
    roe({ key: 'UB-1', product: 'New App' }),
    roe({ key: 'UB-2', product: 'Old App', createdAt: at('2026-01-01T00:00:00Z') }),
    roe({ key: 'UB-3', product: 'Rejected App', state: 'rejected' }),
    roe({ key: 'UB-4', product: 'Payroll AOS' }),
    roe({ key: 'UB-5', product: 'Ignored App' }),
    roe({ key: 'UB-6', product: 'Unspecified product' }),
    roe({ key: 'UB-7', product: 'new-app' }),
  ]);
  assert.deepEqual(added, ['New App']);
  const entry = readTargets(db).entries.find((e) => e.name === 'New App');
  assert.equal(entry.source, 'roe');
  assert.equal(entry.ticketKey, 'UB-1');
  assert.deepEqual(addTargetsFromRoe(db, [roe({ key: 'UB-1' })]), []);
});

test('nothing is added before the list is set up, and an app an admin removed is not re-added', async () => {
  const fresh = await openDb(':memory:');
  assert.deepEqual(addTargetsFromRoe(fresh, [roe()]), []);
  const db = await seeded();
  addTargetsFromRoe(db, [roe()]);
  saveTargets(db, { names: ['MyStaff', 'Payroll'], user: 'Zion' });
  assert.deepEqual(addTargetsFromRoe(db, [roe(), roe({ key: 'UB-9' })]), []);
  assert.deepEqual(readTargets(db).names, ['MyStaff', 'Payroll']);
  // An admin can add it back.
  assert.deepEqual(saveTargets(db, { names: ['MyStaff', 'Payroll', 'New App'], user: 'Zion' }).names, ['MyStaff', 'Payroll', 'New App']);
});

test('routes: everyone reads, only admins change (fails closed without isAdmin)', async () => {
  process.env.TRACKER_DB_PATH = ':memory:';
  const start = async (isAdmin) => {
    const tracker = await createTracker({ root: '/unused', isAdmin, log: () => {} });
    const outer = express();
    outer.use((req, _res, next) => {
      const role = req.headers['x-test-role'];
      if (role) req.user = { name: `Test ${role}`, role };
      next();
    });
    outer.use('/api/tracker', tracker.app);
    const http = outer.listen(0);
    await new Promise((r) => http.once('listening', r));
    const base = `http://127.0.0.1:${http.address().port}/api/tracker/targets`;
    const call = async (method, role, body) => {
      const res = await fetch(base, { method, headers: { 'x-test-role': role, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json() };
    };
    return { call, close: () => new Promise((r) => http.close(r)) };
  };

  const s = await start((req) => req.user?.role === 'admin');
  try {
    assert.equal((await s.call('PUT', 'user', { names: ['X'] })).status, 403);
    assert.equal((await s.call('PUT', 'admin', {})).status, 400);
    assert.equal((await s.call('PUT', 'admin', { names: 'X' })).status, 400);
    const saved = await s.call('PUT', 'admin', { names: ['MyStaff', 'Buzz'], seed: true });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.names, ['MyStaff', 'Buzz']);
    assert.equal((await s.call('PUT', 'admin', { names: ['Other'], seed: true })).status, 409);
    const asUser = await s.call('GET', 'user');
    assert.deepEqual(asUser.body.names, ['MyStaff', 'Buzz']);
    assert.equal(asUser.body.history, undefined);
    assert.ok(Array.isArray((await s.call('GET', 'admin')).body.history));
  } finally {
    await s.close();
  }

  const open = await start(null);
  try {
    assert.equal((await open.call('PUT', 'admin', { names: ['X'] })).status, 403);
  } finally {
    await open.close();
  }
});

test('apps route and decommission from the Projects page: latest year only, platform ignored, restorable', async () => {
  process.env.TRACKER_DB_PATH = ':memory:';
  const tracker = await createTracker({ root: '/unused', log: () => {} });
  const outer = express();
  outer.use('/api/tracker', tracker.app);
  const http = outer.listen(0);
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${http.address().port}/api/tracker`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  try {
    const { body: old } = await call('POST', '/cycles', { track: 'biannual', year: 2025 });
    const { body: cur } = await call('POST', '/cycles', { track: 'biannual', year: 2026 });
    const { body: a2025 } = await call('POST', `/cycles/${old.id}/assessments`, { project: 'Radio', period: '2nd Half' });
    await call('POST', `/cycles/${cur.id}/assessments`, { project: 'Radio', period: '1st Half' });
    await call('POST', `/cycles/${cur.id}/assessments`, { project: 'Radio', period: '2nd Half' });
    await call('POST', `/cycles/${cur.id}/assessments`, { project: 'Buzz', period: '2nd Half' });

    assert.equal((await call('POST', '/apps/decommission', { project: 'Nope', decommissioned: true })).status, 404);
    assert.equal((await call('POST', '/apps/decommission', { project: 'Radio' })).status, 400);
    assert.equal((await call('POST', '/apps/decommission', { project: 'Radio', decommissioned: true, date: 'today' })).status, 400);

    const done = await call('POST', '/apps/decommission', { project: 'Radio AOS', decommissioned: true, reason: 'Retired' });
    assert.equal(done.status, 200);
    const radio = done.body.find((a) => a.name === 'Radio');
    assert.equal(radio.decommissioned, true);
    assert.equal(radio.decommissionReason, 'Retired');
    assert.equal(done.body.find((a) => a.name === 'Buzz').decommissioned, false);
    const rows2026 = (await call('GET', `/cycles/${cur.id}/assessments`)).body.filter((r) => r.project === 'Radio');
    assert.deepEqual(rows2026.map((r) => r.isActive), ['Decommissioned', 'Decommissioned']);
    const row2025 = (await call('GET', `/cycles/${old.id}/assessments`)).body.find((r) => r.id === a2025.id);
    assert.equal(row2025.isActive, null); // older years are left as they were
    assert.ok((await call('GET', `/assessments/${rows2026[0].id}/history`)).body.some((h) => h.field === 'isActive'));

    const back = await call('POST', '/apps/decommission', { project: 'Radio', decommissioned: false });
    assert.equal(back.body.find((a) => a.name === 'Radio').decommissioned, false);
    assert.equal((await call('GET', '/apps')).body.find((a) => a.name === 'Radio').decommissionedAt, null);
  } finally {
    await new Promise((r) => http.close(r));
  }
});

test('list apps missing from this year get Not Started rows; a Full Assessment ticket then links to them', async () => {
  const db = await seeded(['MyStaff', 'Radio', 'Radio AOS', 'Buzz', 'Gone']);
  db.prepare("INSERT INTO cycles (id, track, year) VALUES (1, 'biannual', 2026), (2, 'quarterly', 2026)").run();
  const add = db.prepare('INSERT INTO assessments (cycle_id, period, project, is_active) VALUES (?, ?, ?, ?)');
  add.run(2, '1st Quarter', 'MyStaff', 'Active');
  add.run(1, '1st Half', 'Buzz', 'Active');
  add.run(1, '1st Half', 'Gone', 'Decommissioned');
  const today = new Date(2026, 9, 20); // 2nd Half / 4th Quarter

  const added = addRowsForTargets(db, { today });
  const got = added.map((a) => `${a.project}|${a.track}|${a.period}`).sort();
  assert.deepEqual(got, ['Buzz|biannual|2nd Half', 'MyStaff|quarterly|4th Quarter', 'Radio|biannual|2nd Half']);
  const radio = db.prepare("SELECT * FROM assessments WHERE project = 'Radio'").get();
  assert.equal(radio.is_active, 'Active');
  assert.equal(radio.created_from_target, 1);
  assert.equal(radio.ticket_key, null); // Not Started until a ticket arrives

  assert.deepEqual(addRowsForTargets(db, { today }), []); // no duplicates

  // Deleted rows stay deleted.
  ignoreTargetRow(db, db.prepare("SELECT * FROM assessments WHERE project = 'Buzz' AND period = '2nd Half'").get(), 'Zion');
  db.prepare("DELETE FROM assessments WHERE project = 'Buzz' AND period = '2nd Half'").run();
  assert.deepEqual(addRowsForTargets(db, { today }), []);

  // A new Full Assessment ticket for Radio in Q4 is combined with the list row (no second row).
  const ms = (iso) => Date.parse(`${iso}T00:00:00Z`) - 8 * 3_600_000;
  syncTickets(db, { full: [{ key: 'UB-77', url: 'https://ub/77', state: 'open', product: 'Cloudstaff Radio', quarter: 'Q4', year: '2026', assignee: 'ZionM', createdAt: ms('2026-10-21'), resolvedAt: null }], roe: [] });
  const rows = db.prepare("SELECT * FROM assessments WHERE project LIKE '%Radio%'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticket_key, 'UB-77');
  assert.equal(rows[0].ticket_url, 'https://ub/77');
  assert.equal(rows[0].ticket_state, 'open');
  assert.equal(rows[0].classification, 'Old');

  // No cycle for the year: nothing is added.
  assert.deepEqual(addRowsForTargets(db, { today: new Date(2027, 1, 1) }), []);
});
