// Stores the UberTicket bearer token encrypted at rest (AES-256-GCM).
//   data/secret.key  32 random bytes, created on first save, readable only by this user (0600)
//   data/token.enc   { iv, tag, data, savedAt }, also 0600
// This keeps the token out of plain-text config files, logs and copies of the project folder
// (without the key). Anyone who can read both files as this user can still decrypt it.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import path from 'node:path';

export function makeTokenStore(dir) {
  const keyFile = path.join(dir, 'secret.key');
  const tokenFile = path.join(dir, 'token.enc');

  async function key() {
    try {
      const k = await readFile(keyFile);
      if (k.length === 32) return k;
    } catch {}
    await mkdir(dir, { recursive: true });
    const k = randomBytes(32);
    await writeFile(keyFile, k, { mode: 0o600 });
    await chmod(keyFile, 0o600);
    return k;
  }

  return {
    async save(token) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', await key(), iv);
      const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      const record = { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'), savedAt: Date.now() };
      await writeFile(tokenFile, JSON.stringify(record), { mode: 0o600 });
      await chmod(tokenFile, 0o600);
      return record.savedAt;
    },

    // Returns { token, savedAt } or null if nothing is stored (or it can't be decrypted).
    async load() {
      let record;
      try { record = JSON.parse(await readFile(tokenFile, 'utf8')); } catch { return null; }
      try {
        const decipher = createDecipheriv('aes-256-gcm', await key(), Buffer.from(record.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
        const token = Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8');
        return { token, savedAt: record.savedAt ?? null };
      } catch {
        return null;
      }
    },

    async clear() {
      await rm(tokenFile, { force: true });
    },
  };
}

// Expiry from a JWT's "exp" claim (ms), or null if the token isn't a JWT. Nothing else is read from it.
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
