import express from 'express';
import path from 'node:path';
import { openDb, FIELDS, toApi, toDb, listApps } from './db.js';
import { parseWorkbook, previewOf, importCycles } from './importer.js';
import { syncTickets } from './sync.js';
import { readTargets, saveTargets, addTargetsFromRoe } from './targets.js';
import { TRACKS, SEALS, matchKey } from '../shared/logic.js';
import { normalizeReportInfo, normalizeSnapshot } from '../shared/report.js';
import { targetKey } from '../shared/targets.js';

// Assessment Tracker API, mounted by vite.config.ts at /api/tracker.
// getTickets() returns { full, roe } normalized UberTicket tickets (from the monitor).
// isAdmin(req), when given, limits setup routes (Excel import, UberTicket sync and links) to admins.
export async function createTracker({ root, getTickets = null, ticketStatus = () => null, offsetHours = 8, isAdmin = null, log = (m) => console.log(`[tracker] ${m}`) }) {
  const router = express.Router();
  let db = null;
  let unavailable = null;
  try {
    db = await openDb(process.env.TRACKER_DB_PATH || path.join(root, 'data', 'tracker.db'));
    log(`database ready (${db.engine})`);
  } catch (err) {
    unavailable = `Assessment Tracker database could not be opened: ${err.message}`;
    log(unavailable);
  }

  let lastSync = null;
  function sync() {
    if (!db || !getTickets) return lastSync;
    try {
      const tickets = getTickets();
      lastSync = syncTickets(db, tickets, { offsetHours });
      log(`UberTicket sync: ${lastSync.tickets} tickets, ${lastSync.matchedApps} apps matched, ${lastSync.updated} updated, ${lastSync.unmatched.length} unmatched`);
      // New Rules of Engagement apps join the shared Target Project List.
      try {
        lastSync.targetsAdded = addTargetsFromRoe(db, tickets?.roe || []);
        if (lastSync.targetsAdded.length) log(`added to the Target Project List from Rules of Engagement: ${lastSync.targetsAdded.join(', ')}`);
      } catch (err) {
        log(`Target Project List update from Rules of Engagement failed: ${err.message}`);
      }
    } catch (err) {
      lastSync = { at: new Date().toISOString(), error: err.message, unmatched: [] };
      log(`UberTicket sync failed: ${err.message}`);
    }
    return lastSync;
  }

  router.use(express.json({ limit: '2mb' }));
  router.use((_req, res, next) => (unavailable ? res.status(503).json({ error: unavailable }) : next()));

  // Who made a change: the signed-in user when there is one (set by auth/auth.js), else the name the page sent.
  const userOf = (req) => String(req.user?.name || req.user?.email || req.get('x-user') || '').slice(0, 80) || 'Unknown';
  const adminOnly = (req, res, next) => (!isAdmin || isAdmin(req) ? next() : res.status(403).json({ error: 'Only admins can do this.' }));

  router.get('/cycles', (_req, res) => {
    const rows = db.prepare(`
      SELECT c.id, c.track, c.year, COUNT(a.id) AS apps, MAX(a.updated_at) AS lastUpdated
      FROM cycles c LEFT JOIN assessments a ON a.cycle_id = c.id
      GROUP BY c.id ORDER BY c.year DESC, c.track`).all();
    res.json(rows.map((r) => ({ ...r, label: `${r.year} ${TRACKS[r.track].label}`, periods: TRACKS[r.track].periods })));
  });

  router.post('/cycles', (req, res) => {
    const { track, year } = req.body || {};
    if (!TRACKS[track] || !Number.isInteger(year)) return res.status(400).json({ error: 'track and year are required' });
    try {
      res.status(201).json(db.prepare('INSERT INTO cycles (track, year) VALUES (?, ?) RETURNING id').get(track, year));
    } catch {
      res.status(409).json({ error: 'That cycle already exists' });
    }
  });

  router.get('/cycles/:id/assessments', (req, res) => {
    res.json(db.prepare('SELECT * FROM assessments WHERE cycle_id = ? ORDER BY period, sort_order').all(req.params.id).map(toApi));
  });

  router.post('/cycles/:id/assessments', (req, res) => {
    const body = req.body || {};
    if (!body.project || !body.period) return res.status(400).json({ error: 'project and period are required' });
    const next = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM assessments WHERE cycle_id = ? AND period = ?').get(req.params.id, body.period).n;
    const data = { ...body, sortOrder: next };
    try {
      if (data.reportInfo !== undefined) data.reportInfo = normalizeReportInfo(data.reportInfo);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const keys = Object.keys(FIELDS).filter((k) => data[k] !== undefined);
    const row = db.prepare(`INSERT INTO assessments (cycle_id, ${keys.map((k) => FIELDS[k]).join(', ')}, seal_source, updated_by)
      VALUES (?, ${keys.map(() => '?').join(', ')}, ?, ?) RETURNING *`).get(req.params.id, ...keys.map((k) => toDb(data[k], k)), data.seal ? 'manual' : null, userOf(req));
    db.prepare('INSERT INTO history (assessment_id, field, new_value, changed_by) VALUES (?, ?, ?, ?)').run(row.id, 'created', body.project, userOf(req));
    sync();
    res.status(201).json(toApi(db.prepare('SELECT * FROM assessments WHERE id = ?').get(row.id)));
  });

  router.patch('/assessments/:id', (req, res) => {
    const current = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const before = toApi(current);
    const changes = Object.entries(req.body || {}).filter(([k]) => FIELDS[k]);
    if (!changes.length) return res.json(before);
    // Report text and links: whitelisted keys, length limits, http(s) links only.
    const reportIdx = changes.findIndex(([k]) => k === 'reportInfo');
    if (reportIdx >= 0) {
      try {
        changes[reportIdx] = ['reportInfo', normalizeReportInfo(changes[reportIdx][1])];
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    if (changes.some(([k]) => k === 'seal')) changes.push(['__sealSource', 'manual']);

    const user = userOf(req);
    const logChange = db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      for (const [k, v] of changes) {
        if (k === '__sealSource') continue;
        if (k === 'checks') {
          for (const key of new Set([...Object.keys(before.checks), ...Object.keys(v || {})])) {
            if (!!before.checks[key] !== !!v?.[key]) logChange.run(current.id, `checklist.${key}`, String(!!before.checks[key]), String(!!v?.[key]), user);
          }
        } else if (k === 'reportInfo') {
          const [was, now] = [before.reportInfo, v].map((x) => (x == null ? null : JSON.stringify(x)));
          if (was !== now) logChange.run(current.id, k, was, now, user);
        } else if (String(before[k] ?? '') !== String(v ?? '')) {
          logChange.run(current.id, k, before[k] == null ? null : String(before[k]), v == null ? null : String(v), user);
        }
      }
      const cols = changes.map(([k]) => (k === '__sealSource' ? 'seal_source' : FIELDS[k]));
      const vals = changes.map(([k, v]) => (k === '__sealSource' ? v : toDb(v, k)));
      const row = db.prepare(`UPDATE assessments SET ${cols.map((c) => `${c} = ?`).join(', ')},
        updated_at = datetime('now'), updated_by = ? WHERE id = ? RETURNING *`).get(...vals, user, current.id);
      db.exec('COMMIT');
      // Project / period / active changes can change which ticket belongs to the app.
      if (changes.some(([k]) => ['project', 'period', 'isActive'].includes(k))) sync();
      res.json(toApi(db.prepare('SELECT * FROM assessments WHERE id = ?').get(row.id)));
    } catch (e) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/assessments/:id', (req, res) => {
    const r = db.prepare('SELECT project, ticket_key, ticket_source, created_from_ticket FROM assessments WHERE id = ?').get(req.params.id);
    // Deleting an app that came from a Rules of Engagement ticket: don't let the sync re-create it.
    const ignore = db.prepare('INSERT OR IGNORE INTO ticket_ignores (ticket_key, product, ignored_by) VALUES (?, ?, ?)');
    if (r?.created_from_ticket) ignore.run(r.created_from_ticket, r.project, userOf(req));
    if (r?.ticket_source === 'roe' && r.ticket_key) ignore.run(r.ticket_key, r.project, userOf(req));
    db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  router.get('/assessments/:id/history', (req, res) => {
    res.json(db.prepare('SELECT field, old_value AS oldValue, new_value AS newValue, changed_by AS changedBy, changed_at AS changedAt FROM history WHERE assessment_id = ? ORDER BY id DESC LIMIT 200').all(req.params.id));
  });

  // Security Seal snapshot, taken by the browser (which has the Jira issues) once the ticket is resolved.
  router.post('/assessments/:id/seal', (req, res) => {
    const { seal, ticketKey } = req.body || {};
    const r = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (!SEALS.includes(seal)) return res.status(400).json({ error: 'Unknown seal' });
    if (r.ticket_state !== 'resolved' || r.ticket_key !== ticketKey || r.seal_ticket_key === ticketKey) return res.json(toApi(r));
    db.prepare("UPDATE assessments SET seal = ?, seal_source = 'auto', seal_ticket_key = ?, seal_at = datetime('now'), updated_at = datetime('now'), updated_by = ? WHERE id = ?")
      .run(seal, ticketKey, 'Security Seal (auto)', r.id);
    db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)').run(r.id, 'seal', r.seal, seal, `Security Seal at ${ticketKey} resolution`);
    res.json(toApi(db.prepare('SELECT * FROM assessments WHERE id = ?').get(r.id)));
  });

  // Frozen assessment report, taken by the browser (which has the issues) once the ticket is resolved: the
  // app's issues as of the resolution date. Written once per ticket and never overwritten, so a report
  // downloaded later says the same thing. Only admins can clear it (fails closed without isAdmin).
  router.post('/assessments/:id/report-snapshot', (req, res) => {
    const r = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    let snap;
    try {
      snap = normalizeSnapshot(req.body || {});
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const current = toApi(r).reportSnapshot;
    if (r.ticket_state !== 'resolved' || r.ticket_key !== snap.ticketKey || current?.ticketKey === snap.ticketKey) return res.json(toApi(r));
    const value = JSON.stringify({ ...snap, capturedAt: new Date().toISOString(), capturedBy: userOf(req) });
    db.prepare('UPDATE assessments SET report_snapshot = ? WHERE id = ?').run(value, r.id);
    db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)')
      .run(r.id, 'reportSnapshot', current ? `${current.ticketKey} as of ${current.asOf}` : null, `${snap.ticketKey} as of ${snap.asOf} (${snap.issues.length} issues)`, userOf(req));
    res.json(toApi(db.prepare('SELECT * FROM assessments WHERE id = ?').get(r.id)));
  });
  router.delete('/assessments/:id/report-snapshot', (req, res) => {
    if (!(isAdmin && isAdmin(req))) return res.status(403).json({ error: 'Only admins can unfreeze a report.' });
    const r = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    const current = toApi(r).reportSnapshot;
    if (current) {
      db.prepare('UPDATE assessments SET report_snapshot = NULL WHERE id = ?').run(r.id);
      db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)')
        .run(r.id, 'reportSnapshot', `${current.ticketKey} as of ${current.asOf}`, null, userOf(req));
    }
    res.json(toApi(db.prepare('SELECT * FROM assessments WHERE id = ?').get(r.id)));
  });

  // App list with each app's state in its latest cycle. The analytics pages hide decommissioned apps from
  // their metrics, so decommissioning in the tracker (editor or below) applies everywhere.
  router.get('/apps', (_req, res) => res.json(listApps(db)));

  // Decommission or restore an app from the analytics Projects page: every row of the app (platform
  // ignored, as on the Target Project List) in the latest year it appears in. Tracker editing is open to
  // every signed-in user (D8), as in the assessment editor.
  router.post('/apps/decommission', (req, res) => {
    const { project, decommissioned, date, reason } = req.body || {};
    if (typeof project !== 'string' || !project.trim() || typeof decommissioned !== 'boolean') return res.status(400).json({ error: 'project and decommissioned are required' });
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (reason != null && (typeof reason !== 'string' || reason.length > 300)) return res.status(400).json({ error: 'reason must be text (max 300 characters)' });
    const key = targetKey(project);
    const rows = db.prepare('SELECT a.*, c.year FROM assessments a JOIN cycles c ON c.id = a.cycle_id').all().filter((r) => targetKey(r.project) === key);
    if (!key || !rows.length) return res.status(404).json({ error: `${project} is not in the Assessment Tracker.` });
    const year = Math.max(...rows.map((r) => r.year));
    const user = userOf(req);
    const next = decommissioned
      ? { is_active: 'Decommissioned', decommissioned_at: date || new Date().toISOString().slice(0, 10), decommission_reason: reason?.trim() || null }
      : { is_active: 'Active', decommissioned_at: null, decommission_reason: null };
    const update = db.prepare("UPDATE assessments SET is_active = ?, decommissioned_at = ?, decommission_reason = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?");
    const logChange = db.prepare('INSERT INTO history (assessment_id, field, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      for (const r of rows.filter((x) => x.year === year && (x.is_active === 'Decommissioned') !== decommissioned)) {
        update.run(next.is_active, next.decommissioned_at, next.decommission_reason, user, r.id);
        logChange.run(r.id, 'isActive', r.is_active, `${next.is_active} (Projects page)`, user);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: e.message });
    }
    log(`${decommissioned ? 'decommissioned' : 'restored'} ${project} (${year}) by ${user}`);
    sync();
    res.json(listApps(db));
  });

  // Shared Target Project List: everyone signed in reads it; only admins change it (fails closed without
  // isAdmin, unlike the tracker's other setup routes). Admins also get the change history.
  const isAdminReq = (req) => !!(isAdmin && isAdmin(req));
  router.get('/targets', (req, res) => res.json(readTargets(db, { history: isAdminReq(req) })));
  router.put('/targets', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Only admins can change the Target Project List.' });
    const { names, targetOnly, seed } = req.body || {};
    if (names === undefined && typeof targetOnly !== 'boolean') return res.status(400).json({ error: 'names or targetOnly is required.' });
    try {
      const result = saveTargets(db, { names, targetOnly, seed: seed === true, user: userOf(req) });
      if (result.conflict) return res.status(409).json({ error: 'The shared list is already set up.', ...readTargets(db, { history: true }) });
      log(`Target Project List saved by ${userOf(req)}: ${result.names.length} apps, target only ${result.targetOnly ? 'on' : 'off'}`);
      res.json(readTargets(db, { history: true }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // UberTicket sync status, unmatched tickets and manual links.
  router.get('/sync', (_req, res) => res.json({ enabled: !!getTickets, uberticket: ticketStatus(), last: lastSync, links: db.prepare('SELECT product_key AS productKey, product, project, linked_by AS linkedBy, linked_at AS linkedAt FROM ticket_links ORDER BY product').all() }));
  router.post('/sync', adminOnly, (_req, res) => res.json(sync()));
  router.post('/links', adminOnly, (req, res) => {
    const { product, project } = req.body || {};
    if (!product || !project) return res.status(400).json({ error: 'product and project are required' });
    db.prepare('INSERT INTO ticket_links (product_key, product, project, linked_by) VALUES (?, ?, ?, ?) ON CONFLICT(product_key) DO UPDATE SET project = excluded.project, linked_by = excluded.linked_by, linked_at = datetime(\'now\')')
      .run(matchKey(product), product, project, userOf(req));
    res.json(sync());
  });
  router.delete('/links/:productKey', adminOnly, (req, res) => {
    db.prepare('DELETE FROM ticket_links WHERE product_key = ?').run(req.params.productKey);
    res.json(sync());
  });

  // Excel import: the browser sends the .xlsx bytes as the request body.
  const raw = express.raw({ type: () => true, limit: '50mb' });
  router.post('/import/preview', adminOnly, raw, (req, res) => {
    try {
      res.json(previewOf(parseWorkbook(req.body)));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.post('/import', adminOnly, raw, (req, res) => {
    try {
      const selected = req.query.cycles ? JSON.parse(String(req.query.cycles)) : null;
      const result = importCycles(db, parseWorkbook(req.body), selected, `${userOf(req)} (Excel import)`);
      sync();
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // A full express app (not a bare Router) so req.get / res.json work when mounted in Vite's connect server.
  const app = express();
  app.disable('x-powered-by');
  app.use(router);
  // apps(): the tracker's app list, read-only (used by the PIA module).
  return { app, sync, apps: () => (db ? listApps(db) : []), available: !!db };
}
