import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { makeCalendar } from './businessTime.js';
import { fetchTemplateTickets, fetchActivitySummary, mapLimit, AuthError } from './uberticket.js';
import { normalizeTicket } from './metrics.js';
import { normalizeFull, FULL_FIELDS, ROE_FIELDS } from './fullAssessment.js';
import { demoTickets, demoFullTickets, demoRoeTickets } from './demoData.js';
import { phHolidayList, phHolidayYears } from './phHolidays.js';
import { makeTokenStore, tokenExpiry } from './tokenStore.js';


const list = (s, d) => (s ?? d).split(',').map((x) => x.trim()).filter(Boolean);

// Builds the monitor: an Express app (pages + JSON API) plus start/stop for the background refresh.
// Mount it at the root (standalone server) or under a path (e.g. /monitor inside another app);
// pages use relative URLs so both work.
//   root     folder that holds public/ (pages) and data/ (encrypted token, activity cache)
//   env      settings (process.env)
//   envFile  .env file to clean if it still holds a plain-text UBERTICKET_TOKEN
//   settingsLogin  optional (username, password) => boolean; when given, changing the token always needs that login
export async function createMonitor({ root, env = process.env, envFile = path.join(root, '.env.local'), embedded = false, analyticsUrl = 'http://10.6.99.208/', settingsLogin = null, log = (m) => console.log(`[monitor] ${m}`) }) {
  const dataDir = path.join(root, 'data');
  const settingsPassword = String(env.MONITOR_SETTINGS_PASSWORD || '');


  const config = {
    api: env.UBERTICKET_API || 'https://api-ubertickets.cloudstaff.com/v1',
    demo: env.DEMO === '1',
    templates: list(env.DPSA_TEMPLATES, '322255:Staging,1113577:UAT').map((t) => {
      const [id, envName] = t.split(':');
      return { id: Number(id), env: envName || id };
    }),
    refreshMs: Number(env.REFRESH_MINUTES || 5) * 60_000,
    lookbackDays: Number(env.LOOKBACK_DAYS || 180),
    maxPages: Number(env.MAX_PAGES || 200),
    // Archived tickets are monitored too (INCLUDE_ARCHIVED=0 leaves them out).
    includeArchived: env.INCLUDE_ARCHIVED !== '0',
    // Assessment monitors: same page and rules (priority SLA, times tested), one per UberTicket template.
    assessments: [
      {
        key: 'full', page: '/FullAssessment', aliases: ['/full-assessment'],
        title: 'Security Full Assessment', short: 'Full Assessment',
        templateId: Number(env.FULL_TEMPLATE || 1080829), fields: FULL_FIELDS,
        lookbackDays: Number(env.FULL_LOOKBACK_DAYS || 3650),
      },
      {
        key: 'roe', page: '/RulesOfEngagement', aliases: ['/rules-of-engagement', '/RoE'],
        title: '[PB-0933] Security Test – Rules of Engagement', short: 'Rules of Engagement',
        templateId: Number(env.ROE_TEMPLATE || 72913), fields: ROE_FIELDS,
        lookbackDays: Number(env.ROE_LOOKBACK_DAYS || 3650),
      },
    ],
    // Resolve SLA per priority in business days, shared by all assessment monitors ("Normal" = Medium).
    slaDays: {
      low: Number(env.SLA_LOW_DAYS || 5),
      medium: Number(env.SLA_MEDIUM_DAYS || 10),
      high: Number(env.SLA_HIGH_DAYS || 15),
      critical: Number(env.SLA_CRITICAL_DAYS || 20),
    },
    targets: {
      mttrDays: Number(env.MTTR_TARGET_DAYS || 3),
    },
    business: {
      offsetHours: Number(env.TZ_OFFSET_HOURS || 8),
      start: env.BUSINESS_START || '08:00',
      end: env.BUSINESS_END || '17:00',
      days: list(env.BUSINESS_DAYS, '1,2,3,4,5').map(Number),
      // Philippine regular + special non-working days are skipped like weekends (PH_HOLIDAYS=0 turns this off);
      // HOLIDAYS adds extra dates.
      holidays: [...new Set([...(env.PH_HOLIDAYS === '0' ? [] : phHolidayList()), ...list(env.HOLIDAYS, '')])].sort(),
      holidayYears: env.PH_HOLIDAYS === '0' ? [] : phHolidayYears(),
    },
  };

  const calendar = makeCalendar(config.business);
  const envByTemplate = Object.fromEntries(config.templates.map((t) => [t.id, t.env]));
  // The UberTicket token lives encrypted in data/ (set it from Settings on any page).
  const tokenStore = makeTokenStore(dataDir);
  const cleanToken = (t) => String(t || '').trim().replace(/^Bearer\s+/i, '');
  let token = '';
  let tokenSavedAt = null;

  // Older setups kept the token in plain text in .env.local: blank that line once it is stored encrypted.
  async function removePlainTokenFromEnvFile() {
    const file = envFile;
    let text;
    try { text = await readFile(file, 'utf8'); } catch { return; }
    if (!/^UBERTICKET_TOKEN=.+$/m.test(text)) return;
    await writeFile(file, text.replace(/^UBERTICKET_TOKEN=.+$/m, '# UBERTICKET_TOKEN is stored encrypted in data/token.enc; change it from Settings in the app.'), { mode: 0o600 });
    log('moved the token from .env.local into encrypted storage');
  }

  const stored = await tokenStore.load();
  if (stored) {
    ({ token, savedAt: tokenSavedAt } = stored);
  } else if (cleanToken(env.UBERTICKET_TOKEN)) {
    token = cleanToken(env.UBERTICKET_TOKEN);
    tokenSavedAt = await tokenStore.save(token);
    await removePlainTokenFromEnvFile();
  }
  const tokenInfo = () => ({ set: !!token, savedAt: tokenSavedAt, expiresAt: token ? tokenExpiry(token) : null });

  const state = { raw: [], assess: {}, fetchedAt: null, error: null, errorKind: null, loading: false };

  // Activity-log summary per ticket (submitted / resolved / first assignment). A ticket's log only
  // changes when the ticket does, so it is re-read only when updated_at moves; kept on disk across restarts.
  const cacheFile = path.join(dataDir, 'activity.json');
  let activityCache = {};
  try { activityCache = JSON.parse(await readFile(cacheFile, 'utf8')); } catch {}

  async function addActivity(rows) {
    const stale = rows.filter((r) => activityCache[r.id]?.updated_at !== r.updated_at);
    if (stale.length) log(`reading activity log for ${stale.length} tickets…`);
    await mapLimit(stale, 4, async (r) => {
      activityCache[r.id] = { updated_at: r.updated_at, ...(await fetchActivitySummary({ api: config.api, token, ticketId: r.id })) };
    });
    if (stale.length) {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(activityCache));
    }
    for (const r of rows) {
      const { updated_at, ...summary } = activityCache[r.id] ?? {};
      Object.assign(r, summary);
    }
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    try {
      if (config.demo) {
        state.raw = demoTickets(config.templates);
        const demo = { full: demoFullTickets, roe: demoRoeTickets };
        for (const m of config.assessments) state.assess[m.key] = demo[m.key](m.templateId);
      } else if (!token) {
        throw new AuthError('No UberTicket token saved yet. Open Settings and paste one.');
      } else {
        const common = { api: config.api, token, maxPages: config.maxPages, includeArchived: config.includeArchived };
        const raw = await fetchTemplateTickets({ ...common, templateIds: config.templates.map((t) => t.id), lookbackDays: config.lookbackDays });
        const assess = {};
        for (const m of config.assessments) {
          assess[m.key] = await fetchTemplateTickets({ ...common, templateIds: [m.templateId], lookbackDays: m.lookbackDays });
        }
        // Submitted / resolved times (MTTR, SLA) come from each ticket's activity log.
        await addActivity([...raw, ...Object.values(assess).flat()]);
        state.raw = raw;
        state.assess = assess;
      }
      state.fetchedAt = Date.now();
      state.error = state.errorKind = null;
      log(`loaded ${state.raw.length} DPSA, ${config.assessments.map((m) => `${state.assess[m.key]?.length ?? 0} ${m.short}`).join(', ')} tickets`);
    } catch (err) {
      state.error = err.message;
      state.errorKind = err instanceof AuthError ? 'auth' : 'fetch';
      log(`refresh failed: ${err.message}`);
    } finally {
      state.loading = false;
    }
  }

  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => res.redirect('./DPSA'));
  app.get('/DPSA', (_req, res) => res.sendFile(path.join(root, 'public', 'dpsa.html')));
  for (const m of config.assessments) app.get([m.page, ...m.aliases], (_req, res) => res.sendFile(path.join(root, 'public', 'assessment.html')));
  app.use('/static', express.static(path.join(root, 'public')));

  const common = () => ({
    demo: config.demo,
    fetchedAt: state.fetchedAt,
    loading: state.loading,
    error: state.error,
    errorKind: state.errorKind,
    refreshMinutes: config.refreshMs / 60_000,
    business: { ...config.business, hoursPerDay: calendar.hoursPerDay },
    links: { analytics: env.ANALYTICS_URL || analyticsUrl },
    embedded,
    token: tokenInfo(),
  });

  app.get('/api/assess/:key', (req, res) => {
    const m = config.assessments.find((x) => x.key === req.params.key);
    if (!m) return res.status(404).json({ error: 'Unknown monitor' });
    const now = Date.now();
    const { slaDays } = config;
    res.json({
      ...common(),
      key: m.key,
      title: m.title,
      short: m.short,
      templateId: m.templateId,
      lookbackDays: m.lookbackDays,
      slaDays,
      tickets: (state.assess[m.key] ?? []).map((r) => normalizeFull(r, { calendar, slaDays, offsetHours: config.business.offsetHours, fields: m.fields, now })),
    });
  });
  // Which page path maps to which monitor (used by the shared assessment page).
  app.get('/api/monitors', (_req, res) => res.json(config.assessments.map(({ key, page, aliases, short }) => ({ key, paths: [page, ...aliases], short }))));

  app.get('/api/dpsa', (_req, res) => {
    const now = Date.now();
    res.json({
      ...common(),
      targets: config.targets,
      templates: config.templates,
      tickets: state.raw.map((r) => normalizeTicket(r, { calendar, envByTemplate, targets: config.targets, now })),
    });
  });

  app.post('/api/refresh', async (_req, res) => {
    await refresh();
    res.json({ ok: !state.error, error: state.error });
  });

  // Token settings. The token itself is never sent back to the browser; only whether one is set and when it expires.
  // Changing the token from another machine (e.g. when this runs on a shared server) needs
  // MONITOR_SETTINGS_PASSWORD, sent as the X-Monitor-Password header. Requests from this machine don't.
  function isLocal(req) {
    const ip = String(req.socket?.remoteAddress || '');
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
  function settingsAllowed(req, res) {
    // Inside Security Issues Analytics: the app's own login, from any machine.
    if (settingsLogin) {
      const user = decodeURIComponent(String(req.get('x-monitor-user') || ''));
      const pass = decodeURIComponent(String(req.get('x-monitor-password') || ''));
      if (settingsLogin(user, pass)) return true;
      res.status(403).json({ error: 'Wrong username or password. Use your Security Issues Analytics login.', needsPassword: true });
      return false;
    }
    if (isLocal(req)) return true;
    if (!settingsPassword) {
      res.status(403).json({ error: 'Token settings can only be changed on the server itself until MONITOR_SETTINGS_PASSWORD is set there.', needsPassword: true });
      return false;
    }
    const given = Buffer.from(String(req.get('x-monitor-password') || ''));
    const want = Buffer.from(settingsPassword);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      res.status(403).json({ error: 'Wrong settings password.', needsPassword: true });
      return false;
    }
    return true;
  }

  const tokenStatus = () => ({
    ...tokenInfo(),
    ok: !!token && !state.error && state.fetchedAt != null,
    fetchedAt: state.fetchedAt,
    error: state.error,
    errorKind: state.errorKind,
  });

  app.get('/api/token', (req, res) => res.json({ ...tokenStatus(), loginRequired: !!settingsLogin, passwordRequired: !settingsLogin && !isLocal(req), passwordConfigured: !!settingsPassword }));

  app.post('/api/token', async (req, res) => {
    if (!settingsAllowed(req, res)) return;
    const next = cleanToken(req.body?.token);
    if (!next) return res.status(400).json({ ...tokenStatus(), error: 'Paste a token first' });
    if (/\s/.test(next)) return res.status(400).json({ ...tokenStatus(), error: 'That does not look like a token (it contains spaces)' });
    token = next;
    tokenSavedAt = await tokenStore.save(token);
    await removePlainTokenFromEnvFile();
    await refresh();
    res.json(tokenStatus());
  });

  app.delete('/api/token', async (req, res) => {
    if (!settingsAllowed(req, res)) return;
    await tokenStore.clear();
    token = '';
    tokenSavedAt = null;
    state.error = 'No UberTicket token saved yet. Open Settings and paste one.';
    state.errorKind = 'auth';
    res.json(tokenStatus());
  });


  let timer = null;
  return {
    app,
    config,
    start() {
      if (config.demo) log('using demo data');
      const year = new Date().getFullYear();
      if (env.PH_HOLIDAYS !== '0' && !config.business.holidayYears.includes(year)) {
        log(`No Philippine holidays listed for ${year} yet: add them to phHolidays.js (or HOLIDAYS in .env.local).`);
      }
      refresh();
      timer = setInterval(refresh, config.refreshMs);
    },
    stop() { clearInterval(timer); },
  };
}
