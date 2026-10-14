import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createUserStore } from './users.js';
import { createAuth, requireAdmin, SESSION_COOKIE } from './auth.js';

const quiet = () => {};
const tmpFile = async () => path.join(await mkdtemp(path.join(tmpdir(), 'users-')), 'data', 'users.json');
const BOSS = { email: 'boss@cloudstaff.com' };

test('first sign-in records the person as "user"; AUTH_ADMIN_EMAILS are always admin', async () => {
  const file = await tmpFile();
  const store = await createUserStore({ file, adminEmails: 'Boss@Cloudstaff.com', log: quiet });
  await store.recordSignIn({ oid: 'o1', email: 'Grace@Cloudstaff.com', name: 'Grace' });
  assert.equal(store.roleOf({ oid: 'o1', email: 'grace@cloudstaff.com' }), 'user');
  assert.equal(store.roleOf({ oid: 'x', email: 'boss@cloudstaff.com' }), 'admin');
  assert.equal(store.roleOf({ oid: 'nobody', email: 'new@cloudstaff.com' }), 'user');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.users[0].email, 'grace@cloudstaff.com');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('roles persist, follow the Entra object id when the email changes, and pre-added emails apply on first sign-in', async () => {
  const file = await tmpFile();
  let store = await createUserStore({ file, adminEmails: BOSS.email, log: quiet });
  await store.recordSignIn({ oid: 'o1', email: 'grace@cloudstaff.com' });
  await store.setRole('grace@cloudstaff.com', 'admin', BOSS);
  await store.add('ana@cloudstaff.com', 'admin', BOSS);
  store = await createUserStore({ file, adminEmails: BOSS.email, log: quiet });
  assert.equal(store.roleOf({ oid: 'o1', email: 'grace.cruz@cloudstaff.com' }), 'admin');
  await store.recordSignIn({ oid: 'o2', email: 'ANA@cloudstaff.com' });
  assert.equal(store.roleOf({ oid: 'o2', email: 'other@x.com' }), 'admin');
});

test('guard rails: valid roles and emails, no duplicates, settings admins locked, last admin kept, no self-removal', async () => {
  const store = await createUserStore({ file: await tmpFile(), log: quiet });
  await store.add('a@cloudstaff.com', 'admin', BOSS);
  await assert.rejects(store.add('not-an-email', 'user', BOSS), { status: 400 });
  await assert.rejects(store.add('b@cloudstaff.com', 'owner', BOSS), { status: 400 });
  await assert.rejects(store.add('A@cloudstaff.com', 'user', BOSS), { status: 409 });
  await assert.rejects(store.setRole('a@cloudstaff.com', 'user', BOSS), { status: 409 }); // only admin
  await assert.rejects(store.remove('a@cloudstaff.com', BOSS), { status: 409 });
  await assert.rejects(store.remove('a@cloudstaff.com', { email: 'a@cloudstaff.com' }), { status: 400 });
  await assert.rejects(store.setRole('missing@cloudstaff.com', 'user', BOSS), { status: 404 });

  const withSettings = await createUserStore({ file: await tmpFile(), adminEmails: BOSS.email, log: quiet });
  await assert.rejects(withSettings.setRole(BOSS.email, 'user', BOSS), { status: 400 });
  await withSettings.add('a@cloudstaff.com', 'admin', BOSS);
  assert.equal((await withSettings.setRole('a@cloudstaff.com', 'user', BOSS)).role, 'user'); // boss remains admin
  assert.deepEqual(withSettings.list().map((u) => [u.email, u.role, u.fromSettings]), [['a@cloudstaff.com', 'user', false], [BOSS.email, 'admin', true]]);
});

test('an unreadable users file is never overwritten and everyone falls back to "user"', async () => {
  const file = await tmpFile();
  await createUserStore({ file, log: quiet }).then((s) => s.add('a@cloudstaff.com', 'admin', BOSS));
  await writeFile(file, '{ broken');
  const store = await createUserStore({ file, adminEmails: BOSS.email, log: quiet });
  assert.equal(store.roleOf({ email: 'a@cloudstaff.com' }), 'user');
  assert.equal(store.roleOf(BOSS), 'admin');
  await assert.rejects(store.add('c@cloudstaff.com', 'user', BOSS), { status: 500 });
  await store.recordSignIn({ oid: 'z', email: 'z@cloudstaff.com' });
  assert.equal(await readFile(file, 'utf8'), '{ broken');
});

test('requireAdmin: 401 signed out, 403 user, passes admin', () => {
  const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } });
  const r1 = res();
  assert.equal(requireAdmin({}, r1), false);
  assert.equal(r1.statusCode, 401);
  const r2 = res();
  assert.equal(requireAdmin({ user: { role: 'user' } }, r2), false);
  assert.equal(r2.statusCode, 403);
  assert.equal(requireAdmin({ user: { role: 'admin' } }, res()), true);
});

