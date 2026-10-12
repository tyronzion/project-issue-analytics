import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeTokenStore, tokenExpiry } from './tokenStore.js';

const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

test('token is encrypted at rest and round-trips', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tok-'));
  const store = makeTokenStore(dir);
  const token = jwt({ sub: 'x', exp: 2_000_000_000 });
  await store.save(token);
  const onDisk = await readFile(path.join(dir, 'token.enc'), 'utf8');
  assert.ok(!onDisk.includes(token) && !onDisk.includes(token.split('.')[1]), 'plain token must not be on disk');
  assert.equal((await stat(path.join(dir, 'token.enc'))).mode & 0o777, 0o600);
  assert.equal((await stat(path.join(dir, 'secret.key'))).mode & 0o777, 0o600);
  assert.equal((await store.load()).token, token);
  await store.clear();
  assert.equal(await store.load(), null);
});

test('a tampered token file is rejected', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tok-'));
  const store = makeTokenStore(dir);
  await store.save('abc.def.ghi');
  const f = path.join(dir, 'token.enc');
  const rec = JSON.parse(await readFile(f, 'utf8'));
  rec.data = Buffer.from('tampered').toString('base64');
  await writeFile(f, JSON.stringify(rec));
  assert.equal(await store.load(), null);
});

test('expiry comes from the JWT exp claim; non-JWTs have none', () => {
  assert.equal(tokenExpiry(jwt({ exp: 1_800_000_000 })), 1_800_000_000_000);
  assert.equal(tokenExpiry('not-a-jwt'), null);
});
