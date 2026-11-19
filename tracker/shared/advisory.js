// Tech Risk Analyzer advisory check (D19): which apps in the workbook use a product named in one advisory, and is
// their version below the fix? Rule-based and auditable: no AI. The extraction only proposes products and fixed
// versions; the page shows them for the user to correct before (and after) the check runs.
import { vcmp, vparse } from './techRisk.js';

export const ADV_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VER = '\\d+(?:\\.\\d+){1,3}';

// Words in an inventory that are not products, or too generic to look for in an advisory.
const STOP = new Set(['api', 'apis', 'rest', 'json', 'jwt', 'oauth', 'oauth2', 'sso', 'spa', 'ui', 'web', 'app', 'apps', 'mobile', 'backend', 'frontend', 'server',
  'client', 'service', 'services', 'worker', 'workers', 'job', 'jobs', 'cron', 'scheduler', 'queue', 'database', 'db', 'data', 'auth', 'admin', 'none', 'n/a', 'na',
  'other', 'and', 'with', 'via', 'for', 'the', 'from', 'on', 'in', 'of', 'to', 'cloud', 'container', 'containers', 'docker container', 'image', 'images', 'http', 'https',
  'html', 'css', 'javascript', 'typescript', 'templates', 'views', 'microservice', 'monolith', 'linux', 'windows', 'aws', 'azure', 'google', 'microsoft', 'github']);

