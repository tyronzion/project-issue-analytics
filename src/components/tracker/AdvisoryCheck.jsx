import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Link2, Search, Plus, X, Info, ExternalLink, Download } from 'lucide-react';
import { api } from './api.js';
import { inventoryTerms, extractAdvisory, checkApps, ADV_SEVERITIES } from '../../../tracker/shared/advisory.js';

const STATE_LABEL = { affected: 'Affected', possible: 'Possibly affected', patched: 'Not affected (patched)' };
const splitList = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);

// Excel file of the apps that need action: Affected and Possibly affected rows, plus what the check was based on.
function exportAffected(adv, rows) {
  const need = rows.filter((r) => r.state !== 'patched');
  const wb = XLSX.utils.book_new();
  const list = [['Application', 'Repository', 'Result', 'Severity', 'Product', 'Version found', 'Fix', 'Why', 'Found in the workbook', 'Hosting'],
    ...need.map((r) => [r.app, r.repo, STATE_LABEL[r.state], r.severity, r.product, r.version, r.fix, r.why, r.snippet, r.hosting])];
  const ws = XLSX.utils.aoa_to_sheet(list);
  ws['!cols'] = [26, 28, 20, 10, 16, 12, 18, 22, 60, 36].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: `A1:J${list.length}` };
  XLSX.utils.book_append_sheet(wb, ws, 'Affected apps');
  const chosen = adv.products.filter((p) => p.include && p.name);
  const about = [['Advisory', adv.title], ['Link', adv.url || ''], ['Severity', adv.severity], ['Source', adv.source || ''], ['Exported', new Date().toLocaleString()],
    ['Affected apps', new Set(need.filter((r) => r.state === 'affected').map((r) => r.app)).size], ['Possibly affected apps', new Set(need.filter((r) => r.state === 'possible').map((r) => r.app)).size],
    [], ['Product checked', 'Names looked for', 'Fixed in'], ...chosen.map((p) => [p.name, p.match.join(', '), p.fixed.join(', ')]),
    [], ['CVE', 'Where the advisory mentions it'], ...adv.cves.map((c) => [c.id, c.line])];
  const ws2 = XLSX.utils.aoa_to_sheet(about);
  ws2['!cols'] = [{ wch: 24 }, { wch: 90 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Advisory');
  const name = String(adv.title || 'Advisory').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  XLSX.writeFile(wb, `${name} - affected apps.xlsx`);
}

/**
 * Advisory check (D19): paste the link to one vulnerability write-up; the server reads the page (SSRF-guarded), the
 * browser proposes the products and fixed versions it names that also appear in the workbook, and every app and
 * repository is rated Affected / Possibly affected / Not affected. The proposal is editable; nothing is saved.
 */
export default function AdvisoryCheck({ apps, SevTag, onResult }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [adv, setAdv] = useState(null);
  const terms = useMemo(() => inventoryTerms(apps), [apps]);
  const rows = useMemo(() => (adv ? checkApps(apps, adv) : []), [apps, adv]);

  // The parent keeps the latest result for the Excel export.
  useEffect(() => { onResult?.(adv ? { advisory: adv, rows } : null); }, [adv, rows, onResult]);
  let nextId = 0;
  const newId = () => `p${Date.now()}-${nextId++}`;
  const publish = (a) => setAdv(a ? { ...a, products: a.products.map((p) => (p.id ? p : { ...p, id: newId() })) } : null);

  function analyse(pageText, meta) {
    const a = extractAdvisory(pageText, terms, { title: meta.title });
    const found = { ...a, url: meta.url || '', source: meta.source };
    if (!a.products.length) found.products = [{ name: '', match: [], fixed: [], include: true, mentions: 0, evidence: '' }];
    publish(found);
    if (!a.products.length) setError("None of the technologies in this workbook are named in the advisory. If that's wrong, type the product and its fixed versions below.");
  }

  async function readUrl(e) {
    e?.preventDefault();
    setError('');
    if (!/^https:\/\//i.test(url.trim())) return setError('Paste a full https:// link to the advisory.');
    setBusy(true);
    try {
      const page = await api.readAdvisory(url.trim());
      if (!page.text || page.text.length < 200) {
        setPaste(true);
        publish(null);
        setError("The page loaded but has almost no text (it's probably built by JavaScript). Open it, copy the text and paste it below.");
        return;
      }
      setPaste(false);
      analyse(page.text, { title: page.title, url: page.url, source: `Read from the page ${new Date(page.fetchedAt).toLocaleString()}` });
    } catch (err) {
      setPaste(true);
      publish(null);
      setError(`${err.message} You can paste the advisory's text below instead.`);
    } finally {
      setBusy(false);
    }
  }

  function readPasted() {
    setError('');
    if (text.trim().length < 50) return setError("Paste the advisory's text first.");
    analyse(text, { title: '', url: url.trim(), source: 'Read from pasted text' });
  }

  const update = (i, patch) => publish({ ...adv, products: adv.products.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const affectedApps = new Set(rows.filter((r) => r.state === 'affected').map((r) => r.app));
  const possibleApps = new Set(rows.filter((r) => r.state === 'possible' && !affectedApps.has(r.app)).map((r) => r.app));
  const patchedApps = new Set(rows.filter((r) => r.state === 'patched' && !affectedApps.has(r.app) && !possibleApps.has(r.app)).map((r) => r.app));
  const using = new Set(rows.map((r) => r.app));
  const chosen = (adv?.products || []).filter((p) => p.include && p.name);
  const safeLink = adv?.url && /^https:\/\//i.test(adv.url) ? adv.url : '';
  // Products with a fixed version (or ticked) first; other workbook words the advisory happens to use are folded away.
  const shown = (adv?.products || []).filter((p) => p.include || p.fixed.length || !p.mentions);
  const others = (adv?.products || []).filter((p) => !shown.includes(p));
  const needAction = rows.filter((r) => r.state !== 'patched').length;

  return (
    <div className="p-3 space-y-3">
      <form className="at-card p-4 space-y-2" onSubmit={readUrl}>
        <div className="at-section-title">Is any app affected by this vulnerability?</div>
        <p className="text-xs at-muted">Paste the link to the vulnerability details (vendor advisory, NVD, a security blog). The products and fixed versions it names are matched to every app and repository in this workbook.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="w-4 h-4 at-soft" aria-hidden />
          <input className="at-input flex-1 min-w-[16rem]" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://radar.cloudflare.com/zero-wire/nginx2root" aria-label="Advisory link" maxLength={2000} />
          <button type="submit" className="at-btn" disabled={busy}><Search className="w-3.5 h-3.5" aria-hidden /> {busy ? 'Reading…' : 'Check apps'}</button>
          {!paste && <button type="button" className="at-btn-ghost" onClick={() => setPaste(true)}>Paste text instead</button>}
        </div>
        {paste && (
          <div className="space-y-2">
            <textarea className="at-input w-full font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Open the advisory, select all, copy, and paste here" aria-label="Advisory text" maxLength={200000} />
            <button type="button" className="at-btn" onClick={readPasted}>Check apps against this text</button>
          </div>
        )}
        {error && <div className="at-alert at-alert--warn text-xs"><Info className="w-4 h-4 shrink-0" aria-hidden /><span>{error}</span></div>}
      </form>

      {adv && (
        <>
          <section className="at-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold">{adv.title}</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs at-muted">Severity
                <select className="at-input" value={adv.severity} onChange={(e) => publish({ ...adv, severity: e.target.value })}>{ADV_SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
            </div>
            <p className="text-xs at-muted">
              {safeLink && <><a className="at-link inline-flex items-center gap-1" href={safeLink} target="_blank" rel="noreferrer">{safeLink} <ExternalLink className="w-3 h-3" aria-hidden /></a> · </>}
              {adv.source}. Check the products and fixed versions below against the advisory; edits re-run the check.
            </p>
            <div className="cs-table-shell overflow-x-auto">
              <table className="cs-data-table">
                <thead><tr><th>Check</th><th>Product</th><th>Names to look for in the workbook</th><th>Fixed in (comma separated)</th><th>Where the advisory says so</th><th /></tr></thead>
                <tbody>
                  {shown.map((p) => { const i = adv.products.indexOf(p); return (
                    <tr key={p.id}>
                      <td><input type="checkbox" checked={!!p.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Check ${p.name}`} /></td>
                      <td><input className="at-input w-36" value={p.name} onChange={(e) => update(i, { name: e.target.value, match: p.match.length ? p.match : [e.target.value.toLowerCase()] })} aria-label="Product" /></td>
                      <td><input className="at-input w-44" defaultValue={p.match.join(', ')} onBlur={(e) => update(i, { match: splitList(e.target.value).map((x) => x.toLowerCase()) })} aria-label="Names to look for" /></td>
                      <td><input className="at-input w-44 tabular-nums" defaultValue={p.fixed.join(', ')} onBlur={(e) => update(i, { fixed: splitList(e.target.value).filter((x) => /^\d+(\.\d+)+$/.test(x)) })} aria-label="Fixed versions" /></td>
                      <td className="text-xs at-muted">{p.evidence || (p.mentions ? `Named ${p.mentions}×, no fixed version found` : '—')}</td>
                      <td><button type="button" className="at-btn-ghost" onClick={() => publish({ ...adv, products: adv.products.filter((_, k) => k !== i) })} title="Remove"><X className="w-3.5 h-3.5" aria-hidden /></button></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            {others.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer font-bold at-link">Also named in the advisory, without a fixed version ({others.length})</summary>
                <p className="mt-1 at-muted">Words from your workbook that the advisory also uses. Usually not the affected product; tick one to check it too.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {others.map((p) => (
                    <label key={p.id} className="at-check-option" title={p.evidence || ''}>
                      <input type="checkbox" className="w-4 h-4" checked={false} onChange={() => update(adv.products.indexOf(p), { include: true })} /> {p.name} <span className="at-soft">({p.mentions}×)</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
            <button type="button" className="at-btn-ghost" onClick={() => publish({ ...adv, products: [...adv.products, { name: '', match: [], fixed: [], include: true, mentions: 0, evidence: '' }] })}>
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add product
            </button>
            {adv.cves.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer font-bold at-link">CVEs in the advisory ({adv.cves.length})</summary>
                <ul className="mt-2 space-y-1">{adv.cves.map((c) => <li key={c.id}><b className="tabular-nums">{c.id}</b> <span className="at-muted">{c.line}</span></li>)}</ul>
              </details>
            )}
          </section>

          <section className="at-kpi-grid">
            {[['Affected', affectedApps.size, 'Version below the fix'], ['Possibly affected', possibleApps.size, 'Product used, version to confirm'], ['Patched', patchedApps.size, 'On a fixed version'], ["Don't use it", apps.length - using.size, chosen.map((p) => p.name).join(', ') || 'No product selected']].map(([l, n, h]) => (
              <article key={l} className="issues-kpi-card"><div><span>{l}</span><small>{h}</small></div><strong className="tabular-nums">{n}</strong></article>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <span className="at-section-title" style={{ marginBottom: 0 }}>Apps that use it ({using.size})</span>
            <button type="button" className="at-btn ml-auto" onClick={() => exportAffected(adv, rows)} disabled={!needAction} title={needAction ? 'Affected and possibly affected apps, with the advisory details' : 'No affected or possibly affected apps'}>
              <Download className="w-3.5 h-3.5" aria-hidden /> Export affected apps (.xlsx)
            </button>
          </div>
          <div className="cs-table-shell overflow-x-auto">
            <table className="cs-data-table">
              <thead><tr><th>Application</th><th>Repository</th><th>Result</th><th>Found in the workbook</th><th>Fix</th><th>Hosting</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-bold">{r.app}</td>
                    <td>{r.repo}</td>
                    <td><span className="flex flex-wrap items-center gap-1.5"><SevTag value={r.severity} /> {STATE_LABEL[r.state]}</span>{r.why && <div className="text-xs at-muted">{r.why}</div>}</td>
                    <td>{r.product}{r.version && <span className="tabular-nums"> {r.version}</span>}<div className="text-xs at-muted">{r.snippet}</div></td>
                    <td className="tabular-nums">{r.fix || '—'}</td>
                    <td className="text-xs">{r.hosting || '—'}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-sm at-muted">{chosen.length ? `No app in this workbook names ${chosen.map((p) => p.name).join(' or ')}. A product that isn't written in the workbook can't be found.` : 'Tick a product above to check the apps.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs at-muted">Possibly affected means the workbook names the product without a version (or with a floating tag such as "stable"): check the real version in the image or on the server. Also confirm the conditions the advisory gives (for example a feature that must be enabled) before rating an app.</p>
        </>
      )}
    </div>
  );
}
