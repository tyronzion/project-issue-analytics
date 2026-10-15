// Sign-in for the whole app, with two options on one sign-in page (/auth/login):
//   - "Sign in with Microsoft": Microsoft Entra ID (Azure AD) single sign-on, once its settings are configured
//     (until then the button is shown disabled), and
//   - the classic shared username/password login.
//
// Flow: OpenID Connect authorization code + PKCE, as a confidential client (msal-node). The server keeps the
// session; the browser only holds an opaque, HttpOnly session cookie. Every request needs a session except
// /auth/* (sign-in itself) and /design-system/* (fonts and styles for the sign-in pages).
//
// Who may sign in is controlled in Entra: the app's Enterprise Application has "Assignment required" on, and
// only the assigned users/groups get a token. This module additionally checks the token's tenant and nonce.
//
// Settings (.env.local):
//   AUTH_TENANT_ID      Directory (tenant) ID. Must be a single tenant (not common/organizations/consumers).
//   AUTH_CLIENT_ID      Application (client) ID of the app registration.
//   AUTH_CLIENT_SECRET  Client secret of the app registration.
//   AUTH_REDIRECT_URI   Exactly the redirect URI registered in Entra, e.g. https://analytics.example/auth/callback.
//                       Its path must be /auth/callback or /callback; only that one path accepts the sign-in reply.
//   AUTH_DEV_BYPASS=1   Local development only, when the four settings above are not set: requests from this
//                       machine (127.0.0.1 / ::1) are signed in as "Local developer"; everyone else is refused.
//   AUTH_DEV_ROLE=user  With the bypass, act as a "user" instead of an "admin" (to test what users see).
//
// Classic login (on unless AUTH_CLASSIC_LOGIN=0):
//   The shared Security Issues Analytics username/password, checked here on the server (only a salted scrypt hash
//   is kept in code). AUTH_CLASSIC_USERNAME + AUTH_CLASSIC_PASSWORD replace the built-in one. The shared account
//   is an admin, as before. Failed attempts are rate-limited per IP.
// Microsoft sign-in is on when all four AUTH_* settings above are valid; otherwise its button is disabled and the
// server log says what is missing. With neither option available, every request is refused (fails closed).
//
// Behind a reverse proxy (e.g. the HTTPS proxy in front of the production server):
//   TRUST_PROXY=10.6.99.71   comma-separated proxy IPs. Only for requests from these IPs are X-Forwarded-For (the
//                            real client IP, used for the login rate limit) and X-Forwarded-Proto (https -> Secure
//                            cookies) believed; from anyone else those headers are ignored.
//
// Roles (admin / user) come from auth/users.js and are looked up on every request, so a change applies at once.
// Server routes that only admins may use call requireAdmin(req, res).

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';

export const SESSION_COOKIE = 'sia_session';
export const STATE_COOKIE = 'sia_auth_state';
const IDLE_MS = 8 * 60 * 60 * 1000; // signed out after 8 hours without a request
const ABSOLUTE_MS = 24 * 60 * 60 * 1000; // and at most 24 hours after signing in
const PENDING_MS = 10 * 60 * 1000; // a sign-in must complete within 10 minutes
const CLASSIC_MAX_FAILURES = 10; // failed classic logins per IP ...
const CLASSIC_WINDOW_MS = 15 * 60 * 1000; // ... per 15 minutes
// The original Security Issues Analytics login (username csdatasec). Only a salted scrypt hash is kept, server-side.
const BUILT_IN_CLASSIC = { username: 'csdatasec', salt: 'LIm5VSCcvfr5NyuzcEPiGw', hash: 'IejJ0NV9JWxfl7R0kCPi-VNWGikIPFbwF2zn7Neuqeg' };
const MAX_PENDING = 1000;
const SCOPES = ['openid', 'profile', 'email'];
const MULTI_TENANT = new Set(['common', 'organizations', 'consumers']);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Paths that are reachable without a session.
const PUBLIC_PREFIXES = ['/auth/', '/design-system/'];
// Paths AUTH_REDIRECT_URI may use. /callback matches an Entra registration made without the /auth prefix.
const CALLBACK_PATHS = ['/auth/callback', '/callback'];

