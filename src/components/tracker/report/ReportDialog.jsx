import { useEffect, useMemo, useState } from 'react';
import { X, FileDown, AlertTriangle, Link2, Lock, Unlock } from 'lucide-react';
import { buildReport, reportFileName, normalizeReportInfo, isWebUrl, REPORT_DEFAULTS, reportAsOf, snapshotFor, needsSnapshot } from '../../../../tracker/shared/report.js';
import { api } from '../api.js';
import { SealBadge } from '../ui.jsx';
import { openReportTab, showReport, longDate } from './renderReport.js';
import { loadJiraIntegrationProfile } from '../../../utils/storage';

const todayIso = () => new Date().toLocaleDateString('en-CA');

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="at-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs at-muted">{hint}</span>}
    </label>
  );
}

// Asks for the report's links and text (saved with the assessment), shows what the report will say,
// then opens the print-ready report so it can be saved as PDF.
// Resolved ticket: the issues are frozen as of the resolution date (snapshot saved once, reused for every
// later download). Open ticket: live issues, frozen once the ticket resolves.
export default function ReportDialog({ row, cycleYear, reportIssuesFor, isAdmin, onClose, onSaved }) {
  const kind = row.ticketSource === 'roe' ? 'roe' : 'full';
  const [info, setInfo] = useState(() => ({ ...(kind === 'roe' ? REPORT_DEFAULTS : {}), ...(row.reportInfo || {}) }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setInfo((i) => ({ ...i, [k]: e.target.value }));
  // Jira site for issue-key links: the server's JIRA_BASE_URL, else this browser's Jira profile.
  const [jiraBase, setJiraBase] = useState('');
  useEffect(() => {
    let alive = true;
    const fallback = () => {
      try {
        return new URL(loadJiraIntegrationProfile().baseUrl).origin;
      } catch {
        return '';
      }
    };
    fetch('/api/jira/site').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      .then((d) => alive && setJiraBase(d?.baseUrl || fallback()));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = todayIso();
  const frozen = snapshotFor(row);
  const pending = needsSnapshot(row);
  const asOf = frozen ? frozen.asOf : reportAsOf(row, today);
  const issues = useMemo(() => {
    if (frozen) return { matched: true, issues: frozen.issues };
    if (!reportIssuesFor) return { matched: false, issues: [] };
    return reportIssuesFor(row.project, asOf === today ? undefined : asOf);
  }, [frozen, reportIssuesFor, row.project, asOf, today]);

  const report = useMemo(
    () => (issues ? buildReport({ assessment: { ...row, reportInfo: info }, issues: issues.issues, today: asOf }) : null),
    [row, info, issues, asOf]
  );

  async function unfreeze() {
    if (!window.confirm(`Unfreeze this report? The issues will be read again as of ${longDate(row.actualEnd)} and frozen at the next download.`)) return;
    setError('');
    try {
      onSaved(await api.unfreezeReport(row.id));
    } catch (e) {
      setError(e.message);
    }
  }
  const missingLinks = [!isWebUrl(info.dashboardUrl) && 'Security Dashboard', !isWebUrl(info.scanResultsUrl) && 'Scan Results'].filter(Boolean);

  async function download() {
    setError('');
    let clean;
    try {
      clean = normalizeReportInfo(info);
    } catch (e) {
      return setError(e.message);
    }
    if (missingLinks.length && !window.confirm(`The ${missingLinks.join(' and ')} link${missingLinks.length > 1 ? 's are' : ' is'} empty. The report will say "Not provided". Continue?`)) return;
    const tab = openReportTab();
    if (!tab) return setError('The browser blocked the report tab. Allow pop-ups for this site and try again.');
    setBusy(true);
    try {
      let saved = row;
      if (JSON.stringify(clean) !== JSON.stringify(row.reportInfo ?? null)) {
        saved = await api.updateAssessment(row.id, { reportInfo: clean });
        onSaved(saved);
      }
      // First download after resolution freezes the issues (the server keeps an existing snapshot).
      let used = frozen ? frozen.issues : issues.issues;
      let usedAsOf = asOf;
      if (pending && issues.matched) {
        saved = await api.captureReport(row.id, { ticketKey: row.ticketKey, asOf, issues: issues.issues });
        onSaved(saved);
        const snap = snapshotFor(saved);
        if (snap) [used, usedAsOf] = [snap.issues, snap.asOf];
      }
      const final = buildReport({ assessment: { ...row, reportInfo: saved.reportInfo }, issues: used, today: usedAsOf });
      showReport(tab, final, reportFileName(final, cycleYear), { jiraBase });
      onClose();
    } catch (e) {
      tab.close();
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="at-overlay" style={{ justifyContent: 'center', alignItems: 'center', zIndex: 60, padding: 16 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="at-card at-root flex w-full flex-col" style={{ maxWidth: '40rem', maxHeight: '100%' }} role="dialog" aria-label="Download assessment report">
        <div className="flex items-start gap-3 p-4" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-xs at-muted">{kind === 'roe' ? 'Rules of Engagement summary report' : 'Security Full Assessment report'}</div>
            <h2 className="truncate text-lg font-bold">{row.project}</h2>
          </div>
          <button type="button" onClick={onClose} className="at-btn-ghost" title="Close"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {frozen && (
            <div className="at-alert at-alert--info">
              <Lock className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <b>Frozen at resolution of {frozen.ticketKey}.</b> Issues as of {longDate(frozen.asOf)} ({frozen.issues.length} unresolved then). Changes to issues after that don't affect this report.
                <div className="text-xs at-muted">Saved {frozen.capturedAt?.slice(0, 10)}{frozen.capturedBy ? ` by ${frozen.capturedBy}` : ''}.</div>
              </div>
              {isAdmin && (
                <button type="button" onClick={unfreeze} className="at-btn-ghost" title="Admins: read the issues again as of the resolution date">
                  <Unlock className="w-4 h-4" aria-hidden /> Unfreeze
                </button>
              )}
            </div>
          )}
          {pending && (
            <div className="at-alert at-alert--info">
              <Lock className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              <div>{row.ticketKey} is resolved: this report will be frozen with the issues as of {longDate(asOf)} when you download it.</div>
            </div>
          )}
          {!frozen && !pending && row.ticketKey && row.ticketState !== 'resolved' && (
            <div className="at-alert at-alert--info">Live report: it uses today's issues until {row.ticketKey} is resolved, then it is frozen.</div>
          )}
          {!issues && <div className="at-alert at-alert--info">Issues are still loading…</div>}
          {issues && !issues.matched && (
            <div className="at-alert at-alert--warn">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              <div>No project in Security Issues Analytics matches <b>{row.project}</b>, so the report would show no issues and a Secure seal. Check the project name or the Target Project List first.</div>
            </div>
          )}
          {report && (
            <section className="at-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <SealBadge value={report.seal} />
                <span className="at-muted">
                  {report.counts.unresolved} unresolved · {report.counts.new} new · {report.counts.backlog} backlog · {report.counts.overdue} overdue
                </span>
              </div>
              {!jiraBase && <div className="mt-1 text-xs at-muted">Issue keys won't be links: the Jira site isn't known (set JIRA_BASE_URL on the server, or connect Jira on the Jira page).</div>}
              <div className="mt-1 text-xs at-muted">
                New = created between {report.start ? longDate(report.start) : '(no start date)'} and {longDate(report.end)}{row.ticketKey ? ` (${row.ticketKey})` : ''}.
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="at-section-title inline-flex items-center gap-1.5"><Link2 className="w-4 h-4" aria-hidden /> Artifacts <span className="font-normal at-muted">(recommended)</span></h3>
            <Field label="Security Dashboard link">
              <input type="url" value={info.dashboardUrl ?? ''} onChange={set('dashboardUrl')} placeholder="https://…" className="at-input w-full" autoFocus />
            </Field>
            <Field label="Scan Results link">
              <input type="url" value={info.scanResultsUrl ?? ''} onChange={set('scanResultsUrl')} placeholder="https://…" className="at-input w-full" />
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="at-section-title">Report text</h3>
            <Field label="Introduction" hint="What the application does, in one or two sentences.">
              <textarea rows={3} value={info.intro ?? ''} onChange={set('intro')} className="at-input w-full" />
            </Field>
            {kind === 'roe' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Type of testing"><input value={info.testingType ?? ''} onChange={set('testingType')} className="at-input w-full" /></Field>
                  <Field label="Time of testing"><input value={info.testingTime ?? ''} onChange={set('testingTime')} className="at-input w-full" /></Field>
                </div>
                <Field label="Recommendations" hint={'One per line, "Title: description". Left empty, general recommendations are used.'}>
                  <textarea rows={4} value={info.recommendations ?? ''} onChange={set('recommendations')} placeholder="Disable Directory Listing: Prevent directory browsing to restrict unauthorized access to application files." className="at-input w-full" />
                </Field>
              </>
            )}
            <Field label="Additional notes (optional)" hint="Shown after the advisory, e.g. an Important Note about scope. Separate paragraphs with a blank line.">
              <textarea rows={3} value={info.notes ?? ''} onChange={set('notes')} className="at-input w-full" />
            </Field>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3" style={{ borderTop: '1px solid var(--cs-border)' }}>
          {error && <span className="text-sm" style={{ color: 'var(--color-feedback-danger)' }}>{error}</span>}
          <span className="ml-auto text-xs at-muted">Saved with the assessment for everyone.</span>
          <button type="button" onClick={onClose} className="at-btn-ghost">Cancel</button>
          <button type="button" onClick={download} disabled={busy || !issues} className="at-btn">
            <FileDown className="w-4 h-4" aria-hidden /> {busy ? 'Preparing…' : 'Save & download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
