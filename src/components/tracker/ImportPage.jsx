import { useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { TRACKS } from '../../../tracker/shared/logic.js';
import { api } from './api.js';

export default function ImportPage({ cycles, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function choose(f) {
    setFile(f);
    setPreview(null);
    setMsg('');
    if (!f) return;
    setBusy(true);
    try {
      const p = await api.previewImport(f);
      setPreview(p);
      setSelected(p.filter((c) => c.year === Math.max(...p.map((x) => x.year))).map((c) => c.key));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    const replacing = preview.filter((c) => selected.includes(c.key) && cycles.some((x) => `${x.track}:${x.year}` === c.key));
    if (replacing.length && !window.confirm(`This replaces all current data (including edits made in the app) for: ${replacing.map((c) => `${c.year} ${TRACKS[c.track].label}`).join(', ')}. UberTicket data is re-synced afterwards. Continue?`)) return;
    setBusy(true);
    try {
      const res = await api.runImport(file, selected);
      setMsg(`Imported ${res.map((r) => `${r.imported} apps into ${r.year} ${TRACKS[r.track].label}`).join(', ')}.`);
      onImported();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <section className="at-card p-5">
        <h2 className="text-lg font-bold">Import from Excel</h2>
        <p className="mt-1 text-sm at-muted">
          Upload the Security Full Assessment Tracker workbook. Every <i>"&lt;year&gt; Bi Annual Full assessment"</i> and <i>"&lt;year&gt; Quarterly Full assessment"</i> sheet is read, together with its linked checklist sheet.
        </p>
        <label className="at-dropzone mt-4">
          <Upload className="w-6 h-6 at-soft" aria-hidden />
          <span className="text-sm font-bold">{file ? file.name : 'Choose an .xlsx file'}</span>
          <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => choose(e.target.files[0])} />
        </label>
        {busy && <p className="mt-3 text-sm at-muted">Reading workbook…</p>}
        {msg && <p className="mt-3 text-sm font-bold">{msg}</p>}
      </section>

      {preview && (
        <section className="at-card p-5">
          <h3 className="font-bold">Found in this workbook</h3>
          <ul className="mt-3 space-y-3">
            {preview.map((c) => (
              <li key={c.key} className="at-card p-3" style={{ boxShadow: 'none' }}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 w-4 h-4" checked={selected.includes(c.key)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.key] : s.filter((x) => x !== c.key)))} />
                  <div className="flex-1">
                    <div className="font-bold">{c.year} {TRACKS[c.track].label} <span className="font-normal at-muted">· sheet "{c.sheet.trim()}" · {c.rows} apps</span></div>
                    <div className="text-xs at-muted">{Object.entries(c.byPeriod).map(([p, n]) => `${p}: ${n}`).join(' · ')}</div>
                    {c.mismatches.length > 0 && (
                      <div className="at-alert at-alert--warn mt-2 flex-col text-xs">
                        <div className="flex items-center gap-1 font-bold"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Status typed by hand in Excel differs from the formula for {c.mismatches.length} app(s); the formula is used (UberTicket overrides both once linked):</div>
                        <ul className="list-disc pl-5">
                          {c.mismatches.map((m) => <li key={m.project + m.period}>{m.project} ({m.period}): Excel "{m.excel}", formula "{m.app}"</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={run} disabled={busy || !selected.length} className="at-btn mt-4">
            Import {selected.length} cycle{selected.length === 1 ? '' : 's'}
          </button>
        </section>
      )}
    </div>
  );
}
