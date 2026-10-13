import { useMemo, useState } from 'react';
import { Search, Plus, ExternalLink, AlertTriangle } from 'lucide-react';
import { PRIORITIES, CHECKS } from '../../../tracker/shared/logic.js';
import { StatusPill, SealBadge, PriorityTag, TicketLink, Progress, Select, fmtDate } from './ui.jsx';

export function useFilters(rows) {
  const [f, setF] = useState({ q: '', status: '', priority: '', tester: '' });
  const testers = useMemo(() => [...new Set(rows.map((r) => r.securityTester).filter(Boolean))].sort(), [rows]);
  const filtered = rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.tester && r.securityTester !== f.tester) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (![r.project, r.testingUrl, r.baAssigned, r.repositories, r.ticketKey].some((v) => v && v.toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const bar = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 w-4 h-4 at-soft" aria-hidden />
        <input value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="Search project, URL, BA, UB-…" className="at-input at-has-icon w-60" />
      </label>
      <Select value={f.status} onChange={set('status')} placeholder="All statuses" options={['Done', 'In Progress', 'Not Started']} />
      <Select value={f.priority} onChange={set('priority')} placeholder="All priorities" options={PRIORITIES} />
      <Select value={f.tester} onChange={set('tester')} placeholder="All testers" options={testers} />
    </div>
  );
  return { filtered, bar };
}

// The "<year> Full assessment" sheet.
export default function Assessments({ rows, period, onOpen, onAdd }) {
  const scope = useMemo(() => rows.filter((r) => !period || r.period === period), [rows, period]);
  const { filtered, bar } = useFilters(scope);

  return (
    <section className="cs-table-shell overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
        {bar}
        <span className="ml-auto text-xs at-muted">Showing {filtered.length} of {scope.length}</span>
        <button type="button" onClick={onAdd} className="at-btn">
          <Plus className="w-4 h-4" aria-hidden /> Add application
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="cs-data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Qtr</th>
              <th>Priority</th>
              <th>Tester</th>
              <th>BA</th>
              <th>App</th>
              <th>Dependabots</th>
              <th>Code Review</th>
              <th>Report</th>
              <th>Completion</th>
              <th>Status</th>
              <th>Actual end</th>
              <th>Seal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className="at-row">
                <td>
                  <div className="flex items-center gap-1.5 font-semibold">
                    {r.project}
                    <TicketLink row={r} />
                  </div>
                  {r.testingUrl && r.testingUrl !== 'N/A' && (
                    <a href={r.testingUrl.split(/\s+/)[0]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="at-link inline-flex max-w-60 items-center gap-1 truncate text-xs">
                      <span className="truncate">{r.testingUrl.split(/\s+/)[0].replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                    </a>
                  )}
                </td>
                <td className="at-muted">{r.quarter}</td>
                <td><PriorityTag value={r.priority} /></td>
                <td className="whitespace-nowrap">{r.securityTester}</td>
                <td className="whitespace-nowrap at-muted">{r.baAssigned}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <StatusPill value={r.app} small />
                    {r.app === 'In Progress' && <span className="tabular-nums text-xs at-muted">{r.checksDone}/{CHECKS.length}</span>}
                  </div>
                </td>
                <td><StatusPill value={r.dependabots} small /></td>
                <td><StatusPill value={r.codeReview} small /></td>
                <td><StatusPill value={r.report} small /></td>
                <td><Progress value={r.completion} /></td>
                <td>
                  <div className="flex items-center gap-1">
                    <StatusPill value={r.status} />
                    {r.checklistGap && <AlertTriangle className="w-4 h-4" style={{ color: '#b45309' }} aria-label="Ticket resolved but checklist / deliverables incomplete" />}
                  </div>
                </td>
                <td className="whitespace-nowrap at-muted">{fmtDate(r.actualEnd)}</td>
                <td><SealBadge value={r.seal} auto={r.sealSource === 'auto'} /></td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={13} className="p-10 text-center at-muted">No applications match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
