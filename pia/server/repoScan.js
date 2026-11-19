import { fileKind, scanFiles, personalSummary, RULESET_VERSION } from './scanner.js';

// Runs the scanner over GitHub repositories through the read-only client (github.js). File contents stay in
// memory for the duration of the scan only; what is returned (and stored) is the scanner's summary.

export const LIMITS = { maxFiles: 300, maxFileBytes: 512 * 1024, maxMs: 30_000, maxChangedFiles: 120 };

// Full scan of a repository's default branch.
export async function scanRepo(gh, repo, { limits = LIMITS, now = () => Date.now() } = {}) {
  const started = now();
  const info = await gh.repo(repo);
  const sha = await gh.headSha(repo, info.defaultBranch);
  const tree = await gh.tree(repo, sha);
  const paths = tree.entries.map((e) => e.path);
  const candidates = tree.entries.filter((e) => fileKind(e.path));
  let truncated = tree.truncated;
  const files = [];
  for (const e of candidates) {
    if (files.length >= limits.maxFiles || now() - started > limits.maxMs) { truncated = true; break; }
    if (e.size > limits.maxFileBytes) { truncated = true; continue; }
    files.push({ path: e.path, content: await gh.blob(repo, e.sha) });
  }
  const result = scanFiles({ paths, files });
  return {
    repo, branch: info.defaultBranch, sha, rulesetVersion: RULESET_VERSION,
    status: truncated ? 'truncated' : 'ok',
    filesConsidered: candidates.length, filesRead: files.length,
    fields: result.fields,
    summary: { ...result, fields: undefined },
  };
}

// What changed in a repository since a day ("YYYY-MM-DD", Manila time) that matters to the PIA:
// personal-data fields added/removed, outside services added/removed, privacy controls touched.
export async function changesSince(gh, repo, sinceDay, { limits = LIMITS, offsetHours = 8 } = {}) {
  const info = await gh.repo(repo);
  const head = await gh.headSha(repo, info.defaultBranch);
  const untilIso = new Date(Date.parse(`${sinceDay}T23:59:59Z`) - offsetHours * 3_600_000).toISOString();
  const base = await gh.commitBefore(repo, info.defaultBranch, untilIso);
  const out = { repo, branch: info.defaultBranch, since: sinceDay, headSha: head, baseSha: base?.sha ?? null, totalCommits: 0, changedFiles: 0, relevantFiles: [], truncated: false };

  if (!base) {
    // The repository has no commits from before the last assessment: everything in it is new since then.
    const full = await scanRepo(gh, repo, { limits });
    return { ...out, newRepo: true, truncated: full.status === 'truncated', diff: diffScans(emptyScan(), { fields: full.fields, summary: full.summary }) };
  }
  if (base.sha === head) return { ...out, diff: diffScans(emptyScan(), emptyScan()) };

  const cmp = await gh.compare(repo, base.sha, head);
  out.totalCommits = cmp.totalCommits;
  out.changedFiles = cmp.files.length;
  out.truncated = cmp.truncated;
  const relevant = cmp.files.filter((f) => fileKind(f.path) || (f.previousPath && fileKind(f.previousPath)));
  out.relevantFiles = relevant.slice(0, 200).map((f) => ({ path: f.path, status: f.status }));

  const before = [], after = [];
  for (const f of relevant.slice(0, limits.maxChangedFiles)) {
    if (f.status !== 'removed') {
      const text = await gh.fileAt(repo, f.path, head, limits.maxFileBytes);
      if (text != null) after.push({ path: f.path, content: text });
    }
    if (f.status !== 'added') {
      const text = await gh.fileAt(repo, f.previousPath || f.path, base.sha, limits.maxFileBytes);
      if (text != null) before.push({ path: f.previousPath || f.path, content: text });
    }
  }
  if (relevant.length > limits.maxChangedFiles) out.truncated = true;
  // Path signals (consent pages, audit code, …) only from files added or removed in the period.
  const addedPaths = cmp.files.filter((f) => f.status === 'added' || f.status === 'renamed').map((f) => f.path);
  const removedPaths = cmp.files.filter((f) => f.status === 'removed').map((f) => f.path);
  const a = scanFiles({ paths: addedPaths, files: after });
  const b = scanFiles({ paths: removedPaths, files: before });
  return { ...out, diff: diffScans({ fields: b.fields, summary: b }, { fields: a.fields, summary: a }) };
}

const emptyScan = () => ({ fields: [], summary: { integrations: [], controls: {}, storage: { drivers: [], databases: [] }, hosts: [] } });

// Before/after -> what was added and removed (by identifier, service, control signal).
export function diffScans(before, after) {
  const key = (f) => `${f.category}\u0000${f.identifier.toLowerCase()}`;
  const fb = new Map(before.fields.filter((f) => f.sensitivity !== 'credential').map((f) => [key(f), f]));
  const fa = new Map(after.fields.filter((f) => f.sensitivity !== 'credential').map((f) => [key(f), f]));
  const pick = (f) => ({ identifier: f.identifier, category: f.category, sensitivity: f.sensitivity, path: f.path, line: f.line });
  const fieldsAdded = [...fa.entries()].filter(([k]) => !fb.has(k)).map(([, f]) => pick(f));
  const fieldsRemoved = [...fb.entries()].filter(([k]) => !fa.has(k)).map(([, f]) => pick(f));
  const labels = (s) => (s.summary.integrations || []).map((i) => i.label);
  const ib = labels(before), ia = labels(after);
  const integrationsAdded = (after.summary.integrations || []).filter((i) => !ib.includes(i.label));
  const integrationsRemoved = (before.summary.integrations || []).filter((i) => !ia.includes(i.label));
  const controls = {};
  const text = (c) => c.label + (c.path ? ` (${c.path})` : c.dependency ? ` (${c.dependency})` : '');
  const kinds = new Set([...Object.keys(after.summary.controls || {}), ...Object.keys(before.summary.controls || {})]);
  for (const kind of kinds) {
    const a = (after.summary.controls?.[kind] || []).map(text);
    const b = (before.summary.controls?.[kind] || []).map(text);
    const added = a.filter((x) => !b.includes(x));
    const removed = b.filter((x) => !a.includes(x));
    if (added.length || removed.length) controls[kind] = { added, removed };
  }
  const dbb = before.summary.storage?.databases || [], dba = after.summary.storage?.databases || [];
  return {
    fieldsAdded, fieldsRemoved,
    personalAdded: personalSummary(fieldsAdded.map((f) => ({ ...f }))),
    integrationsAdded, integrationsRemoved,
    databasesAdded: dba.filter((d) => !dbb.includes(d)),
    newStorage: !(before.summary.storage?.drivers || []).length && (after.summary.storage?.drivers || []).length > 0,
    controls,
  };
}
