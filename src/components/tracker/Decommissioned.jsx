import { useState } from 'react';
import { Archive, ArchiveRestore, Search } from 'lucide-react';
import { StatusPill, PriorityTag, SealBadge, fmtDate } from './ui.jsx';

// Apps retired from the cycle: excluded from Monitoring, Full Assessment and Checklist.
export default function Decommissioned({ rows, onOpen, onRestore }) {
  const [q, setQ] = useState('');
  const list = rows
    .filter((r) => !q || [r.project, r.decommissionReason, r.securityTester].some((v) => v && v.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.decommissionedAt || '').localeCompare(a.decommissionedAt || '') || a.project.localeCompare(b.project));

  return (
    <section className="cs-table-shell overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
        <h2 className="mr-auto text-base font-bold">Decommissioned applications ({rows.length})</h2>
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 w-4 h-4 at-soft" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="at-input at-has-icon w-56" />
        </label>
      </div>
      {!rows.length ? (
        <div className="flex flex-col items-center gap-2 p-12 text-center at-muted">
          <Archive className="w-8 h-8 at-soft" aria-hidden />
          <p>No decommissioned applications in this cycle.</p>
          <p className="text-sm">Open an app and click <b>Decommission</b> to retire it from monitoring.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="cs-data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Period</th>
                <th>Priority</th>
                <th>Tester</th>
                <th>Last status</th>
                <th>Seal</th>
                <th>Decommissioned</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r)} className="at-row">
                  <td className="font-semibold">{r.project}</td>
                  <td className="whitespace-nowrap at-muted">{r.period}</td>
                  <td><PriorityTag value={r.priority} /></td>
                  <td className="whitespace-nowrap">{r.securityTester}</td>
                  <td><StatusPill value={r.status} small /></td>
                  <td><SealBadge value={r.seal} /></td>
                  <td className="whitespace-nowrap at-muted">
                    {fmtDate(r.decommissionedAt) || '—'}
                    {r.updatedBy && <div className="text-xs at-soft">by {r.updatedBy}</div>}
                  </td>
                  <td className="max-w-72 at-muted">{r.decommissionReason || '—'}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(r);
                      }}
                      className="at-btn"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" aria-hidden /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
