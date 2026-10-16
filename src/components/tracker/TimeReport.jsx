import { useEffect, useMemo, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2, ArrowDown, ArrowUp, BarChart3 } from 'lucide-react';
import { FilterSelect } from '../FilterChips';
import { PRIORITIES, MAN_HOURS, enrich, isDecommissioned, timeStats, timeByPriority, timeByGroup, estimateMinutes, vsEstimate } from '../../../tracker/shared/logic.js';
import { api } from './api.js';
import { useFilters } from './Assessments.jsx';
import { PriorityTag, StatusPill, TicketLink, SEVERITY_ACCENT, fmtMinutes } from './ui.jsx';

const range = (x) => (!x.recorded ? '—' : x.min === x.max ? fmtMinutes(x.min) : `${fmtMinutes(x.min)} – ${fmtMinutes(x.max)}`);
// Headline numbers: whole hours from 10h up ("596h"), exact below ("4h 30m").
const short = (m) => (m == null || !(m > 0) ? '—' : m >= 600 ? `${Math.round(m / 60)}h` : fmtMinutes(m));

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

// "Above / Within / Below estimate" with an icon, never colour alone.
function EstimateBadge({ minutes, priority }) {
  const v = vsEstimate(minutes, priority);
  if (!v) return null;
  const est = MAN_HOURS[priority];
  if (v === 'over') return <span className="at-badge at-badge--over" title={`Estimate ${est} h`}><AlertTriangle className="w-3 h-3" aria-hidden />Above estimate</span>;
  if (v === 'within') return <span className="at-badge at-badge--within" title={`Estimate ${est} h`}><CheckCircle2 className="w-3 h-3" aria-hidden />Within estimate</span>;
  return <span className="at-badge at-badge--under" title={`Estimate ${est} h`}><ArrowDown className="w-3 h-3" aria-hidden />Below estimate</span>;
}

function Kpi({ label, hint, children }) {
  return (
    <article className="issues-kpi-card">
      <div>
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <strong className="tabular-nums whitespace-nowrap">{children}</strong>
    </article>
  );
}

