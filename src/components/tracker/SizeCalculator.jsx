import { useMemo, useState } from 'react';
import { Calculator, Copy, Check, RotateCcw, Info } from 'lucide-react';
import { SIZE_FACTORS, SIZE_MODELS, SIZE_BANDS, COMPLEXITY_GUIDE, TEST_TYPES, TEST_DURATION, HOURS_PER_DAY, calculateSize, sizeSummary } from '../../../tracker/shared/sizing.js';
import { PriorityTag, SEVERITY_ACCENT, cx } from './ui.jsx';
import './tracker.css';

const pctText = (x) => `${Math.round(x * 1000) / 10}%`;
const pts = (x) => Math.round(x * 1000) / 10;

/**
 * Web Application Size Calculator (the Strike Team's SharePoint workbook as a page).
 * Read-only for everyone: nothing is saved. Logic and the adjusted matrix live in tracker/shared/sizing.js.
 */
export default function SizeCalculator() {
  const [appName, setAppName] = useState('');
  const [answers, setAnswers] = useState({});
  const [model, setModel] = useState('adjusted');
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => calculateSize(answers, model), [answers, model]);
  const other = useMemo(() => calculateSize(answers, model === 'adjusted' ? 'workbook' : 'adjusted'), [answers, model]);
  const summary = useMemo(() => sizeSummary(answers, { appName, model }), [answers, appName, model]);
  const factors = SIZE_FACTORS.filter((f) => f.weights[model] > 0);
  const accent = SEVERITY_ACCENT[result.size];

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text can still be selected by hand */
    }
  }

  return (
    <div className="at-root space-y-4">
      <div className="at-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Calculator className="w-5 h-5" style={{ color: 'var(--cs-primary)' }} aria-hidden />
        <h1 className="text-lg font-bold">Web Application Size Calculator</h1>
        <span className="text-xs at-muted">Gives the application size (= tracker priority) and the test duration.</span>
        <div className="ml-auto flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Scoring matrix">
          {Object.entries(SIZE_MODELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={model === key}
              className={model === key ? 'at-btn' : 'at-btn-ghost'}
              onClick={() => setModel(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] items-start">
        {/* Inputs */}
        <div className="at-card p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[220px]">
              <span className="at-label">Application name (optional, used in the summary)</span>
              <input className="at-input w-full" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. StaffCentral" />
            </label>
            <button
              type="button"
              className="at-btn-ghost"
              onClick={() => {
                setAnswers({});
                setAppName('');
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Reset
            </button>
          </div>

          {factors.map((f) => {
            const value = answers[f.key] || '';
            const score = result.breakdown.find((b) => b.key === f.key);
            return (
              <div key={f.key} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center py-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <div>
                  <div className="text-sm font-bold">
                    {f.label} <span className="text-xs font-semibold at-soft">· up to {pts(f.weights[model])} pts</span>
                  </div>
                  <div className="text-xs at-muted">{f.help}</div>
                  {f.key === 'functionality' && COMPLEXITY_GUIDE[value] && <div className="text-xs mt-1">{COMPLEXITY_GUIDE[value]}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="at-input flex-1"
                    value={value}
                    aria-label={f.label}
                    onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <span className="w-12 text-right text-xs font-bold tabular-nums">{value ? pts(score.score) : '—'}</span>
                </div>
              </div>
            );
          })}

          <details className="text-xs at-muted pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            <summary className="cursor-pointer font-bold">Functionality guide</summary>
            <ul className="mt-2 space-y-1.5">
              {Object.entries(COMPLEXITY_GUIDE).map(([k, v]) => (
                <li key={k}><b>{k}:</b> {v}</li>
              ))}
            </ul>
          </details>
        </div>

        {/* Result */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="at-size-card" style={{ '--size-accent': accent }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold at-muted uppercase tracking-wider">Application size</span>
              <span className="text-xs at-muted">{result.answered}/{result.breakdown.length} answered</span>
            </div>
            <span className="at-big" style={{ color: accent }}>{result.size}</span>
            <div className="text-sm">
              Score <b>{pctText(result.total)}</b> · {TEST_DURATION[result.size].rating} rating
            </div>
            <div className="at-strip" aria-hidden>
              {SIZE_BANDS.map((b, i) => (
                <div
                  key={b.size}
                  className="at-strip-est"
                  style={{ left: `${(i ? SIZE_BANDS[i - 1].max : 0) * 100}%`, width: `${(b.max - (i ? SIZE_BANDS[i - 1].max : 0)) * 100}%`, borderColor: b.size === result.size ? accent : undefined }}
                />
              ))}
              <div className="at-strip-avg" style={{ left: `${Math.min(result.total, 1) * 100}%` }} />
            </div>
            <div className="at-strip-axis">
              {SIZE_BANDS.map((b) => (
                <span key={b.size}>{b.size}</span>
              ))}
            </div>
            <table className="w-full mt-3 text-sm" aria-label="Test duration">
              <caption className="text-left text-xs font-bold at-muted pb-1">
                Test duration · incl. documentation, {HOURS_PER_DAY}-hour working day
              </caption>
              <tbody>
                {TEST_TYPES.map((t) => {
                  const [lo, hi] = TEST_DURATION[result.size][t.key];
                  return (
                    <tr key={t.key} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                      <td className="py-1.5">{t.label}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums">{lo}–{hi} hrs</td>
                      <td className="py-1.5 pl-3 text-right text-xs at-muted tabular-nums">{lo / HOURS_PER_DAY}–{hi / HOURS_PER_DAY} days</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {result.answered > 0 && other.size !== result.size && (
              <div className="at-alert at-alert--info mt-3 text-xs">
                <Info className="w-4 h-4 shrink-0" aria-hidden />
                <span>
                  The {other.model === 'workbook' ? 'Strike Team workbook' : 'adjusted matrix'} gives <PriorityTag value={other.size} /> ({pctText(other.total)})
                  {model === 'adjusted' ? ', because it does not count user base and weighs functionality and pages more.' : '.'}
                </span>
              </div>
            )}
          </div>

          <div className="at-card">
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="at-section-title mb-0">Assessment summary</div>
              <button type="button" className="at-btn-ghost" onClick={copySummary} disabled={!result.answered}>
                {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {result.answered ? (
              <textarea readOnly className={cx('at-input w-full block')} style={{ margin: 0, border: 0, borderRadius: 0, minHeight: 400, fontSize: 12.5, lineHeight: 1.55 }} value={summary} />
            ) : (
              <p className="px-4 pb-4 pt-2 text-sm at-muted">Answer the questions to get a summary of why the app has its size, ready to paste into the assessment notes or report.</p>
            )}
            {result.answered > 0 && !result.complete && (
              <p className="px-4 pb-3 text-xs" style={{ color: 'var(--at-warn-ink)' }}>Answer every factor before using the summary: unanswered factors count as zero.</p>
            )}
          </div>

          <details className="at-card px-4 py-3 text-xs at-muted">
            <summary className="cursor-pointer font-bold">How is this calculated?</summary>
            <p className="mt-2">
              Each factor scores its weight × (answer position ÷ last answer), as in the Strike Team workbook. The total out of 100 gives the size: up to 25%
              Low, up to 50% Medium, up to 75% High, above 75% Critical.
            </p>
            <table className="cs-data-table mt-2">
              <thead>
                <tr><th>Factor</th><th>Workbook</th><th>Adjusted</th></tr>
              </thead>
              <tbody>
                {SIZE_FACTORS.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td className="tabular-nums">{pts(f.weights.workbook)}%</td>
                    <td className="tabular-nums">{pts(f.weights.adjusted)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2">
              The adjusted matrix counts the workbook's unused User base answer (a standard impact factor in the OWASP Risk Rating) and moves 5% each from
              Functionality and Pages to pay for it. Across every possible answer set it agrees with the workbook 86% of the time and is never more than one size apart.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
