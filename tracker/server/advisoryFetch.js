// Tech Risk Analyzer advisory check (D19): reads ONE public advisory page that a signed-in user pasted, so the browser
// can check its apps against it. Security-sensitive: the server fetches a user-supplied URL, so it is guarded against
// SSRF and abuse:
//   - https only, default port only, no credentials in the URL
//   - every address the host name resolves to must be public (no loopback, private, link-local, CGNAT, multicast,
//     ULA, metadata ...); the connection is pinned to the checked address, so DNS rebinding can't swap it
//   - at most 3 redirects, each checked the same way; 10 s timeout; 2 MB body; text/html, text/plain, JSON or XML only
//   - no cookies or auth headers are sent; nothing is stored; only text is returned (scripts and styles are dropped)
//   - per-user rate limit and at most 2 fetches at a time
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const TEXT_LIMIT = 200_000;

// IPv4 ranges that must never be reached: [first, prefix length].
const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4num = (ip) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
function blockedV4(ip) {
  const n = v4num(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const b = v4num(base);
    return n >= b && n < b + size;
  });
}

// True when the address is not a public unicast address.
export function isBlockedAddress(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return blockedV4(ip);
  if (kind !== 6) return true;
  const a = ip.toLowerCase();
  if (a === '::' || a === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a) || /^::(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return blockedV4(mapped[1]);
  if (/^::ffff:/.test(a)) return true; // mapped in hex form
  const first = parseInt(a.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (a.startsWith('64:ff9b:') || a.startsWith('2001:db8:') || a.startsWith('100::')) return true; // NAT64, documentation, discard
  if (a.startsWith('2002:')) return true; // 6to4 can embed a private IPv4
  return false;
}

// Checks the URL shape. Throws with a message for the user.
export function checkAdvisoryUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('That is not a valid link.'); }
  if (u.protocol !== 'https:') throw new Error('Only https:// links can be read.');
  if (u.username || u.password) throw new Error('Links with a user name or password are not allowed.');
  if (u.port && u.port !== '443') throw new Error('Only links on the standard https port can be read.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !net.isIP(host)) {
    throw new Error('Only public websites can be read.');
  }
  if (net.isIP(host) && isBlockedAddress(host)) throw new Error('Only public websites can be read.');
  u.hash = '';
  return u;
}

async function resolvePublic(host, lookup) {
  if (net.isIP(host)) return { address: host, family: net.isIP(host) };
  let addrs;
  try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { throw new Error(`The site ${host} could not be found.`); }
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) throw new Error('Only public websites can be read.');
  return addrs[0];
}

function getOnce(u, addr, request) {
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: 'https:', hostname: u.hostname.replace(/^\[|\]$/g, ''), port: 443, method: 'GET', path: `${u.pathname}${u.search}`,
      servername: net.isIP(u.hostname) ? undefined : u.hostname,
      // Connect to the address that was checked, not whatever DNS says next.
      lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: addr.address, family: addr.family }]) : cb(null, addr.address, addr.family)),
      headers: { 'User-Agent': 'SecurityIssuesAnalytics-AdvisoryCheck/1.0', Accept: 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1', 'Accept-Encoding': 'identity' },
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: res.headers.location });
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`The site answered ${res.statusCode}.`)); }
      const type = String(res.headers['content-type'] || '').toLowerCase();
      if (!/text\/html|text\/plain|application\/(xhtml\+xml|json|xml)|text\/xml/.test(type)) { res.resume(); return reject(new Error('That link is not a web page (for example a PDF or a download).')); }
      if (Number(res.headers['content-length'] || 0) > MAX_BYTES) { res.resume(); return reject(new Error('That page is too large to read.')); }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(new Error('That page is too large to read.')); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), type }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The site took too long to answer.')));
    req.on('error', reject);
    req.end();
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Readable text from an HTML page: one block element per line, tables as "a | b" rows.
export function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template|iframe|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<\/(td|th)\s*>/gi, ' | ').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|tr|table|thead|tbody|h[1-6]|pre|blockquote|dd|dt|dl|figure|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(s).split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').replace(/\s*\|\s*$/, '').trim()).filter(Boolean).join('\n');
}

function titleOf(html) {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html);
  const t = og?.[1] || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  return decode(t).replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Fetches one advisory page and returns { url, title, text, fetchedAt }.
export async function fetchAdvisory(raw, { lookup = dns.lookup, request = https.request } = {}) {
  let u = checkAdvisoryUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const addr = await resolvePublic(u.hostname.replace(/^\[|\]$/g, ''), lookup);
    const r = await getOnce(u, addr, request);
    if (r.redirect) {
      if (hop === MAX_REDIRECTS) throw new Error('That link redirects too many times.');
      u = checkAdvisoryUrl(new URL(r.redirect, u).toString());
      continue;
    }
    const html = /html|xml/.test(r.type);
    const text = (html ? htmlToText(r.body) : r.body).slice(0, TEXT_LIMIT);
    return { url: u.toString(), title: html ? titleOf(r.body) : '', text, fetchedAt: new Date().toISOString() };
  }
  throw new Error('That link redirects too many times.');
}

// Express handler: POST { url } -> { url, title, text, fetchedAt }. Rate limited per signed-in user.
export function advisoryRoute({ fetcher = fetchAdvisory, perMinute = 6, log = () => {} } = {}) {
  const hits = new Map();
  let running = 0;
  return async (req, res) => {
    const who = String(req.user?.email || req.socket?.remoteAddress || 'anon');
    const now = Date.now();
    const recent = (hits.get(who) || []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) return res.status(429).json({ error: 'Too many advisory checks. Wait a minute and try again.' });
    if (running >= 2) return res.status(429).json({ error: 'Another advisory is being read. Try again in a few seconds.' });
    recent.push(now);
    hits.set(who, recent);
    running++;
    try {
      const out = await fetcher(req.body?.url);
      log(`advisory read by ${who}: ${new URL(out.url).host}`);
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e.message || 'The page could not be read.' });
    } finally {
      running--;
    }
  };
}
