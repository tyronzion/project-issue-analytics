import { useMemo, useState } from 'react';
import { monitoringSummary, timeByPriority, SEALS } from '../../../tracker/shared/logic.js';
import { StatusPill, SealBadge, PriorityTag, TicketLink, SEAL_STYLE, SEVERITY_ACCENT, Select, fmtDate, fmtMinutes, pct } from './ui.jsx';

const SEGMENTS = [
  { key: 'done', label: 'Done', color: 'var(--at-good)' },
  { key: 'inProgress', label: 'In Progress', color: 'var(--at-warn)' },
  { key: 'notStarted', label: 'Not Started', color: 'var(--at-idle)' },
];

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

function StackedBar({ parts, total }) {
  return (
    <div className="severity-bar">
      {SEGMENTS.map((s) => (parts[s.key] ? <div key={s.key} title={`${s.label}: ${parts[s.key]} of ${total}`} style={{ width: `${(parts[s.key] / total) * 100}%`, background: s.color }} /> : null))}
    </div>
  );
}

// The "<year> Qx Monitoring" sheet: live, per period.
export default function Monitoring({ rows, period, onOpen }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const scope = useMemo(() => rows.filter((r) => r.period === period), [rows, period]);
  const s = useMemo(() => monitoringSummary(scope), [scope]);
  const time = useMemo(() => timeByPriority(scope), [scope]);
  const list = scope.filter((r) => (!statusFilter || r.status === statusFilter) && (!sevFilter || r.priority === sevFilter));
  const linked = scope.filter((r) => r.ticketKey).length;

  if (!scope.length) return <div className="at-card p-10 text-center at-muted">No applications in {period} yet.</div>;

  return (
    <div className="space-y-4">
      <section className="at-kpi-grid">
        <Kpi label="Applications" hint={`${linked} linked to UberTicket`}>{s.totalApps}</Kpi>
        <Kpi label="Done" hint={`${pct(s.donePct)} of applications`}>{s.done}</Kpi>
        <Kpi label="In Progress" hint="Ticket open">{s.inProgress}</Kpi>
        <Kpi label="Not Started" hint="No ticket yet">{s.notStarted}</Kpi>
        <Kpi label="Current Points" hint={`${pct(s.pointsPct)} of the goal`}>
          {s.currentPoints}<em> / {s.goalPoints}</em>
        </Kpi>
        <Kpi label="Goal Points / Month" hint={`Time spent ${fmtMinutes(s.timeSpent) || '0h'}`}>{s.goalPointsPerMonth.toFixed(1)}</Kpi>
      </section>

      <section className="severity-scorecard" aria-label="Progress by severity">
        <header className="severity-scorecard-header">
          <div>
            <h3>Severity Scorecard</h3>
            <p>Points per finished app: Critical 4 · High 3 · Medium 2 · Low 1. Status comes from UberTicket when a ticket is linked.</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] at-muted">
              {SEGMENTS.map((x) => (
                <span key={x.key} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.color }} />
                  {x.label}
                </span>
              ))}
            </div>
          </div>
          <div className="severity-risk-score" title="Current points ÷ goal points">
            <span>Points Progress</span>
            <strong>{Math.round(s.pointsPct * 100)}<small>%</small></strong>
            <small>{s.currentPoints} of {s.goalPoints} goal points</small>
          </div>
        </header>
        <div className="severity-grid">
          {s.bySeverity.map((x) => (
            <article key={x.severity} className="severity-card" style={{ borderTopColor: SEVERITY_ACCENT[x.severity] }}>
              <div className="severity-card-top">
                <span style={{ color: SEVERITY_ACCENT[x.severity] }}>{x.severity}</span>
                <em>{x.pointsPerSize} pts / app</em>
              </div>
              <strong className="tabular-nums">{x.totalApps}</strong>
              <p className="severity-definition">Goal {x.goalPoints} pts · Man hours {x.manHours}</p>
              <StackedBar parts={x} total={x.totalApps} />
              <dl className="tabular-nums">
                <div><dt>Done</dt><dd>{x.done}</dd></div>
                <div><dt>In Progress</dt><dd>{x.inProgress}</dd></div>
                <div><dt>Not Started</dt><dd>{x.notStarted}</dd></div>
                <div><dt>Completion</dt><dd>{pct(x.done / x.totalApps)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="severity-scorecard" aria-label="Real-time security seal">
        <header className="severity-scorecard-header">
          <div>
            <h3>Real Time Security Seal</h3>
            <p>Seal of each application in {period}, captured from the Security Seal when its UberTicket was resolved.</p>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {SEALS.map((seal) => {
            const st = SEAL_STYLE[seal];
            return (
              <div key={seal} className="at-seal-tile">
                <div style={{ background: st.bg, color: st.text, borderBottom: `1px solid ${st.border}` }}>{seal}</div>
                <strong className="tabular-nums">{s.seals[seal]}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cs-table-shell overflow-hidden" aria-label="Time spent by priority">
        <div className="p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <h2 className="text-base font-bold">Time Spent by Priority</h2>
          <p className="text-xs at-muted">
            Actual hours per application in {period}, from the UberTicket time spent or the editor. Apps with no time recorded are left out of the range.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="cs-data-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th className="text-right">Apps with time</th>
                <th className="text-right">Hours range</th>
                <th className="text-right">Average</th>
                <th className="text-right">Total time</th>
                <th className="text-right">Man hours (estimate)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {time.byPriority.map((x) => (
                <tr key={x.priority}>
                  <td><PriorityTag value={x.priority} /></td>
                  <td className="text-right">{x.recorded} <span className="at-soft">/ {x.apps}</span></td>
                  <td className="text-right whitespace-nowrap">{x.recorded ? (x.min === x.max ? fmtMinutes(x.min) : `${fmtMinutes(x.min)} – ${fmtMinutes(x.max)}`) : '—'}</td>
                  <td className="text-right whitespace-nowrap">{fmtMinutes(x.avg) || '—'}</td>
                  <td className="text-right whitespace-nowrap font-semibold">{fmtMinutes(x.total) || '—'}</td>
                  <td className="text-right whitespace-nowrap at-muted">{x.manHours ? `${x.manHours} h` : '—'}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Overall</td>
                <td className="text-right">{time.overall.recorded} <span className="at-soft">/ {time.overall.apps}</span></td>
                <td className="text-right whitespace-nowrap">{time.overall.recorded ? `${fmtMinutes(time.overall.min)} – ${fmtMinutes(time.overall.max)}` : '—'}</td>
                <td className="text-right whitespace-nowrap">{fmtMinutes(time.overall.avg) || '—'}</td>
                <td className="text-right whitespace-nowrap">{fmtMinutes(time.overall.total) || '—'}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="cs-table-shell overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <h2 className="mr-auto text-base font-bold">
            Applications <span className="text-xs font-medium at-muted">({list.length} listed)</span>
          </h2>
          <Select value={sevFilter} onChange={setSevFilter} placeholder="All severities" options={s.bySeverity.map((x) => x.severity)} />
          <Select value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={['Done', 'In Progress', 'Not Started']} />
        </div>
        <div className="overflow-x-auto">
          <table className="cs-data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Project</th>
                <th>Severity</th>
                <th>Status</th>
                <th>UberTicket</th>
                <th className="text-right">Score</th>
                <th>Date</th>
                <th className="text-right">Time spent</th>
                <th>Seal</th>
                <th>Tester</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id} onClick={() => onOpen(r)} className="at-row">
                  <td className="tabular-nums at-soft">{i + 1}</td>
                  <td className="font-semibold">{r.project}</td>
                  <td><PriorityTag value={r.priority} /></td>
                  <td><StatusPill value={r.status} /></td>
                  <td><TicketLink row={r} /></td>
                  <td className="tabular-nums text-right font-bold">{r.score}</td>
                  <td className="whitespace-nowrap">{r.status === 'Done' ? fmtDate(r.actualEnd) : r.status}</td>
                  <td className="whitespace-nowrap tabular-nums text-right">{fmtMinutes(r.timeSpent) || <span className="at-soft">—</span>}</td>
                  <td><SealBadge value={r.seal} auto={r.sealSource === 'auto'} /></td>
                  <td>{r.securityTester}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
