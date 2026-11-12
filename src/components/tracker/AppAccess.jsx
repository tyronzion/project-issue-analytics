import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Copy, Check, Globe, Smartphone, ExternalLink, Pencil, Trash2, Plus, X, History, Info, Layers, Filter } from 'lucide-react';
import { FilterSelect, FilterSearch } from '../FilterChips';
import { targetMatcher } from '../../../tracker/shared/targets.js';
import { useSharedTargets, activeTargetNames } from '../../utils/sharedTargets';
import { accessApi } from './api.js';
import { cx } from './ui.jsx';
import './tracker.css';

const KIND_LABEL = { web: 'Web', mobile: 'Mobile' };
const PLATFORM_LABEL = { ios: 'iOS', android: 'Android', both: 'iOS + Android' };
const BLANK_ACCOUNT = { username: '', password: '', role: '', environment: '', notes: '' };

// ?app=<key> opens that app's drawer (the assessment editor links here).
const appFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('app') || null;
  } catch {
    return null;
  }
};
const setAppInUrl = (key) => {
  try {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set('app', key);
    else url.searchParams.delete('app');
    window.history.replaceState(null, '', url.pathname + url.search);
  } catch {
    /* ignore */
  }
};

function KindTag({ kind }) {
  if (!kind) return <span className="at-soft">Not set</span>;
  const Icon = kind === 'web' ? Globe : Smartphone;
  return (
    <span className="at-pill at-pill--idle">
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {KIND_LABEL[kind]}
    </span>
  );
}

function OutLink({ href, children }) {
  if (!href) return <span className="at-soft">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="at-link inline-flex items-center gap-1 max-w-full" onClick={(e) => e.stopPropagation()}>
      <span className="truncate">{children || href}</span>
      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
    </a>
  );
}

// Copies a value to the clipboard and shows "Copied" briefly. The password is fetched on click and never
// kept in React state or shown on screen.
function CopyButton({ getText, label, title, onDone }) {
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [message, setMessage] = useState('');
  async function copy(e) {
    e.stopPropagation();
    setState('busy');
    try {
      let text = await getText();
      await navigator.clipboard.writeText(text);
      text = null;
      setState('done');
      setMessage('');
      onDone?.();
    } catch (err) {
      setState('error');
      setMessage(err?.name === 'NotAllowedError' ? 'The browser blocked the clipboard.' : err?.message || 'Copy failed.');
    }
    setTimeout(() => setState('idle'), 1800);
  }
  return (
    <button type="button" className="at-btn-ghost" onClick={copy} disabled={state === 'busy'} title={state === 'error' ? message : title} aria-label={title}>
      {state === 'done' ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      {state === 'done' ? 'Copied' : state === 'error' ? 'Failed' : label}
    </button>
  );
}

function AccountForm({ initial, editing, onSave, onCancel, busy }) {
  const [f, setF] = useState(() => ({ ...BLANK_ACCOUNT, ...initial, password: '' }));
  const [clearPassword, setClearPassword] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 p-3"
      style={{ border: '1px solid var(--cs-border)', borderRadius: 'var(--radius-lg)', background: 'var(--cs-surface-0)' }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, ...(editing && clearPassword ? { clearPassword: true, password: '' } : {}) });
      }}
    >
      <label>
        <span className="at-label">Username or email *</span>
        <input className="at-input w-full" value={f.username} onChange={set('username')} required maxLength={200} autoComplete="off" />
      </label>
      <label>
        <span className="at-label">{editing ? 'New password (leave blank to keep)' : 'Password'}</span>
        <input className="at-input w-full" type="password" value={f.password} onChange={set('password')} maxLength={500} autoComplete="new-password" disabled={clearPassword} />
      </label>
      <label>
        <span className="at-label">Role</span>
        <input className="at-input w-full" value={f.role || ''} onChange={set('role')} maxLength={80} placeholder="e.g. Admin, Standard user" />
      </label>
      <label>
        <span className="at-label">Environment</span>
        <input className="at-input w-full" value={f.environment || ''} onChange={set('environment')} maxLength={40} placeholder="e.g. UAT, Staging" />
      </label>
      <label className="sm:col-span-2">
        <span className="at-label">Notes</span>
        <input className="at-input w-full" value={f.notes || ''} onChange={set('notes')} maxLength={500} placeholder="e.g. MFA code goes to the QA mailbox" />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        {editing && initial.hasPassword && (
          <label className="inline-flex items-center gap-2 text-xs at-muted mr-auto">
            <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
            Remove the saved password
          </label>
        )}
        <span className="ml-auto" />
        <button type="button" className="at-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="at-btn" disabled={busy}>{editing ? 'Save account' : 'Add account'}</button>
      </div>
    </form>
  );
}

