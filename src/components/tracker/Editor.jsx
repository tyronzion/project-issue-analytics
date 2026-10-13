import { useEffect, useState } from 'react';
import { X, Trash2, History, Archive, ArchiveRestore, Ticket, Lock, AlertTriangle } from 'lucide-react';
import { CHECKS, PRIORITIES, TASK_STATUSES, SEALS, QUARTERS, CLASSIFICATIONS, enrich, isDecommissioned } from '../../../tracker/shared/logic.js';
import { api } from './api.js';
import { StatusPill, Progress, SealBadge, fmtDate, cx } from './ui.jsx';

const BLANK = {
  project: '', quarter: '', isActive: 'Active', classification: 'New', repositories: '', testingUrl: '', priority: 'Medium',
  baAssigned: '', securityTester: '', coTester: '', checks: {}, mobileApp: false,
  dependabots: 'Not Started', codeReview: 'Not Started', report: 'Not Started',
  plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '', timeSpent: '', seal: '', notes: '',
};

function Field({ label, children, wide, locked }) {
  return (
    <label className={cx('block', wide && 'sm:col-span-2')}>
      <span className="at-label inline-flex items-center gap-1">
        {label}
        {locked && <Lock className="w-3 h-3" aria-label="From UberTicket" />}
      </span>
      {children}
    </label>
  );
}

