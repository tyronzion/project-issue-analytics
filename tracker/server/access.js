import { matchKey } from '../shared/logic.js';
import { readTargets } from './targets.js';

// App Access: per app, whether it is a web or mobile app, its web URL or build folder link, and its test accounts
// (username, encrypted password, role). Stored in the tracker database (backed up with it).
//   app_access          one row per app (key = matchKey(name), so "Staffcentral IOS" and "Staffcentral" are
//                       separate, as on the Target Project List)
//   app_accounts        test accounts; password_enc is AES-256-GCM JSON from fieldCipher.js, never returned
//                       by a list or read
//   app_access_history  append-only: who changed what, and who copied which password (never the value)
// Every signed-in user can read, edit and copy (the app has only a few users; user decision 2026-11-12).
// Passwords are only returned one at a time by the copy route, which is logged and rate-limited.

export const KINDS = ['web', 'mobile'];
export const PLATFORMS = ['ios', 'android', 'both'];
export const MAX_ACCOUNTS = 50;
const LIMITS = { username: 200, password: 500, role: 80, environment: 40, notes: 500, url: 2000 };
const COPY_LIMIT = 30; // password copies per user ...
const COPY_WINDOW_MS = 10 * 60 * 1000; // ... per 10 minutes

export function ensureAccessTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_access (
      app_key TEXT PRIMARY KEY,          -- matchKey(name)
      name TEXT NOT NULL,
      kind TEXT,                         -- 'web' | 'mobile'
      platform TEXT,                     -- mobile: 'ios' | 'android' | 'both'
      web_url TEXT,
      build_url TEXT,                    -- link to the shared folder holding the IPA/APK (SharePoint, OneDrive, Drive); files are never stored here
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS app_accounts (
      id INTEGER PRIMARY KEY,
      app_key TEXT NOT NULL REFERENCES app_access(app_key) ON DELETE CASCADE,
      username TEXT NOT NULL,
      password_enc TEXT,                 -- fieldCipher JSON; NULL = no password saved
      role TEXT,
      environment TEXT,                  -- e.g. UAT, Staging
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_app_accounts_app ON app_accounts(app_key, sort_order, id);
    CREATE TABLE IF NOT EXISTS app_access_history (
      id INTEGER PRIMARY KEY,
      app_key TEXT NOT NULL,
      action TEXT NOT NULL,              -- 'updated' | 'account added' | 'account changed' | 'account removed' | 'password copied'
      detail TEXT,                       -- never a password
      changed_by TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_app_access_history_app ON app_access_history(app_key, id);
  `);
}

// ---- validation ---------------------------------------------------------------------------------------

function text(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new Error(`${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const v = value.trim();
  if (required && !v) throw new Error(`${field} is required.`);
  if (v.length > LIMITS[field]) throw new Error(`${field} is limited to ${LIMITS[field]} characters.`);
  return v || null;
}

// http(s) links only, so a saved link can never run script when clicked.
export function cleanUrl(value, field) {
  const v = text(value, 'url');
  if (!v) return null;
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`${field} must be a full link starting with https:// or http://`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`${field} must start with https:// or http://`);
  return u.href;
}

function cleanPassword(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('password must be text.');
  if (value.length > LIMITS.password) throw new Error(`password is limited to ${LIMITS.password} characters.`);
  return value; // kept exactly as typed (spaces can be part of a password)
}

// ---- reads --------------------------------------------------------------------------------------------

const accessRow = (db, key) => db.prepare('SELECT * FROM app_access WHERE app_key = ?').get(key);

// Latest tracker row per app: the testing URL and mobile flag the tracker already holds (used until App Access
// has its own values for the app).
function trackerHints(db) {
  const rows = db.prepare(`SELECT a.project, a.testing_url, a.mobile_app, a.is_active FROM assessments a JOIN cycles c ON c.id = a.cycle_id
    ORDER BY c.year DESC, a.id DESC`).all();
  const out = new Map();
  for (const r of rows) {
    const key = matchKey(r.project);
    if (!key) continue;
    const hint = out.get(key) || { name: r.project, testingUrl: null, mobile: !!r.mobile_app, decommissioned: r.is_active === 'Decommissioned' };
    if (!hint.testingUrl && r.testing_url) hint.testingUrl = r.testing_url;
    out.set(key, hint);
  }
  return out;
}

// The tracker's "Testing URL(s)" is free text that may hold several links: offer the first http(s) one.
const safeUrl = (v) => {
  const first = String(v || '').match(/https?:\/\/[^\s,;<>"']+/i)?.[0];
  try {
    return first ? cleanUrl(first, 'url') : null;
  } catch {
    return null;
  }
};

// Every app the team knows: the Target Project List, the tracker's apps and apps with App Access details.
export function listAccess(db) {
  const hints = trackerHints(db);
  const targets = readTargets(db);
  const onList = new Set(targets.names.map(matchKey));
  const saved = new Map(db.prepare('SELECT * FROM app_access').all().map((r) => [r.app_key, r]));
  const counts = new Map(db.prepare('SELECT app_key, COUNT(*) AS n FROM app_accounts GROUP BY app_key').all().map((r) => [r.app_key, r.n]));
  const names = new Map();
  for (const n of targets.names) names.set(matchKey(n), n);
  for (const [k, h] of hints) if (!names.has(k)) names.set(k, h.name);
  for (const [k, r] of saved) if (!names.has(k)) names.set(k, r.name);
  return [...names]
    .filter(([key]) => key)
    .map(([key, name]) => appOut(key, saved.get(key)?.name || name, saved.get(key), hints.get(key), { accounts: counts.get(key) || 0, onTargetList: onList.has(key) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function appOut(key, name, row, hint, extra) {
  // Until someone saves App Access details, show what the tracker already has (marked fromTracker).
  const fromTracker = !row && !!hint && (hint.mobile || !!hint.testingUrl);
  return {
    key,
    name,
    kind: row ? row.kind : hint?.mobile ? 'mobile' : hint?.testingUrl ? 'web' : null,
    platform: row?.platform || null,
    webUrl: row ? row.web_url : hint?.mobile ? null : safeUrl(hint?.testingUrl),
    buildUrl: row?.build_url || null,
    fromTracker,
    decommissioned: !!hint?.decommissioned,
    updatedBy: row?.updated_by || null,
    updatedAt: row?.updated_at || null,
    ...extra,
  };
}

const accountOut = (r) => ({
  id: r.id,
  username: r.username,
  hasPassword: !!r.password_enc,
  role: r.role,
  environment: r.environment,
  notes: r.notes,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

export function readApp(db, key) {
  const app = listAccess(db).find((a) => a.key === key);
  if (!app) return null;
  return {
    ...app,
    accounts: db.prepare('SELECT * FROM app_accounts WHERE app_key = ? ORDER BY sort_order, id').all(key).map(accountOut),
    history: db.prepare('SELECT action, detail, changed_by AS changedBy, changed_at AS changedAt FROM app_access_history WHERE app_key = ? ORDER BY id DESC LIMIT 50').all(key),
  };
}

// ---- writes -------------------------------------------------------------------------------------------

const logChange = (db, key, action, detail, user) =>
  db.prepare('INSERT INTO app_access_history (app_key, action, detail, changed_by) VALUES (?, ?, ?, ?)').run(key, action, detail, user);

// Creates the app_access row when an app gets its first details or account. Only apps the team already
// tracks (Target Project List or Assessment Tracker) can get one; the name comes from there, not the request.
function ensureRow(db, key, user) {
  if (accessRow(db, key)) return;
  const app = listAccess(db).find((a) => a.key === key);
  if (!app) throw new Error('Unknown app.');
  db.prepare('INSERT INTO app_access (app_key, name, kind, web_url, updated_by) VALUES (?, ?, ?, ?, ?)').run(key, app.name, app.kind || null, app.webUrl || null, user);
}

export function saveApp(db, key, body, user) {
  const kind = body.kind == null || body.kind === '' ? null : body.kind;
  if (kind !== null && !KINDS.includes(kind)) throw new Error('kind must be web or mobile.');
  const platform = body.platform == null || body.platform === '' ? null : body.platform;
  if (platform !== null && !PLATFORMS.includes(platform)) throw new Error('platform must be ios, android or both.');
  const next = {
    kind,
    platform: kind === 'mobile' ? platform : null,
    web_url: cleanUrl(body.webUrl, 'Web URL'),
    build_url: kind === 'mobile' ? cleanUrl(body.buildUrl, 'Build folder link') : null,
  };
  db.exec('BEGIN');
  try {
    ensureRow(db, key, user);
    const before = accessRow(db, key);
    const changed = Object.keys(next).filter((c) => (before[c] ?? null) !== next[c]);
    if (changed.length) {
      db.prepare("UPDATE app_access SET kind = ?, platform = ?, web_url = ?, build_url = ?, updated_by = ?, updated_at = datetime('now') WHERE app_key = ?")
        .run(next.kind, next.platform, next.web_url, next.build_url, user, key);
      const label = { kind: 'type', platform: 'platform', web_url: 'web URL', build_url: 'build folder link' };
      logChange(db, key, 'updated', changed.map((c) => `${label[c]}: ${next[c] ?? '(none)'}`).join('; '), user);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return readApp(db, key);
}

function accountFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.username !== undefined) out.username = text(body.username, 'username', { required: true });
  for (const f of ['role', 'environment', 'notes']) if (!partial || body[f] !== undefined) out[f] = text(body[f], f);
  return out;
}

const describe = (a) => `${a.username}${a.role ? ` (${a.role})` : ''}${a.environment ? ` · ${a.environment}` : ''}`;

export function addAccount(db, key, body, user, cipher) {
  const fields = accountFields(body);
  const password = cleanPassword(body.password);
  db.exec('BEGIN');
  try {
    ensureRow(db, key, user);
    const n = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), -1) + 1 AS next FROM app_accounts WHERE app_key = ?').get(key);
    if (n.n >= MAX_ACCOUNTS) throw new Error(`An app can have at most ${MAX_ACCOUNTS} accounts.`);
    db.prepare('INSERT INTO app_accounts (app_key, username, password_enc, role, environment, notes, sort_order, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(key, fields.username, password ? cipher.encrypt(password) : null, fields.role, fields.environment, fields.notes, n.next, user, user);
    logChange(db, key, 'account added', describe(fields), user);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return readApp(db, key);
}

const accountRow = (db, key, id) => db.prepare('SELECT * FROM app_accounts WHERE id = ? AND app_key = ?').get(id, key);

// password: undefined or '' keeps the saved one; clearPassword: true removes it.
export function updateAccount(db, key, id, body, user, cipher) {
  const current = accountRow(db, key, id);
  if (!current) return null;
  const fields = accountFields(body, { partial: true });
  const password = cleanPassword(body.password);
  const sets = Object.entries(fields).filter(([f, v]) => (current[f] ?? null) !== v);
  const changes = sets.map(([f]) => f);
  if (password) {
    sets.push(['password_enc', cipher.encrypt(password)]);
    changes.push('password');
  } else if (body.clearPassword === true && current.password_enc) {
    sets.push(['password_enc', null]);
    changes.push('password removed');
  }
  if (sets.length) {
    db.prepare(`UPDATE app_accounts SET ${sets.map(([c]) => `${c} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(...sets.map(([, v]) => v), user, id);
    logChange(db, key, 'account changed', `${describe({ ...current, ...fields })}: ${changes.join(', ')}`, user);
  }
  return readApp(db, key);
}

export function deleteAccount(db, key, id, user) {
  const current = accountRow(db, key, id);
  if (!current) return null;
  db.prepare('DELETE FROM app_accounts WHERE id = ?').run(id);
  logChange(db, key, 'account removed', describe(current), user);
  return readApp(db, key);
}

// The one route that returns a password: for the Copy button. Logged every time.
export function revealPassword(db, key, id, user, cipher) {
  const current = accountRow(db, key, id);
  if (!current) return { status: 404 };
  if (!current.password_enc) return { status: 404, error: 'No password is saved for this account.' };
  let password;
  try {
    password = cipher.decrypt(current.password_enc);
  } catch {
    return { status: 500, error: 'The password could not be decrypted (wrong or missing access.key).' };
  }
  logChange(db, key, 'password copied', describe(current), user);
  return { status: 200, password };
}

// ---- routes -------------------------------------------------------------------------------------------

// Mounted by tracker.js on its router at /access. Every route needs a signed-in user (req.user, set by
// auth/auth.js) even though the app-wide gate already checks it: these routes hold credentials.
export function mountAccess(router, { db, cipher, log = () => {}, now = Date.now }) {
  const copies = new Map(); // user -> recent copy times
  const userOf = (req) => String(req.user?.name || req.user?.email || '').slice(0, 80) || 'Unknown';

  router.use('/access', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!db) return res.status(503).json({ error: 'Assessment Tracker database is not available.' });
    if (!req.user) return res.status(401).json({ error: 'Sign-in required' });
    next();
  });

  const fail = (res, e) => res.status(400).json({ error: e.message });
  const okKey = (key) => /^[a-z0-9]{1,200}$/.test(key);
  const okId = (id) => /^\d{1,12}$/.test(id);

  router.get('/access', (_req, res) => res.json(listAccess(db)));

  router.get('/access/apps/:key', (req, res) => {
    const app = okKey(req.params.key) && readApp(db, req.params.key);
    return app ? res.json(app) : res.status(404).json({ error: 'Unknown app.' });
  });

  router.put('/access/apps/:key', (req, res) => {
    if (!okKey(req.params.key)) return res.status(404).json({ error: 'Unknown app.' });
    try {
      res.json(saveApp(db, req.params.key, req.body || {}, userOf(req)));
    } catch (e) {
      fail(res, e);
    }
  });

  router.post('/access/apps/:key/accounts', (req, res) => {
    if (!okKey(req.params.key)) return res.status(404).json({ error: 'Unknown app.' });
    try {
      res.status(201).json(addAccount(db, req.params.key, req.body || {}, userOf(req), cipher));
    } catch (e) {
      fail(res, e);
    }
  });

  router.patch('/access/apps/:key/accounts/:id', (req, res) => {
    if (!okKey(req.params.key) || !okId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    try {
      const out = updateAccount(db, req.params.key, Number(req.params.id), req.body || {}, userOf(req), cipher);
      return out ? res.json(out) : res.status(404).json({ error: 'Not found' });
    } catch (e) {
      fail(res, e);
    }
  });

  router.delete('/access/apps/:key/accounts/:id', (req, res) => {
    if (!okKey(req.params.key) || !okId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const out = deleteAccount(db, req.params.key, Number(req.params.id), userOf(req));
    return out ? res.json(out) : res.status(404).json({ error: 'Not found' });
  });

  // POST with a JSON content type only, so a plain cross-site form or link can't trigger it.
  router.post('/access/apps/:key/accounts/:id/copy', (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
    if (!okKey(req.params.key) || !okId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const user = userOf(req);
    const t = now();
    const recent = (copies.get(user) || []).filter((x) => t - x < COPY_WINDOW_MS);
    if (recent.length >= COPY_LIMIT) return res.status(429).json({ error: 'Too many password copies. Try again in a few minutes.' });
    const out = revealPassword(db, req.params.key, Number(req.params.id), user, cipher);
    if (out.status !== 200) return res.status(out.status).json({ error: out.error || 'Not found' });
    copies.set(user, [...recent, t]);
    log(`password copied: ${req.params.key} account ${req.params.id} by ${user}`);
    res.json({ password: out.password });
  });
}
