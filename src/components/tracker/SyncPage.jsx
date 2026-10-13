import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Link2, Unlink, Ticket, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from './api.js';

// UberTicket sync status: what was matched, which tickets need a manual link.
export default function SyncPage({ projects, onSynced }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState({});

  const load = () => api.syncStatus().then(setInfo).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onSynced();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // One row per unmatched product (a product can have several tickets).
  const unmatched = useMemo(() => {
    const by = new Map();
    for (const t of info?.last?.unmatched || []) {
      const g = by.get(t.productKey) || { product: t.product, productKey: t.productKey, tickets: [] };
      g.tickets.push(t);
      by.set(t.productKey, g);
    }
    return [...by.values()];
  }, [info]);

  const ub = info?.uberticket;
  const last = info?.last;

  return (
    <div className="space-y-4">
      <section className="at-card flex flex-wrap items-center gap-4 p-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold">UberTicket sync</h2>
          <p className="text-sm at-muted">
            Runs after every UberTicket refresh (Full Assessment and Rules of Engagement tickets). It sets <b>status</b> (open = In Progress, resolved = Done),
            <b> tester</b> (assignee, kept as it was at resolution), <b>actual start / end</b> (submitted / resolved) and Rules of Engagement <b>time spent</b>.
            The <b>seal</b> is captured from the Security Seal page when a ticket is resolved.
          </p>
        </div>
        <button type="button" onClick={() => act(api.syncNow)} disabled={busy} className="at-btn">
          <RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} aria-hidden /> Sync now
        </button>
      </section>

      {error && <div className="at-alert at-alert--error">{error}</div>}

      {info && (
        <section className="at-kpi-grid">
          <article className="issues-kpi-card">
            <div><span>UberTicket data</span><small>{ub?.error ? ub.error : ub?.fetchedAt ? `Loaded ${new Date(ub.fetchedAt).toLocaleString()}` : 'Not loaded yet'}{ub?.demo ? ' (demo data)' : ''}</small></div>
            {ub?.error ? <AlertTriangle className="w-8 h-8" style={{ color: '#b45309' }} aria-label="Error" /> : <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--at-good)' }} aria-label="OK" />}
          </article>
          <article className="issues-kpi-card"><div><span>Tickets checked</span><small>{last?.at ? `Last sync ${new Date(last.at).toLocaleTimeString()}` : 'No sync yet'}</small></div><strong>{last?.tickets ?? 0}</strong></article>
          <article className="issues-kpi-card"><div><span>Apps linked</span><small>Matched to a tracker app</small></div><strong>{last?.matchedApps ?? 0}</strong></article>
          <article className="issues-kpi-card"><div><span>Updated</span><small>Apps changed by the last sync</small></div><strong>{last?.updated ?? 0}</strong></article>
          <article className="issues-kpi-card"><div><span>Unmatched</span><small>Products needing a link</small></div><strong>{unmatched.length}</strong></article>
          <article className="issues-kpi-card"><div><span>Manual links</span><small>Product → app</small></div><strong>{info.links.length}</strong></article>
        </section>
      )}
      {last?.error && <div className="at-alert at-alert--error">Sync failed: {last.error}</div>}
      {ub?.errorKind === 'auth' || (ub?.error && /token/i.test(ub.error)) ? (
        <div className="at-alert at-alert--warn">The UberTicket token is missing or expired. Open <b>DPSA Monitoring → Settings</b> and paste a new token.</div>
      ) : null}

      <section className="cs-table-shell overflow-hidden">
        <div className="p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <h2 className="text-base font-bold">Unmatched tickets ({unmatched.length} products)</h2>
          <p className="text-xs at-muted">Names match automatically when they differ only by case, spaces, punctuation or a leading "Cloudstaff". Link the rest once; the link is remembered.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="cs-data-table">
            <thead>
              <tr>
                <th>UberTicket product</th>
                <th>Tickets</th>
                <th>Why</th>
                <th>Link to tracker app</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((g) => (
                <tr key={g.productKey}>
                  <td className="font-semibold">{g.product}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {g.tickets.slice(0, 6).map((t) => (
                        <a key={t.key + t.source} href={t.url} target="_blank" rel="noreferrer" className="at-ticket" title={`${t.source === 'roe' ? 'Rules of Engagement' : 'Full Assessment'} · ${t.state} · ${t.quarter} ${t.year} · ${t.assignee}`}>
                          <Ticket className="w-3 h-3" aria-hidden /> {t.key} · {t.quarter} {t.year}
                        </a>
                      ))}
                      {g.tickets.length > 6 && <span className="text-xs at-muted">+{g.tickets.length - 6} more</span>}
                    </div>
                  </td>
                  <td className="text-xs at-muted">{g.tickets[0].reason}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <input list="at-projects" value={choice[g.productKey] ?? ''} onChange={(e) => setChoice({ ...choice, [g.productKey]: e.target.value })} placeholder="Tracker app name…" className="at-input w-56" />
                      <button type="button" disabled={busy || !choice[g.productKey]} onClick={() => act(() => api.link(g.product, choice[g.productKey]))} className="at-btn">
                        <Link2 className="w-3.5 h-3.5" aria-hidden /> Link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!unmatched.length && (
                <tr><td colSpan={4} className="p-8 text-center at-muted">{last ? 'Every ticket is matched to an app.' : 'No sync has run yet. It runs after the UberTicket data loads.'}</td></tr>
              )}
            </tbody>
          </table>
          <datalist id="at-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
      </section>

      {info?.links.length > 0 && (
        <section className="cs-table-shell overflow-hidden">
          <div className="p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
            <h2 className="text-base font-bold">Manual links</h2>
          </div>
          <table className="cs-data-table">
            <thead><tr><th>UberTicket product</th><th>Tracker app</th><th>Linked by</th><th /></tr></thead>
            <tbody>
              {info.links.map((l) => (
                <tr key={l.productKey}>
                  <td className="font-semibold">{l.product}</td>
                  <td>{l.project}</td>
                  <td className="text-xs at-muted">{l.linkedBy} · {l.linkedAt.slice(0, 10)}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => act(() => api.unlink(l.productKey))} className="at-btn-ghost">
                      <Unlink className="w-3.5 h-3.5" aria-hidden /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
