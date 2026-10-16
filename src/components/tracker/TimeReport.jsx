import { Fragment, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PRIORITIES, enrich, isDecommissioned, timeStats, timeByPriority, timeByGroup } from '../../../tracker/shared/logic.js';
import { api } from './api.js';
import { useFilters } from './Assessments.jsx';
import { PriorityTag, StatusPill, TicketLink, fmtMinutes } from './ui.jsx';

const range = (x) => (!x.recorded ? '—' : x.min === x.max ? fmtMinutes(x.min) : `${fmtMinutes(x.min)} – ${fmtMinutes(x.max)}`);

function Section({ title, hint, actions, children }) {
  return (
    <section className="cs-table-shell overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
        <div className="mr-auto">
          <h2 className="text-base font-bold">{title}</h2>
          {hint && <p className="text-xs at-muted">{hint}</p>}
        </div>
        {actions}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

// Apps with time / range / average / total for a list of groups (priority, tester, …).
export function TimeStatsTable({ groups, overall, label, renderKey, manHours }) {
  return (
    <table className="cs-data-table">
      <thead>
        <tr>
          <th>{label}</th>
          <th className="text-right">Apps with time</th>
          <th className="text-right">Hours range</th>
          <th className="text-right">Average</th>
          <th className="text-right">Total time</th>
          {manHours && <th className="text-right">Man hours (estimate)</th>}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {groups.map((x) => (
          <tr key={x.key}>
            <td>{renderKey(x)}</td>
            <td className="text-right">{x.recorded} <span className="at-soft">/ {x.apps}</span></td>
            <td className="text-right whitespace-nowrap">{range(x)}</td>
            <td className="text-right whitespace-nowrap">{fmtMinutes(x.avg) || '—'}</td>
            <td className="text-right whitespace-nowrap font-semibold">{fmtMinutes(x.total) || '—'}</td>
            {manHours && <td className="text-right whitespace-nowrap at-muted">{x.manHours ? `${x.manHours} h` : '—'}</td>}
          </tr>
        ))}
        {overall && (
          <tr className="font-bold">
            <td>Overall</td>
            <td className="text-right">{overall.recorded} <span className="at-soft">/ {overall.apps}</span></td>
            <td className="text-right whitespace-nowrap">{range(overall)}</td>
            <td className="text-right whitespace-nowrap">{fmtMinutes(overall.avg) || '—'}</td>
            <td className="text-right whitespace-nowrap">{fmtMinutes(overall.total) || '—'}</td>
            {manHours && <td />}
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function TimeByPriorityTable({ rows }) {
  const t = useMemo(() => timeByPriority(rows), [rows]);
  return (
    <TimeStatsTable
      groups={t.byPriority.map((x) => ({ ...x, key: x.priority }))}
      overall={t.overall}
      label="Priority"
      renderKey={(x) => <PriorityTag value={x.priority} />}
      manHours
    />
  );
}

function Kpi({ label, hint, children }) {
  return (
    <article className="issues-kpi-card">
      <div>
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <strong className="tabular-nums">{children}</strong>
    </article>
  );
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(name, header, lines) {
  const text = [header, ...lines].map((l) => l.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Every period of every cycle, grouped by track (Bi-Annual, Quarterly), oldest first, with its time stats.
function usePeriodComparison(cycles) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all(cycles.map((c) => api.assessments(c.id).then((rows) => ({ c, rows: rows.map(enrich).filter((r) => !isDecommissioned(r)) }))))
      .then((all) => {
        if (!live) return;
        const list = [];
        for (const { c, rows } of [...all].sort((a, b) => a.c.track.localeCompare(b.c.track) || a.c.year - b.c.year)) {
          for (const p of c.periods) {
            const inPeriod = rows.filter((r) => r.period === p);
            if (!inPeriod.length) continue;
            const byPriority = Object.fromEntries(timeByPriority(inPeriod).byPriority.map((x) => [x.priority, x]));
            list.push({ key: `${c.id}:${p}`, label: `${c.year} ${p}`, track: c.label.replace(/^\d+ /, ''), cycle: c.label, ...timeStats(inPeriod), byPriority });
          }
        }
        setData(list);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [cycles]);
  return { data, error };
}

export function PeriodComparison({ cycles }) {
  const { data, error } = usePeriodComparison(cycles);
  if (error) return <div className="at-alert at-alert--error">{error}</div>;
  if (!data) return <div className="at-card p-6 text-center at-muted">Loading periods…</div>;
  const maxTotal = Math.max(1, ...data.map((x) => x.total));
  return (
    <Section title="Comparison Between Periods" hint="Every period in every cycle, oldest first, per track. Change in average compares with the previous period of the same track. Priority columns show the average per app, with the number of apps that have time recorded.">
      <table className="cs-data-table">
        <thead>
          <tr>
            <th>Period</th>
            <th className="text-right">Apps with time</th>
            <th>Total time</th>
            <th className="text-right">Average</th>
            <th className="text-right">Change in average</th>
            {PRIORITIES.map((p) => <th key={p} className="text-right">{p} avg</th>)}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {data.map((x, i) => {
            const prev = data.slice(0, i).reverse().find((y) => y.track === x.track && y.avg != null);
            const delta = x.avg != null && prev ? x.avg - prev.avg : null;
            const header = i === 0 || data[i - 1].track !== x.track;
            return (
              <Fragment key={x.key}>
                {header && (
                  <tr>
                    <td colSpan={5 + PRIORITIES.length} className="text-xs font-bold uppercase at-muted">{x.track}</td>
                  </tr>
                )}
                <tr>
                  <td className="whitespace-nowrap font-semibold" title={x.cycle}>{x.label}</td>
                  <td className="text-right">{x.recorded} <span className="at-soft">/ {x.apps}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="at-progress" style={{ width: 120 }}>
                        <div style={{ width: `${(x.total / maxTotal) * 100}%`, background: 'var(--at-good)' }} />
                      </div>
                      <span className="whitespace-nowrap font-semibold">{fmtMinutes(x.total) || '—'}</span>
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">{fmtMinutes(x.avg) || '—'}</td>
                  <td className="text-right whitespace-nowrap at-muted">
                    {delta == null ? '—' : Math.round(delta) === 0 ? 'no change' : `${delta > 0 ? '+' : '−'}${fmtMinutes(Math.abs(delta))} vs ${prev.label}`}
                  </td>
                  {PRIORITIES.map((p) => {
                    const s = x.byPriority[p];
                    return (
                      <td key={p} className="text-right whitespace-nowrap" title={s?.recorded ? `Range ${range(s)} · total ${fmtMinutes(s.total)}` : undefined}>
                        {s?.recorded ? <>{fmtMinutes(s.avg)} <span className="at-soft">({s.recorded})</span></> : <span className="at-soft">—</span>}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

// Time spent report: summary, per application size (priority), per security tester, per app.
// The comparison between periods is its own page (PeriodComparison). Read-only; time comes from UberTicket or the editor.
export default function TimeReport({ rows, period, scopeLabel, onOpen }) {
  const scope = useMemo(() => rows.filter((r) => !period || r.period === period), [rows, period]);
  const overall = useMemo(() => timeStats(scope), [scope]);
  const testers = useMemo(() => timeByGroup(scope, (r) => r.securityTester), [scope]);
  const { filtered, bar } = useFilters(scope);
  const apps = useMemo(() => [...filtered].sort((a, b) => (Number(b.timeSpent) || 0) - (Number(a.timeSpent) || 0) || a.project.localeCompare(b.project)), [filtered]);

  const exportApps = () => downloadCsv(
    `time-spent-${scopeLabel.replace(/\W+/g, '-').toLowerCase()}.csv`,
    ['Project', 'Period', 'Priority', 'Security tester', 'Status', 'UberTicket', 'Time spent (minutes)', 'Time spent (hours)'],
    apps.map((r) => [r.project, r.period, r.priority, r.securityTester, r.status, r.ticketKey, r.timeSpent ?? '', r.timeSpent ? (r.timeSpent / 60).toFixed(2) : '']),
  );

  return (
    <div className="space-y-4">
      <section className="at-kpi-grid">
        <Kpi label="Total Time" hint={scopeLabel}>{fmtMinutes(overall.total) || '0h'}</Kpi>
        <Kpi label="Apps With Time" hint={`of ${overall.apps} applications`}>{overall.recorded}</Kpi>
        <Kpi label="Average / App" hint="Apps with time recorded">{fmtMinutes(overall.avg) || '—'}</Kpi>
        <Kpi label="Shortest" hint="Least time on one app">{fmtMinutes(overall.min) || '—'}</Kpi>
        <Kpi label="Longest" hint="Most time on one app">{fmtMinutes(overall.max) || '—'}</Kpi>
        <Kpi label="Testers" hint="With time recorded">{testers.filter((x) => x.key && x.recorded).length}</Kpi>
      </section>

      <Section title="By Application Size" hint={`Size = priority. ${scopeLabel}. Apps with no time recorded are left out of the range and average.`}>
        <TimeByPriorityTable rows={scope} />
      </Section>

      <Section title="By Security Tester" hint={`${scopeLabel}. Time is counted for the app's security tester.`}>
        <table className="cs-data-table">
          <thead>
            <tr>
              <th>Security tester</th>
              <th className="text-right">Apps with time</th>
              <th className="text-right">Hours range</th>
              <th className="text-right">Average</th>
              <th className="text-right">Total time</th>
              <th>Apps by size</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {testers.map((x) => {
              const mine = scope.filter((r) => (r.securityTester || '') === x.key);
              return (
                <tr key={x.key || 'none'}>
                  <td className="whitespace-nowrap font-semibold">{x.key || <span className="at-soft">Unassigned</span>}</td>
                  <td className="text-right">{x.recorded} <span className="at-soft">/ {x.apps}</span></td>
                  <td className="text-right whitespace-nowrap">{range(x)}</td>
                  <td className="text-right whitespace-nowrap">{fmtMinutes(x.avg) || '—'}</td>
                  <td className="text-right whitespace-nowrap font-semibold">{fmtMinutes(x.total) || '—'}</td>
                  <td className="whitespace-nowrap text-xs at-muted">
                    {PRIORITIES.map((p) => [p, mine.filter((r) => r.priority === p).length]).filter(([, n]) => n).map(([p, n]) => `${p} ${n}`).join(' · ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section
        title="Per Application"
        hint={`${scopeLabel}. Most time first. Click a row to edit its time spent.`}
        actions={(
          <>
            {bar}
            <button type="button" onClick={exportApps} className="at-btn-ghost" title="Download this list as CSV">
              <Download className="w-3.5 h-3.5" aria-hidden /> CSV
            </button>
          </>
        )}
      >
        <table className="cs-data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Period</th>
              <th>Priority</th>
              <th>Security tester</th>
              <th>Status</th>
              <th className="text-right">Time spent</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className="at-row">
                <td>
                  <div className="flex items-center gap-1.5 font-semibold">
                    {r.project}
                    <TicketLink row={r} />
                  </div>
                </td>
                <td className="whitespace-nowrap at-muted">{r.period}</td>
                <td><PriorityTag value={r.priority} /></td>
                <td className="whitespace-nowrap">{r.securityTester}</td>
                <td><StatusPill value={r.status} /></td>
                <td className="whitespace-nowrap tabular-nums text-right font-semibold">{fmtMinutes(r.timeSpent) || <span className="at-soft font-normal">—</span>}</td>
              </tr>
            ))}
            {!apps.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center at-muted">No applications match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