// Live data and secrets inside the project folder. The Vite dev server serves project files directly, so
// these are refused for everyone, signed in or not (tracker database, encrypted UberTicket token + its key,
// the users/roles file).
export function isBlockedPath(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
  return /(^|\/)(tracker|monitor|auth)\/data(\/|$)/.test(p);
}

// Where to go after sign-in: only a path on this site, never another origin (no open redirect).
export function safeReturnTo(value) {
  const v = String(value || '');
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || v.startsWith('/auth/') || v === '/callback' || v.startsWith('/callback?')) return '/';
  if (/[\r\n]/.test(v)) return '/';
  return v;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // ignore malformed cookie values
    }
  }
  return out;
}

function sameString(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const normalizeIp = (ip) => String(ip || '').trim().replace(/^::ffff:/, '');

function isLoopback(req) {
  const ip = String(req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// For server routes only admins may use. Sends 401/403 and returns false when the request isn't from an admin.
export function requireAdmin(req, res) {
  if (req.user?.role === 'admin') return true;
  res.statusCode = req.user ? 403 : 401;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: req.user ? 'Only admins can do this.' : 'Sign-in required' }));
  return false;
}

// JSON request body, at most 16 KB. Mutating /auth routes require Content-Type: application/json, which a
// plain cross-site form can't send.
function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      reject(Object.assign(new Error('Content-Type must be application/json'), { status: 415 }));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy?.();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Small server-rendered pages (classic login, signed out, errors). Styled with the Cloudstaff Design System tokens.
function shell(title, inner) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Security Issues Analytics</title>
<link rel="stylesheet" href="/design-system/fonts/fonts.css"><link rel="stylesheet" href="/design-system/css/tokens.css">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    background: var(--color-surface-page, #f3f5f8); color: var(--color-text-base-primary, #252938); font: 14px/1.5 var(--font-family-body, sans-serif); }
  main { width: min(100%, 400px); display: grid; gap: 16px; padding: 32px; box-sizing: border-box; background: #fff;
    border: 1px solid var(--color-border-subtle, #e8edf4); border-radius: var(--radius-2xl, 1rem); box-shadow: var(--shadow-lg, 0 16px 32px rgba(16,24,40,.12)); }
  img { height: 40px; width: auto; justify-self: start; }
  h1 { margin: 0; font: 600 1.25rem/1.3 var(--font-family-heading, sans-serif); }
  p { margin: 0; color: var(--color-text-base-secondary, #4e5667); }
  a.btn { display: inline-flex; justify-content: center; padding: 11px; border-radius: 9999px; text-decoration: none; font-weight: 700;
    background: var(--color-action-primary, #0070eb); color: #fff; }
  a.btn:hover, button.btn:hover { background: var(--color-action-primary-hover, #0063cf); }
  form { display: grid; gap: 16px; margin: 0; }
  label { display: grid; gap: 6px; font-weight: 700; }
  input { font: inherit; padding: 10px 12px; border: 1px solid var(--color-border-primary, #dce3ee); border-radius: var(--radius-lg, .75rem); outline: none; }
  input:focus { border-color: var(--color-brand-primary, #007aff); }
  button.btn { border: 0; font: inherit; font-weight: 700; padding: 11px; border-radius: 9999px; cursor: pointer;
    background: var(--color-action-primary, #0070eb); color: #fff; }
  .btn.btn-ms { display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 10px; border-radius: 9999px;
    border: 1px solid var(--color-border-strong, #c9d2e1); background: #fff; color: var(--color-text-base-primary, #252938);
    font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
  a.btn.btn-ms:hover { background: var(--color-brand-primary-hover, #f0f7ff); }
  .btn.btn-ms[disabled] { opacity: .55; cursor: not-allowed; }
  .hint { margin-top: -8px; font-size: 12px; text-align: center; color: var(--color-text-base-muted, #737c90); }
  .or { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--color-text-base-muted, #737c90); }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--color-border-subtle, #e8edf4); }
  .alert { padding: 10px 12px; border-radius: var(--radius-lg, .75rem); font-weight: 600; font-size: 13px;
    color: var(--color-feedback-danger, #f22c46); background: var(--color-feedback-danger-soft, #fde9ec); border: 1px solid var(--color-border-danger, #f9aab5); }
</style></head>
<body><main>
  <img src="/design-system/assets/logos/cloudstaff-logo-landscape.svg" alt="Cloudstaff">
  ${inner}
</main></body></html>`;
}

function page(title, message, action) {
  return shell(title, `<h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  ${action ? `<a class="btn" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>` : ''}`);
}

const MICROSOFT_LOGO = '<svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';

// The sign-in page: "Sign in with Microsoft" (disabled until configured) and the classic form.
function loginPage({ returnTo = '/', error = '', username = '', microsoft = false, classic = true } = {}) {
  const microsoftOption = microsoft
    ? `<a class="btn btn-ms" href="/auth/microsoft?returnTo=${encodeURIComponent(returnTo)}">${MICROSOFT_LOGO}<span>Sign in with Microsoft</span></a>`
    : `<button class="btn btn-ms" type="button" disabled aria-describedby="ms-note">${MICROSOFT_LOGO}<span>Sign in with Microsoft</span></button>
    <p class="hint" id="ms-note">Microsoft sign-in isn't set up yet.</p>`;
  const classicOption = classic
    ? `<div class="or"><span>or use the team account</span></div>
  <form method="post" action="/auth/login">
    <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
    <label>Username <input name="username" autocomplete="username" required value="${escapeHtml(username)}" ${username ? '' : 'autofocus'}></label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required ${username ? 'autofocus' : ''}></label>
    <button class="btn" type="submit">Sign in</button>
  </form>`
    : '';
  return shell('Sign in', `<div><h1>Security Issues Analytics</h1><p>Sign in to access the issue workspace.</p></div>
  ${error ? `<div class="alert" role="alert">${escapeHtml(error)}</div>` : ''}
  ${microsoftOption}
  ${classicOption}`);
}

// application/x-www-form-urlencoded body (the classic login form), at most 4 KB.
function readForm(req, limit = 4 * 1024) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      reject(Object.assign(new Error('Unsupported form'), { status: 415 }));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy?.();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

// Messages for the Entra errors users actually hit; anything else gets a generic message (not reflected).
function friendlyError(code, description) {
  const d = String(description || '');
  if (code === 'access_denied' && !/AADSTS/.test(d)) return 'Sign-in was cancelled.';
  if (/AADSTS50105/.test(d)) return 'Your Microsoft account has not been given access to this app. Ask the Data Security Team to add you.';
  return 'Microsoft sign-in did not complete. Try again; if it keeps failing, contact the Data Security Team.';
}

export function createAuth({ env = process.env, users = null, msalClient = null, now = () => Date.now(), log = (m) => console.log(`[auth] ${m}`) } = {}) {
  const tenantId = String(env.AUTH_TENANT_ID || '').trim();
  const clientId = String(env.AUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.AUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.AUTH_REDIRECT_URI || '').trim();

  const problems = [];
  if (!tenantId) problems.push('AUTH_TENANT_ID is not set');
  else if (MULTI_TENANT.has(tenantId.toLowerCase())) problems.push('AUTH_TENANT_ID must be your own tenant, not common/organizations/consumers');
  else if (!GUID.test(tenantId)) problems.push('AUTH_TENANT_ID must be the Directory (tenant) ID, a GUID like 00000000-0000-0000-0000-000000000000');
  if (!clientId) problems.push('AUTH_CLIENT_ID is not set');
  if (!clientSecret && !msalClient) problems.push('AUTH_CLIENT_SECRET is not set');
  let callbackPath = '/auth/callback';
  try {
    const u = new URL(redirectUri);
    callbackPath = u.pathname;
    if (u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
      problems.push('AUTH_REDIRECT_URI must use https:// (Microsoft only allows http:// for localhost)');
    }
  } catch {
    problems.push('AUTH_REDIRECT_URI is not set to a full URL');
  }
  if (!CALLBACK_PATHS.includes(callbackPath)) problems.push('AUTH_REDIRECT_URI must end in /auth/callback or /callback');

  const configured = problems.length === 0; // Microsoft sign-in available
  const devBypass = !configured && env.AUTH_DEV_BYPASS === '1';

  // Classic login credential: from AUTH_CLASSIC_USERNAME/PASSWORD, else the built-in one.
  let classic = null;
  const classicUser = String(env.AUTH_CLASSIC_USERNAME || '').trim();
  const classicPass = String(env.AUTH_CLASSIC_PASSWORD || '').trim();
  const anyMicrosoftSetting = [tenantId, clientId, clientSecret, redirectUri].some(Boolean);
  if (env.AUTH_CLASSIC_LOGIN !== '0') {
    if (classicUser && classicPass) {
      const salt = randomBytes(16).toString('base64url');
      classic = { username: classicUser, salt, hash: scryptSync(classicPass, salt, 32).toString('base64url') };
    } else if (classicUser || classicPass) {
      log('AUTH_CLASSIC_USERNAME and AUTH_CLASSIC_PASSWORD must be set together; classic login is off.');
    } else {
      classic = BUILT_IN_CLASSIC;
    }
  }
  const methods = { microsoft: configured, classic: !!classic };
  const mode = devBypass ? 'dev-bypass' : configured || classic ? 'login' : 'unconfigured';
  if (mode === 'login') log(`sign-in options: ${[configured && 'Microsoft', classic && 'classic (shared admin account)'].filter(Boolean).join(' + ')}`);
  if (!configured && anyMicrosoftSetting) log(`Microsoft sign-in is off until its settings are fixed: ${problems.join('; ')}`);
  if (configured && env.AUTH_DEV_BYPASS === '1') log('AUTH_DEV_BYPASS is ignored because Microsoft sign-in is configured');
  if (devBypass) log('WARNING: AUTH_DEV_BYPASS=1 — requests from this machine are signed in without Microsoft. Never set this on a server.');
  if (mode === 'unconfigured') log(`No sign-in method is available, so every request is refused: ${problems.join('; ')}`);

  const secureCookies = configured && redirectUri.startsWith('https:');
  const trustedProxies = new Set(String(env.TRUST_PROXY || '').split(',').map(normalizeIp).filter(Boolean));
  if (trustedProxies.size) log(`trusting X-Forwarded-For/-Proto from: ${[...trustedProxies].join(', ')}`);
  const viaTrustedProxy = (req) => trustedProxies.has(normalizeIp(req.socket?.remoteAddress));

  // The visitor's IP: the socket address, or (from a trusted proxy) the right-most X-Forwarded-For entry that is
  // not itself a trusted proxy. Left-most entries are client-supplied and could be forged, so they are not used.
  function clientIp(req) {
    const socketIp = normalizeIp(req.socket?.remoteAddress) || 'unknown';
    if (!viaTrustedProxy(req)) return socketIp;
    const hops = String(req.headers['x-forwarded-for'] || '').split(',').map(normalizeIp).filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) if (!trustedProxies.has(hops[i])) return hops[i];
    return socketIp;
  }
  const isHttps = (req) => !!req.socket?.encrypted
    || (viaTrustedProxy(req) && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https');
  const cca = configured
    ? msalClient || new ConfidentialClientApplication({
      auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
    })
    : null;
  const crypto = new CryptoProvider();

  const sessions = new Map(); // id -> { user, created, seen }
  const pending = new Map(); // state -> { verifier, nonce, returnTo, created }

  const sweep = () => {
    const t = now();
    for (const [id, s] of sessions) if (t - s.seen > IDLE_MS || t - s.created > ABSOLUTE_MS) sessions.delete(id);
    for (const [k, p] of pending) if (t - p.created > PENDING_MS) pending.delete(k);
  };
  const timer = setInterval(sweep, 10 * 60 * 1000);
  timer.unref?.();

  // Secure when the Microsoft redirect URI is https, or when this request came over HTTPS (directly or via a
  // trusted proxy).
  function cookie(name, value, maxAgeSeconds, req = null) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (secureCookies || (req && isHttps(req))) parts.push('Secure');
    if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
    return parts.join('; ');
  }

  function sessionFor(req) {
    const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!id) return null;
    const s = sessions.get(id);
    if (!s) return null;
    const t = now();
    if (t - s.seen > IDLE_MS || t - s.created > ABSOLUTE_MS) {
      sessions.delete(id);
      return null;
    }
    s.seen = t;
    return { id, ...s };
  }

  function send(res, status, body, headers = {}) {
    res.statusCode = status;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  }
  const html = (res, status, body, headers = {}) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  const json = (res, status, body, headers = {}) => send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json', ...headers });
  const redirect = (res, location, headers = {}, status = 302) => send(res, status, '', { Location: location, ...headers });

  async function startLogin(req, res, url) {
    const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
    const { verifier, challenge } = await crypto.generatePkceCodes();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    if (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
    pending.set(state, { verifier, nonce, returnTo, created: now() });
    const authUrl = await cca.getAuthCodeUrl({
      scopes: SCOPES, redirectUri, responseMode: 'query', codeChallenge: challenge, codeChallengeMethod: 'S256', state, nonce,
    });
    redirect(res, authUrl, { 'Set-Cookie': cookie(STATE_COOKIE, state, PENDING_MS / 1000) });
  }

  async function finishLogin(req, res, url) {
    const clearState = cookie(STATE_COOKIE, '', 0);
    const retry = { href: '/auth/login', label: 'Back to sign-in' };
    const state = url.searchParams.get('state') || '';
    const browserState = parseCookies(req.headers.cookie)[STATE_COOKIE] || '';
    // The state must match the one this browser started with (stops login CSRF / session fixation).
    const entry = state && sameString(state, browserState) ? pending.get(state) : null;
    if (state) pending.delete(state);
    if (!entry || now() - entry.created > PENDING_MS) {
      return html(res, 400, page('Sign-in expired', 'That sign-in link has expired or was opened in another browser. Start again.', retry), { 'Set-Cookie': clearState });
    }
    const error = url.searchParams.get('error');
    if (error) {
      log(`sign-in failed: ${error} ${String(url.searchParams.get('error_description') || '').split('\n')[0].slice(0, 200)}`);
      return html(res, 403, page('Sign-in failed', friendlyError(error, url.searchParams.get('error_description')), retry), { 'Set-Cookie': clearState });
    }
    const code = url.searchParams.get('code');
    if (!code) return html(res, 400, page('Sign-in failed', 'Microsoft did not return a sign-in code.', retry), { 'Set-Cookie': clearState });

    let result;
    try {
      // state is passed in the request too: msal-node then only compares it with the payload's (already checked above)
      // instead of decoding it as its own state format, which our random state is not (fails with invalid_state).
      result = await cca.acquireTokenByCode(
        { code, scopes: SCOPES, redirectUri, codeVerifier: entry.verifier, state },
        { code, state, nonce: entry.nonce },
      );
    } catch (err) {
      log(`token exchange failed: ${err?.errorCode || err?.name || 'error'}`);
      return html(res, 403, page('Sign-in failed', friendlyError('', err?.message), retry), { 'Set-Cookie': clearState });
    }
    const claims = result?.idTokenClaims || {};
    if (claims.nonce !== entry.nonce || String(claims.tid || '').toLowerCase() !== tenantId.toLowerCase()) {
      log('sign-in rejected: token nonce or tenant did not match');
      return html(res, 403, page('Sign-in failed', 'The sign-in response could not be verified. Try again.', retry), { 'Set-Cookie': clearState });
    }

    const user = {
      name: String(result.account?.name || claims.name || ''),
      email: String(result.account?.username || claims.preferred_username || claims.email || ''),
      oid: String(claims.oid || ''),
    };
    // New session id on every sign-in; drop any session this browser had before.
    const old = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (old) sessions.delete(old);
    const id = randomBytes(32).toString('base64url');
    const t = now();
    sessions.set(id, { user, created: t, seen: t });
    log(`signed in: ${user.email || user.oid}`);
    try {
      await users?.recordSignIn(user);
    } catch (err) {
      log(`could not record sign-in for ${user.email}: ${err?.message || err}`);
    }
    redirect(res, entry.returnTo, { 'Set-Cookie': [clearState, cookie(SESSION_COOKIE, id)] });
  }

  // Classic login: rate-limited per IP; the password is compared as a scrypt hash in constant time.
  const failures = new Map(); // ip -> { count, first }
  function verifyClassic(username, password) {
    const want = Buffer.from(classic.hash, 'base64url');
    // Always hash, so a wrong username takes as long as a wrong password. Passwords are trimmed, as before.
    const given = scryptSync(String(password || '').trim(), classic.salt, 32);
    const userOk = String(username || '').trim().toLowerCase() === classic.username.toLowerCase();
    return timingSafeEqual(given, want) && userOk;
  }

  async function classicLogin(req, res) {
    const ip = clientIp(req);
    const t = now();
    const f = failures.get(ip);
    if (f && t - f.first > CLASSIC_WINDOW_MS) failures.delete(ip);
    if ((failures.get(ip)?.count || 0) >= CLASSIC_MAX_FAILURES) {
      return html(res, 429, page('Too many attempts', 'Too many failed sign-ins from this computer. Wait 15 minutes and try again.'));
    }
    let form;
    try {
      form = await readForm(req);
    } catch (err) {
      return html(res, err.status || 400, loginPage({ ...methods, error: 'Something went wrong. Please try again.' }));
    }
    const returnTo = safeReturnTo(form.get('returnTo'));
    const username = String(form.get('username') || '').slice(0, 200);
    if (!verifyClassic(username, form.get('password'))) {
      const entry = failures.get(ip) || { count: 0, first: t };
      entry.count += 1;
      failures.set(ip, entry);
      log(`classic sign-in failed from ${ip}`);
      return html(res, 401, loginPage({ ...methods, returnTo, username, error: 'Incorrect username or password. Please try again.' }));
    }
    failures.delete(ip);
    const old = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (old) sessions.delete(old);
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { user: { name: classic.username, email: '', oid: '', classic: true }, created: t, seen: t });
    log(`classic sign-in from ${ip}`);
    return redirect(res, returnTo, { 'Set-Cookie': cookie(SESSION_COOKIE, id, null, req) }, 303);
  }

  async function handleAuthRoute(req, res, url) {
    const method = String(req.method || 'GET').toUpperCase();
    const path = url.pathname;
    if (path === '/auth/me' && method === 'GET') {
      if (req.user) return json(res, 200, { name: req.user.name, email: req.user.email, role: req.user.role, dev: !!req.user.dev });
      return json(res, 401, { error: 'Sign-in required' });
    }
    if (path === '/auth/users' || path.startsWith('/auth/users/')) return handleUsers(req, res, path, method);
    if (path === '/auth/logout' && method === 'POST') {
      const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (id) sessions.delete(id);
      return redirect(res, '/auth/signed-out', { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0, req) }, 303);
    }
    if (path === '/auth/signed-out' && method === 'GET') {
      return html(res, 200, page('You are signed out', 'You have been signed out of Security Issues Analytics.', mode === 'login' ? { href: '/auth/login', label: 'Sign in' } : null));
    }
    if (mode === 'login' && path === '/auth/login' && method === 'GET') {
      if (req.user) return redirect(res, safeReturnTo(url.searchParams.get('returnTo')));
      return html(res, 200, loginPage({ ...methods, returnTo: safeReturnTo(url.searchParams.get('returnTo')) }));
    }
    if (methods.classic && mode === 'login' && path === '/auth/login' && method === 'POST') return classicLogin(req, res);
    if (methods.microsoft && path === '/auth/microsoft' && method === 'GET') return startLogin(req, res, url);
    if (methods.microsoft && path === callbackPath && method === 'GET') return finishLogin(req, res, url);
    return json(res, 404, { error: 'Not found' });
  }

  // User management (admins only): list, add by email, change role, remove.
  async function handleUsers(req, res, path, method) {
    if (!requireAdmin(req, res)) return;
    if (!users) return json(res, 503, { error: 'User management is not available.' });
    let email = '';
    try {
      email = decodeURIComponent(path.slice('/auth/users/'.length));
    } catch {
      return json(res, 400, { error: 'Bad user address' });
    }
    const actor = { email: req.user.email || req.user.name };
    try {
      if (path === '/auth/users' && method === 'GET') return json(res, 200, { users: users.list(), me: req.user.email, readOnly: users.isReadOnly(), methods });
      if (path === '/auth/users' && method === 'POST') {
        const body = await readJson(req);
        return json(res, 201, await users.add(body.email, body.role, actor));
      }
      if (email && method === 'PATCH') {
        const body = await readJson(req);
        return json(res, 200, await users.setRole(email, body.role, actor));
      }
      if (email && method === 'DELETE') {
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(res, 415, { error: 'Content-Type must be application/json' });
        await users.remove(email, actor);
        return json(res, 200, { removed: email });
      }
      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      return json(res, err.status || 500, { error: err.status ? err.message : 'Could not update users.' });
    }
  }

  function refuseUnconfigured(res) {
    return html(res, 503, page('Sign-in is not set up', 'No sign-in option is available on this server, so the app is locked. Ask the administrator to check the AUTH_* settings.'));
  }

  // Connect-style middleware. Must run before every other route (see vite.config.ts).
  async function middleware(req, res, next) {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const path = url.pathname;
      const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

      if (mode === 'dev-bypass') {
        if (!isLoopback(req)) return html(res, 403, page('Not available', 'This copy of the app runs in local development mode and only accepts requests from its own machine.'));
        req.user = { name: 'Local developer', email: 'dev@localhost', oid: '', dev: true, role: env.AUTH_DEV_ROLE === 'user' ? 'user' : 'admin' };
      } else if (mode === 'login') {
        const session = sessionFor(req);
        if (session?.user.classic) {
          // The shared classic account can do everything (as before). Per-person roles come with Microsoft sign-in.
          if (methods.classic) req.user = { ...session.user, role: 'admin' };
        } else if (session) {
          // Role is looked up on every request, so a change by an admin applies at once. No store = least privilege.
          req.user = { ...session.user, role: users ? users.roleOf(session.user) : 'user' };
        }
      }

      // The sign-in reply arrives before there is a session. /callback is let through only when it is the configured path.
      if (path.startsWith('/auth/') || (methods.microsoft && path === callbackPath)) return await handleAuthRoute(req, res, url);
      if (isPublic) return next();
      if (mode === 'unconfigured') return refuseUnconfigured(res);
      if (req.user) return next();

      // No session: browser navigations go to the sign-in page (Microsoft or classic); API calls and assets get 401.
      const method = String(req.method || 'GET').toUpperCase();
      const wantsHtml = String(req.headers.accept || '').includes('text/html');
      if ((method === 'GET' || method === 'HEAD') && wantsHtml) {
        return redirect(res, `/auth/login?returnTo=${encodeURIComponent(safeReturnTo(path + url.search))}`);
      }
      return json(res, 401, { error: 'Sign-in required' });
    } catch (err) {
      log(`error: ${err?.message || err}`);
      return json(res, 500, { error: 'Sign-in error' });
    }
  }

  return {
    mode,
    methods,
    problems,
    middleware,
    stop: () => clearInterval(timer),
    // for tests
    _sessions: sessions,
    _pending: pending,
  };
}
