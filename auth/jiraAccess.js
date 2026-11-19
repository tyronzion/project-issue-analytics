// Who may sync from Jira with their own credentials, and to which Jira (D8 amended 2026-11-19).
// Admins: any Jira URL, as before; their sync can also replace the shared dataset (client side).
// Users: may now use Settings → Jira with their OWN Jira email + API token, but only against the team's Jira site(s),
// so the server can't be pointed at an arbitrary host (SSRF), and at most 6 syncs a minute. A user's sync only updates
// that user's own browser; saving the shared dataset (POST /api/state/issues) stays admin-only.

// Allowed Jira hosts for users: JIRA_ALLOWED_HOSTS (comma separated; "*.atlassian.net" style wildcards allowed),
// else the host of JIRA_BASE_URL plus any Atlassian Cloud site (*.atlassian.net).
export function allowedJiraHosts(env = process.env) {
  const list = String(env.JIRA_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list;
  const out = ['*.atlassian.net'];
  try {
    const u = new URL(String(env.JIRA_BASE_URL || ''));
    if (u.protocol === 'https:') out.unshift(u.hostname.toLowerCase());
  } catch { /* not set */ }
  return out;
}

const hostMatches = (host, rule) => (rule.startsWith('*.') ? host.endsWith(rule.slice(1)) && host.length > rule.length - 1 : host === rule);

// Throws (with a message for the user) unless baseUrl is https on the default port, without credentials, on an
// allowed host. Returns the origin to use.
export function checkUserJiraUrl(baseUrl, hosts) {
  let u;
  try { u = new URL(String(baseUrl || '').trim()); } catch { throw new Error('Enter the Jira site address, for example https://your-domain.atlassian.net'); }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) {
    throw new Error('The Jira address must be https://, on the standard port, without a user name or password.');
  }
  const host = u.hostname.toLowerCase();
  if (!hosts.some((rule) => hostMatches(host, rule))) {
    throw new Error(`Only the team's Jira can be used here (${hosts.join(', ')}). Ask an admin if your Jira site is different.`);
  }
  return u.origin;
}

// Per-user rate limit for user syncs. Returns true when the call may go ahead.
export function createSyncLimiter({ perMinute = 6, now = () => Date.now() } = {}) {
  const hits = new Map();
  return (who) => {
    const t = now();
    const recent = (hits.get(who) || []).filter((x) => t - x < 60_000);
    if (recent.length >= perMinute) { hits.set(who, recent); return false; }
    recent.push(t);
    hits.set(who, recent);
    return true;
  };
}
