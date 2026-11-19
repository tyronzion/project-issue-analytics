import { useState } from 'react';
import { ScanSearch, Github, Save, ShieldCheck, ExternalLink, AlertTriangle } from 'lucide-react';
import { piaApi } from './api.js';
import { RECOMMENDATION } from './badges.jsx';

const COVERAGE_LABEL = { own: 'Needs its own PIA', covered: 'Covered by a parent app’s PIA', not_required: 'No PIA needed' };

// New application: link its GitHub repositories, scan them (read-only), see whether it needs its own PIA, and
// record the admin's decision. Users see the results; admins see the buttons (the server enforces it too).
export default function RepoScanPanel({ id, data, isAdmin, busy, act }) {
  const [repoText, setRepoText] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [decision, setDecision] = useState(null);
  const rec = data.recommendation;
  const cov = data.coverage;

  async function scan() {
    setScanning(true);
    try { await act(() => piaApi.scan(id)); } finally { setScanning(false); }
  }
  function startDecision() {
    const p = rec.parent;
    const parent = data.parentOptions.find((o) => o.id === (cov?.parentAppId ?? p?.appId));
    setDecision({
      status: cov?.status ?? (rec.recommendation === 'undecided' ? 'own' : rec.recommendation),
      parentAppId: parent?.id ?? '',
      parentPolicyId: cov?.parentPolicyId ?? p?.policyId ?? parent?.policies[0]?.id ?? '',
      reason: cov && !cov.needsReview ? cov.reason : rec.reasons.join(' '),
      confirmSensitive: false,
    });
  }
  async function saveDecision(e) {
    e.preventDefault();
    const body = { status: decision.status, reason: decision.reason, confirmSensitive: decision.confirmSensitive };
    if (decision.status === 'covered') Object.assign(body, { parentAppId: Number(decision.parentAppId), parentPolicyId: decision.parentPolicyId });
    if (await act(() => piaApi.setCoverage(id, body))) setDecision(null);
  }

  const parent = decision && data.parentOptions.find((o) => o.id === Number(decision.parentAppId));
  const tone = RECOMMENDATION[rec.recommendation];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">Does it need a PIA?</h3>
        {isAdmin && data.githubRepos.length > 0 && (
          <button type="button" className="at-btn ml-auto" disabled={busy || !data.github.configured} onClick={scan} title={data.github.configured ? 'Read-only scan of the default branch' : 'Set up the GitHub App on PIA Matching first'}>
            <ScanSearch className={scanning ? 'w-3.5 h-3.5 animate-pulse' : 'w-3.5 h-3.5'} aria-hidden /> {scanning ? 'Scanning…' : data.scans.length ? 'Scan again' : 'Scan repository'}
          </button>
        )}
      </div>

      {/* Repositories */}
      <div className="text-sm">
        <span className="at-label">GitHub repositories</span>
        {repoText == null ? (
          <div className="flex flex-wrap items-center gap-2">
            {data.githubRepos.length ? data.githubRepos.map((r) => (
              <a key={r} href={`https://github.com/${r}`} target="_blank" rel="noreferrer" className="at-ticket"><Github className="w-3 h-3" aria-hidden /> {r}</a>
            )) : <span className="at-muted">None linked.</span>}
            {isAdmin && <button type="button" className="at-link text-xs" onClick={() => setRepoText([...data.githubRepos, ...(data.githubRepos.length ? [] : data.suggestedRepos)].join('\n'))}>{data.githubRepos.length ? 'Change' : 'Add'}</button>}
          </div>
        ) : (
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await act(() => piaApi.setRepos(id, repoText.split(/[\s,]+/).filter(Boolean)))) setRepoText(null); }}>
            <textarea rows={3} value={repoText} onChange={(e) => setRepoText(e.target.value)} className="at-input w-full font-mono text-xs" placeholder={`${data.github.orgs[0] || 'org'}/repository (one per line, or a github.com link)`} />
            {data.suggestedRepos.length > 0 && <p className="text-xs at-muted">From the tracker: {data.suggestedRepos.join(', ')}</p>}
            {data.github.demo && <p className="text-xs at-muted">Demo repositories: {data.github.demoRepos.join(', ')}</p>}
            <div className="flex gap-2">
              <button type="submit" className="at-btn" disabled={busy}><Save className="w-3.5 h-3.5" aria-hidden /> Save</button>
              <button type="button" className="at-btn-ghost" onClick={() => setRepoText(null)}>Cancel</button>
            </div>
          </form>
        )}
        {!data.github.configured && <p className="mt-1 text-xs at-muted">The GitHub App isn't set up yet{isAdmin ? ': open PIA Matching → GitHub access.' : '.'}</p>}
      </div>

      {/* Recommendation */}
      <div className={`pia-rec pia-rec--${tone.tone}`}>
        <div className="flex items-center gap-2 font-bold">
          {tone.tone === 'warning' ? <AlertTriangle className="w-4 h-4" aria-hidden /> : <ShieldCheck className="w-4 h-4" aria-hidden />}
          Scan recommendation: {tone.label}{rec.parent ? ` (${rec.parent.name})` : ''}
        </div>
        <ul>{rec.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {rec.related?.length > 0 && rec.recommendation !== 'covered' && <p className="mt-1 text-xs at-muted">Linked apps: {rec.related.map((r) => r.name).join(', ')}</p>}
      </div>

      {/* Scan results */}
      {data.scans.map((s) => <ScanResult key={s.id} scan={s} />)}

      {/* Decision */}
      <div className="at-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="at-label m-0">Decision</span>
          {cov ? (
            <span className="font-semibold">{COVERAGE_LABEL[cov.status]}{cov.status === 'covered' && cov.parentName ? `: ${cov.parentName}` : ''}</span>
          ) : <span className="at-muted">Not decided yet</span>}
          {isAdmin && !decision && <button type="button" className="at-btn-ghost ml-auto" onClick={startDecision} disabled={busy}>{cov ? 'Change' : 'Decide'}</button>}
        </div>
        {cov && <p className="mt-1 text-xs at-muted">{cov.reason} · {cov.decidedBy}, {String(cov.decidedAt).slice(0, 10)}</p>}
        {cov?.needsReview && <div className="at-alert at-alert--warn mt-2">{cov.reviewNote} Review the decision.</div>}
        {data.coveredApps.length > 0 && <p className="mt-1 text-xs">This app's PIA also covers: {data.coveredApps.map((a) => a.name).join(', ')}.</p>}

        {decision && (
          <form className="mt-3 space-y-3" onSubmit={saveDecision}>
            <div className="flex flex-wrap gap-3">
              {Object.entries(COVERAGE_LABEL).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="radio" name="pia-coverage" checked={decision.status === k} onChange={() => setDecision({ ...decision, status: k })} /> {label}</label>
              ))}
            </div>
            {decision.status === 'covered' && (
              <div className="grid grid-cols-2 gap-3">
                <label><span className="at-label">Parent app (has its own approved PIA)</span>
                  <select required className="at-input w-full" value={decision.parentAppId} onChange={(e) => { const p = data.parentOptions.find((o) => o.id === Number(e.target.value)); setDecision({ ...decision, parentAppId: e.target.value, parentPolicyId: p?.policies[0]?.id ?? '' }); }}>
                    <option value="">Choose…</option>
                    {data.parentOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
                <label><span className="at-label">Parent's approved PIA</span>
                  <select required className="at-input w-full" value={decision.parentPolicyId} onChange={(e) => setDecision({ ...decision, parentPolicyId: e.target.value })}>
                    {(parent?.policies || []).map((p) => <option key={p.id} value={p.id}>v{p.version || '?'} approved {p.approvedAt ? new Date(p.approvedAt).toISOString().slice(0, 10) : '?'}</option>)}
                  </select>
                </label>
              </div>
            )}
            <label className="block"><span className="at-label">Reason (kept in the audit trail)</span>
              <textarea required minLength={5} maxLength={1000} rows={3} className="at-input w-full" value={decision.reason} onChange={(e) => setDecision({ ...decision, reason: e.target.value })} />
            </label>
            {rec.sensitive && decision.status !== 'own' && (
              <label className="at-alert at-alert--warn flex items-start gap-2">
                <input type="checkbox" checked={decision.confirmSensitive} onChange={(e) => setDecision({ ...decision, confirmSensitive: e.target.checked })} />
                <span>The latest scan found <b>sensitive personal information</b>. I confirm this app still doesn't need its own PIA.</span>
              </label>
            )}
            <div className="flex gap-2">
              <button type="submit" className="at-btn" disabled={busy}>Save decision</button>
              <button type="button" className="at-btn-ghost" onClick={() => setDecision(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data.coverageHistory.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer at-muted">Decision history ({data.coverageHistory.length})</summary>
            <ul className="mt-1 space-y-1">
              {data.coverageHistory.map((h, i) => (
                <li key={i}><span className="at-muted">{h.changedAt} · {h.changedBy}:</span> {h.oldStatus || '—'} → {h.newStatus || 'cleared'}{h.newParent ? ` (${h.newParent})` : ''}. {h.reason}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function ScanResult({ scan }) {
  const s = scan.summary || {};
  const cats = new Map();
  for (const f of scan.fields) if (f.sensitivity !== 'credential') cats.set(f.category, { sensitivity: f.sensitivity, list: [...(cats.get(f.category)?.list || []), f] });
  const link = (f) => (scan.sha ? `https://github.com/${scan.repo}/blob/${scan.sha}/${f.path.split('/').map(encodeURIComponent).join('/')}#L${f.line}` : null);
  return (
    <div className="at-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`https://github.com/${scan.repo}`} target="_blank" rel="noreferrer" className="font-semibold at-link">{scan.repo}</a>
        <span className="text-xs at-muted">{scan.status === 'error' ? 'scan failed' : `${scan.branch} @ ${String(scan.sha || '').slice(0, 7)}`} · {scan.scannedAt} · {scan.scannedBy}</span>
        {scan.status === 'truncated' && <span className="pia-chip pia-chip--sensitive">limits reached</span>}
      </div>
      {scan.status === 'error' ? <p className="mt-1 at-alert at-alert--error">{scan.error}</p> : (
        <div className="mt-2 space-y-2">
          <p className="text-xs at-muted">
            {s.surface?.type === 'api' ? 'API (no user interface found)' : s.surface?.type?.startsWith('web app') ? 'Web app' : 'No UI or API routes found'}
            {' · '}{s.storage?.ownSchema ? `own database schema (${s.storage.schemaFiles} files)` : 'no schema of its own'}
            {s.storage?.drivers?.length ? ` · ${s.storage.drivers.join(', ')}` : ''}
            {s.storage?.databases?.length ? ` · database ${s.storage.databases.join(', ')}` : ''}
            {` · ${scan.filesRead} of ${scan.filesConsidered} files read · rules ${scan.rulesetVersion}`}
          </p>
          {cats.size ? (
            <div className="flex flex-wrap gap-1.5">
              {[...cats.entries()].map(([c, v]) => (
                <details key={c} className="w-full">
                  <summary className="cursor-pointer"><span className={v.sensitivity === 'sensitive' ? 'pia-chip pia-chip--sensitive' : 'pia-chip'}>{c} · {v.list.length}</span></summary>
                  <ul className="pia-evidence">
                    {v.list.slice(0, 30).map((f, i) => (
                      <li key={i}><code>{f.identifier}</code> {link(f) ? <a className="at-link" href={link(f)} target="_blank" rel="noreferrer">{f.path}:{f.line}</a> : `${f.path}:${f.line}`}{f.confidence === 'low' ? ' (low confidence)' : ''}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : <p className="text-xs">No personal-data fields found.</p>}
          {s.integrations?.length > 0 && <p className="text-xs"><b>Outside services:</b> {s.integrations.map((i) => `${i.label} (${i.kind})`).join(', ')}</p>}
          {Object.keys(s.controls || {}).length > 0 && (
            <p className="text-xs"><b>Privacy controls seen:</b> {Object.entries(s.controls).map(([k, v]) => `${k} (${v.length})`).join(', ')}</p>
          )}
        </div>
      )}
      {scan.sha && <a href={`https://github.com/${scan.repo}/tree/${scan.sha}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs at-link"><ExternalLink className="w-3 h-3" aria-hidden /> Scanned commit</a>}
    </div>
  );
}
