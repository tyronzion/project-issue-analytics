import { matchKey, TRACKS } from '../shared/logic.js';
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
    -- Rows added for list apps (addRowsForTargets) that someone deleted: don't add them again.
    CREATE TABLE IF NOT EXISTS target_row_ignores (
      app_key TEXT NOT NULL,             -- targetKey(project)
      cycle_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      ignored_by TEXT,
      ignored_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (app_key, cycle_id, period)
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

// The list as the guide for the Assessment Tracker: every list app gets a "Not Started" row in this year's
// cycle for the current period and the ones after it, so the tracker and the list count the same apps. A
// Full Assessment ticket for the app is then matched to that row by the UberTicket sync (same name and
// period), which fills in its link, status, tester and dates.
//   - one row per app: platform entries ("Radio AOS") are the same app as "Radio" (targetKey)
//   - the app's track this year if it has rows already, otherwise Bi-Annual; no cycle for the year = nothing
//   - apps decommissioned this year, and rows someone deleted (target_row_ignores), are left alone
export function addRowsForTargets(db, { today = new Date(), user = 'Target Project List' } = {}) {
  if (!setting(db, 'seeded_at')) return [];
  const names = db.prepare('SELECT name FROM target_projects WHERE removed = 0 ORDER BY sort_order, id').all().map((r) => r.name);
  const year = today.getFullYear();
  const cycles = db.prepare('SELECT id, track FROM cycles WHERE year = ?').all(year);
  if (!names.length || !cycles.length) return [];
  const cycleOf = new Map(cycles.map((c) => [c.track, c.id]));
  const month = today.getMonth();
  const fromIndex = { biannual: month < 6 ? 0 : 1, quarterly: Math.floor(month / 3) };

  const rows = db.prepare('SELECT a.project, a.period, a.is_active, a.cycle_id, c.track FROM assessments a JOIN cycles c ON c.id = a.cycle_id WHERE c.year = ?').all(year);
  const byApp = new Map();
  for (const r of rows) {
    const k = targetKey(r.project);
    byApp.set(k, [...(byApp.get(k) || []), r]);
  }
  const ignored = new Set(db.prepare('SELECT app_key, cycle_id, period FROM target_row_ignores').all().map((r) => `${r.app_key}|${r.cycle_id}|${r.period}`));

  // One name per app: the shortest list entry ("Radio" rather than "Radio AOS").
  const apps = new Map();
  for (const n of names) {
    const k = targetKey(n);
    if (k && (!apps.has(k) || n.length < apps.get(k).length)) apps.set(k, n);
  }

  const added = [];
  db.exec('BEGIN');
  try {
    const insert = db.prepare(`INSERT INTO assessments (cycle_id, period, sort_order, project, is_active, created_from_target, updated_by)
      VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM assessments WHERE cycle_id = ? AND period = ?), ?, 'Active', 1, ?) RETURNING id`);
    const log = db.prepare('INSERT INTO history (assessment_id, field, new_value, changed_by) VALUES (?, ?, ?, ?)');
    for (const [k, name] of apps) {
      const existing = byApp.get(k) || [];
      if (existing.some((r) => r.is_active === 'Decommissioned')) continue;
      const track = existing[0]?.track ?? (cycleOf.has('biannual') ? 'biannual' : cycles[0].track);
      const cycleId = cycleOf.get(track);
      if (!cycleId) continue;
      for (const period of TRACKS[track].periods.slice(fromIndex[track])) {
        if (existing.some((r) => r.cycle_id === cycleId && r.period === period) || ignored.has(`${k}|${cycleId}|${period}`)) continue;
        const id = insert.get(cycleId, period, cycleId, period, name, user).id;
        log.run(id, 'created', `${name} (from the Target Project List)`, user);
        added.push({ id, project: name, track, period });
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return added;
}

// Deleting a row that addRowsForTargets added: remember it, so it isn't added again.
export function ignoreTargetRow(db, row, user) {
  if (!row?.created_from_target) return;
  db.prepare('INSERT OR IGNORE INTO target_row_ignores (app_key, cycle_id, period, ignored_by) VALUES (?, ?, ?, ?)')
    .run(targetKey(row.project), row.cycle_id, row.period, user);
}
