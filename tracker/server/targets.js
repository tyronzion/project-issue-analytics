import { matchKey } from '../shared/logic.js';
import { targetKey } from '../shared/targets.js';

// The shared Target Project List (one list for everyone, stored in the tracker database).
//   target_projects   one row per list entry (unique by matchKey, so "Staffcentral IOS" and "Staffcentral" are
//                     separate entries, as the analytics pages treat them); removed = 1 keeps a removed app from
//                     being re-added by the RoE sync
//   target_history    who added / removed what, and switch changes
//   target_settings   seeded_at (when the list was first saved; RoE tickets from then on are added),
//                     target_only ('1' = pages show only target apps; on by default)
// Admins edit the list; new Rules of Engagement products are added by the UberTicket sync.

export const MAX_TARGETS = 1000;
const MAX_NAME = 120;

export function ensureTargetTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS target_projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      entry_key TEXT NOT NULL UNIQUE,    -- matchKey(name)
      sort_order INTEGER NOT NULL DEFAULT 0,
      removed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,              -- 'seed' | 'admin' | 'roe'
      ticket_key TEXT,                   -- the Rules of Engagement ticket that added it
      added_by TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS target_history (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL,              -- 'added' | 'removed' | 'target only on' | 'target only off' | 'set up'
      name TEXT,
      changed_by TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS target_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

const setting = (db, key) => db.prepare('SELECT value FROM target_settings WHERE key = ?').get(key)?.value ?? null;
const setSetting = (db, key, value) =>
  db.prepare('INSERT INTO target_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

export function readTargets(db, { history = false } = {}) {
  const seededAt = setting(db, 'seeded_at');
  const rows = db.prepare('SELECT * FROM target_projects WHERE removed = 0 ORDER BY sort_order, id').all();
  const out = {
    seeded: !!seededAt,
    seededAt,
    targetOnly: setting(db, 'target_only') !== '0',
    names: rows.map((r) => r.name),
    entries: rows.map((r) => ({ name: r.name, source: r.source, ticketKey: r.ticket_key, addedBy: r.added_by, addedAt: r.added_at })),
  };
  if (history) {
    out.history = db.prepare('SELECT action, name, changed_by AS changedBy, changed_at AS changedAt FROM target_history ORDER BY id DESC LIMIT 200').all();
  }
  return out;
}

// names: array of strings from the request. Returns the cleaned list (first spelling of each entry kept)
// or throws with a message for the 400 response.
export function cleanNames(names) {
  if (!Array.isArray(names)) throw new Error('names must be a list of app names.');
  if (names.length > MAX_TARGETS) throw new Error(`The list is limited to ${MAX_TARGETS} apps.`);
  const seen = new Set();
  const out = [];
  for (const raw of names) {
    if (typeof raw !== 'string') throw new Error('Every app name must be text.');
    const name = raw.trim();
    if (!name) continue;
    if (name.length > MAX_NAME) throw new Error(`App names are limited to ${MAX_NAME} characters.`);
    const key = matchKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Replaces the list (admin save) and/or the "target only" switch. seed = the first save, from a browser's
// old list; refused once the list exists so a stale browser can't overwrite it.
export function saveTargets(db, { names, targetOnly, seed = false, user, now = () => new Date().toISOString() }) {
  const seededAt = setting(db, 'seeded_at');
  if (seed && seededAt) return { conflict: true };
  const list = names === undefined ? null : cleanNames(names);
  const log = db.prepare('INSERT INTO target_history (action, name, changed_by) VALUES (?, ?, ?)');

  db.exec('BEGIN');
  try {
    if (!seededAt) {
      setSetting(db, 'seeded_at', now());
      log.run('set up', null, user);
    }
    if (list) {
      const existing = new Map(db.prepare('SELECT * FROM target_projects').all().map((r) => [r.entry_key, r]));
      const keep = new Set();
      list.forEach((name, i) => {
        const key = matchKey(name);
        keep.add(key);
        const cur = existing.get(key);
        if (!cur) {
          db.prepare('INSERT INTO target_projects (name, entry_key, sort_order, source, added_by) VALUES (?, ?, ?, ?, ?)')
            .run(name, key, i, seed ? 'seed' : 'admin', user);
          if (!seed) log.run('added', name, user);
        } else {
          db.prepare('UPDATE target_projects SET name = ?, sort_order = ?, removed = 0 WHERE id = ?').run(name, i, cur.id);
          if (cur.removed) {
            db.prepare("UPDATE target_projects SET source = 'admin', added_by = ?, added_at = datetime('now') WHERE id = ?").run(user, cur.id);
            log.run('added', name, user);
          }
        }
      });
      for (const [key, r] of existing) {
        if (!keep.has(key) && !r.removed) {
          db.prepare('UPDATE target_projects SET removed = 1 WHERE id = ?').run(r.id);
          log.run('removed', r.name, user);
        }
      }
      if (seed) log.run('added', `${list.length} apps from the existing list`, user);
    }
    if (typeof targetOnly === 'boolean') {
      const before = setting(db, 'target_only') !== '0';
      setSetting(db, 'target_only', targetOnly ? '1' : '0');
      if (before !== targetOnly) log.run(targetOnly ? 'target only on' : 'target only off', null, user);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return readTargets(db);
}

// New Rules of Engagement apps: a product named in an RoE ticket created after the list was set up,
// that isn't covered by the list (targetKey: platform variants count) and wasn't removed by an admin, is added. Rejected tickets and tickets
// the tracker ignores are skipped. Returns the names added.
export function addTargetsFromRoe(db, roeTickets = []) {
  const seededAt = setting(db, 'seeded_at');
  if (!seededAt) return [];
  const since = Date.parse(seededAt);
  const known = new Set(db.prepare('SELECT name FROM target_projects').all().map((r) => targetKey(r.name)));
  const ignored = new Set(db.prepare('SELECT ticket_key FROM ticket_ignores').all().map((r) => r.ticket_key));
  const fresh = roeTickets
    .filter((t) => t.state !== 'rejected' && t.product && t.product !== 'Unspecified product' && !ignored.has(t.key) && (t.createdAt ?? 0) >= since)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const added = [];
  if (!fresh.length) return added;

  db.exec('BEGIN');
  try {
    let order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM target_projects').get().n;
    for (const t of fresh) {
      const name = String(t.product).trim().slice(0, MAX_NAME);
      const key = targetKey(name);
      if (!key || known.has(key)) continue;
      known.add(key);
      const by = `Rules of Engagement ${t.key}`;
      db.prepare("INSERT INTO target_projects (name, entry_key, sort_order, source, ticket_key, added_by) VALUES (?, ?, ?, 'roe', ?, ?)")
        .run(name, matchKey(name), order++, t.key, by);
      db.prepare('INSERT INTO target_history (action, name, changed_by) VALUES (?, ?, ?)').run('added', name, by);
      added.push(name);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return added;
}
