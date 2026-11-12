import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { openDb } from '../server/db.js';
import { createFieldCipher } from '../server/fieldCipher.js';
import { listAccess, saveApp, addAccount, readApp, cleanUrl } from '../server/access.js';
import { saveTargets } from '../server/targets.js';
import { createTracker } from '../server/tracker.js';

const SECRET = 'S3cret pass!word';

test('field cipher: round trip, a fresh IV per value, tampering is detected', () => {
  const c = createFieldCipher();
  const a = c.encrypt(SECRET);
  const b = c.encrypt(SECRET);
  assert.notEqual(a, b);
  assert.ok(!a.includes(SECRET));
  assert.equal(c.decrypt(a), SECRET);
  const rec = JSON.parse(a);
  const data = Buffer.from(rec.data, 'base64');
  data[0] ^= 1;
  assert.throws(() => c.decrypt(JSON.stringify({ ...rec, data: data.toString('base64') })));
  // Another key can't read it.
  assert.throws(() => createFieldCipher().decrypt(a));
});

test('field cipher: the key file is created once (0600) and reused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-key-'));
  const keyPath = path.join(dir, 'sub', 'access.key');
  const stored = createFieldCipher({ keyPath }).encrypt(SECRET);
  assert.equal(fs.statSync(keyPath).size, 32);
  if (process.platform !== 'win32') assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
  assert.equal(createFieldCipher({ keyPath }).decrypt(stored), SECRET);
  fs.writeFileSync(keyPath, 'short');
  assert.throws(() => createFieldCipher({ keyPath }).decrypt(stored), /32-byte/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('links must be http(s)', () => {
  assert.equal(cleanUrl('https://app.example.com/login', 'Web URL'), 'https://app.example.com/login');
  assert.equal(cleanUrl('', 'Web URL'), null);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.example', 'app.example.com']) assert.throws(() => cleanUrl(bad, 'Web URL'));
});

test('the app list joins the Target Project List, tracker apps and saved details; tracker hints until saved', async () => {
  const db = await openDb(':memory:');
  saveTargets(db, { names: ['Staffcentral', 'Staffcentral IOS'], seed: true, user: 'Admin' });
  const cycle = db.prepare("INSERT INTO cycles (track, year) VALUES ('biannual', 2026) RETURNING id").get().id;
  db.prepare("INSERT INTO assessments (cycle_id, period, project, testing_url, mobile_app) VALUES (?, '2nd Half', 'Staffcentral', 'https://sc.example.com', 0)").run(cycle);
  db.prepare("INSERT INTO assessments (cycle_id, period, project, mobile_app) VALUES (?, '2nd Half', 'Staffcentral IOS', 1)").run(cycle);
  db.prepare("INSERT INTO assessments (cycle_id, period, project, testing_url) VALUES (?, '2nd Half', 'Old Tool', 'javascript:alert(1)')").run(cycle);
  db.prepare("INSERT INTO assessments (cycle_id, period, project, testing_url) VALUES (?, '2nd Half', 'Two Links', 'Staging: https://stg.example.com, UAT: https://uat.example.com')").run(cycle);
  const list = listAccess(db);
  const by = Object.fromEntries(list.map((a) => [a.name, a]));
  assert.deepEqual(list.map((a) => a.name), ['Old Tool', 'Staffcentral', 'Staffcentral IOS', 'Two Links']);
  assert.equal(by['Two Links'].webUrl, 'https://stg.example.com/', 'the first link in a free-text Testing URL');
  assert.equal(by.Staffcentral.kind, 'web');
  assert.equal(by.Staffcentral.webUrl, 'https://sc.example.com/');
  assert.equal(by.Staffcentral.fromTracker, true);
  assert.equal(by['Staffcentral IOS'].kind, 'mobile');
  assert.equal(by['Staffcentral IOS'].onTargetList, true);
  assert.equal(by['Old Tool'].onTargetList, false);
  assert.equal(by['Old Tool'].webUrl, null, 'an unsafe tracker URL is never offered as a link');

  const cipher = createFieldCipher();
  const saved = saveApp(db, by['Staffcentral IOS'].key, { kind: 'mobile', platform: 'ios', buildUrl: 'https://testflight.apple.com/join/abc' }, 'Zion');
  assert.equal(saved.fromTracker, false);
  assert.equal(saved.buildUrl, 'https://testflight.apple.com/join/abc');
  addAccount(db, saved.key, { username: 'qa_admin', password: SECRET, role: 'Admin' }, 'Zion', cipher);
  const app = readApp(db, saved.key);
  assert.equal(app.accounts.length, 1);
  assert.equal(app.accounts[0].hasPassword, true);
  assert.ok(!JSON.stringify(app).includes(SECRET));
  assert.ok(!JSON.stringify(app).includes('password_enc'));
  const stored = db.prepare('SELECT password_enc FROM app_accounts').get().password_enc;
  assert.ok(!stored.includes(SECRET), 'the database holds only ciphertext');
  assert.equal(cipher.decrypt(stored), SECRET);
  assert.throws(() => saveApp(db, 'nosuchapp', { kind: 'web' }, 'Zion'), /Unknown app/);
  assert.throws(() => saveApp(db, saved.key, { kind: 'desktop' }, 'Zion'), /web or mobile/);
});

async function server() {
  process.env.TRACKER_DB_PATH = ':memory:';
  const tracker = await createTracker({ root: '/unused', isAdmin: (req) => req.user?.role === 'admin', log: () => {} });
  const outer = express();
  outer.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (role) req.user = { name: `Test ${role}`, role };
    next();
  });
  outer.use('/api/tracker', tracker.app);
  const http = outer.listen(0);
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${http.address().port}/api/tracker`;
  const call = async (method, url, { role = 'user', body, type = 'application/json' } = {}) => {
    const headers = role ? { 'x-test-role': role } : {};
    if (body !== undefined || method === 'POST') headers['content-type'] = type;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, cache: res.headers.get('cache-control'), text, data: text ? JSON.parse(text) : null };
  };
  return { call, close: () => new Promise((r) => http.close(r)) };
}

test('routes: signed-in users read, edit and copy; passwords only through the logged copy route', async (t) => {
  const s = await server();
  t.after(s.close);
  await s.call('PUT', '/targets', { role: 'admin', body: { names: ['Buzz'], seed: true } });

  // Signed out: refused.
  assert.equal((await s.call('GET', '/access', { role: null })).status, 401);
  assert.equal((await s.call('POST', '/access/apps/buzz/accounts', { role: null, body: { username: 'x' } })).status, 401);

  const list = await s.call('GET', '/access');
  assert.equal(list.status, 200);
  assert.equal(list.cache, 'no-store');
  assert.deepEqual(list.data.map((a) => a.key), ['buzz']);

  // A regular user can set the type and URL and add accounts (D8: tracker edits are open to every user).
  assert.equal((await s.call('PUT', '/access/apps/buzz', { body: { kind: 'web', webUrl: 'javascript:alert(1)' } })).status, 400);
  const put = await s.call('PUT', '/access/apps/buzz', { body: { kind: 'web', webUrl: 'https://buzz.example.com' } });
  assert.equal(put.status, 200);
  assert.equal(put.data.webUrl, 'https://buzz.example.com/');
  const added = await s.call('POST', '/access/apps/buzz/accounts', { body: { username: 'qa_user', password: SECRET, role: 'Standard user', environment: 'UAT' } });
  assert.equal(added.status, 201);
  assert.ok(!added.text.includes(SECRET));
  const id = added.data.accounts[0].id;
  assert.equal((await s.call('POST', '/access/apps/buzz/accounts', { body: { username: '' } })).status, 400);

  // Reads never carry the password.
  for (const url of ['/access', '/access/apps/buzz']) {
    const r = await s.call('GET', url);
    assert.ok(!r.text.includes(SECRET), url);
    assert.ok(!r.text.includes('password_enc'), url);
  }

  // Copy: JSON content type only, returns the password, logs who copied it (not the value).
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`, { type: 'text/plain' })).status, 415);
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`, { role: null })).status, 401);
  assert.equal((await s.call('POST', `/access/apps/other/accounts/${id}/copy`)).status, 404, 'an account is only found under its own app');
  const copy = await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`);
  assert.equal(copy.status, 200);
  assert.equal(copy.cache, 'no-store');
  assert.equal(copy.data.password, SECRET);
  const app = await s.call('GET', '/access/apps/buzz');
  assert.ok(app.data.history.some((h) => h.action === 'password copied' && h.changedBy === 'Test user'));
  assert.ok(!app.text.includes(SECRET));

  // Editing without a password keeps it; a new password replaces it; clearPassword removes it.
  await s.call('PATCH', `/access/apps/buzz/accounts/${id}`, { body: { role: 'Admin', password: '' } });
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`)).data.password, SECRET);
  await s.call('PATCH', `/access/apps/buzz/accounts/${id}`, { body: { password: 'new-one' } });
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`)).data.password, 'new-one');
  const cleared = await s.call('PATCH', `/access/apps/buzz/accounts/${id}`, { body: { clearPassword: true } });
  assert.equal(cleared.data.accounts[0].hasPassword, false);
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`)).status, 404);

  const removed = await s.call('DELETE', `/access/apps/buzz/accounts/${id}`);
  assert.equal(removed.data.accounts.length, 0);
  assert.deepEqual(removed.data.history.slice(0, 2).map((h) => h.action), ['account removed', 'account changed']);
  assert.equal((await s.call('DELETE', `/access/apps/buzz/accounts/${id}`)).status, 404);
});

test('routes: password copies are rate-limited per user', async (t) => {
  const s = await server();
  t.after(s.close);
  await s.call('PUT', '/targets', { role: 'admin', body: { names: ['Buzz'], seed: true } });
  const id = (await s.call('POST', '/access/apps/buzz/accounts', { body: { username: 'qa', password: SECRET } })).data.accounts[0].id;
  for (let i = 0; i < 30; i++) assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`)).status, 200);
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`)).status, 429);
  // Another user is not affected.
  assert.equal((await s.call('POST', `/access/apps/buzz/accounts/${id}/copy`, { role: 'admin' })).status, 200);
});

test('routes: only apps the team tracks can get App Access details', async (t) => {
  const s = await server();
  t.after(s.close);
  await s.call('PUT', '/targets', { role: 'admin', body: { names: ['Buzz'], seed: true } });
  assert.equal((await s.call('PUT', '/access/apps/madeup', { body: { name: 'Made Up', kind: 'web' } })).status, 400);
  assert.equal((await s.call('POST', '/access/apps/madeup/accounts', { body: { name: 'Made Up', username: 'x' } })).status, 400);
  assert.equal((await s.call('GET', '/access/apps/madeup')).status, 404);
  // The saved name comes from the list, not the request.
  const out = await s.call('PUT', '/access/apps/buzz', { body: { name: '<b>Other</b>', kind: 'web' } });
  assert.equal(out.data.name, 'Buzz');
});