function AccessDrawer({ appKey, onClose, onChanged }) {
  const [app, setApp] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); // null | 'new' | account id
  const [showHistory, setShowHistory] = useState(false);

  const apply = useCallback((a) => {
    setApp(a);
    setDraft({ kind: a.kind || '', platform: a.platform || '', webUrl: a.webUrl || '', buildUrl: a.buildUrl || '' });
  }, []);

  useEffect(() => {
    accessApi.app(appKey).then(apply).catch((e) => setError(e.message));
  }, [appKey, apply]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      const out = await fn();
      apply(out);
      onChanged();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const dirty = app && draft && (['kind', 'platform', 'webUrl', 'buildUrl'].some((k) => (draft[k] || '') !== (app[k] || '')) || app.fromTracker);

  return (
    <div className="at-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="at-drawer at-root" role="dialog" aria-label={`App access for ${app?.name || 'application'}`}>
        <div className="flex items-start gap-3 p-4" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-xs at-muted">App Access</div>
            <h2 className="truncate text-lg font-bold">{app?.name || '…'}</h2>
            {app?.updatedBy && <div className="text-xs at-soft mt-1">Last changed by {app.updatedBy}, {app.updatedAt} UTC</div>}
          </div>
          <button type="button" className="at-btn-ghost" onClick={() => setShowHistory((v) => !v)} title="Change history" disabled={!app}>
            <History className="w-4 h-4" aria-hidden />
          </button>
          <button type="button" className="at-btn-ghost" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && <div className="at-alert at-alert--error">{error}</div>}
          {!app && !error && <div className="text-sm at-muted">Loading…</div>}

          {app && showHistory && (
            <div className="at-card p-3">
              <div className="at-section-title">Change history</div>
              {app.history.length === 0 ? (
                <div className="text-xs at-muted">No changes yet.</div>
              ) : (
                <ul className="space-y-1 text-xs">
                  {app.history.map((h, i) => (
                    <li key={i}>
                      <span className="at-soft">{h.changedAt} UTC</span> · <b>{h.changedBy}</b> · {h.action}
                      {h.detail ? ` · ${h.detail}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {app && draft && (
            <section className="space-y-3">
              <div className="at-section-title">Application</div>
              {app.fromTracker && (
                <div className="at-alert at-alert--info">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  <span>Filled in from the Assessment Tracker (Testing URL / Mobile App). Save to keep it here.</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Application type">
                {['web', 'mobile'].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={draft.kind === k} className={draft.kind === k ? 'at-btn' : 'at-btn-ghost'} onClick={() => setDraft((d) => ({ ...d, kind: k }))}>
                    {k === 'web' ? <Globe className="w-3.5 h-3.5" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
                    {KIND_LABEL[k]} app
                  </button>
                ))}
              </div>
              {draft.kind === 'web' && (
                <label className="block">
                  <span className="at-label">Web URL</span>
                  <div className="flex gap-2">
                    <input className="at-input flex-1" type="url" value={draft.webUrl} onChange={(e) => setDraft((d) => ({ ...d, webUrl: e.target.value }))} placeholder="https://app.example.com" maxLength={2000} />
                    {app.webUrl && <a className="at-btn-ghost" href={app.webUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" aria-hidden />Open</a>}
                  </div>
                </label>
              )}
              {draft.kind === 'mobile' && (
                <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <label>
                    <span className="at-label">Platform</span>
                    <select className="at-input w-full" value={draft.platform} onChange={(e) => setDraft((d) => ({ ...d, platform: e.target.value }))}>
                      <option value="">Select…</option>
                      {Object.entries(PLATFORM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="at-label">Build folder link (IPA / APK)</span>
                    <div className="flex gap-2">
                      <input className="at-input flex-1" type="url" value={draft.buildUrl} onChange={(e) => setDraft((d) => ({ ...d, buildUrl: e.target.value }))} placeholder="SharePoint, OneDrive or Google Drive folder link" maxLength={2000} />
                      {app.buildUrl && <a className="at-btn-ghost" href={app.buildUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" aria-hidden />Open</a>}
                    </div>
                  </label>
                  <p className="sm:col-span-2 text-xs at-muted">Keep the IPA / APK files in a shared folder and paste the folder link here. Build files are not stored in this app.</p>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" className="at-btn" disabled={busy || !dirty} onClick={() => run(() => accessApi.saveApp(app.key, draft))}>
                  Save application
                </button>
              </div>
            </section>
          )}

          {app && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="at-section-title mb-0">Test accounts</div>
                <span className="text-xs at-muted">({app.accounts.length})</span>
                {form !== 'new' && (
                  <button type="button" className="at-btn-ghost ml-auto" onClick={() => setForm('new')}>
                    <Plus className="w-3.5 h-3.5" aria-hidden /> Add account
                  </button>
                )}
              </div>
              <div className="at-alert at-alert--warn">
                <KeyRound className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <span>Test accounts only: never save a real staff or production account. Passwords are encrypted, never shown, and every copy is logged.</span>
              </div>

              {form === 'new' && (
                <AccountForm
                  initial={BLANK_ACCOUNT}
                  busy={busy}
                  onCancel={() => setForm(null)}
                  onSave={async (data) => (await run(() => accessApi.addAccount(app.key, data))) && setForm(null)}
                />
              )}

              {app.accounts.length === 0 && form !== 'new' ? (
                <div className="text-sm at-muted">No test accounts yet.</div>
              ) : (
                <ul className="space-y-2">
                  {app.accounts.map((a) =>
                    form === a.id ? (
                      <li key={a.id}>
                        <AccountForm
                          initial={a}
                          editing
                          busy={busy}
                          onCancel={() => setForm(null)}
                          onSave={async (data) => (await run(() => accessApi.updateAccount(app.key, a.id, data))) && setForm(null)}
                        />
                      </li>
                    ) : (
                      <li key={a.id} className="at-card p-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="min-w-[12rem] flex-1">
                            <div className="font-bold text-sm break-all">{a.username}</div>
                            <div className="text-xs at-muted">
                              {[a.role, a.environment].filter(Boolean).join(' · ') || 'No role set'}
                            </div>
                          </div>
                          <CopyButton label="Username" title={`Copy username ${a.username}`} getText={async () => a.username} />
                          {a.hasPassword ? (
                            <>
                              <span className="text-sm tracking-widest at-muted" aria-label="Password hidden">••••••••</span>
                              <CopyButton label="Password" title="Copy password" getText={async () => (await accessApi.copyPassword(app.key, a.id)).password} onDone={() => accessApi.app(app.key).then(setApp).catch(() => {})} />
                            </>
                          ) : (
                            <span className="text-xs at-soft">No password saved</span>
                          )}
                          <button type="button" className="at-btn-ghost" onClick={() => setForm(a.id)} aria-label={`Edit ${a.username}`} title="Edit">
                            <Pencil className="w-3.5 h-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="at-btn-danger"
                            aria-label={`Remove ${a.username}`}
                            title="Remove"
                            onClick={() => window.confirm(`Remove the test account ${a.username}?`) && run(() => accessApi.deleteAccount(app.key, a.id))}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        </div>
                        {a.notes && <div className="text-xs mt-2">{a.notes}</div>}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * App Access: per application, whether it is a web or mobile app, its web URL or build folder link, and its test
 * accounts (username, encrypted password, role). Every signed-in user can view, edit and copy (D16).
 * Follows the shared Target Project List switch like the other tracker pages.
 */
export default function AppAccess() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(appFromUrl);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [showAll, setShowAll] = useState(false);
  const targets = useSharedTargets();
  const targetNames = activeTargetNames(targets);

  const load = useCallback(() => {
    accessApi.list().then(setApps).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const openApp = (key) => {
    setOpen(key);
    setAppInUrl(key);
  };

  const scoped = useMemo(() => {
    if (!apps) return [];
    const onList = targetNames && !showAll ? targetMatcher(targetNames) : null;
    return apps.filter((a) => !a.decommissioned && (!onList || onList(a.name)));
  }, [apps, targetNames, showAll]);
  const hidden = (apps?.filter((a) => !a.decommissioned).length || 0) - scoped.length;

  const shown = scoped.filter((a) => {
    if (kind === 'none' ? a.kind : kind && a.kind !== kind) return false;
    if (status === 'with' && !a.accounts) return false;
    if (status === 'without' && a.accounts) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![a.name, a.webUrl, a.buildUrl].some((v) => v && v.toLowerCase().includes(s))) return false;
    }
    return true;
  });
  const withAccounts = scoped.filter((a) => a.accounts > 0).length;

  return (
    <div className="at-root space-y-4">
      <div className="at-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <KeyRound className="w-5 h-5" style={{ color: 'var(--cs-primary)' }} aria-hidden />
        <h1 className="text-lg font-bold">App Access</h1>
        <span className="text-xs at-muted">Test accounts, web URLs and mobile build folders for each application.</span>
        {apps && (
          <span className="ml-auto text-xs at-muted">
            {withAccounts} of {scoped.length} apps have test accounts
          </span>
        )}
      </div>

      {error && <div className="at-alert at-alert--error">{error}</div>}

      <section className="cs-table-shell overflow-hidden">
        <div className="cs-filter-row px-4 py-3">
          <FilterSearch value={q} onChange={setQ} placeholder="Search app or URL…" />
          <FilterSelect icon={Layers} label="Type" value={kind} onChange={setKind} allLabel="All" options={[{ value: 'web', label: 'Web' }, { value: 'mobile', label: 'Mobile' }, { value: 'none', label: 'Not set' }]} />
          <FilterSelect icon={Filter} label="Accounts" value={status} onChange={setStatus} allLabel="All" options={[{ value: 'with', label: 'Has accounts' }, { value: 'without', label: 'No accounts' }]} />
          {targetNames && (hidden > 0 || showAll) && (
            <button type="button" className="at-btn-ghost ml-auto" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show target apps only' : `Show all apps (${hidden} hidden)`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="cs-data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Type</th>
                <th>Web URL / build folder</th>
                <th className="text-right">Test accounts</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {!apps && !error && (
                <tr><td colSpan={5} className="at-muted">Loading…</td></tr>
              )}
              {apps && shown.length === 0 && (
                <tr><td colSpan={5} className="at-muted">No applications match.</td></tr>
              )}
              {shown.map((a) => (
                <tr
                  key={a.key}
                  className="at-row"
                  tabIndex={0}
                  onClick={() => openApp(a.key)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openApp(a.key))}
                >
                  <td className="font-semibold">
                    {a.name}
                    {!a.onTargetList && <span className="at-tag ml-2 at-soft" title="Not on the Target Project List">Not on list</span>}
                  </td>
                  <td>
                    <KindTag kind={a.kind} />
                    {a.kind === 'mobile' && a.platform && <span className="text-xs at-muted ml-2">{PLATFORM_LABEL[a.platform]}</span>}
                  </td>
                  <td className="max-w-[360px]">
                    <OutLink href={a.kind === 'mobile' ? a.buildUrl : a.webUrl} />
                    {a.fromTracker && <span className="text-xs at-soft ml-2" title="From the Assessment Tracker; not saved here yet">· from tracker</span>}
                  </td>
                  <td className={cx('text-right tabular-nums', !a.accounts && 'at-soft')}>{a.accounts || '—'}</td>
                  <td className="text-xs at-muted whitespace-nowrap">{a.updatedBy ? `${a.updatedBy} · ${a.updatedAt.slice(0, 10)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <AccessDrawer
          appKey={open}
          onClose={() => openApp(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
