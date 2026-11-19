import { personalSummary } from './scanner.js';

// "Does this app need its own PIA?" Pure rules over scan results (DECISIONS D15). It only RECOMMENDS: an admin
// confirms the decision on the app page, with a reason, and that decision is what counts.
//
//   own           the app stores personal data in its own database (own schema/migrations with personal fields).
//                 This wins even for an API used by an app with a PIA (user rule, 2026-10-30).
//   covered       no personal data stored of its own, and it is tied to an app with an approved PIA: it calls that
//                 app / is called by it (URLs, setting names, package names) or uses the same database
//   not_required  no personal-data fields and nothing linking it to an app with a PIA (confirm by hand)
//   undecided     no repo scanned, a scan failed or was cut short, or an API with no app with a PIA linked to it

// scans: the app's latest scan per repo [{ status, repo, summary, fields }]
// others: other apps [{ id, name, approvedPolicy: { id, url } | null, coverageStatus, repos: [..], scans: [...] }]
export function recommend({ app, scans = [], others = [] }) {
  if (!scans.length) return result('undecided', ['No repository has been scanned yet. Add the app’s GitHub repository and scan it.']);
  const failed = scans.filter((s) => s.status === 'error');
  if (failed.length) return result('undecided', failed.map((s) => `The scan of ${s.repo} failed: ${s.error || 'unknown error'}.`));

  const fields = scans.flatMap((s) => s.fields || []);
  const personal = personalSummary(fields);
  const sensitive = personal.some((p) => p.sensitivity === 'sensitive');
  const ownSchema = scans.some((s) => s.summary?.storage?.ownSchema);
  const surface = mergeSurface(scans);
  const reasons = [];

  if (ownSchema && personal.length) {
    const cats = personal.map((p) => p.category.toLowerCase()).join(', ');
    reasons.push(`It stores personal data in its own database: ${cats} (${personal.reduce((n, p) => n + p.count, 0)} fields${sensitive ? ', including sensitive personal information' : ''}).`);
    if (surface === 'api') reasons.push('It is an API, but because it keeps its own personal data it needs its own PIA.');
    return result('own', reasons, { sensitive, personal });
  }

  const truncated = scans.filter((s) => s.status === 'truncated');
  const links = relatedApps({ app, scans, others });
  const parents = links.filter((l) => l.app.approvedPolicy && l.app.coverageStatus !== 'covered' && l.app.coverageStatus !== 'not_required');

  if (parents.length) {
    const best = parents.sort((a, b) => b.score - a.score)[0];
    reasons.push(surface === 'api' ? 'It is an API with no database of personal data of its own.' : 'It has no database of personal data of its own.');
    reasons.push(...best.why.map((w) => `${w} ${best.app.name}, which has an approved PIA.`));
    if (personal.length) reasons.push(`Personal-data names appear in its code (${personal.map((p) => p.category.toLowerCase()).join(', ')}), but not in a schema of its own: the data belongs to ${best.app.name}.`);
    if (truncated.length) reasons.push('Part of the repository was not scanned (limits reached); check the decision by hand.');
    return result('covered', reasons, { sensitive, personal, parent: { appId: best.app.id, name: best.app.name, policyId: best.app.approvedPolicy.id, policyUrl: best.app.approvedPolicy.url }, related: links.map(brief) });
  }

  if (truncated.length) return result('undecided', [`Part of ${truncated.map((s) => s.repo).join(', ')} was not scanned (limits reached). Review it by hand.`], { sensitive, personal, related: links.map(brief) });

  if (surface === 'api') {
    const near = links.length ? ` It is linked to ${links.map((l) => l.app.name).join(', ')}, but none of them has an approved PIA yet.` : '';
    return result('undecided', [`It is an API with no personal data of its own, but no app with an approved PIA was found that uses it.${near} Scan the app that calls it, or choose the parent app by hand.`], { sensitive, personal, related: links.map(brief) });
  }

  if (!personal.length) {
    const storage = scans.some((s) => s.summary?.storage?.persistent);
    reasons.push(storage ? 'It has a database, but no personal-data fields were found in its schema.' : 'It has no database and no personal-data fields were found.');
    reasons.push('Confirm this by hand: the scan only sees what is in the repository.');
    return result('not_required', reasons, { sensitive, personal, related: links.map(brief) });
  }

  return result('undecided', ['Personal-data names appear in the code, but no schema of its own was found and no app with a PIA is linked to it. Review it by hand.'], { sensitive, personal, related: links.map(brief) });
}

function result(recommendation, reasons, extra = {}) {
  return { recommendation, reasons, sensitive: false, personal: [], parent: null, related: [], ...extra };
}
const brief = (l) => ({ appId: l.app.id, name: l.app.name, why: l.why, hasPia: !!l.app.approvedPolicy });

function mergeSurface(scans) {
  const types = scans.map((s) => s.summary?.surface?.type).filter(Boolean);
  if (types.some((t) => t.startsWith('web app'))) return 'web app';
  if (types.includes('api')) return 'api';
  return 'other';
}

// Apps linked to this one through its scans: either side mentions the other's hosts, repo or package name, or both
// use the same database name. Returns [{ app, why: [..], score }].
export function relatedApps({ app, scans, others }) {
  const mine = identity(app, scans);
  const out = [];
  for (const other of others) {
    if (other.id === app.id || !other.scans?.length) continue;
    const theirs = identity(other, other.scans);
    const why = [];
    let score = 0;
    const sharedDb = mine.databases.filter((d) => theirs.databases.includes(d));
    if (sharedDb.length) { why.push(`It uses the same database (${sharedDb.join(', ')}) as`); score += 3; }
    if (mentions(theirs, mine)) { why.push('It is called by'); score += 2; }
    if (mentions(mine, theirs)) { why.push('It calls'); score += 2; }
    if (why.length) out.push({ app: other, why, score });
  }
  return out;
}

// What an app is known by (hosts, repo and package names) and what it refers to.
function identity(app, scans) {
  const s = (k) => scans.flatMap((x) => x.summary?.[k] || []);
  const repoNames = scans.map((x) => String(x.repo || '').split('/')[1]).filter(Boolean).map((n) => n.toLowerCase());
  return {
    databases: [...new Set(scans.flatMap((x) => x.summary?.storage?.databases || []))],
    selfHosts: [...new Set(s('selfHosts'))],
    names: [...new Set([...repoNames, ...s('packageNames')])].filter((n) => n.length >= 4),
    refHosts: [...new Set(s('hosts'))],
    refKeys: s('envKeys').map((k) => k.toLowerCase()),
    deps: s('dependencies'),
  };
}

// Does `a` refer to `b`? (a's config URLs hit b's own hosts, a depends on b's package, or a's settings name b)
function mentions(a, b) {
  if (b.selfHosts.some((h) => a.refHosts.includes(h))) return true;
  if (b.names.some((n) => a.deps.includes(n))) return true;
  return b.names.some((n) => {
    const slug = n.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (slug.length < 4) return false;
    return a.refKeys.some((k) => k.startsWith(`${slug}_`) && /_(url|host|endpoint|base_url|api|api_url|uri)$/.test(k))
      || a.refHosts.some((h) => h.split('.')[0] === n.replace(/[^a-z0-9-]+/g, '-'));
  });
}
