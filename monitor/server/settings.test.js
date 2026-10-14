import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.js';

// Stands in for the app's admin check (vite.config.ts passes the signed-in user only when they are an admin).
const signedInAs = (email) => (req) => (req.get('x-test-user') === email ? { email } : null);

async function serve(opts) {
  const root = await mkdtemp(path.join(tmpdir(), 'mon-'));
  const monitor = await createMonitor({ root, env: { DEMO: '1' }, log: () => {}, ...opts });
  const server = monitor.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => server.close() };
}
const post = (base, headers = {}) => fetch(`${base}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ token: 'abc.def.ghi' }) });

test('inside the app, only an allowed (admin) user can change the token, even from this machine', async () => {
  const { base, close } = await serve({ settingsUser: signedInAs('grace@cloudstaff.com') });
  try {
    assert.equal((await (await fetch(`${base}/api/token`)).json()).canChange, false);
    assert.equal((await post(base)).status, 403);
    assert.equal((await post(base, { 'X-Test-User': 'someone@else.com' })).status, 403);
    assert.equal((await fetch(`${base}/api/token`, { method: 'DELETE' })).status, 403);
    const ok = await post(base, { 'X-Test-User': 'grace@cloudstaff.com' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).set, true);
    assert.equal((await (await fetch(`${base}/api/token`, { headers: { 'X-Test-User': 'grace@cloudstaff.com' } })).json()).canChange, true);
  } finally { close(); }
});

test('standalone (no app login): allowed from this machine', async () => {
  const { base, close } = await serve({});
  try {
    assert.equal((await post(base)).status, 200);
  } finally { close(); }
});
