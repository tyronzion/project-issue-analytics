import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { CHECKS } from '../../../tracker/shared/logic.js';
import { useFilters } from './Assessments.jsx';
import { StatusPill } from './ui.jsx';

// The "<year> checklist" sheet: one row per app, one column per test.
export default function Checklist({ rows, period, onToggle, onOpen }) {
  const scope = useMemo(() => rows.filter((r) => r.period === period), [rows, period]);
  const { filtered, bar } = useFilters(scope);
  const columnDone = CHECKS.map((c) => filtered.filter((r) => r.checks[c.key]).length);

  return (
    <section className="cs-table-shell overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
        {bar}
        <span className="ml-auto text-xs at-muted">Click a box to tick / untick. Changes save immediately.</span>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="cs-data-table">
          <thead>
            <tr>
              <th className="at-sticky-col min-w-48 align-bottom">Application</th>
              {CHECKS.map((c, i) => (
                <th key={c.key} className="h-28 w-12 align-bottom" style={{ padding: '8px 4px' }}>
                  <div className="at-vertical mx-auto text-left">{c.label}</div>
                  <div className="tabular-nums mt-1 text-[10px] at-soft">{columnDone[i]}/{filtered.length}</div>
                </th>
              ))}
              <th className="align-bottom" style={{ padding: '8px 4px' }}>
                <div className="at-vertical mx-auto text-left">Mobile App</div>
              </th>
              <th className="align-bottom">App status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="at-sticky-col font-semibold" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  <button type="button" onClick={() => onOpen(r)} className="text-left hover:underline">{r.project}</button>
                </td>
                {CHECKS.map((c) => {
                  const on = !!r.checks[c.key];
                  return (
                    <td key={c.key} className="text-center" style={{ padding: 2 }}>
                      <button
                        type="button"
                        onClick={() => onToggle(r, { checks: { ...r.checks, [c.key]: !on } })}
                        aria-label={`${c.label} for ${r.project}: ${on ? 'done' : 'not done'}`}
                        aria-pressed={on}
                        className="at-check"
                      >
                        <Check className="w-4 h-4" strokeWidth={3} aria-hidden />
                      </button>
                    </td>
                  );
                })}
                <td className="text-center" style={{ padding: 2 }}>
                  <input type="checkbox" checked={!!r.mobileApp} onChange={() => onToggle(r, { mobileApp: !r.mobileApp })} className="w-4 h-4" aria-label={`Mobile app: ${r.project}`} />
                </td>
                <td style={{ paddingTop: 6, paddingBottom: 6 }}>
                  <StatusPill value={r.app} small />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
