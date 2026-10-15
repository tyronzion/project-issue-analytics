// Copies the sign-in settings from GitHub Actions secrets/variables into the server's .env.local, so they are kept in
// GitHub instead of being typed into files by hand. Run by .github/workflows/deploy.yml before scripts/deploy.sh:
//   node auth/envFromCi.js <path/to/.env.local>
// Only the keys below are touched, and only when the workflow provides a non-empty value; every other line of
// .env.local (Jira, Postgres, proxy settings, ...) is kept as is. The file is rewritten with mode 600 and values are
// never printed.

import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CI_KEYS = [
  'AUTH_TENANT_ID',
  'AUTH_CLIENT_ID',
  'AUTH_CLIENT_SECRET',
  'AUTH_REDIRECT_URI',
  'AUTH_ADMIN_EMAILS',
  'AUTH_CLASSIC_USERNAME',
  'AUTH_CLASSIC_PASSWORD',
];

// Vite's loadEnv expands $VAR even inside quotes and treats an unquoted # as a comment, so values are written
// double-quoted with $ escaped. Characters that could break out of the quotes are refused rather than escaped.
function quote(key, value) {
  if (/["\\\r\n]/.test(value)) throw new Error(`${key} contains a quote, backslash or line break; not written`);
  return `"${value.replace(/\$/g, '\\$')}"`;
}

export function mergeEnv(text, values) {
  const updates = new Map();
  for (const key of CI_KEYS) {
    const value = values[key];
    if (typeof value === 'string' && value.trim() !== '') updates.set(key, `${key}=${quote(key, value.trim())}`);
  }
  const written = new Set();
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const out = [];
  for (const line of lines) {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (key && updates.has(key)) {
      // Keep only the first definition of a managed key, replaced.
      if (!written.has(key)) out.push(updates.get(key));
      written.add(key);
    } else {
      out.push(line);
    }
  }
  for (const [key, line] of updates) if (!written.has(key)) out.push(line);
  return { text: out.length ? `${out.join('\n')}\n` : '', keys: [...updates.keys()] };
}

export async function writeEnvFile(file, values) {
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const merged = mergeEnv(text, values);
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, merged.text, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
  return merged.keys;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node auth/envFromCi.js <path/to/.env.local>');
    process.exit(2);
  }
  try {
    const keys = await writeEnvFile(file, process.env);
    console.log(keys.length ? `[env] updated in ${file}: ${keys.join(', ')}` : '[env] no AUTH_* values provided; nothing changed');
  } catch (error) {
    console.error(`[env] ERROR: ${error.message}`);
    process.exit(1);
  }
}
