import { matchKey } from '../../tracker/shared/logic.js';

// UberTicket PIA policies + the tracker's app list -> the PIA app list.
//   apps        every tracker app, plus every product named in a PIA policy (so apps without a PIA show as gaps),
//               plus apps an admin added; matched by matchKey (case, punctuation, a leading "Cloudstaff") or a pia_links entry
//   policies    the pia_policies cache is replaced on every sync (UberTicket wins)
// Admin-entered data (reassessments, hidden apps, manual apps, links) is never changed here. An app that only
// came from a PIA policy and no longer has one (e.g. after a manual link) is removed, unless an admin recorded
// something on it.

export function syncPia(db, { policies = [], trackerApps = [] }) {
  const created = [];
  db.exec('BEGIN');
  try {
    const appIdByKey = new Map(db.prepare('SELECT id, match_key FROM apps').all().map((a) => [a.match_key, a.id]));
    const links = new Map(db.prepare('SELECT product_key, app_id FROM pia_links').all().map((l) => [l.product_key, l.app_id]));

    // Tracker apps (read-only source): name, repositories and decommissioned come from the tracker.
    db.prepare('UPDATE apps SET in_tracker = 0, decommissioned = 0').run();
    const upsertTracker = db.prepare(`INSERT INTO apps (name, match_key, in_tracker, decommissioned, repositories, updated_by)
      VALUES (?, ?, 1, ?, ?, 'Tracker sync')
      ON CONFLICT(match_key) DO UPDATE SET name = excluded.name, in_tracker = 1, decommissioned = excluded.decommissioned, repositories = excluded.repositories
      RETURNING id`);
    for (const t of trackerApps) {
      const key = matchKey(t.name);
      if (!key) continue;
      appIdByKey.set(key, upsertTracker.get(String(t.name).trim(), key, t.decommissioned ? 1 : 0, t.repositories || null).id);
    }

    // PIA policies: link, match or create the app.
    db.prepare('DELETE FROM pia_policies').run();
    const insertApp = db.prepare("INSERT INTO apps (name, match_key, updated_by) VALUES (?, ?, 'UberTicket sync') RETURNING id");
    const insertPolicy = db.prepare(`INSERT OR REPLACE INTO pia_policies
      (id, app_id, serial, url, product, product_key, status, state, version, risk_rating, risk_label, submitter, approved_by, submitted_at, approved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of policies) {
      const productKey = matchKey(p.product);
      if (!productKey) continue;
      let appId = links.get(productKey) ?? appIdByKey.get(productKey);
      if (appId == null) {
        appId = insertApp.get(String(p.product).trim(), productKey).id;
        appIdByKey.set(productKey, appId);
        created.push(String(p.product).trim());
      }
      insertPolicy.run(p.id, appId, p.serial ?? null, p.url ?? null, p.product, productKey, p.status ?? null, p.state, p.version ?? null,
        p.riskRating ?? null, p.riskLabel ?? null, p.submitter ?? null, p.approvedBy ?? null, p.submittedAt ?? null, p.approvedAt ?? null, p.updatedAt ?? null);
    }
    db.prepare('UPDATE apps SET from_pia = EXISTS (SELECT 1 FROM pia_policies p WHERE p.app_id = apps.id)').run();

    // Apps left with no source and nothing recorded on them.
    const removed = db.prepare(`DELETE FROM apps WHERE in_tracker = 0 AND from_pia = 0 AND manual = 0 AND hidden = 0
      AND NOT EXISTS (SELECT 1 FROM reassessments r WHERE r.app_id = apps.id)
      AND NOT EXISTS (SELECT 1 FROM pia_links l WHERE l.app_id = apps.id)
      RETURNING name`).all().map((r) => r.name);
    db.exec('COMMIT');

    return {
      at: new Date().toISOString(),
      policies: policies.length,
      apps: db.prepare('SELECT COUNT(*) AS n FROM apps').get().n,
      created: created.filter((n) => !removed.includes(n)),
      removed,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
