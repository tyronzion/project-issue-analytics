import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMonitor } from './monitor.js';

// Test-only login; the real app passes isValidAppLogin from src/utils/appLogin.ts.
const login = (u, p) => u.trim().toLowerCase() === 'tester' && p === 'p@ss: wörd';

async function serve(opts) {
  const root = await mkdtemp(path.join(tmpdir(), 'mon-'));
  const monitor = await createMonitor({ root, env: { DEMO: '1' }, log: () => {}, ...opts });
  const server = monitor.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => server.close() };
}
const post = (base, headers = {}) => fetch(`${base}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ token: 'abc.def.ghi' }) });
const creds = (u, p) => ({ 'X-Monitor-User': encodeURIComponent(u), 'X-Monitor-Password': encodeURIComponent(p) });

test('with the app login configured, changing the token needs that username and password', async () => {
  const { base, close } = await serve({ settingsLogin: login });
  try {
    assert.equal((await (await fetch(`${base}/api/token`)).json()).loginRequired, true);
    assert.equal((await post(base)).status, 403);
    assert.equal((await post(base, creds('tester', 'wrong'))).status, 403);
    const ok = await post(base, creds(' Tester ', 'p@ss: wörd'));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).set, true);
    assert.equal((await fetch(`${base}/api/token`, { method: 'DELETE' })).status, 403);
  } finally { close(); }
});

test('standalone (no app login): allowed from this machine', async () => {
  const { base, close } = await serve({});
  try {
    assert.equal((await post(base)).status, 200);
  } finally { close(); }
});