function Choice({ value, onChange, options, blank, disabled }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="at-input w-full" disabled={disabled}>
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

export default function Editor({ row, periods, testers, onClose, onSaved, onDeleted, cycleId }) {
  const isNew = !row.id;
  const [draft, setDraft] = useState(() => ({ ...BLANK, ...row }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);
  const [decom, setDecom] = useState(null);
  const retired = !isNew && isDecommissioned(row);
  const linked = !isNew && !!row.ticketKey; // UberTicket owns status, tester and dates

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const live = enrich(draft);
  const allChecked = CHECKS.every((c) => draft.checks[c.key]);
  const changed = Object.keys(BLANK).concat('period').filter((k) => JSON.stringify(draft[k] ?? '') !== JSON.stringify(row[k] ?? (isNew ? BLANK[k] : '')));

  async function save() {
    if (!draft.project.trim()) return setError('Project name is required');
    setSaving(true);
    setError('');
    try {
      const keys = isNew ? [...Object.keys(BLANK), 'period'] : changed;
      const patch = Object.fromEntries(keys.map((k) => [k, draft[k] === '' ? null : draft[k]]));
      onSaved(isNew ? await api.createAssessment(cycleId, patch) : await api.updateAssessment(row.id, patch));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function setLifecycle(patch) {
    setSaving(true);
    setError('');
    try {
      onSaved(await api.updateAssessment(row.id, patch));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${row.project}" from this cycle? This cannot be undone.`)) return;
    await api.deleteAssessment(row.id);
    onDeleted(row.id);
  }

  return (
    <div className="at-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="at-drawer at-root" role="dialog" aria-label={`Edit ${draft.project || 'application'}`}>
        <div className="flex items-start gap-3 p-4" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-xs at-muted">{isNew ? 'New application' : draft.period}</div>
            <h2 className="truncate text-lg font-bold">{draft.project || 'Untitled'}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill value={live.status} />
              <Progress value={live.completion} />
              <span className="text-xs at-muted">Monitoring score: {live.score}</span>
            </div>
          </div>
          {!isNew && (
            <button type="button" onClick={async () => setHistory(history ? null : await api.history(row.id))} className="at-btn-ghost" title="Change history">
              <History className="w-4 h-4" aria-hidden />
            </button>
          )}
          <button type="button" onClick={onClose} className="at-btn-ghost" title="Close">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {linked && (
            <div className="at-alert at-alert--info">
              <Ticket className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <div className="font-bold">
                  <a href={row.ticketUrl} target="_blank" rel="noreferrer" className="at-link">{row.ticketKey}</a>
                  {' · '}{row.ticketSource === 'roe' ? 'Rules of Engagement' : 'Security Full Assessment'} · {row.ticketState}
                </div>
                <div className="at-muted">
                  Status, tester, actual dates and the New / Old tag come from UberTicket{row.testerFrozen ? ' (tester kept as it was at resolution)' : ''}.
                  {row.createdFromTicket && <> Added automatically from Rules of Engagement {row.createdFromTicket}.</>}
                  {row.sealSource === 'auto' && row.sealAt && <> Seal captured {row.sealAt.slice(0, 10)}.</>}
                </div>
              </div>
            </div>
          )}
          {live.checklistGap && (
            <div className="at-alert at-alert--warn">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              <div>The UberTicket is resolved but the checklist / deliverables are only {live.completion}% complete.</div>
            </div>
          )}

          {history && (
            <section className="at-card p-3 text-sm">
              <h3 className="at-section-title">Change history</h3>
              {!history.length && <p className="at-muted">No changes recorded yet.</p>}
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {history.map((h, i) => (
                  <li key={i} className="text-xs at-muted">
                    <span className="tabular-nums at-soft">{h.changedAt.slice(0, 16)}</span> · <b>{h.changedBy}</b> · {h.field}: {h.oldValue ?? '∅'} → {h.newValue ?? '∅'}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {retired && (
            <div className="at-alert at-alert--info">
              <Archive className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <div className="font-bold">Decommissioned{row.decommissionedAt && ` on ${fmtDate(row.decommissionedAt)}`}</div>
                <div className="at-muted">{row.decommissionReason || 'No reason given.'} Not counted in Monitoring.</div>
              </div>
              <button type="button" onClick={() => setLifecycle({ isActive: 'Active', decommissionedAt: null, decommissionReason: null })} disabled={saving} className="at-btn">
                <ArchiveRestore className="w-4 h-4" aria-hidden /> Restore
              </button>
            </div>
          )}

          {decom && (
            <section className="at-alert at-alert--warn flex-col">
              <div className="font-bold">Decommission {row.project}?</div>
              <p>It will be removed from Monitoring, Full Assessment and Checklist, and listed on the Decommissioned page. You can restore it later.</p>
              <div className="grid w-full gap-3 sm:grid-cols-[10rem_1fr]">
                <Field label="Decommissioned on"><input type="date" value={decom.date} onChange={(e) => setDecom({ ...decom, date: e.target.value })} className="at-input w-full" /></Field>
                <Field label="Reason (optional)"><input value={decom.reason} onChange={(e) => setDecom({ ...decom, reason: e.target.value })} placeholder="e.g. App retired, replaced by …" className="at-input w-full" autoFocus /></Field>
              </div>
              <div className="flex w-full justify-end gap-2">
                <button type="button" onClick={() => setDecom(null)} className="at-btn-ghost">Cancel</button>
                <button type="button" onClick={() => setLifecycle({ isActive: 'Decommissioned', decommissionedAt: decom.date || null, decommissionReason: decom.reason.trim() || null })} disabled={saving} className="at-btn">Decommission</button>
              </div>
            </section>
          )}

          <section>
            <h3 className="at-section-title">Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project"><input value={draft.project} onChange={(e) => set('project')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="Period"><Choice value={draft.period} onChange={set('period')} options={periods} /></Field>
              <Field label="Priority"><Choice value={draft.priority} onChange={set('priority')} options={PRIORITIES} /></Field>
              <Field label="Quarter"><Choice value={draft.quarter} onChange={set('quarter')} options={QUARTERS} blank="—" /></Field>
              <Field label="Classification" locked={linked}><Choice value={draft.classification} onChange={set('classification')} options={CLASSIFICATIONS} blank="—" disabled={linked} /></Field>
              <Field label="Security tester" locked={linked}>
                <input list="at-testers" value={draft.securityTester ?? ''} onChange={(e) => set('securityTester')(e.target.value)} className="at-input w-full" disabled={linked} />
                <datalist id="at-testers">{testers.map((t) => <option key={t} value={t} />)}</datalist>
              </Field>
              <Field label="Co-tester"><input list="at-testers" value={draft.coTester ?? ''} onChange={(e) => set('coTester')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="BA assigned"><input value={draft.baAssigned ?? ''} onChange={(e) => set('baAssigned')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="Testing URL(s)" wide><textarea rows={2} value={draft.testingUrl ?? ''} onChange={(e) => set('testingUrl')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="Repositories" wide><textarea rows={3} value={draft.repositories ?? ''} onChange={(e) => set('repositories')(e.target.value)} className="at-input w-full font-mono text-xs" /></Field>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="at-section-title" style={{ marginBottom: 0 }}>
                App testing checklist <span className="font-normal at-muted">({live.checksDone}/{CHECKS.length})</span>
              </h3>
              <button type="button" onClick={() => set('checks')(Object.fromEntries(CHECKS.map((c) => [c.key, !allChecked])))} className="at-link text-xs font-bold">
                {allChecked ? 'Clear all' : 'Tick all'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {CHECKS.map((c) => (
                <label key={c.key} className={cx('at-check-option', draft.checks[c.key] && 'at-check-option--on')}>
                  <input type="checkbox" checked={!!draft.checks[c.key]} onChange={(e) => set('checks')({ ...draft.checks, [c.key]: e.target.checked })} className="w-4 h-4" />
                  {c.label}
                </label>
              ))}
              <label className="at-check-option" style={{ borderStyle: 'dashed' }}>
                <input type="checkbox" checked={!!draft.mobileApp} onChange={(e) => set('mobileApp')(e.target.checked)} className="w-4 h-4" />
                Mobile App
              </label>
            </div>
            <p className="mt-1.5 text-xs at-muted">App status: <b>{live.app}</b>. All 12 ticked makes it "Uploaded" (+40%).</p>
          </section>

          <section>
            <h3 className="at-section-title">Deliverables <span className="font-normal at-muted">(+20% each when done)</span></h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Dependabots alert"><Choice value={draft.dependabots} onChange={set('dependabots')} options={TASK_STATUSES} /></Field>
              <Field label="Code review"><Choice value={draft.codeReview} onChange={set('codeReview')} options={TASK_STATUSES} /></Field>
              <Field label="Report"><Choice value={draft.report} onChange={set('report')} options={TASK_STATUSES} /></Field>
            </div>
          </section>

          <section>
            <h3 className="at-section-title">Schedule &amp; result</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Planned start"><input type="date" value={draft.plannedStart ?? ''} onChange={(e) => set('plannedStart')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="Planned end"><input type="date" value={draft.plannedEnd ?? ''} onChange={(e) => set('plannedEnd')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="Actual start (ticket submitted)" locked={linked}><input type="date" value={draft.actualStart ?? ''} onChange={(e) => set('actualStart')(e.target.value)} className="at-input w-full" disabled={linked} /></Field>
              <Field label="Actual end (ticket resolved)" locked={linked}><input type="date" value={draft.actualEnd ?? ''} onChange={(e) => set('actualEnd')(e.target.value)} className="at-input w-full" disabled={linked} /></Field>
              <Field label="Time spent (minutes)"><input type="number" min="0" value={draft.timeSpent ?? ''} onChange={(e) => set('timeSpent')(e.target.value)} className="at-input w-full" /></Field>
              <Field label="Seal">
                <div className="flex items-center gap-2">
                  <Choice value={draft.seal} onChange={set('seal')} options={SEALS} blank="—" />
                  {row.sealSource === 'auto' && draft.seal === row.seal && <SealBadge value={row.seal} auto />}
                </div>
              </Field>
              <Field label="Notes" wide><textarea rows={3} value={draft.notes ?? ''} onChange={(e) => set('notes')(e.target.value)} className="at-input w-full" /></Field>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderTop: '1px solid var(--cs-border)' }}>
          {!isNew && !retired && !decom && (
            <button type="button" onClick={() => setDecom({ date: new Date().toLocaleDateString('en-CA'), reason: '' })} className="at-btn-ghost">
              <Archive className="w-4 h-4" aria-hidden /> Decommission
            </button>
          )}
          {!isNew && (
            <button type="button" onClick={remove} className="at-btn-danger">
              <Trash2 className="w-4 h-4" aria-hidden /> Delete
            </button>
          )}
          {error && <span className="text-sm" style={{ color: '#b42318' }}>{error}</span>}
          <span className="ml-auto text-xs at-muted">{!isNew && row.updatedBy && `Last updated by ${row.updatedBy}`}</span>
          <button type="button" onClick={onClose} className="at-btn-ghost">Cancel</button>
          <button type="button" onClick={save} disabled={saving || (!isNew && !changed.length)} className="at-btn">
            {saving ? 'Saving…' : isNew ? 'Add application' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