// Candidate product names from the workbook's apps: technology words with versions and noise removed.
export function inventoryTerms(apps) {
  const seen = new Map();
  const labels = new Set();
  for (const a of apps || []) for (const f of [...(a.fields || []), ...(a.units || []).flatMap((u) => u.fields || [])]) {
    String(f.label || '').toLowerCase().replace(/\(s\)/g, '').split(/\s*[/&]\s*|\s+\(|\)/).forEach((w) => w.trim() && labels.add(w.trim()));
  }
  for (const a of apps || []) {
    const texts = [...(a.fields || []).map((f) => f.value), ...(a.units || []).map((u) => u.text || '')];
    for (const t of texts) {
      for (let part of String(t).split(/[\n,;+()[\]{}|]|\s\/\s|\s-\s|:\s/)) {
        part = part.replace(new RegExp(`[~^>=<v]*${VER}\\S*`, 'gi'), ' ').replace(/\b\d+(\.x)?\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[^\w]+|[^\w+#]+$/g, '').trim();
        if (part.length < 3 || part.length > 32 || !/[a-z]/i.test(part) || part.split(' ').length > 3) continue;
        const key = part.toLowerCase();
        if (STOP.has(key) || labels.has(key) || /^https?:|\.(com|org|net|io)\b|@/.test(key)) continue;
        if (!seen.has(key)) seen.set(key, part);
      }
    }
  }
  return [...seen.values()];
}

const FIX_BEFORE = /\b(?:before|prior to|earlier than|older than|below|lower than|up to but not including)\s*$|<\s*$/i;
const FIX_WORDS = /\b(fix|fixed|fixes|patched|patch|upgrade|update|resolved|remediat|addressed|safe version|non-vulnerable|first fixed)/i;
const NOT_FIX = /\b(from|since|starting|introduced|affected from|first affected|as of|through)\s*$/i;

// Versions written after a "before / fixed in" phrase in a line, e.g. "before 1.30.7 or 1.31.9".
function fixedVersionsIn(line, fixContext) {
  const out = [];
  const re = new RegExp(VER, 'g');
  let m;
  while ((m = re.exec(line))) {
    const pre = line.slice(Math.max(0, m.index - 40), m.index);
    if (NOT_FIX.test(pre)) continue;
    // A version joined to an earlier fixed one ("1.30.7 or 1.31.9", "1.30.7, 1.31.9") is fixed too.
    const joined = out.length && /^\s*(?:,|or|and|\/|or later,?|and later,?)\s*$/i.test(line.slice(out[out.length - 1].end, m.index));
    if (FIX_BEFORE.test(pre) || fixContext || joined || /\b(fixed|patched|resolved) in\s*$/i.test(pre) || /\bupgrade to\s*$|\bupdate to\s*$/i.test(pre)) {
      out.push({ v: m[0], end: m.index + m[0].length });
    }
  }
  return out.map((x) => x.v);
}

// A different, longer product name ("NGINX Plus", "Redis Enterprise") is not the same product.
const VARIANT = /^\s+(plus|enterprise|pro|premium|cloud|ee|business|commercial|stack|for\s+\w+)\b/i;

// Proposes { title, severity, cves, products } from an advisory's text and the inventory's product names.
export function extractAdvisory(text, terms, { title = '' } = {}) {
  const src = String(text || '');
  const lines = src.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map((l) => l.trim()).filter(Boolean);
  const cves = [];
  for (const line of lines) {
    for (const id of line.match(/CVE-\d{4}-\d{4,7}/g) || []) {
      if (cves.some((c) => c.id === id)) continue;
      cves.push({ id, line: line.slice(0, 300) });
    }
  }
  // Severity: the highest word used next to "severity", "CVSS" or "rated".
  let severity = '';
  for (const m of src.matchAll(/severity|cvss|rated|rates|rating|impact/gi)) {
    const win = src.slice(Math.max(0, m.index - 40), m.index + 80).split('\n').find((l, i, all) => all.length === 1 || l.toLowerCase().includes(m[0].toLowerCase())) || '';
    for (const s of ADV_SEVERITIES) if (new RegExp(`\\b${s}\\b`, 'i').test(win) && (!severity || ADV_SEVERITIES.indexOf(s) < ADV_SEVERITIES.indexOf(severity))) severity = s;
  }
  const products = [];
  const sorted = [...new Set(terms || [])].sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const re = new RegExp(`(?<![\\w.-])${reEsc(term)}(?![\\w-])`, 'gi');
    const fixed = new Set();
    let mentions = 0;
    let heading = '';
    let evidence = '';
    for (const line of lines) {
      if (line.length <= 60 && !new RegExp(VER).test(line)) heading = line;
      re.lastIndex = 0;
      let m;
      let hit = false;
      while ((m = re.exec(line))) {
        if (VARIANT.test(line.slice(m.index + m[0].length))) continue;
        hit = true;
        break;
      }
      if (!hit) continue;
      mentions++;
      const ctx = FIX_WORDS.test(heading) && !/affected/i.test(line) || /\b(fixed|patched) versions?\b/i.test(line);
      const vs = fixedVersionsIn(line, ctx);
      if (vs.length && !evidence) evidence = line.slice(0, 240);
      vs.forEach((v) => fixed.add(v));
    }
    if (!mentions) continue;
    // A shorter term inside a longer one already found ("SQL" in "PostgreSQL") adds nothing.
    if (products.some((p) => p.name.toLowerCase().includes(term.toLowerCase()) && p.mentions >= mentions)) continue;
    products.push({ name: term, match: [term.toLowerCase()], fixed: [...fixed].sort(vcmp), mentions, evidence, include: fixed.size > 0 || title.toLowerCase().includes(term.toLowerCase()) });
  }
  products.sort((a, b) => Number(b.include) - Number(a.include) || b.fixed.length - a.fixed.length || b.mentions - a.mentions);
  return { title: title || lines[0]?.slice(0, 200) || 'Advisory', severity: severity || 'High', cves, products: products.slice(0, 15) };
}

// Is version v below the fix? Same major.minor branch first, else the next fixed release above it.
export function fixVerdict(v, fixed) {
  const sorted = [...fixed].sort(vcmp);
  const same = sorted.find((f) => { const a = vparse(f); const b = vparse(v); return a[0] === b[0] && a[1] === b[1]; });
  if (same) {
    if (String(v).split('.').length < Math.min(3, String(same).split('.').length)) return { state: 'possible', fix: same, why: 'patch level not stated' };
    return vcmp(v, same) >= 0 ? { state: 'patched', fix: same } : { state: 'affected', fix: same };
  }
  const next = sorted.find((f) => vcmp(f, v) > 0);
  return next ? { state: 'affected', fix: next } : { state: 'patched', fix: sorted[sorted.length - 1] };
}

// Where a product is named in a block of workbook text, with the version written next to it, if any.
export function findProduct(text, p) {
  const t = String(text || '');
  for (const name of p.match || []) {
    if (!name) continue;
    const re = new RegExp(`(?<![\\w.-])${reEsc(name)}(?![\\w-])(?:[\\s:/@=-]*(?:v|version\\s*)?(${VER})|[:\\s]*(stable|latest|mainline|lts|alpine)\\b)?`, 'gi');
    let m;
    let hit = null;
    while ((m = re.exec(t))) {
      if (VARIANT.test(t.slice(m.index + name.length))) continue;
      if (!hit || (m[1] && !hit.version)) hit = { version: m[1] || '', floating: m[2] || '', at: m.index, len: m[0].length };
      if (hit.version) break;
    }
    if (hit) {
      const s = Math.max(0, hit.at - 45);
      const e = Math.min(t.length, hit.at + hit.len + 45);
      hit.snippet = `${s ? '…' : ''}${t.slice(s, e).replace(/\s+/g, ' ').trim()}${e < t.length ? '…' : ''}`;
      return hit;
    }
  }
  return null;
}

const lowerSev = (s) => (ADV_SEVERITIES.includes(s) && s !== 'Low' ? ADV_SEVERITIES[ADV_SEVERITIES.indexOf(s) + 1] : s || 'Medium');

// One row per app and repository that names a selected product: affected / possible / patched.
export function checkApps(apps, advisory) {
  const products = (advisory.products || []).filter((p) => p.include && (p.match || []).length);
  const rows = [];
  for (const a of apps || []) {
    const hostingOf = (fields) => ((fields || []).find((f) => /hosting|deploy/i.test(f.label)) || {}).value || '';
    const units = a.units.filter((u) => !u.missing && u.text);
    const blocks = units.length ? units : [{ repo: '(whole application)', appLevel: true, fields: a.fields, text: a.fields.map((f) => `${f.label}: ${f.value}`).join('\n') }];
    for (const u of blocks) {
      for (const p of products) {
        const hit = findProduct(u.text, p);
        if (!hit) continue;
        let r;
        if (hit.version && p.fixed.length) r = fixVerdict(hit.version, p.fixed);
        else if (hit.version) r = { state: 'possible', fix: '', why: 'the advisory gives no fixed version' };
        else r = { state: 'possible', fix: p.fixed.join(' / '), why: hit.floating ? `floating tag "${hit.floating}"` : 'version not stated' };
        const severity = r.state === 'affected' ? advisory.severity : r.state === 'possible' ? lowerSev(advisory.severity) : 'OK';
        rows.push({ app: a.name, repo: u.appLevel ? '(whole application)' : u.repo, product: p.name, version: hit.version || hit.floating || '', ...r, why: r.why || '', severity, snippet: hit.snippet, hosting: hostingOf(u.fields) || hostingOf(a.fields) });
        break; // one product per repository
      }
    }
  }
  const rank = { affected: 0, possible: 1, patched: 2 };
  return rows.sort((x, y) => rank[x.state] - rank[y.state] || x.app.localeCompare(y.app) || x.repo.localeCompare(y.repo));
}
