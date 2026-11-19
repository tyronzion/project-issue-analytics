import { useState } from 'react';
import { GitCompare, FileDown } from 'lucide-react';
import { QUESTIONS, SECTIONS } from '../../../pia/shared/questions.js';
import { piaApi } from './api.js';

const Q = new Map(QUESTIONS.map((q) => [q.id, q]));
const SECTION = new Map(SECTIONS.map((s) => [s.id, s.title.replace(/^SECTION [IVX]+ - /, '')]));

// Yearly reassessment: compare the app's repositories with the last assessment, list the PIA answers that the
// changes affect, have a person confirm the answers code can't check, and download the new Word document
// (previous answers carried over from UberTicket). Then record the reassessment as before.
export default function ReassessmentPanel({ id, data, isAdmin, busy, act, onRecord }) {
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [note, setNote] = useState('');
  const check = data.lastCheck;
  const app = data.app;

  async function runCheck() {
    setChecking(true);
    setNote('');
    try { await act(() => piaApi.reassessmentCheck(id)); } finally { setChecking(false); }
  }
  async function download() {
    setDownloading(true);
    setNote('');
    await act(async () => {
      const { blob, fileName, matched } = await piaApi.reassessmentDocument(id, check.id, confirm);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote(`Downloaded ${fileName}: ${matched} of ${QUESTIONS.length} answers carried over from the previous PIA. Check it, file it in SharePoint, then record the reassessment with its link.`);
    });
    setDownloading(false);
  }

  if (!app.lastAssessed) return null;
  const changed = check?.questions?.filter((q) => q.status === 'changed') || [];
  const allConfirmed = data.manualQuestions.every((q) => confirm[q.id]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">Yearly reassessment</h3>
        {isAdmin && (
          <button type="button" className="at-btn ml-auto" disabled={busy || !data.githubRepos.length || !data.github.configured} onClick={runCheck}
            title={!data.githubRepos.length ? 'Link the app’s GitHub repository first' : `Compare the repositories with ${app.lastAssessed}`}>
            <GitCompare className={checking ? 'w-3.5 h-3.5 animate-pulse' : 'w-3.5 h-3.5'} aria-hidden /> {checking ? 'Checking…' : 'Check for changes'}
          </button>
        )}
      </div>
      <p className="text-xs at-muted">Compares the linked repositories with their state on the last assessment ({app.lastAssessed}): new personal-data fields, outside services, databases and privacy controls.</p>

      {check && (
        <div className="at-card space-y-3 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pia-rec pia-rec--${check.material ? 'warning' : 'success'} py-1 font-bold`}>
              {check.material ? `Changes found: ${changed.length} answer${changed.length === 1 ? '' : 's'} to review` : 'No material change since the last assessment'}
            </span>
            <span className="text-xs at-muted">Checked {check.checkedAt} by {check.checkedBy} · since {check.since}</span>
          </div>
          <ul className="text-xs">
            {check.repos.map((r) => (
              <li key={r.repo}>
                <b>{r.repo}</b>: {r.error ? <span className="at-alert at-alert--error inline-block py-0">{r.error}</span>
                  : r.newRepo ? 'created after the last assessment (all of it is new)'
                  : `${r.totalCommits} commits, ${r.changedFiles} files changed, ${r.relevantFiles.length} privacy-relevant${r.truncated ? ' (limits reached: review by hand)' : ''}`}
              </li>
            ))}
          </ul>
          {changed.length > 0 && (
            <div>
              <span className="at-label">Answers affected</span>
              {changed.map((c) => (
                <div key={c.id} className="pia-q pia-q--changed">
                  <span className="text-xs at-muted">{SECTION.get(Q.get(c.id).section)} · </span>{Q.get(c.id).text}
                  <ul className="pia-evidence">{c.evidenceLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <>
              <div>
                <span className="at-label">Not answerable from code: still true? ({data.manualQuestions.filter((q) => confirm[q.id]).length}/{data.manualQuestions.length})</span>
                <label className="pia-q flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={allConfirmed} onChange={(e) => setConfirm(Object.fromEntries(data.manualQuestions.map((q) => [q.id, e.target.checked])))} /> All of these are unchanged
                </label>
                {data.manualQuestions.map((q) => (
                  <label key={q.id} className="pia-q flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={!!confirm[q.id]} onChange={(e) => setConfirm({ ...confirm, [q.id]: e.target.checked })} /> {q.text}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="at-btn" disabled={busy || downloading} onClick={download}>
                  <FileDown className="w-3.5 h-3.5" aria-hidden /> {downloading ? 'Building…' : 'Download reassessment (Word)'}
                </button>
                <button type="button" className="at-btn-ghost" onClick={onRecord}>Record reassessment…</button>
              </div>
              <p className="text-xs at-muted">The document copies the previous PIA's answers from UberTicket{check.material ? ' and highlights the ones to update' : ''}. Unconfirmed questions are marked in it.</p>
            </>
          )}
          {note && <div className="at-alert at-alert--info">{note}</div>}
        </div>
      )}
    </section>
  );
}
