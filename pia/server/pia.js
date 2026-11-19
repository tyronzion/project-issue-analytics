import express from 'express';
import path from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { openPiaDb, appToApi, policyToApi, reassessmentToApi, scanToApi, findingToApi, coverageToApi, parseJson } from './db.js';
import { syncPia } from './sync.js';
import { piaStatus, dayOf, isDay, DEFAULT_DUE_SOON_DAYS } from '../shared/rules.js';
import { QUESTIONS, changedEvidence, questionStatus } from '../shared/questions.js';
import { matchKey } from '../../tracker/shared/logic.js';
import { makeTokenStore } from '../../monitor/server/tokenStore.js';
import { createGithub, parseRepo, reposFromText, isOrg, GithubError } from './github.js';
import { scanRepo, changesSince } from './repoScan.js';
import { recommend } from './recommend.js';
import { personalSummary } from './scanner.js';
import { matchAnswers } from './policyAnswers.js';
import { reassessmentBlocks } from './reassessDoc.js';
import { buildDocx, loadTheme, loadAssets } from './docx.js';
import { fileURLToPath } from 'node:url';
import { demoGithub } from './demoGithub.js';

// Privacy Impact Assessment API, mounted by vite.config.ts at /api/pia.
//   getPolicies()     normalized [PIA01] policies from the UberTicket monitor (read-only source)
//   getTrackerApps()  the Assessment Tracker's app list (read-only source)
//   uberticket()      the monitor's PIA fetch status
//   isAdmin(req)      every change (reassessments, apps, links, settings, sync, repos, scans, coverage, GitHub
//                     settings, reassessment checks and documents) is admin-only. Without it, changes are refused:
//                     these are compliance records.
//   fetchPolicy(id)   one [PIA01] policy with its answers, read when a reassessment document is built (not stored)
//   github            optional GitHub client (tests); by default github.js with the App key stored encrypted in data/
//   tokensCss         design-system tokens file, for the Word document's colours and fonts
//   demo              DEMO=1: synthetic GitHub repositories (demo-org/…) instead of the real GitHub App
export async function createPia({ root, getPolicies = () => [], getTrackerApps = () => [], uberticket = () => null, isAdmin = null, offsetHours = 8, now = () => Date.now(), log = (m) => console.log(`[pia] ${m}`), fetchPolicy = null, github = null, secretStore = null, tokensCss = '', demo = false }) {
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
    const coverage = new Map(db.prepare('SELECT c.*, p.name AS parent_name FROM coverage c LEFT JOIN apps p ON p.id = c.parent_app_id').all().map((c) => [c.app_id, c]));
    const apps = db.prepare('SELECT * FROM apps ORDER BY name COLLATE NOCASE').all()
      .map((a) => {
        const v = view(a, byApp.get(a.id) || [], reByApp.get(a.id) || [], opts);
        const latest = (byApp.get(a.id) || []).filter((p) => p.state !== 'rejected').sort((x, y) => (y.submittedAt ?? 0) - (x.submittedAt ?? 0))[0];
        const c = coverage.get(a.id);
        return { ...v, latestPolicy: latest ? { url: latest.url, version: latest.version, state: latest.state } : null, coverage: c ? { status: c.status, parentName: c.parent_name, needsReview: !!c.needs_review } : null };
      });
    res.json({ ...opts, apps, uberticket: uberticket(), lastSync });
  });

  router.get('/apps/:id', async (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const policies = db.prepare('SELECT * FROM pia_policies WHERE app_id = ? ORDER BY submitted_at DESC').all(app.id).map(policyToApi);
    const reassessments = db.prepare('SELECT * FROM reassessments WHERE app_id = ? ORDER BY assessed_on DESC, id DESC').all(app.id).map(reassessmentToApi);
    const history = db.prepare('SELECT field, old_value AS oldValue, new_value AS newValue, changed_by AS changedBy, changed_at AS changedAt FROM history WHERE app_id = ? ORDER BY id DESC LIMIT 200').all(app.id);
    const opts = { today: today(), dueSoonDays: dueSoonDays() };
    res.json({ ...opts, app: view(app, policies, reassessments, opts), policies, reassessments, history, ...detail(app.id), github: await githubInfo() });
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


  // ---- GitHub App settings (D15). The private key is stored encrypted (data/github.enc) and never sent back. ----
  const dataDir = path.dirname(process.env.PIA_DB_PATH || path.join(root, 'data', 'pia.db'));
  const keyStore = secretStore || (db ? makeTokenStore(dataDir, { name: 'github' }) : null);
  let keyCache; // undefined = not loaded; null = none saved; { token, savedAt }
  const loadKey = async () => (keyCache === undefined ? (keyCache = await keyStore.load()) : keyCache);
  const allowedOrgs = () => (demo && !github ? ['demo-org'] : parseJson(setting('github_orgs', '[]'), []));
  const ghAppId = () => setting('github_app_id', '');
  const gh = github || (demo ? demoGithub() : null) || createGithub({
    allowedOrgs,
    getCredential: async () => {
      const k = await loadKey();
      return k && ghAppId() ? { appId: ghAppId(), privateKey: k.token } : null;
    },
  });
  const putSetting = (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  async function githubInfo() {
    const k = db ? await loadKey() : null;
    if (gh.demo) return { configured: true, demo: true, appId: 'demo', orgs: allowedOrgs(), keySet: false, keySavedAt: null, demoRepos: gh.repos };
    return { configured: !!(k && ghAppId() && allowedOrgs().length), appId: ghAppId(), orgs: allowedOrgs(), keySet: !!k, keySavedAt: k?.savedAt ?? null };
  }
  const safeError = (err) => (err instanceof GithubError ? err.message : 'Unexpected error while reading the repository.');

  router.get('/github', async (_req, res) => res.json(await githubInfo()));

  router.put('/github', adminOnly, async (req, res) => {
    const { appId, privateKey, orgs } = req.body || {};
    if (appId !== undefined && !/^\d{1,12}$/.test(String(appId))) return res.status(400).json({ error: 'The App ID is a number (GitHub → Settings → Developer settings → GitHub Apps).' });
    if (orgs !== undefined && (!Array.isArray(orgs) || orgs.length < 1 || orgs.length > 10 || !orgs.every(isOrg))) return res.status(400).json({ error: 'Give 1 to 10 GitHub organisation names (letters, numbers and dashes).' });
    let pem = null;
    if (privateKey !== undefined) {
      pem = String(privateKey).trim();
      const looksLikePem = pem.length < 10_000 && /^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----$/.test(pem);
      let ok = false;
      try { ok = looksLikePem && createPrivateKey(pem).asymmetricKeyType === 'rsa'; } catch { ok = false; }
      if (!ok) return res.status(400).json({ error: 'Paste the GitHub App private key (.pem file contents, RSA).' });
    }
    const user = userOf(req);
    if (appId !== undefined) putSetting('github_app_id', String(appId));
    if (orgs !== undefined) putSetting('github_orgs', JSON.stringify(orgs.map((o) => o.trim())));
    if (pem) {
      await keyStore.save(pem);
      keyCache = undefined;
    }
    gh.clearTokens?.();
    log(`GitHub settings changed by ${user}${pem ? ' (private key replaced)' : ''}`);
    res.json(await githubInfo());
  });

  router.delete('/github/key', adminOnly, async (req, res) => {
    await keyStore.clear();
    keyCache = undefined;
    gh.clearTokens?.();
    log(`GitHub App private key removed by ${userOf(req)}`);
    res.json(await githubInfo());
  });

  router.post('/github/test', adminOnly, async (_req, res) => res.json({ results: await gh.test() }));

  // ---- Repositories, scans and the "own PIA / covered" recommendation --------------------------------------------
  const appRow = (id) => db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
  const latestScans = (appId) => db.prepare('SELECT * FROM scans WHERE id IN (SELECT MAX(id) FROM scans WHERE app_id = ? GROUP BY repo) ORDER BY repo').all(appId)
    .map((r) => scanToApi(r, db.prepare('SELECT * FROM scan_findings WHERE scan_id = ? ORDER BY path, line').all(r.id).map(findingToApi)));
  const approvedPolicy = (appId) => {
    const p = db.prepare("SELECT * FROM pia_policies WHERE app_id = ? AND state = 'approved' ORDER BY approved_at DESC LIMIT 1").get(appId);
    return p ? { id: p.id, url: p.url, version: p.version, approvedAt: p.approved_at, approvedBy: p.approved_by, riskRating: p.risk_rating, riskLabel: p.risk_label } : null;
  };
  const coverageOf = (appId) => coverageToApi(db.prepare('SELECT * FROM coverage WHERE app_id = ?').get(appId));

  function recommendationFor(app) {
    const scans = latestScans(app.id);
    const rows = db.prepare('SELECT * FROM scans WHERE id IN (SELECT MAX(id) FROM scans GROUP BY app_id, repo)').all();
    const byApp = rows.reduce((m, r) => m.set(r.app_id, [...(m.get(r.app_id) || []), scanToApi(r)]), new Map());
    const others = db.prepare('SELECT id, name FROM apps WHERE id != ?').all(app.id).filter((a) => byApp.has(a.id))
      .map((a) => ({ ...a, scans: byApp.get(a.id), approvedPolicy: approvedPolicy(a.id), coverageStatus: coverageOf(a.id)?.status ?? null }));
    return { scans, recommendation: recommend({ app: { id: app.id, name: app.name }, scans, others }) };
  }

  router.put('/apps/:id/repos', adminOnly, (req, res) => {
    const app = appRow(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const list = Array.isArray(req.body?.repos) ? req.body.repos : null;
    if (!list || list.length > 10) return res.status(400).json({ error: 'repos must be a list of up to 10 GitHub repositories.' });
    const orgs = allowedOrgs().map((o) => o.toLowerCase());
    const repos = [];
    for (const raw of list) {
      const r = parseRepo(raw);
      if (!r) return res.status(400).json({ error: `"${String(raw).slice(0, 80)}" is not a GitHub repository (owner/repo or a github.com link).` });
      if (!orgs.includes(r.split('/')[0].toLowerCase())) return res.status(400).json({ error: `${r} is outside the allowed GitHub organisations (${orgs.join(', ') || 'none set'}). An admin sets them in PIA settings.` });
      if (!repos.includes(r)) repos.push(r);
    }
    const before = parseJson(app.github_repos, []);
    const user = userOf(req);
    const row = db.prepare("UPDATE apps SET github_repos = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ? RETURNING *").get(JSON.stringify(repos), user, app.id);
    if (before.join(',') !== repos.join(',')) logChange(app.id, 'GitHub repositories', before.join(', ') || null, repos.join(', ') || null, user);
    res.json(appToApi(row));
  });

  // Scans run one at a time (GitHub rate limits, server load).
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  router.post('/apps/:id/scan', adminOnly, async (req, res) => {
    const app = appRow(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const repos = parseJson(app.github_repos, []);
    if (!repos.length) return res.status(400).json({ error: 'Add the app’s GitHub repository first.' });
    const user = userOf(req);
    await enqueue(async () => {
      for (const repo of repos) {
        let r;
        try {
          r = await scanRepo(gh, repo);
        } catch (err) {
          db.prepare("INSERT INTO scans (app_id, repo, status, error, scanned_by) VALUES (?, ?, 'error', ?, ?)").run(app.id, repo, safeError(err), user);
          log(`scan of ${repo} failed: ${safeError(err)}`);
          continue;
        }
        db.exec('BEGIN');
        try {
          const scan = db.prepare('INSERT INTO scans (app_id, repo, branch, commit_sha, ruleset_version, status, files_considered, files_read, summary, scanned_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
            .get(app.id, repo, r.branch, r.sha, r.rulesetVersion, r.status, r.filesConsidered, r.filesRead, JSON.stringify(r.summary), user);
          const ins = db.prepare('INSERT INTO scan_findings (scan_id, path, line, framework, identifier, category, sensitivity, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
          for (const f of r.fields.slice(0, 2000)) ins.run(scan.id, f.path, f.line, f.framework, f.identifier, f.category, f.sensitivity, f.confidence);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }
    });
    logChange(app.id, 'repository scan', null, repos.join(', '), user);
    flagDrift(app.id);
    res.json(detail(app.id));
  });

  // A decision stays as decided; a later scan that finds personal-data categories the evidence didn't have, or a
  // schema of its own, only flags it for review.
  function flagDrift(appId) {
    const cov = db.prepare('SELECT * FROM coverage WHERE app_id = ?').get(appId);
    if (!cov || cov.needs_review) return;
    const evidence = parseJson(cov.evidence_scan_ids, []);
    const cats = (ids) => new Set(ids.length ? db.prepare(`SELECT DISTINCT category FROM scan_findings WHERE sensitivity != 'credential' AND scan_id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((x) => x.category) : []);
    const latest = latestScans(appId).filter((s) => s.status !== 'error');
    const before = cats(evidence.map(Number).filter(Number.isInteger));
    const now = cats(latest.map((s) => s.id));
    const added = [...now].filter((c) => !before.has(c));
    const ownSchemaNow = latest.some((s) => s.summary?.storage?.ownSchema) && personalSummary(latest.flatMap((s) => s.fields)).length > 0;
    const ownSchemaBefore = evidence.some((id) => parseJson(db.prepare('SELECT summary FROM scans WHERE id = ?').get(Number(id))?.summary, {})?.storage?.ownSchema);
    const notes = [];
    if (added.length) notes.push(`new personal-data categories: ${added.join(', ')}`);
    if (cov.status !== 'own' && ownSchemaNow && !ownSchemaBefore) notes.push('it now stores personal data in its own database');
    if (notes.length) {
      db.prepare('UPDATE coverage SET needs_review = 1, review_note = ? WHERE app_id = ?').run(`Latest scan: ${notes.join('; ')}.`, appId);
      logChange(appId, 'coverage needs review', null, notes.join('; '), 'Repository scan');
    }
  }

  router.put('/apps/:id/coverage', adminOnly, (req, res) => {
    const app = appRow(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const status = String(req.body?.status || '');
    const reason = String(req.body?.reason ?? '').trim();
    if (!['own', 'covered', 'not_required'].includes(status)) return res.status(400).json({ error: 'status must be own, covered or not_required.' });
    if (reason.length < 5 || reason.length > 1000) return res.status(400).json({ error: 'Give the reason for this decision (5 to 1000 characters).' });
    let parentId = null, parentPolicy = null;
    if (status === 'covered') {
      parentId = Number(req.body?.parentAppId);
      const parent = appRow(parentId);
      if (!parent || parent.id === app.id) return res.status(400).json({ error: 'Choose the parent app whose PIA covers this one.' });
      if (coverageOf(parent.id)?.status === 'covered' || coverageOf(parent.id)?.status === 'not_required') return res.status(400).json({ error: `${parent.name} is itself covered or exempt; choose the app that has its own PIA.` });
      const policyId = String(req.body?.parentPolicyId || '');
      const pol = db.prepare("SELECT id FROM pia_policies WHERE id = ? AND app_id = ? AND state = 'approved'").get(policyId, parent.id);
      if (!pol) return res.status(400).json({ error: `Pick ${parent.name}’s approved PIA policy.` });
      parentPolicy = pol.id;
    }
    if (status !== 'own' && db.prepare("SELECT 1 FROM coverage WHERE parent_app_id = ? AND status = 'covered' LIMIT 1").get(app.id)) {
      return res.status(400).json({ error: 'Other apps are covered by this app\u2019s PIA, so it must keep its own PIA.' });
    }
    const { scans, recommendation } = recommendationFor(app);
    if (status !== 'own' && recommendation.sensitive && req.body?.confirmSensitive !== true) {
      return res.status(400).json({ error: 'The latest scan found sensitive personal information. Tick the confirmation to decide this app does not need its own PIA.', needsConfirm: true });
    }
    const old = db.prepare('SELECT * FROM coverage WHERE app_id = ?').get(app.id);
    const user = userOf(req);
    const evidence = JSON.stringify(scans.map((s) => s.id));
    db.prepare(`INSERT INTO coverage (app_id, status, parent_app_id, parent_policy_id, reason, recommendation, evidence_scan_ids, needs_review, review_note, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, datetime('now'))
      ON CONFLICT(app_id) DO UPDATE SET status = excluded.status, parent_app_id = excluded.parent_app_id, parent_policy_id = excluded.parent_policy_id, reason = excluded.reason,
        recommendation = excluded.recommendation, evidence_scan_ids = excluded.evidence_scan_ids, needs_review = 0, review_note = NULL, decided_by = excluded.decided_by, decided_at = excluded.decided_at`)
      .run(app.id, status, parentId, parentPolicy, reason, recommendation.recommendation, evidence, user);
    const parentName = (id) => (id ? appRow(id)?.name ?? `#${id}` : null);
    db.prepare('INSERT INTO coverage_history (app_id, old_status, new_status, old_parent, new_parent, reason, evidence, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(app.id, old?.status ?? null, status, parentName(old?.parent_app_id), parentName(parentId), reason, `${evidence}${recommendation.sensitive ? ' sensitive-confirmed' : ''}`, user);
    logChange(app.id, 'PIA coverage', old?.status ?? null, status === 'covered' ? `covered by ${parentName(parentId)}` : status, user);
    res.json(detail(app.id));
  });

  router.delete('/apps/:id/coverage', adminOnly, (req, res) => {
    const app = appRow(req.params.id);
    const old = app && db.prepare('SELECT * FROM coverage WHERE app_id = ?').get(app.id);
    if (!old) return res.status(404).json({ error: 'Not found' });
    if (db.prepare("SELECT 1 FROM coverage WHERE parent_app_id = ? AND status = 'covered' LIMIT 1").get(app.id)) return res.status(400).json({ error: 'Other apps are covered by this app’s PIA. Change those first.' });
    const reason = String(req.body?.reason ?? '').trim().slice(0, 1000) || 'Decision cleared';
    db.prepare('DELETE FROM coverage WHERE app_id = ?').run(app.id);
    db.prepare('INSERT INTO coverage_history (app_id, old_status, new_status, reason, changed_by) VALUES (?, ?, NULL, ?, ?)').run(app.id, old.status, reason, userOf(req));
    logChange(app.id, 'PIA coverage', old.status, null, userOf(req));
    res.json(detail(app.id));
  });

  // Word document look: design-system tokens and the Cloudstaff logos (read once).
  const docTheme = loadTheme(tokensCss);
  const docAssets = loadAssets(fileURLToPath(new URL('../assets', import.meta.url)));

  // ---- Yearly reassessment: what changed in the repos since the last assessment, and the new document ----------
  router.post('/apps/:id/reassessment-check', adminOnly, async (req, res) => {
    const app = appRow(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const st = statusOf(app.id);
    if (!st.lastAssessed) return res.status(400).json({ error: 'This app has no completed PIA yet, so there is nothing to reassess. Scan it as a new app instead.' });
    const repos = parseJson(app.github_repos, []);
    if (!repos.length) return res.status(400).json({ error: 'Add the app’s GitHub repository first.' });
    const results = await enqueue(async () => {
      const out = [];
      for (const repo of repos) {
        try {
          out.push(await changesSince(gh, repo, st.lastAssessed, { offsetHours }));
        } catch (err) {
          out.push({ repo, since: st.lastAssessed, error: safeError(err) });
        }
      }
      return out;
    });
    const kinds = changedEvidence(results.filter((r) => !r.error));
    const questions = questionStatus(kinds).map((x) => ({ id: x.id, status: x.status, evidenceLines: x.evidenceLines }));
    const result = {
      since: st.lastAssessed,
      repos: results.map((r) => (r.error ? r : { ...r, relevantFiles: r.relevantFiles.slice(0, 50) })),
      questions,
      material: questions.some((x) => x.status === 'changed'),
      incomplete: results.some((r) => r.error || r.truncated),
    };
    const user = userOf(req);
    const row = db.prepare('INSERT INTO reassessment_checks (app_id, since, result, checked_by) VALUES (?, ?, ?, ?) RETURNING id, checked_at').get(app.id, st.lastAssessed, JSON.stringify(result), user);
    logChange(app.id, 'reassessment check', null, result.material ? `changes found (${questions.filter((x) => x.status === 'changed').length} answers)` : 'no material change', user);
    res.json({ id: row.id, checkedAt: row.checked_at, checkedBy: user, ...result });
  });

  router.post('/apps/:id/reassessment-document', adminOnly, async (req, res) => {
    const app = appRow(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const check = db.prepare('SELECT * FROM reassessment_checks WHERE id = ? AND app_id = ?').get(Number(req.body?.checkId), app.id);
    if (!check) return res.status(400).json({ error: 'Run "Check for changes" first.' });
    const policy = approvedPolicy(app.id);
    if (!policy) return res.status(400).json({ error: 'No approved PIA policy for this app in UberTicket.' });
    if (!fetchPolicy) return res.status(503).json({ error: 'Reading PIA answers from UberTicket is not available.' });
    let detailRaw;
    try {
      detailRaw = await fetchPolicy(policy.id);
    } catch (err) {
      return res.status(502).json({ error: `The previous PIA couldn't be read from UberTicket: ${err.message}` });
    }
    if (!detailRaw) return res.status(502).json({ error: 'The previous PIA was not found in UberTicket.' });
    const { answers, extra } = matchAnswers(detailRaw);
    const manualIds = new Set(QUESTIONS.filter((q) => !q.evidence.length).map((q) => q.id));
    const confirmations = Object.fromEntries(Object.entries(req.body?.confirmations || {}).filter(([k, v]) => manualIds.has(k) && v === true));
    const user = userOf(req);
    const st = statusOf(app.id);
    const blocks = reassessmentBlocks({
      app: { name: app.name },
      policy: { ...policy, approvedOn: dayOf(policy.approvedAt, offsetHours) },
      answers,
      extra: extra.filter((e) => !/^(project or product|version)$/i.test(e.label)),
      check: parseJson(check.result, {}),
      confirmations,
      reviewer: user,
      today: today(),
      lastAssessed: st.lastAssessed,
    });
    const buf = buildDocx(blocks, { title: `${app.name} Privacy Impact Assessment: reassessment ${today()}`, author: user, theme: docTheme, assets: docAssets });
    logChange(app.id, 'reassessment document', null, `generated from check #${check.id} (${Object.keys(answers).length}/${QUESTIONS.length} answers carried over)`, user);
    const file = `${app.name.replace(/[^A-Za-z0-9 ._-]+/g, ' ').trim().slice(0, 60) || 'App'} PIA Reassessment ${today()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('X-Answers-Matched', String(Object.keys(answers).length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  });

  function statusOf(appId) {
    const policies = db.prepare('SELECT * FROM pia_policies WHERE app_id = ?').all(appId).map(policyToApi);
    const reassessments = db.prepare('SELECT * FROM reassessments WHERE app_id = ?').all(appId).map(reassessmentToApi);
    return piaStatus({ policies, reassessments, offsetHours, today: today(), dueSoonDays: dueSoonDays() });
  }

  // Scan, coverage and reassessment parts of the app detail.
  function detail(appId) {
    const app = appRow(appId);
    const { scans, recommendation } = recommendationFor(app);
    const coverage = coverageOf(app.id);
    const linked = parseJson(app.github_repos, []);
    const lastCheck = db.prepare('SELECT * FROM reassessment_checks WHERE app_id = ? ORDER BY id DESC LIMIT 1').get(app.id);
    return {
      githubRepos: linked,
      suggestedRepos: reposFromText(app.repositories).filter((r) => !linked.includes(r)),
      scans,
      recommendation,
      approvedPolicy: approvedPolicy(app.id),
      coverage: coverage && { ...coverage, parentName: coverage.parentAppId ? appRow(coverage.parentAppId)?.name ?? null : null },
      coveredApps: db.prepare("SELECT a.id, a.name FROM coverage c JOIN apps a ON a.id = c.app_id WHERE c.parent_app_id = ? AND c.status = 'covered' ORDER BY a.name").all(app.id),
      coverageHistory: db.prepare('SELECT old_status AS oldStatus, new_status AS newStatus, old_parent AS oldParent, new_parent AS newParent, reason, changed_by AS changedBy, changed_at AS changedAt FROM coverage_history WHERE app_id = ? ORDER BY id DESC LIMIT 50').all(app.id),
      parentOptions: db.prepare("SELECT DISTINCT a.id, a.name FROM apps a JOIN pia_policies p ON p.app_id = a.id AND p.state = 'approved' WHERE a.id != ? ORDER BY a.name COLLATE NOCASE").all(app.id)
        .filter((a) => !['covered', 'not_required'].includes(coverageOf(a.id)?.status))
        .map((a) => ({ ...a, policies: db.prepare("SELECT id, url, version, approved_at AS approvedAt FROM pia_policies WHERE app_id = ? AND state = 'approved' ORDER BY approved_at DESC").all(a.id) })),
      lastCheck: lastCheck ? { id: lastCheck.id, checkedAt: lastCheck.checked_at, checkedBy: lastCheck.checked_by, ...parseJson(lastCheck.result, {}) } : null,
      manualQuestions: QUESTIONS.filter((q) => !q.evidence.length).map((q) => ({ id: q.id, text: q.text })),
    };
  }

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
