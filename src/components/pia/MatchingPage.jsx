import { useEffect, useState } from 'react';
import { RefreshCw, Link2, Unlink } from 'lucide-react';
import { piaApi } from './api.js';

// PIA matching (admins): PIA products that didn't match a tracker app, manual links, and the coming-due window.
export default function MatchingPage({ isAdmin, onChanged }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState({});
  const [days, setDays] = useState('');

  const load = () => piaApi.syncStatus().then((d) => { setInfo(d); setDays(String(d.dueSoonDays)); }).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const last = info?.last;
  const trackerApps = (info?.apps || []).filter((a) => a.inTracker);
  const appIdByName = new Map(trackerApps.map((a) => [a.name, a.id]));

  return (
    <div className="space-y-4">
      <section className="at-card flex flex-wrap items-center gap-4 p-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold">PIA matching</h2>
          <p className="text-sm at-muted">
            After every UberTicket refresh, the PIA list is rebuilt from the Assessment Tracker's apps and every <b>[PIA01] Privacy Impact Assessment</b> policy
            (its <b>Project or Product</b> field). Names match when they differ only by case, spaces, punctuation or a leading "Cloudstaff". A PIA product with no
            matching tracker app is added as its own app; if it's a tracker app under another name, link it below. Links are remembered.
          </p>
          {last && <p className="mt-1 text-xs at-muted">Last sync {new Date(last.at).toLocaleString()}: {last.policies} policies, {last.apps} apps{last.error ? ` · failed: ${last.error}` : ''}</p>}
        </div>
        {isAdmin && (
          <button type="button" onClick={() => act(piaApi.syncNow)} disabled={busy} className="at-btn">
            <RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} aria-hidden /> Sync now
          </button>
        )}
      </section>

      {error && <div className="at-alert at-alert--error">{error}</div>}

      <section className="cs-table-shell overflow-hidden">
        <div className="p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <h2 className="text-base font-bold">PIA products not in the tracker ({info?.piaOnly.length ?? 0})</h2>
          <p className="text-xs at-muted">Each is listed as its own app. Link it to a tracker app if it's the same application under another name.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="cs-data-table">
            <thead><tr><th>PIA product</th><th>Link to tracker app</th></tr></thead>
            <tbody>
              {(info?.piaOnly || []).flatMap((a) => a.products.map((product) => (
                <tr key={`${a.id}:${product}`}>
                  <td className="font-semibold">{product}</td>
                  <td>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <input list="pia-tracker-apps" value={choice[product] ?? ''} onChange={(e) => setChoice({ ...choice, [product]: e.target.value })} placeholder="Tracker app name…" className="at-input w-56" aria-label={`Tracker app for ${product}`} />
                        <button type="button" disabled={busy || !appIdByName.has(choice[product])} onClick={() => act(() => piaApi.link(product, appIdByName.get(choice[product])))} className="at-btn">
                          <Link2 className="w-3.5 h-3.5" aria-hidden /> Link
                        </button>
                      </div>
                    ) : <span className="at-soft">—</span>}
                  </td>
                </tr>
              )))}
              {!info?.piaOnly.length && <tr><td colSpan={2} className="p-8 text-center at-muted">{info ? 'Every PIA product matches a tracker app.' : 'Loading…'}</td></tr>}
            </tbody>
          </table>
          <datalist id="pia-tracker-apps">{trackerApps.map((a) => <option key={a.id} value={a.name} />)}</datalist>
        </div>
      </section>

      {info?.links.length > 0 && (
        <section className="cs-table-shell overflow-hidden">
          <div className="p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
            <h2 className="text-base font-bold">Manual links</h2>
          </div>
          <table className="cs-data-table">
            <thead><tr><th>PIA product</th><th>App</th><th>Linked by</th><th /></tr></thead>
            <tbody>
              {info.links.map((l) => (
                <tr key={l.productKey}>
                  <td className="font-semibold">{l.product}</td>
                  <td>{l.appName}</td>
                  <td className="text-xs at-muted">{l.linkedBy} · {l.linkedAt.slice(0, 10)}</td>
                  <td className="text-right">
                    {isAdmin && (
                      <button type="button" disabled={busy} onClick={() => act(() => piaApi.unlink(l.productKey))} className="at-btn-ghost">
                        <Unlink className="w-3.5 h-3.5" aria-hidden /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isAdmin && info && (
        <section className="at-card flex flex-wrap items-end gap-3 p-4">
          <label>
            <span className="at-label">"Coming due" window (days before the due date)</span>
            <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="at-input w-28" />
          </label>
          <button type="button" disabled={busy || Number(days) === info.dueSoonDays} onClick={() => act(() => piaApi.setDueSoonDays(Number(days)))} className="at-btn">Save</button>
        </section>
      )}
    </div>
  );
}
