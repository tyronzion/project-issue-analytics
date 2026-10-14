import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, isBlockedPath, safeReturnTo, parseCookies, SESSION_COOKIE, STATE_COOKIE } from './auth.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const ENV = {
  AUTH_TENANT_ID: TENANT,
  AUTH_CLIENT_ID: 'client-id',
  AUTH_CLIENT_SECRET: 'secret',
  AUTH_REDIRECT_URI: 'https://analytics.example/auth/callback',
};

// Stands in for msal-node's ConfidentialClientApplication.
function fakeMsal({ tid = TENANT, nonce = null, fail = false } = {}) {
  const calls = { authUrl: null, token: null };
  return {
    calls,
    async getAuthCodeUrl(req) {
      calls.authUrl = req;
      return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?state=${req.state}`;
    },
    async acquireTokenByCode(req, payload) {
      calls.token = { req, payload };
      if (fail) throw Object.assign(new Error('AADSTS50105: not assigned'), { errorCode: 'invalid_grant' });
      return {
        account: { name: 'Grace Cruz', username: 'grace@cloudstaff.com' },
        idTokenClaims: { nonce: nonce ?? payload.nonce, tid, oid: 'oid-1' },
      };
    },
  };
}

function call(auth, { method = 'GET', url = '/', cookie = '', accept = 'text/html', ip = '10.0.0.5' } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const req = { method, url, headers: { cookie, accept }, socket: { remoteAddress: ip } };
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (body) => resolve({ status: res.statusCode, headers, body: String(body || ''), req, next: false }),
    };
    auth.middleware(req, res, () => resolve({ status: null, headers, body: '', req, next: true }));
  });
}

const cookiesFrom = (setCookie) => [].concat(setCookie || []).map((c) => c.split(';')[0]).join('; ');

async function signIn(auth) {
  const start = await call(auth, { url: '/auth/login?returnTo=%2Fissues' });
  const state = new URL(start.headers.location).searchParams.get('state');
  const done = await call(auth, { url: `/auth/callback?code=abc&state=${state}`, cookie: cookiesFrom(start.headers['set-cookie']) });
  return { start, state, done, cookie: cookiesFrom(done.headers['set-cookie']).split('; ').find((c) => c.startsWith(SESSION_COOKIE)) };
}

test('data folders are blocked however the path is written', () => {
  for (const p of ['/tracker/data/tracker.db', '/Tracker/Data/x', '/monitor/data/secret.key', '/auth/data/users.json', '//monitor//data/token.enc', '/monitor%2Fdata%2Fsecret.key', '/tracker\\data\\tracker.db', '/%E0%A4%A']) {
    assert.equal(isBlockedPath(p), true, p);
  }
  for (const p of ['/', '/monitor/DPSA', '/tracker', '/api/tracker/cycles', '/src/data.ts']) assert.equal(isBlockedPath(p), false, p);
});

test('returnTo only allows paths on this site', () => {
  assert.equal(safeReturnTo('/issues?x=1'), '/issues?x=1');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'issues', '', '/auth/login', '/x\r\nSet-Cookie: a=b']) {
    assert.equal(safeReturnTo(bad), '/', bad);
  }
});

test('parseCookies keeps the first value of a repeated name', () => {
  assert.deepEqual(parseCookies('a=1; b=two%20words; a=2; bad'), { a: '1', b: 'two words' });
});

test('with classic login turned off and no Microsoft settings, every request is refused (fails closed)', async () => {
  const auth = createAuth({ env: { AUTH_CLASSIC_LOGIN: '0' }, log: () => {} });
  assert.equal(auth.mode, 'unconfigured');
  const r = await call(auth, { url: '/' });
  assert.equal(r.status, 503);
  assert.equal((await call(auth, { url: '/api/tracker/cycles', accept: '*/*' })).status, 503);
  assert.equal((await call(auth, { url: '/design-system/css/tokens.css' })).next, true);
  auth.stop();
});

test('invalid settings are reported and fail closed', () => {
  const cases = [
    { ...ENV, AUTH_TENANT_ID: 'common' },
    { ...ENV, AUTH_TENANT_ID: 'contoso.onmicrosoft.com' },
    { ...ENV, AUTH_REDIRECT_URI: 'http://10.6.99.208/auth/callback' },
    { ...ENV, AUTH_REDIRECT_URI: 'https://analytics.example/callback' },
  ];
  for (const env of cases) {
    const auth = createAuth({ env, log: () => {} });
    assert.equal(auth.mode, 'unconfigured', JSON.stringify(env));
    auth.stop();
  }
  const local = createAuth({ env: { ...ENV, AUTH_REDIRECT_URI: 'http://localhost:5199/auth/callback' }, msalClient: fakeMsal(), log: () => {} });
  assert.equal(local.mode, 'entra');
  local.stop();
});

test('dev bypass only works from this machine and never alongside real settings', async () => {
  const auth = createAuth({ env: { AUTH_DEV_BYPASS: '1' }, log: () => {} });
  assert.equal(auth.mode, 'dev-bypass');
  const local = await call(auth, { url: '/', ip: '127.0.0.1' });
  assert.equal(local.next, true);
  assert.equal(local.req.user.dev, true);
  assert.equal((await call(auth, { url: '/', ip: '10.0.0.5' })).status, 403);
  auth.stop();
  const both = createAuth({ env: { ...ENV, AUTH_DEV_BYPASS: '1' }, msalClient: fakeMsal(), log: () => {} });
  assert.equal(both.mode, 'entra');
  both.stop();
});

test('signed-out visitors are sent to Microsoft; API calls get 401', async () => {
  const auth = createAuth({ env: ENV, msalClient: fakeMsal(), log: () => {} });
  const page = await call(auth, { url: '/issues?x=1' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/auth/login?returnTo=%2Fissues%3Fx%3D1');
  const api = await call(auth, { url: '/api/tracker/cycles', accept: 'application/json' });
  assert.equal(api.status, 401);
  const post = await call(auth, { method: 'POST', url: '/api/state/issues', accept: 'text/html' });
  assert.equal(post.status, 401);
  auth.stop();
});

test('full sign-in: PKCE + state + nonce, secure HttpOnly session cookie, back to returnTo', async () => {
  const msal = fakeMsal();
  const auth = createAuth({ env: ENV, msalClient: msal, log: () => {} });
  const { start, state, done, cookie } = await signIn(auth);
  assert.match(start.headers.location, /^https:\/\/login\.microsoftonline\.com\//);
  assert.equal(msal.calls.authUrl.codeChallengeMethod, 'S256');
  assert.ok(msal.calls.authUrl.nonce && msal.calls.authUrl.codeChallenge);
  assert.match(String(start.headers['set-cookie']), new RegExp(`^${STATE_COOKIE}=.*HttpOnly; SameSite=Lax; Secure`));
  assert.equal(msal.calls.token.payload.state, state);
  assert.equal(done.status, 302);
  assert.equal(done.headers.location, '/issues');
  const sessionCookie = [].concat(done.headers['set-cookie']).find((c) => c.startsWith(SESSION_COOKIE));
  assert.match(sessionCookie, /HttpOnly; SameSite=Lax; Secure$/);
  const next = await call(auth, { url: '/api/tracker/cycles', cookie, accept: '*/*' });
  assert.equal(next.next, true);
  // no user store given: least privilege
  assert.deepEqual(next.req.user, { name: 'Grace Cruz', email: 'grace@cloudstaff.com', oid: 'oid-1', role: 'user' });
  const me = await call(auth, { url: '/auth/me', cookie });
  assert.deepEqual(JSON.parse(me.body), { name: 'Grace Cruz', email: 'grace@cloudstaff.com', role: 'user', dev: false });
  auth.stop();
});

test('callback is refused when the state does not match this browser', async () => {
  const auth = createAuth({ env: ENV, msalClient: fakeMsal(), log: () => {} });
  const start = await call(auth, { url: '/auth/login' });
  const state = new URL(start.headers.location).searchParams.get('state');
  const noCookie = await call(auth, { url: `/auth/callback?code=abc&state=${state}` });
  assert.equal(noCookie.status, 400);
  // the state is single-use: the matching browser can no longer complete it either
  const replay = await call(auth, { url: `/auth/callback?code=abc&state=${state}`, cookie: cookiesFrom(start.headers['set-cookie']) });
  assert.equal(replay.status, 400);
  assert.equal(auth._sessions.size, 0);
  auth.stop();
});

test('tokens from another tenant or with a wrong nonce are rejected', async () => {
  for (const msal of [fakeMsal({ tid: '99999999-9999-9999-9999-999999999999' }), fakeMsal({ nonce: 'other' })]) {
    const auth = createAuth({ env: ENV, msalClient: msal, log: () => {} });
    const { done } = await signIn(auth);
    assert.equal(done.status, 403);
    assert.equal(auth._sessions.size, 0);
    auth.stop();
  }
});

test('users not assigned to the app get a clear message, not the raw error', async () => {
  const auth = createAuth({ env: ENV, msalClient: fakeMsal(), log: () => {} });
  const start = await call(auth, { url: '/auth/login' });
  const state = new URL(start.headers.location).searchParams.get('state');
  const r = await call(auth, {
    url: `/auth/callback?state=${state}&error=access_denied&error_description=${encodeURIComponent('AADSTS50105: <script>x</script>')}`,
    cookie: cookiesFrom(start.headers['set-cookie']),
  });
  assert.equal(r.status, 403);
  assert.match(r.body, /not been given access/);
  assert.doesNotMatch(r.body, /<script>x/);
  auth.stop();
});

test('sign out ends the session; sessions expire after 8 idle hours', async () => {
  let t = 1_000_000;
  const auth = createAuth({ env: ENV, msalClient: fakeMsal(), now: () => t, log: () => {} });
  let { cookie } = await signIn(auth);
  const out = await call(auth, { method: 'POST', url: '/auth/logout', cookie });
  assert.equal(out.status, 303);
  assert.equal(out.headers.location, '/auth/signed-out');
  assert.equal((await call(auth, { url: '/api/x', cookie, accept: '*/*' })).status, 401);

  ({ cookie } = await signIn(auth));
  t += 7 * 60 * 60 * 1000;
  assert.equal((await call(auth, { url: '/api/x', cookie, accept: '*/*' })).next, true);
  t += 8 * 60 * 60 * 1000 + 1;
  assert.equal((await call(auth, { url: '/api/x', cookie, accept: '*/*' })).status, 401);
  auth.stop();
});

test('session cookies are not secure-flagged for a localhost redirect URI (plain http dev)', async () => {
  const auth = createAuth({ env: { ...ENV, AUTH_REDIRECT_URI: 'http://localhost:5199/auth/callback' }, msalClient: fakeMsal(), log: () => {} });
  const { done } = await signIn(auth);
  assert.doesNotMatch(String(done.headers['set-cookie']), /Secure/);
  auth.stop();
});

// ---- Classic login (used until Microsoft sign-in is configured) ----

function post(auth, { url = '/auth/login', form, cookie = '', ip = '10.0.0.5', contentType = 'application/x-www-form-urlencoded', encrypted = false }) {
  return new Promise((resolve) => {
    const headers = {};
    const listeners = {};
    const req = {
      method: 'POST', url, headers: { cookie, accept: 'text/html', 'content-type': contentType },
      socket: { remoteAddress: ip, encrypted }, on(ev, fn) { listeners[ev] = fn; return req; },
    };
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (b) => resolve({ status: res.statusCode, headers, body: String(b || '') }) };
    auth.middleware(req, res, () => resolve({ status: null, next: true }));
    queueMicrotask(() => { listeners.data?.(Buffer.from(new URLSearchParams(form).toString())); listeners.end?.(); });
  });
}

// Test credentials (the built-in account works the same way; its password is not repeated here).
const CLASSIC = { AUTH_CLASSIC_USERNAME: 'Team', AUTH_CLASSIC_PASSWORD: 'long secret' };

test('no Microsoft settings: classic login is the default', () => {
  const auth = createAuth({ env: {}, log: () => {} });
  assert.equal(auth.mode, 'classic');
  auth.stop();
});

test('classic login is checked on the server and leads back to the page asked for', async () => {
  const auth = createAuth({ env: CLASSIC, log: () => {} });
  assert.equal(auth.mode, 'classic');
  const page = await call(auth, { url: '/issues' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/auth/login?returnTo=%2Fissues');
  const form = await call(auth, { url: '/auth/login?returnTo=%2Fissues' });
  assert.equal(form.status, 200);
  assert.match(form.body, /name="password"/);
  assert.match(form.body, /value="\/issues"/);

  const bad = await post(auth, { form: { username: 'team', password: 'wrong', returnTo: '/issues' } });
  assert.equal(bad.status, 401);
  assert.match(bad.body, /Incorrect username or password/);

  const ok = await post(auth, { form: { username: ' TEAM ', password: 'long secret ', returnTo: '/issues' } });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, '/issues');
  assert.match(ok.headers['set-cookie'], /HttpOnly; SameSite=Lax$/); // plain http: no Secure flag
  const cookie = ok.headers['set-cookie'].split(';')[0];
  const next = await call(auth, { url: '/api/tracker/cycles', cookie, accept: '*/*' });
  assert.equal(next.next, true);
  assert.equal(next.req.user.role, 'admin');
  assert.equal(next.req.user.name, 'Team');
  auth.stop();
});

test('classic login: open redirects, non-form posts and brute force are refused', async () => {
  const auth = createAuth({ env: CLASSIC, log: () => {} });
  const evil = await post(auth, { form: { username: 'team', password: 'long secret', returnTo: 'https://evil.example' } });
  assert.equal(evil.headers.location, '/');
  assert.equal((await post(auth, { form: { username: 'team', password: 'x' }, contentType: 'application/json', ip: '10.9.9.9' })).status, 415);
  for (let i = 0; i < 10; i++) assert.equal((await post(auth, { form: { username: 'team', password: `guess${i}` }, ip: '10.1.1.1' })).status, 401);
  // 11th attempt is blocked, even with the right password
  assert.equal((await post(auth, { form: { username: 'team', password: 'long secret' }, ip: '10.1.1.1' })).status, 429);
  // other computers are unaffected
  assert.equal((await post(auth, { form: { username: 'team', password: 'long secret' }, ip: '10.2.2.2' })).status, 303);
  auth.stop();
});

test('classic login: own credentials replace the built-in account; HTTPS gets Secure cookies', async () => {
  const auth = createAuth({ env: CLASSIC, log: () => {} });
  assert.equal((await post(auth, { form: { username: 'csdatasec', password: 'anything' } })).status, 401);
  const ok = await post(auth, { form: { username: 'team', password: 'long secret' }, encrypted: true });
  assert.equal(ok.status, 303);
  assert.match(ok.headers['set-cookie'], /Secure/);
  auth.stop();
  const half = createAuth({ env: { AUTH_CLASSIC_USERNAME: 'team' }, log: () => {} });
  assert.equal(half.mode, 'unconfigured');
  half.stop();
});

test('classic login switches off as soon as Microsoft sign-in is configured, and partial Microsoft settings lock', async () => {
  const entra = createAuth({ env: ENV, msalClient: fakeMsal(), log: () => {} });
  assert.equal(entra.mode, 'entra');
  assert.equal((await post(entra, { form: { username: 'team', password: 'long secret' } })).status, 404);
  entra.stop();
  const partial = createAuth({ env: { AUTH_TENANT_ID: ENV.AUTH_TENANT_ID }, log: () => {} });
  assert.equal(partial.mode, 'unconfigured');
  partial.stop();
});