// /auth/users through the real middleware, signed in with the local dev bypass.
function call(auth, { method = 'GET', url, body, contentType = 'application/json' }) {
  return new Promise((resolve) => {
    const listeners = {};
    const req = {
      method, url, headers: { accept: 'application/json', 'content-type': body !== undefined || method === 'DELETE' ? contentType : '' },
      socket: { remoteAddress: '127.0.0.1' },
      on(ev, fn) { listeners[ev] = fn; return req; },
    };
    const res = { statusCode: 200, setHeader() {}, end: (b) => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }) };
    auth.middleware(req, res, () => resolve({ status: null }));
    queueMicrotask(() => {
      if (body !== undefined) listeners.data?.(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      listeners.end?.();
    });
  });
}

test('/auth/users: admins manage users; users are refused; forms (non-JSON) are refused', async () => {
  const users = await createUserStore({ file: await tmpFile(), log: quiet });
  const admin = createAuth({ env: { AUTH_DEV_BYPASS: '1' }, users, log: quiet });
  const user = createAuth({ env: { AUTH_DEV_BYPASS: '1', AUTH_DEV_ROLE: 'user' }, users, log: quiet });

  assert.equal((await call(user, { url: '/auth/users' })).status, 403);
  assert.equal((await call(user, { method: 'POST', url: '/auth/users', body: { email: 'x@cloudstaff.com', role: 'admin' } })).status, 403);

  const added = await call(admin, { method: 'POST', url: '/auth/users', body: { email: 'X@cloudstaff.com', role: 'admin' } });
  assert.equal(added.status, 201);
  assert.equal(added.body.email, 'x@cloudstaff.com');
  assert.equal((await call(admin, { method: 'POST', url: '/auth/users', body: 'email=y@cloudstaff.com&role=admin', contentType: 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await call(admin, { method: 'PATCH', url: '/auth/users/x%40cloudstaff.com', body: { role: 'user' } })).status, 409); // last admin
  await users.add('y@cloudstaff.com', 'admin', BOSS);
  assert.equal((await call(admin, { method: 'PATCH', url: '/auth/users/x%40cloudstaff.com', body: { role: 'user' } })).body.role, 'user');
  assert.equal((await call(admin, { method: 'DELETE', url: '/auth/users/x%40cloudstaff.com', contentType: 'text/plain' })).status, 415);
  assert.equal((await call(admin, { method: 'DELETE', url: '/auth/users/x%40cloudstaff.com' })).status, 200);
  const list = await call(admin, { url: '/auth/users' });
  assert.deepEqual(list.body.users.map((u) => u.email), ['y@cloudstaff.com']);
  admin.stop();
  user.stop();
});

test('an Entra session gets its role from the store, and a role change applies on the next request', async () => {
  const users = await createUserStore({ file: await tmpFile(), log: quiet });
  const TENANT = '11111111-2222-3333-4444-555555555555';
  const msal = {
    getAuthCodeUrl: async (r) => `https://login.microsoftonline.com/x?state=${r.state}`,
    acquireTokenByCode: async (_r, p) => ({ account: { name: 'Grace', username: 'grace@cloudstaff.com' }, idTokenClaims: { nonce: p.nonce, tid: TENANT, oid: 'o1' } }),
  };
  const auth = createAuth({ env: { AUTH_TENANT_ID: TENANT, AUTH_CLIENT_ID: 'c', AUTH_CLIENT_SECRET: 's', AUTH_REDIRECT_URI: 'https://a.example/auth/callback' }, users, msalClient: msal, log: quiet });
  const run = (url, cookie = '') => new Promise((resolve) => {
    const headers = {};
    const req = { method: 'GET', url, headers: { cookie, accept: 'text/html' }, socket: {} };
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: () => resolve({ headers, req }) };
    auth.middleware(req, res, () => resolve({ headers, req, next: true }));
  });
  const start = await run('/auth/login');
  const state = new URL(start.headers.location).searchParams.get('state');
  const done = await run(`/auth/callback?code=c&state=${state}`, [].concat(start.headers['set-cookie']).map((c) => c.split(';')[0]).join('; '));
  const cookie = [].concat(done.headers['set-cookie']).map((c) => c.split(';')[0]).find((c) => c.startsWith(SESSION_COOKIE));
  assert.equal((await run('/', cookie)).req.user.role, 'user');
  await users.setRole('grace@cloudstaff.com', 'admin', BOSS);
  assert.equal((await run('/', cookie)).req.user.role, 'admin');
  auth.stop();
});
