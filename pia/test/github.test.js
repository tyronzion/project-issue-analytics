import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createGithub, parseRepo, reposFromText, appJwt } from '../server/github.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' });
const SECRET = 'ghs_installation_token_SECRET';
const SHA = 'a'.repeat(40);

function fakeFetch(log, { status = 200 } = {}) {
  return async (url, opts) => {
    log.push({ url, method: opts.method, auth: opts.headers.Authorization });
    const u = new URL(url);
    const json = (body, s = 200) => ({ ok: s < 400, status: s, headers: { get: () => '100' }, json: async () => body });
    if (u.pathname === '/orgs/acme/installation') return json({ id: 42 });
    if (u.pathname === '/app/installations/42/access_tokens') return json({ token: SECRET, expires_at: new Date(Date.now() + 3600_000).toISOString() });
    if (u.pathname === '/repos/acme/app') return json({ full_name: 'acme/app', default_branch: 'main' }, status);
    if (u.pathname === '/repos/acme/app/commits/main') return json({ sha: SHA });
    return json({}, 404);
  };
}

const client = (log, extra = {}) => createGithub({ getCredential: async () => ({ appId: '123', privateKey: PEM }), allowedOrgs: () => ['acme'], fetchImpl: fakeFetch(log, extra) });

test('parseRepo and reposFromText', () => {
  assert.equal(parseRepo('acme/app'), 'acme/app');
  assert.equal(parseRepo('https://github.com/acme/app.git'), 'acme/app');
  assert.equal(parseRepo('https://github.com/acme/app/tree/main/src'), 'acme/app');
  assert.equal(parseRepo('git@github.com:acme/app.git'), 'acme/app');
  assert.equal(parseRepo('https://gitlab.com/acme/app'), null);
  assert.equal(parseRepo('acme/../etc'), null);
  assert.equal(parseRepo('acme'), null);
  assert.deepEqual(reposFromText('Web: https://github.com/acme/web\nAPI: git@github.com:acme/api.git, https://github.com/acme/web'), ['acme/web', 'acme/api']);
});

test('JWT is RS256, signed by the App key, short-lived', () => {
  const jwt = appJwt({ appId: '123', privateKey: PEM, now: 1_700_000_000_000 });
  const [h, p, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.iss, '123');
  assert.ok(payload.exp - payload.iat <= 600);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, 'base64url')));
});

test('only GETs to api.github.com, plus the one installation-token exchange', async () => {
  const log = [];
  const gh = client(log);
  assert.deepEqual(await gh.repo('acme/app'), { fullName: 'acme/app', defaultBranch: 'main', private: false, archived: false, htmlUrl: undefined });
  assert.equal(await gh.headSha('acme/app', 'main'), SHA);
  for (const r of log) assert.ok(r.url.startsWith('https://api.github.com/'), r.url);
  const nonGet = log.filter((r) => r.method !== 'GET');
  assert.deepEqual(nonGet.map((r) => new URL(r.url).pathname), ['/app/installations/42/access_tokens']);
  // The installation token is reused, and repo calls use it (not the JWT).
  assert.equal(log.filter((r) => r.url.includes('access_tokens')).length, 1);
  assert.equal(log.at(-1).auth, `Bearer ${SECRET}`);
});

test('rejects repos outside the allowed orgs and malformed names, before any request', async () => {
  const log = [];
  const gh = client(log);
  await assert.rejects(gh.repo('other/app'), /not an allowed GitHub organisation/);
  await assert.rejects(gh.repo('acme/app?x=1'), /Not a valid GitHub repository/);
  await assert.rejects(gh.repo('../../user'), /Not a valid GitHub repository/);
  await assert.rejects(gh.tree('acme/app', 'not-a-sha'), /Unexpected commit id/);
  assert.equal(log.length, 0);
});

test('errors never carry the token or key', async () => {
  const log = [];
  const gh = client(log, { status: 500 });
  const err = await gh.repo('acme/app').catch((e) => e);
  assert.match(err.message, /HTTP 500/);
  assert.ok(!err.message.includes(SECRET) && !err.message.includes('PRIVATE KEY'));
  const noCred = createGithub({ getCredential: async () => null, allowedOrgs: () => ['acme'], fetchImpl: fakeFetch([]) });
  await assert.rejects(noCred.repo('acme/app'), /not set up yet/);
});
