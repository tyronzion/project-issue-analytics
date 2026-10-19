import { useCallback, useEffect, useState } from 'react';
import { X, ExternalLink, FileCheck, Trash2, EyeOff, Eye } from 'lucide-react';
import { dayOf } from '../../../pia/shared/rules.js';
import { fmtDate } from '../tracker/ui.jsx';
import { piaApi } from './api.js';
import { StatusBadge, InProgressBadge, DaysLeft } from './badges.jsx';

const POLICY_STATE = { approved: 'Approved', open: 'Under review', rejected: 'Rejected / removed (not counted)' };

// One application: its PIA policies, recorded reassessments and change history. Admins record reassessments here.
export default function AppDetail({ id, isAdmin, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => piaApi.app(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveReassessment(e) {
    e.preventDefault();
    if (await act(() => piaApi.addReassessment(id, form))) setForm(null);
  }

  function toggleHidden() {
    if (data.app.hidden) return act(() => piaApi.setHidden(id, false, ''));
    const reason = window.prompt('Why does this app not need tracking on the PIA list? (recorded in the history)');
    if (reason) act(() => piaApi.setHidden(id, true, reason));
  }

  const app = data?.app;
  return (
    <div className="at-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="at-drawer at-root" role="dialog" aria-label={`PIA for ${app?.name ?? 'application'}`}>
        <div className="flex items-start gap-3 p-4" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-xs at-muted">Privacy Impact Assessment</div>
            <h2 className="truncate text-lg font-bold">{app?.name ?? 'Loading…'}</h2>
            {app && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge app={app} />
                <InProgressBadge app={app} />
                {app.dueOn && <span className="at-muted">Next due {fmtDate(app.dueOn)} · <DaysLeft app={app} /></span>}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="at-btn-ghost" title="Close">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {error && <div className="at-alert at-alert--error">{error}</div>}
          {app?.hidden && <div className="at-alert at-alert--info">Hidden from the PIA list: {app.hiddenReason}</div>}

          {app && (
            <section className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="at-label">Last assessed</span>{app.lastAssessed ? `${fmtDate(app.lastAssessed)} (${app.lastSource === 'reassessment' ? 'recorded reassessment' : 'PIA approved'})` : '—'}</div>
              <div><span className="at-label">First PIA approved</span>{app.firstApproved ? fmtDate(app.firstApproved) : '—'}</div>
              <div><span className="at-label">Source</span>{[app.inTracker && 'Assessment Tracker', app.fromPia && 'UberTicket PIA', app.manual && 'Added by an admin'].filter(Boolean).join(', ')}{app.decommissioned ? ' (decommissioned in the tracker)' : ''}</div>
              <div><span className="at-label">Repositories (from the tracker)</span><span className="whitespace-pre-wrap break-all font-mono text-xs">{app.repositories || '—'}</span></div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-base font-bold">Reassessments</h3>
              {isAdmin && !form && (
                <button type="button" className="at-btn ml-auto" onClick={() => setForm({ assessedOn: dayOf(Date.now()), reportUrl: '', notes: '' })}>
                  <FileCheck className="w-3.5 h-3.5" aria-hidden /> Record reassessment
                </button>
              )}
            </div>
            {form && (
              <form onSubmit={saveReassessment} className="at-card mb-3 space-y-3 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <label><span className="at-label">Completed on</span>
                    <input type="date" required value={form.assessedOn} max={dayOf(Date.now())} onChange={(e) => setForm({ ...form, assessedOn: e.target.value })} className="at-input w-full" />
                  </label>
                  <label><span className="at-label">Report link (https)</span>
                    <input type="url" required pattern="https://.*" value={form.reportUrl} onChange={(e) => setForm({ ...form, reportUrl: e.target.value })} placeholder="https://cloudstaff.sharepoint.com/…" className="at-input w-full" />
                  </label>
                </div>
                <label className="block"><span className="at-label">Notes (optional)</span>
                  <textarea rows={2} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="at-input w-full" />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="at-btn">Save</button>
                  <button type="button" onClick={() => setForm(null)} className="at-btn-ghost">Cancel</button>
                </div>
              </form>
            )}
            {data?.reassessments.length ? (
              <ul className="pia-timeline">
                {data.reassessments.map((r) => (
                  <li key={r.id}>
                    <time>{fmtDate(r.assessedOn)}</time>
                    <div className="min-w-0 flex-1 text-sm">
                      <a href={r.reportUrl} target="_blank" rel="noreferrer" className="at-link inline-flex items-center gap-1 break-all"><ExternalLink className="w-3 h-3" aria-hidden /> Report</a>
                      {r.notes && <p className="whitespace-pre-wrap">{r.notes}</p>}
                      <p className="text-xs at-soft">Recorded by {r.recordedBy} · {r.recordedAt.slice(0, 10)}</p>
                    </div>
                    {isAdmin && (
                      <button type="button" disabled={busy} className="at-btn-ghost" title="Remove (kept in the history)" onClick={() => window.confirm('Remove this reassessment record?') && act(() => piaApi.removeReassessment(r.id))}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm at-muted">No reassessment recorded. {isAdmin ? 'Record one when the yearly review is complete.' : ''}</p>}
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold">PIA policies in UberTicket</h3>
            {data?.policies.length ? (
              <ul className="pia-timeline">
                {data.policies.map((p) => (
                  <li key={p.id}>
                    <time>{p.submittedAt ? fmtDate(dayOf(p.submittedAt)) : '—'}</time>
                    <div className="min-w-0 flex-1 text-sm">
                      <a href={p.url} target="_blank" rel="noreferrer" className="at-link inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" aria-hidden /> {p.product} · v{p.version || '?'}</a>
                      <p className="text-xs at-muted">
                        {POLICY_STATE[p.state]}{p.approvedAt ? ` ${fmtDate(dayOf(p.approvedAt))}${p.approvedBy ? ` by ${p.approvedBy}` : ''}` : ''}
                        {p.submitter ? ` · submitted by ${p.submitter}` : ''}
                        {p.riskRating != null ? ` · overall risk ${p.riskRating}${p.riskLabel ? ` (${p.riskLabel})` : ''}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm at-muted">No [PIA01] policy names this app. If it's under another name, link it on the PIA Matching page.</p>}
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold">History</h3>
            {data?.history.length ? (
              <ul className="space-y-1 text-xs">
                {data.history.map((h, i) => (
                  <li key={i}><span className="at-muted">{h.changedAt} · {h.changedBy}:</span> {h.field} {h.oldValue ? <s className="at-soft">{h.oldValue}</s> : null} {h.newValue}</li>
                ))}
              </ul>
            ) : <p className="text-sm at-muted">No changes recorded.</p>}
          </section>

          {isAdmin && app && (
            <section className="pt-2" style={{ borderTop: '1px solid var(--cs-border)' }}>
              <button type="button" disabled={busy} onClick={toggleHidden} className="at-btn-ghost">
                {app.hidden ? <><Eye className="w-3.5 h-3.5" aria-hidden /> Show on the PIA list</> : <><EyeOff className="w-3.5 h-3.5" aria-hidden /> Hide from the PIA list…</>}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