// One card per size: typical time, the shortest–longest strip with the estimate band, and a verdict.
function SizeCard({ x, scaleMax }) {
  const est = estimateMinutes(x.priority);
  const pos = (m) => `${Math.min(100, (m / scaleMax) * 100)}%`;
  const accent = SEVERITY_ACCENT[x.priority];
  return (
    <article className="at-size-card" style={{ '--size-accent': accent }}>
      <div className="flex items-center justify-between gap-2">
        <PriorityTag value={x.priority} />
        {x.recorded > 0 && <EstimateBadge minutes={x.avg} priority={x.priority} />}
      </div>
      {x.recorded ? (
        <>
          <span className="at-big tabular-nums">{short(x.avg)}</span>
          <p className="text-xs at-muted">typical per app · {x.recorded} of {x.apps} apps timed</p>
          <div
            className="at-strip"
            role="img"
            aria-label={`Shortest ${fmtMinutes(x.min)}, average ${fmtMinutes(x.avg)}, longest ${fmtMinutes(x.max)}${est ? `, estimate ${MAN_HOURS[x.priority]} h` : ''}`}
            title={`Shortest ${fmtMinutes(x.min)} · average ${fmtMinutes(x.avg)} · longest ${fmtMinutes(x.max)}${est ? ` · estimate ${MAN_HOURS[x.priority]} h` : ''}`}
          >
            {est && <div className="at-strip-est" style={{ left: pos(est[0]), width: `calc(${pos(est[1])} - ${pos(est[0])})` }} />}
            <div className="at-strip-range" style={{ left: pos(x.min), width: `calc(${pos(x.max)} - ${pos(x.min)})` }} />
            <div className="at-strip-avg" style={{ left: pos(x.avg) }} />
          </div>
          <div className="at-strip-axis tabular-nums"><span>0h</span><span>{short(scaleMax)}</span></div>
          <p className="mt-2 text-xs at-muted">
            {fmtMinutes(x.min)} to {fmtMinutes(x.max)} · estimate {MAN_HOURS[x.priority] || '—'} h · total {short(x.total)}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm at-muted">No time recorded yet for {x.apps} app{x.apps === 1 ? '' : 's'}.</p>
      )}
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

function Change({ now, before }) {
  if (now == null || before == null) return null;
  const d = now - before;
  if (Math.abs(d) < 1) return <span className="text-xs at-soft">same</span>;
  const Icon = d > 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs at-muted" title={`${d > 0 ? 'More' : 'Less'} than the period before`}>
      <Icon className="w-3 h-3" aria-hidden />{fmtMinutes(Math.abs(d))}
    </span>
  );
}

const METRICS = [
  { value: 'avg', label: 'Typical per app' },
  { value: 'total', label: 'Total hours' },
];

// One track (Bi-Annual or Quarterly): headline, a column per period, then the same by size.
function TrackComparison({ track, periods, metric }) {
  const timed = periods.filter((x) => x.recorded);
  const first = timed[0];
  const last = timed[timed.length - 1];
  const max = Math.max(1, ...periods.map((x) => x[metric] || 0));
  const sizes = PRIORITIES.filter((p) => periods.some((x) => x.byPriority[p]));
  const pct = first && last && first !== last ? Math.round(((last.avg - first.avg) / first.avg) * 100) : null;

  return (
    <Section title={track} hint={`${periods.length} periods, oldest first. Hover a column for details.`}>
      {first && last && first !== last && (
        <p className="at-headline" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
          A typical app took <b>{short(first.avg)}</b> in {first.label} and <b>{short(last.avg)}</b> in {last.label}
          {pct ? <> ({pct > 0 ? 'up' : 'down'} <b>{Math.abs(pct)}%</b>)</> : ' (about the same)'}.
        </p>
      )}
      <div className="at-columns">
        {periods.map((x) => (
          <div
            key={x.key}
            className={x[metric] ? 'at-column' : 'at-column at-column--empty'}
            title={`${x.label}: ${x.recorded} of ${x.apps} apps timed · total ${fmtMinutes(x.total) || '0h'} · average ${fmtMinutes(x.avg) || '—'} · range ${range(x)}`}
          >
            <b className="tabular-nums">{short(x[metric])}</b>
            <div style={{ height: `${((x[metric] || 0) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="at-column-labels">
        {periods.map((x, i) => (
          <div key={x.key}>
            <strong>{x.label}</strong>
            {x.recorded} of {x.apps} apps timed
            {i > 0 && <div><Change now={x[metric] || null} before={periods[i - 1][metric] || null} /></div>}
          </div>
        ))}
      </div>
      {sizes.length > 0 && (
        <table className="cs-data-table">
          <thead>
            <tr>
              <th>Typical per app, by size</th>
              {periods.map((x) => <th key={x.key} style={{ textAlign: 'right' }}>{x.label}</th>)}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {sizes.map((p) => (
              <tr key={p}>
                <td><PriorityTag value={p} /></td>
                {periods.map((x, i) => {
                  const s = x.byPriority[p];
                  const prev = periods[i - 1]?.byPriority[p];
                  return (
                    <td key={x.key} className="text-right whitespace-nowrap" title={s?.recorded ? `${s.recorded} apps · range ${range(s)} · total ${fmtMinutes(s.total)}` : undefined}>
                      {s?.recorded ? (
                        <span className="inline-flex items-center gap-2">
                          {i > 0 && <Change now={s.avg} before={prev?.avg ?? null} />}
                          <span className="font-semibold">{short(s.avg)}</span>
                        </span>
                      ) : <span className="at-soft">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function PeriodComparison({ cycles }) {
  const { data, error } = usePeriodComparison(cycles);
  const [metric, setMetric] = useState('avg');
  if (error) return <div className="at-alert at-alert--error">{error}</div>;
  if (!data) return <div className="at-card p-6 text-center at-muted">Loading periods…</div>;
  const tracks = [...new Set(data.map((x) => x.track))];
  return (
    <div className="space-y-4">
      <div className="at-card flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-base font-bold">How time changes between periods</h2>
          <p className="text-xs at-muted">Bi-Annual and Quarterly are shown separately and never compared with each other. Apps with no time recorded are left out.</p>
        </div>
        <FilterSelect icon={BarChart3} label="Show" value={metric} onChange={setMetric} options={METRICS} />
      </div>
      {tracks.map((t) => <TrackComparison key={t} track={t} periods={data.filter((x) => x.track === t)} metric={metric} />)}
    </div>
  );
}

// Time spent report: summary, per application size (priority), per security tester, per app.
// The comparison between periods is its own page (PeriodComparison). Read-only; time comes from UberTicket or the editor.
export default function TimeReport({ rows, period, scopeLabel, onOpen }) {
  const [onlyTimed, setOnlyTimed] = useState(true);
  const scope = useMemo(() => rows.filter((r) => !period || r.period === period), [rows, period]);
  const overall = useMemo(() => timeStats(scope), [scope]);
  const sizes = useMemo(() => timeByPriority(scope).byPriority, [scope]);
  const testers = useMemo(() => timeByGroup(scope, (r) => r.securityTester), [scope]);
  const { filtered, bar } = useFilters(scope);
  const apps = useMemo(
    () => filtered.filter((r) => !onlyTimed || Number(r.timeSpent) > 0)
      .sort((a, b) => (Number(b.timeSpent) || 0) - (Number(a.timeSpent) || 0) || a.project.localeCompare(b.project)),
    [filtered, onlyTimed],
  );
  const overCount = scope.filter((r) => vsEstimate(r.timeSpent, r.priority) === 'over').length;
  const scaleMax = Math.max(1, ...sizes.map((x) => Math.max(x.max || 0, estimateMinutes(x.priority)?.[1] || 0)));
  const timedTesters = testers.filter((x) => x.key && x.recorded);
  const untimedTesters = testers.filter((x) => x.key && !x.recorded).map((x) => x.key);
  const maxTester = Math.max(1, ...timedTesters.map((x) => x.total));
  const maxApp = Math.max(1, ...apps.map((r) => Number(r.timeSpent) || 0));

  const exportApps = () => downloadCsv(
    `time-spent-${scopeLabel.replace(/\W+/g, '-').toLowerCase()}.csv`,
    ['Project', 'Period', 'Priority', 'Security tester', 'Status', 'UberTicket', 'Time spent (minutes)', 'Time spent (hours)', 'Vs estimate'],
    apps.map((r) => [r.project, r.period, r.priority, r.securityTester, r.status, r.ticketKey, r.timeSpent ?? '', r.timeSpent ? (r.timeSpent / 60).toFixed(2) : '', vsEstimate(r.timeSpent, r.priority) ?? '']),
  );

  if (!overall.recorded) {
    return <div className="at-card p-10 text-center at-muted">No time recorded yet in {scopeLabel}. Time comes from the UberTicket “Time Spent (MM)” field or the editor.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="at-card at-headline">
        In {scopeLabel}, the team logged <b>{short(overall.total)}</b> on <b>{overall.recorded}</b> apps.
        A typical app took <b>{short(overall.avg)}</b> (shortest {fmtMinutes(overall.min)}, longest {fmtMinutes(overall.max)}).
        {overall.apps > overall.recorded && <> <b>{overall.apps - overall.recorded}</b> apps have no time recorded yet.</>}
      </p>

      <section className="at-kpi-grid at-kpi-grid--4">
        <Kpi label="Total Time" hint={`${fmtMinutes(overall.total)} exactly`}>{short(overall.total)}</Kpi>
        <Kpi label="Apps Timed" hint={`of ${overall.apps} applications`}>{overall.recorded}</Kpi>
        <Kpi label="Typical App" hint="Average per timed app">{short(overall.avg)}</Kpi>
        <Kpi label="Above Estimate" hint="Apps over their size's man hours">{overCount}</Kpi>
      </section>

      <Section title="How long does each size take?" hint="Size = priority. The bar runs from the shortest to the longest app; the dot is the average; the dashed box is the man-hours estimate.">
        <div className="at-size-grid">
          {sizes.map((x) => <SizeCard key={x.priority} x={x} scaleMax={scaleMax} />)}
        </div>
      </Section>

      <Section title="Who spent the time?" hint="Total hours per security tester, most first. Hover a bar for the range.">
        <div className="at-hbars">
          {timedTesters.map((x) => (
            <div key={x.key} className="at-hbar">
              <span className="truncate font-semibold">{x.key}</span>
              <div className="at-hbar-track" title={`${x.key}: total ${fmtMinutes(x.total)} · range ${range(x)}`}>
                <div style={{ width: `${(x.total / maxTester) * 100}%` }} />
              </div>
              <span className="tabular-nums whitespace-nowrap">
                <b>{short(x.total)}</b> <span className="at-muted">· {x.recorded} apps · avg {short(x.avg)}</span>
              </span>
            </div>
          ))}
          {untimedTesters.length > 0 && <p className="text-xs at-muted">No time recorded yet: {untimedTesters.join(', ')}</p>}
        </div>
      </Section>

      <Section
        title="Every app"
        hint="Longest first. Click a row to edit its time spent."
        actions={(
          <>
            {bar}
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold at-muted">
              <input type="checkbox" checked={onlyTimed} onChange={(e) => setOnlyTimed(e.target.checked)} />
              Only apps with time
            </label>
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
              <th>Size</th>
              <th>Tester</th>
              <th>Time spent</th>
              <th>Vs estimate</th>
              <th>Status</th>
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
                  {!period && <div className="text-xs at-muted">{r.period}</div>}
                </td>
                <td><PriorityTag value={r.priority} /></td>
                <td className="whitespace-nowrap">{r.securityTester}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {Number(r.timeSpent) > 0 ? (
                    <>
                      <span className="at-inline-bar" aria-hidden><span style={{ width: `${(r.timeSpent / maxApp) * 100}%` }} /></span>
                      <b>{fmtMinutes(r.timeSpent)}</b>
                    </>
                  ) : <span className="at-soft">Not recorded</span>}
                </td>
                <td><EstimateBadge minutes={r.timeSpent} priority={r.priority} /></td>
                <td><StatusPill value={r.status} small /></td>
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
