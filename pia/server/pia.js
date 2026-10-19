import express from 'express';
import path from 'node:path';
import { openPiaDb, appToApi, policyToApi, reassessmentToApi } from './db.js';
import { syncPia } from './sync.js';
import { piaStatus, dayOf, isDay, DEFAULT_DUE_SOON_DAYS } from '../shared/rules.js';
import { matchKey } from '../../tracker/shared/logic.js';

// Privacy Impact Assessment API, mounted by vite.config.ts at /api/pia.
//   getPolicies()     normalized [PIA01] policies from the UberTicket monitor (read-only source)
//   getTrackerApps()  the Assessment Tracker's app list (read-only source)
//   uberticket()      the monitor's PIA fetch status
//   isAdmin(req)      every change (reassessments, apps, links, settings, sync) is admin-only. Without it,
//                     changes are refused: these are compliance records.
export async function createPia({ root, getPolicies = () => [], getTrackerApps = () => [], uberticket = () => null, isAdmin = null, offsetHours = 8, now = () => Date.now(), log = (m) => console.log(`[pia] ${m}`) }) {
  const router = express.Router();
  let db = null;
  let unavailable = null;
  try {
    db = await openPiaDb(process.env.PIA_DB_PATH || path.join(root, 'data', 'pia.db'));
    log(`database ready (${db.engine})`);
  } catch (err) {
    unavailable = `PIA database could not be opened: ${err.message}`;
    log(unavailable);
  }

  let lastSync = null;
  function sync() {
    if (!db) return lastSync;
    try {
      lastSync = syncPia(db, { policies: getPolicies() || [], trackerApps: getTrackerApps() || [] });
      log(`UberTicket sync: ${lastSync.policies} PIA policies, ${lastSync.apps} apps${lastSync.created.length ? `, added ${lastSync.created.join(', ')}` : ''}`);
    } catch (err) {
      lastSync = { at: new Date().toISOString(), error: err.message, created: [], removed: [] };
      log(`UberTicket sync failed: ${err.message}`);
    }
    return lastSync;
  }

  const setting = (key, fallback) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
  const dueSoonDays = () => Number(setting('due_soon_days', process.env.PIA_DUE_SOON_DAYS || DEFAULT_DUE_SOON_DAYS));
  const today = () => dayOf(now(), offsetHours);

  router.use(express.json({ limit: '100kb' }));
  router.use((_req, res, next) => (unavailable ? res.status(503).json({ error: unavailable }) : next()));

  // Audit name: the signed-in user (set by auth/auth.js). The browser can't choose it.
  const userOf = (req) => String(req.user?.name || req.user?.email || '').slice(0, 80) || 'Unknown';
  const adminOnly = (req, res, next) => (isAdmin && isAdmin(req) ? next() : res.status(403).json({ error: 'Only admins can do this.' }));
  const logChange = (appId, field, oldValue, newValue, user) =>
    db.prepare('INSERT INTO history (app_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)').run(appId, field, oldValue ?? null, newValue ?? null, user);

  // App + its reassessment status.
  function view(app, policies, reassessments, opts) {
    return { ...appToApi(app), ...piaStatus({ policies, reassessments, offsetHours, ...opts }), policyCount: policies.filter((p) => p.state !== 'rejected').length };
  }

  router.get('/apps', (_req, res) => {
    const opts = { today: today(), dueSoonDays: dueSoonDays() };
    const policies = db.prepare('SELECT * FROM pia_policies').all().map(policyToApi);
    const reassessments = db.prepare('SELECT * FROM reassessments').all().map(reassessmentToApi);
    const group = (list) => list.reduce((m, x) => m.set(x.appId, [...(m.get(x.appId) || []), x]), new Map());
    const byApp = group(policies);
    const reByApp = group(reassessments);
    const apps = db.prepare('SELECT * FROM apps ORDER BY name COLLATE NOCASE').all()
      .map((a) => {
        const v = view(a, byApp.get(a.id) || [], reByApp.get(a.id) || [], opts);
        const latest = (byApp.get(a.id) || []).filter((p) => p.state !== 'rejected').sort((x, y) => (y.submittedAt ?? 0) - (x.submittedAt ?? 0))[0];
        return { ...v, latestPolicy: latest ? { url: latest.url, version: latest.version, state: latest.state } : null };
      });
    res.json({ ...opts, apps, uberticket: uberticket(), lastSync });
  });

  router.get('/apps/:id', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const policies = db.prepare('SELECT * FROM pia_policies WHERE app_id = ? ORDER BY submitted_at DESC').all(app.id).map(policyToApi);
    const reassessments = db.prepare('SELECT * FROM reassessments WHERE app_id = ? ORDER BY assessed_on DESC, id DESC').all(app.id).map(reassessmentToApi);
    const history = db.prepare('SELECT field, old_value AS oldValue, new_value AS newValue, changed_by AS changedBy, changed_at AS changedAt FROM history WHERE app_id = ? ORDER BY id DESC LIMIT 200').all(app.id);
    const opts = { today: today(), dueSoonDays: dueSoonDays() };
    res.json({ ...opts, app: view(app, policies, reassessments, opts), policies, reassessments, history });
  });

  // An app that is in neither the tracker nor UberTicket yet.
  router.post('/apps', adminOnly, (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const key = matchKey(name);
    if (!name || name.length > 120 || !key) return res.status(400).json({ error: 'An app name (up to 120 characters) is required.' });
    const existing = db.prepare('SELECT * FROM apps WHERE match_key = ?').get(key);
    if (existing) return res.status(409).json({ error: `"${existing.name}" is already on the list.`, app: appToApi(existing) });
    const app = db.prepare('INSERT INTO apps (name, match_key, manual, updated_by) VALUES (?, ?, 1, ?) RETURNING *').get(name, key, userOf(req));
    logChange(app.id, 'created', null, name, userOf(req));
    res.status(201).json(appToApi(app));
  });

  // Hide or show an app on the PIA list (a reason is required to hide).
  router.patch('/apps/:id', adminOnly, (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (typeof req.body?.hidden !== 'boolean') return res.status(400).json({ error: 'hidden (true/false) is required.' });
    const hidden = req.body.hidden;
    const reason = String(req.body.hiddenReason ?? '').trim().slice(0, 500);
    if (hidden && !reason) return res.status(400).json({ error: 'Say why the app is taken off the PIA list.' });
    const user = userOf(req);
    const row = db.prepare("UPDATE apps SET hidden = ?, hidden_reason = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ? RETURNING *")
      .get(hidden ? 1 : 0, hidden ? reason : null, user, app.id);
    if (!!app.hidden !== hidden) logChange(app.id, hidden ? 'hidden' : 'shown', app.hidden_reason, hidden ? reason : null, user);
    res.json(appToApi(row));
  });

  // Record a reassessment: the date it was completed and the report.
  router.post('/apps/:id/reassessments', adminOnly, (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const assessedOn = String(req.body?.assessedOn ?? '');
    const reportUrl = String(req.body?.reportUrl ?? '').trim();
    const notes = String(req.body?.notes ?? '').trim();
    if (!isDay(assessedOn) || assessedOn < '2000-01-01') return res.status(400).json({ error: 'assessedOn must be a date (YYYY-MM-DD).' });
    if (assessedOn > today()) return res.status(400).json({ error: 'The reassessment date can\'t be in the future.' });
    if (!isHttpsUrl(reportUrl)) return res.status(400).json({ error: 'The report link must be an https:// URL.' });
    if (notes.length > 1000) return res.status(400).json({ error: 'Notes are limited to 1000 characters.' });
    const user = userOf(req);
    const row = db.prepare('INSERT INTO reassessments (app_id, assessed_on, report_url, notes, recorded_by) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .get(app.id, assessedOn, reportUrl, notes || null, user);
    logChange(app.id, 'reassessment', null, `${assessedOn} ${reportUrl}`, user);
    res.status(201).json(reassessmentToApi(row));
  });

  // Remove a reassessment recorded by mistake (kept in the history).
  router.delete('/reassessments/:id', adminOnly, (req, res) => {
    const r = db.prepare('SELECT * FROM reassessments WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM reassessments WHERE id = ?').run(r.id);
    logChange(r.app_id, 'reassessment removed', `${r.assessed_on} ${r.report_url}`, null, userOf(req));
    res.status(204).end();
  });

  // Sync status, PIA products that aren't tracker apps, and manual links.
  router.get('/sync', (_req, res) => {
    const products = db.prepare('SELECT DISTINCT app_id, product FROM pia_policies').all();
    const piaOnly = db.prepare('SELECT * FROM apps WHERE in_tracker = 0 AND manual = 0 AND from_pia = 1 ORDER BY name COLLATE NOCASE').all()
      .map((a) => ({ ...appToApi(a), products: products.filter((p) => p.app_id === a.id).map((p) => p.product) }));
    const links = db.prepare(`SELECT l.product_key AS productKey, l.product, l.app_id AS appId, a.name AS appName, l.linked_by AS linkedBy, l.linked_at AS linkedAt
      FROM pia_links l JOIN apps a ON a.id = l.app_id ORDER BY l.product COLLATE NOCASE`).all();
    const apps = db.prepare('SELECT id, name, in_tracker AS inTracker FROM apps ORDER BY name COLLATE NOCASE').all().map((a) => ({ ...a, inTracker: !!a.inTracker }));
    res.json({ uberticket: uberticket(), last: lastSync, piaOnly, links, apps, dueSoonDays: dueSoonDays() });
  });
  router.post('/sync', adminOnly, (_req, res) => res.json(sync()));

  router.post('/links', adminOnly, (req, res) => {
    const product = String(req.body?.product ?? '').trim();
    const target = db.prepare('SELECT * FROM apps WHERE id = ?').get(Number(req.body?.appId));
    if (!product || !matchKey(product) || !target) return res.status(400).json({ error: 'product and an existing appId are required.' });
    if (matchKey(product) === target.match_key) return res.status(400).json({ error: 'That product already matches this app by name.' });
    const user = userOf(req);
    db.prepare("INSERT INTO pia_links (product_key, product, app_id, linked_by) VALUES (?, ?, ?, ?) ON CONFLICT(product_key) DO UPDATE SET product = excluded.product, app_id = excluded.app_id, linked_by = excluded.linked_by, linked_at = datetime('now')")
      .run(matchKey(product), product, target.id, user);
    logChange(target.id, 'linked product', null, product, user);
    res.json(sync());
  });
  router.delete('/links/:productKey', adminOnly, (req, res) => {
    const l = db.prepare('SELECT * FROM pia_links WHERE product_key = ?').get(req.params.productKey);
    if (!l) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM pia_links WHERE product_key = ?').run(l.product_key);
    logChange(l.app_id, 'unlinked product', l.product, null, userOf(req));
    res.json(sync());
  });

  router.put('/settings', adminOnly, (req, res) => {
    const days = req.body?.dueSoonDays;
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'dueSoonDays must be a whole number from 1 to 365.' });
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('due_soon_days', String(days));
    log(`coming-due window set to ${days} days by ${userOf(req)}`);
    res.json({ dueSoonDays: dueSoonDays() });
  });

  // A full express app (not a bare Router) so req.get / res.json work when mounted in Vite's connect server.
  const app = express();
  app.disable('x-powered-by');
  app.use(router);
  return { app, sync, available: !!db };
}

// Report links are shown as clickable links, so only https URLs are accepted (no javascript:, data:, http:).
export function isHttpsUrl(value) {
  if (!value || value.length > 2000) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
