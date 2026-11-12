import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Encrypts single values stored in the tracker database (App Access test-account passwords).
// Same scheme as monitor/server/tokenStore.js: AES-256-GCM, a random 12-byte IV per value and the auth tag,
// stored as JSON { v, iv, tag, data }. The 32-byte key lives in its own file (0600), next to the database by
// default, so a copy of tracker.db alone reveals no passwords. Back up both files: without the key the
// passwords can't be recovered.
// keyPath null (tests, an in-memory database): a random key kept in memory only.
export function createFieldCipher({ keyPath = null } = {}) {
  let key = keyPath ? null : randomBytes(32);

  function loadKey() {
    if (key) return key;
    try {
      const k = fs.readFileSync(keyPath);
      if (k.length === 32) return (key = k);
      throw new Error(`${path.basename(keyPath)} is not a 32-byte key`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const k = randomBytes(32);
    try {
      // wx: never overwrite a key another process created in the meantime.
      fs.writeFileSync(keyPath, k, { mode: 0o600, flag: 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') return loadKey();
      throw err;
    }
    fs.chmodSync(keyPath, 0o600);
    return (key = k);
  }

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
      const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
    },
    // Throws when the value was changed or the key is wrong (GCM auth tag check).
    decrypt(stored) {
      const record = JSON.parse(stored);
      if (record?.v !== 1) throw new Error('Unknown encrypted value format');
      const decipher = createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(record.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}
