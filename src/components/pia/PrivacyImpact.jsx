import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Plus, ExternalLink } from 'lucide-react';
import { FilterSearch } from '../FilterChips';
import { STATUS } from '../../../pia/shared/rules.js';
import { fmtDate, cx } from '../tracker/ui.jsx';
import { piaApi } from './api.js';
import { StatusBadge, InProgressBadge, DaysLeft } from './badges.jsx';
import AppDetail from './AppDetail.jsx';
import MatchingPage from './MatchingPage.jsx';
import '../tracker/tracker.css';
import './pia.css';

const counted = (a) => !a.hidden && !a.decommissioned;
const KPIS = ['overdue', 'due-soon', 'never', 'initial', 'current'];
const KPI_NOTE = {
  overdue: 'Past the yearly reassessment date',
  'due-soon': null,
  never: 'No PIA policy in UberTicket',
  initial: 'First PIA submitted, not approved yet',
  current: 'Reassessed within the year',
};

/**
 * Privacy Impact Assessments: yearly reassessment status per application.
 * section: 'overview' | 'matching'. Changes are admin-only on the server; isAdmin only hides the buttons.
 */
export default function PrivacyImpact({ section, isAdmin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => piaApi.apps().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    // UberTicket refreshes and teammates' changes show up without a reload.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const apps = data?.apps ?? [];
  const counts = useMemo(() => Object.fromEntries(KPIS.map((k) => [k, apps.filter((a) => counted(a) && a.status === k).length])), [apps]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => showAll || counted(a))
      .filter((a) => !filter || (counted(a) && a.status === filter))
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((x, y) => STATUS[x.status].order - STATUS[y.status].order || (x.daysLeft ?? 0) - (y.daysLeft ?? 0) || x.name.localeCompare(y.name));
  }, [apps, filter, query, showAll]);

  async function addApp() {
    const name = window.prompt('App name (as it should appear on the PIA list)');
    if (!name) return;
    try {
      await piaApi.addApp(name);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const ub = data?.uberticket;
  return (
    <div className="at-root space-y-4">
      <div className="at-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <h1 className="text-lg font-bold">Privacy Impact Assessments</h1>
        <span className="text-xs at-muted">
          Reassessment due 12 months after the last approved PIA or recorded reassessment · coming due within {data?.dueSoonDays ?? '…'} days
        </span>
        <span className="ml-auto text-xs at-muted">
          {ub?.fetchedAt ? `UberTicket ${new Date(ub.fetchedAt).toLocaleString()}` : 'UberTicket not loaded yet'}{ub?.demo ? ' (demo data)' : ''}
        </span>
        <button type="button" onClick={load} className="at-btn-ghost" title="Reload">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      {error && (
        <div className="at-alert at-alert--error justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="font-bold">Dismiss</button>
        </div>
      )}
      {ub && !ub.enabled && <div className="at-alert at-alert--warn">The PIA fetch is turned off (PIA_TEMPLATE=0).</div>}
      {ub?.error && <div className="at-alert at-alert--warn">PIA policies couldn't be loaded from UberTicket: {ub.error}</div>}
      {ub?.errorKind === 'auth' && <div className="at-alert at-alert--warn">The UberTicket token is missing or expired. An admin can paste a new one in <b>DPSA Monitoring → Settings</b>.</div>}

      {section === 'matching' && <MatchingPage isAdmin={isAdmin} onChanged={load} />}

      {section === 'overview' && (
        <>
          <section className="at-kpi-grid">
            {KPIS.map((k) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? '' : k)} className="issues-kpi-card pia-kpi">
                <div><span>{STATUS[k].label}</span><small>{k === 'due-soon' ? `Due within ${data?.dueSoonDays ?? '…'} days` : KPI_NOTE[k]}</small></div>
                <strong>{data ? counts[k] : '…'}</strong>
              </button>
            ))}
            <article className="issues-kpi-card">
              <div><span>Applications</span><small>Tracker apps + PIA products (hidden and decommissioned not counted)</small></div>
              <strong>{data ? apps.filter(counted).length : '…'}</strong>
            </article>
          </section>

          <section className="cs-table-shell overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
              <h2 className="text-base font-bold">{filter ? STATUS[filter].label : 'All applications'} ({rows.length})</h2>
              {filter && <button type="button" className="at-btn-ghost" onClick={() => setFilter('')}>Clear filter</button>}
              <span className="ml-auto"><FilterSearch value={query} onChange={setQuery} placeholder="Search apps…" /></span>
              <label className="flex items-center gap-1.5 text-xs at-muted">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show hidden and decommissioned
              </label>
              {isAdmin && (
                <button type="button" onClick={addApp} className="at-btn"><Plus className="w-3.5 h-3.5" aria-hidden /> Add app</button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="cs-data-table">
                <thead>
                  <tr><th>Application</th><th>Status</th><th>Last assessed</th><th>Next due</th><th /><th>Latest PIA</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={cx('at-row', !counted(a) && 'at-row--dim')} onClick={() => setOpenId(a.id)}>
                      <td className="font-semibold">{a.name}</td>
                      <td><div className="flex flex-wrap items-center gap-1"><StatusBadge app={a} /><InProgressBadge app={a} /></div></td>
                      <td>{a.lastAssessed ? <>{fmtDate(a.lastAssessed)} <span className="text-xs at-soft">{a.lastSource === 'reassessment' ? 'reassessment' : 'PIA approved'}</span></> : <span className="at-soft">—</span>}</td>
                      <td>{a.dueOn ? fmtDate(a.dueOn) : <span className="at-soft">—</span>}</td>
                      <td className="text-xs"><DaysLeft app={a} /></td>
                      <td>
                        {a.latestPolicy ? (
                          <a href={a.latestPolicy.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="at-ticket">
                            <ExternalLink className="w-3 h-3" aria-hidden /> v{a.latestPolicy.version || '?'} · {a.latestPolicy.state}
                          </a>
                        ) : <span className="at-soft">—</span>}
                      </td>
                      <td className="text-xs at-muted">{[a.inTracker && 'Tracker', a.fromPia && 'PIA', a.manual && 'Added'].filter(Boolean).join(' · ')}{a.decommissioned ? ' · decommissioned' : ''}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={7} className="p-8 text-center at-muted">{data ? 'No applications match.' : 'Loading…'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {openId != null && <AppDetail id={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
