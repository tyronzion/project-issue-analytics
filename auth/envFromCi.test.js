import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadEnv } from 'vite';
import { mergeEnv, writeEnvFile } from './envFromCi.js';

test('replaces managed keys, keeps every other line, appends missing keys', () => {
  const before = '# Jira\nJIRA_TOKEN=keep-me\nAUTH_CLIENT_ID="old"\nexport AUTH_TENANT_ID=old\nAUTH_CLIENT_ID=dup\n';
  const { text, keys } = mergeEnv(before, { AUTH_CLIENT_ID: 'new-id', AUTH_TENANT_ID: 'tid', AUTH_CLIENT_SECRET: 's' });
  assert.equal(text, '# Jira\nJIRA_TOKEN=keep-me\nAUTH_CLIENT_ID="new-id"\nAUTH_TENANT_ID="tid"\nAUTH_CLIENT_SECRET="s"\n');
  assert.deepEqual(keys, ['AUTH_TENANT_ID', 'AUTH_CLIENT_ID', 'AUTH_CLIENT_SECRET']);
});

test('empty or missing values leave existing settings alone; other env vars are ignored', () => {
  const before = 'AUTH_CLIENT_SECRET="keep"\n';
  const { text, keys } = mergeEnv(before, { AUTH_CLIENT_SECRET: '  ', PATH: '/bin', JIRA_TOKEN: 'x' });
  assert.equal(text, before);
  assert.deepEqual(keys, []);
});

test('refuses values that would break out of the quotes', () => {
  assert.throws(() => mergeEnv('', { AUTH_CLIENT_SECRET: 'a"b' }), /AUTH_CLIENT_SECRET/);
  assert.throws(() => mergeEnv('', { AUTH_CLIENT_SECRET: 'a\nB=1' }), /AUTH_CLIENT_SECRET/);
});

test('written file has mode 600 and Vite reads the exact values back ($, #, ~ survive)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'envci-'));
  const file = path.join(dir, '.env.local');
  await writeFile(file, 'OTHER=1\n', { mode: 0o644 });
  const secret = 'Ab1~x.$HOME_y#z-_';
  await writeEnvFile(file, { AUTH_CLIENT_SECRET: secret, AUTH_ADMIN_EMAILS: 'a@x.com,b@x.com' });
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const env = loadEnv('development', dir, '');
  assert.equal(env.AUTH_CLIENT_SECRET, secret);
  assert.equal(env.AUTH_ADMIN_EMAILS, 'a@x.com,b@x.com');
  assert.equal(env.OTHER, '1');
  assert.match(await readFile(file, 'utf8'), /^OTHER=1\n/);
});

test('creates the file when it does not exist', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'envci-')), '.env.local');
  await writeEnvFile(file, { AUTH_TENANT_ID: 't' });
  assert.equal(await readFile(file, 'utf8'), 'AUTH_TENANT_ID="t"\n');
});
