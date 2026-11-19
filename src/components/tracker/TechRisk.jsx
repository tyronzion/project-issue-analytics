import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ShieldAlert, Upload, Download, RefreshCcw, Gauge, ExternalLink, Info } from 'lucide-react';
import { FilterSearch, FilterSelect } from '../FilterChips';
import { analyzeWorkbook, analyzeApp, applyEndOfLifeRows, LIFECYCLE, OSV_PACKAGES, KB_AS_OF, SEV_ORDER, sevRank, vparse } from '../../../tracker/shared/techRisk.js';
import { SEVERITY_ACCENT, fmtDate, cx } from './ui.jsx';
import AdvisoryCheck from './AdvisoryCheck.jsx';
import './tracker.css';

// Severity colours: the Severity Scorecard accents, plus design-system tokens for Info and OK.
const SEV_COLOR = { ...SEVERITY_ACCENT, Info: 'var(--cs-muted)', OK: 'var(--at-good-ink)' };
const RISK_LABEL = { Info: 'Not assessed / info' };

function SevTag({ value }) {
  const c = SEV_COLOR[value] || 'var(--cs-muted)';
  return <span className="at-tag" style={{ color: c, borderColor: c }}>{value}</span>;
}

function Kpi({ label, hint, children }) {
  return (
    <article className="issues-kpi-card">
      <div>
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <strong className="tabular-nums">{children}</strong>
    </article>
  );
}

function Counts({ o, live = 0 }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {o.eolCount > 0 && <span className="at-badge at-badge--over">{o.eolCount} end of life</span>}
      {o.soonCount > 0 && <span className="at-badge at-badge--over">{o.soonCount} EOL soon</span>}
      {o.affected + live > 0 && <span className="at-badge" style={{ color: SEVERITY_ACCENT.Critical, borderColor: SEVERITY_ACCENT.Critical }}>{o.affected + live} vulnerable</span>}
      {o.possible > 0 && <span className="at-badge at-badge--under">{o.possible} to confirm</span>}
    </span>
  );
}

function TechTable({ techs }) {
  if (!techs.length) return <p className="text-sm at-muted">No versioned technologies were found for this repository.</p>;
  return (
    <div className="cs-table-shell overflow-x-auto">
      <table className="cs-data-table">
        <thead>
          <tr><th>Technology</th><th>Detected</th><th>Status</th><th>Security support ends</th><th>Latest</th><th>What to do</th></tr>
        </thead>
        <tbody>
          {[...techs].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)).map((t, i) => (
            <tr key={i}>
              <td className="font-bold">{t.tech}</td>
              <td className="tabular-nums">{t.detected}</td>
              <td><span className="flex flex-wrap items-center gap-1.5"><SevTag value={t.severity} /> {t.status}</span></td>
              <td className="whitespace-nowrap">{t.eol ? fmtDate(t.eol) : '—'}</td>
              <td className="tabular-nums">{t.latest || '—'}</td>
              <td>{t.rec}{t.note && <div className="text-xs at-muted">{t.note}</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VulnTable({ vulns }) {
  if (!vulns.length) return <p className="text-sm at-muted">No known vulnerabilities matched the versions in this repository.</p>;
  return (
    <div className="cs-table-shell overflow-x-auto">
      <table className="cs-data-table">
        <thead>
          <tr><th>CVE / advisory</th><th>Severity</th><th>Affects</th><th>Issue</th><th>Status</th><th>Fixed in</th></tr>
        </thead>
        <tbody>
          {[...vulns].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)).map((v, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">
                <a className="at-link font-bold" href={v.url} target="_blank" rel="noreferrer">{v.id}</a>
                {v.source !== 'Built-in' && <span className="at-tag ml-1.5" style={{ color: 'var(--cs-primary)', borderColor: 'var(--cs-primary)' }}>Live</span>}
              </td>
              <td><SevTag value={v.severity} />{v.cvss && <div className="text-xs at-muted tabular-nums">CVSS {v.cvss}</div>}</td>
              <td>{v.tech}<div className="text-xs at-muted">{v.detected}</div></td>
              <td>{v.title}</td>
              <td>{v.state}</td>
              <td className="tabular-nums">{v.fixed || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArchList({ fields }) {
  const list = fields.filter((f) => f.value && f.value !== '-');
  if (!list.length) return <p className="text-sm at-muted">No architecture details in the workbook.</p>;
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(140px,200px)_minmax(0,1fr)] mt-2">
      {list.map((f, i) => (
        <div key={i} className="contents">
          <dt className="at-muted">{f.label}</dt>
          <dd className="whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RepoAudit({ app, unit, index, total, live }) {
  const accent = SEV_COLOR[unit.risk];
  return (
    <section className="at-card p-4 space-y-3" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider at-soft">Repository {index + 1} of {total}</span>
        {unit.url ? (
          <a className="at-link font-bold inline-flex items-center gap-1" href={unit.url} target="_blank" rel="noreferrer">
            {unit.repo} <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        ) : (
          <span className="font-bold">{unit.repo}</span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <SevTag value={unit.risk} />
          {!unit.missing && <Counts o={unit} live={live.length} />}
        </span>
      </div>
      {unit.missing ? (
        <p className="text-sm at-muted">
          {unit.missingWhy ? `Not audited: ${unit.missingWhy}` : "Listed on the app row but has no details in the workbook (for example, the repository wasn't accessible), so it wasn't audited."}
        </p>
      ) : (
        <>
          {unit.combined && (
            <div className="at-alert at-alert--info text-xs">
              <Info className="w-4 h-4 shrink-0" aria-hidden />
              <span>The workbook doesn't separate these repositories, so they were audited together. Add a repository sheet with a "Used by App(s)" column, or start each line with the repository name, to audit them separately.</span>
            </div>
          )}
          {!unit.appLevel && !unit.combined && (
            <details className="text-xs">
              <summary className="cursor-pointer font-bold at-link">Repository details from the workbook</summary>
              <ArchList fields={unit.fields} />
            </details>
          )}
          <div>
            <div className="at-section-title">Technology support status</div>
            <TechTable techs={unit.techs} />
          </div>
          <div>
            <div className="at-section-title">Known vulnerabilities</div>
            <VulnTable vulns={[...unit.vulns, ...live]} />
          </div>
        </>
      )}
    </section>
  );
}

function AppRow({ app, open, liveFor }) {
  const accent = SEV_COLOR[app.risk];
  const pattern = (app.fields.find((f) => /pattern/i.test(f.label)) || app.fields.find((f) => /category/i.test(f.label)) || {}).value || '';
  const nRepos = app.units.filter((u) => !u.appLevel).length;
  const liveN = app.units.reduce((n, u) => n + liveFor(app.name, u.repo).length, 0);
  return (
    <details className="at-card" style={{ borderLeft: `5px solid ${accent}` }} open={open}>
      <summary className="cursor-pointer list-none px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-base font-bold">{app.name}</span>
        <span className="text-xs at-muted">
          {pattern && <>{pattern} · </>}
          {nRepos ? `${nRepos} ${nRepos === 1 ? 'repository' : 'repositories'} audited separately` : 'Audited at application level'} · {app.techs.length} technologies checked
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <SevTag value={app.risk} />
          {app.notAssessed ? <span className="at-badge at-badge--under">Not assessed</span> : <Counts o={app} live={liveN} />}
        </span>
      </summary>
      <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        {app.notAssessed && app.units.every((u) => u.appLevel || u.missing) ? (
          <p className="text-sm at-muted">Not assessed: the workbook has no repository or technology details for this app.</p>
        ) : (
          app.units.map((u, i) => <RepoAudit key={i} app={app} unit={u} index={i} total={app.units.length} live={liveFor(app.name, u.repo)} />)
        )}
        <details className="text-xs">
          <summary className="cursor-pointer font-bold at-link">Application architecture (from the workbook)</summary>
          <ArchList fields={app.fields} />
        </details>
      </div>
    </details>
  );
}

// Workbook rows for the export. One sheet per view, Repository column on every detail row.
function reportSheets(apps, liveFor, advisory) {
  const R = [...apps].sort((a, b) => sevRank(a.risk) - sevRank(b.risk) || a.name.localeCompare(b.name));
  const summary = [['Application', 'Overall risk (worst repository)', 'Repositories audited', 'Repositories (risk)', 'End-of-life technologies', 'EOL within 90 days', 'Confirmed vulnerable', 'To confirm (patch level)']];
  const repos = [['Application', 'Repository', 'URL', 'Risk', 'End-of-life technologies', 'EOL within 90 days', 'Confirmed vulnerable', 'To confirm (patch level)', 'Outdated technology', 'Vulnerabilities (confirmed)']];
  const techs = [['Application', 'Repository', 'Technology', 'Detected', 'Status', 'Severity', 'Security support ends', 'Latest', 'Recommendation', 'Note']];
  const vulns = [['Application', 'Repository', 'Technology', 'Detected', 'CVE', 'Severity', 'CVSS', 'Status', 'Issue', 'Fixed in', 'Source', 'Link']];
  for (const r of R) {
    const liveN = r.units.reduce((n, u) => n + liveFor(r.name, u.repo).length, 0);
    summary.push([r.name, r.notAssessed ? 'Not assessed' : r.risk, r.units.filter((u) => !u.appLevel && !u.missing).length, r.units.filter((u) => !u.appLevel).map((u) => `${u.repo} (${u.missing ? 'not audited' : u.risk})`).join('\n'), r.eolCount, r.soonCount, r.affected + liveN, r.possible]);
    for (const u of r.units) {
      const live = liveFor(r.name, u.repo);
      const all = [...u.vulns, ...live];
      repos.push([r.name, u.repo, u.url || '', u.missing ? 'Not audited' : u.risk, u.eolCount, u.soonCount, u.affected + live.length, u.possible,
        u.techs.filter((t) => t.severity !== 'OK').map((t) => `${t.detected} (${t.status})`).join('; '),
        all.filter((v) => v.state.startsWith('Affected') || v.source !== 'Built-in').map((v) => v.id).join(', ')]);
      for (const t of u.techs) techs.push([r.name, u.repo, t.tech, t.detected, t.status, t.severity, t.eol || '', t.latest || '', t.rec, t.note]);
      for (const v of all) vulns.push([r.name, u.repo, v.tech, v.detected, v.id, v.severity, v.cvss || '', v.state, v.title, v.fixed || '', v.source, v.url]);
    }
  }
  const labels = [];
  R.forEach((r) => r.fields.forEach((f) => { if (!labels.includes(f.label)) labels.push(f.label); }));
  const arch = [['Application', ...labels], ...R.map((r) => [r.name, ...labels.map((l) => r.fields.filter((f) => f.label === l).map((f) => f.value).join('\n'))])];
  return [
    ['App Risk Summary', summary, [28, 16, 12, 44, 12, 12, 12, 14]],
    ['Repository Audit', repos, [26, 30, 40, 12, 12, 12, 12, 14, 70, 45]],
    ['Outdated Technology', techs, [26, 30, 22, 24, 20, 11, 14, 12, 60, 40]],
    ['Vulnerabilities', vulns, [26, 30, 18, 22, 18, 11, 7, 30, 60, 22, 10, 45]],
    ['Architecture', arch, [28, ...labels.map(() => 40)]],
    ...(advisory?.rows.length ? [['Advisory Check', [['Advisory', 'Link', 'Application', 'Repository', 'Result', 'Severity', 'Product', 'Version found', 'Fix', 'Found in the workbook', 'Hosting', 'Why'],
      ...advisory.rows.map((r) => [advisory.advisory.title, advisory.advisory.url || '', r.app, r.repo, { affected: 'Affected', possible: 'Possibly affected', patched: 'Not affected (patched)' }[r.state], r.severity, r.product, r.version, r.fix, r.snippet, r.hosting, r.why])],
      [36, 36, 26, 28, 20, 10, 16, 12, 16, 60, 30, 24]]] : []),
  ];
}

/**
 * Tech Risk Analyzer (D17). Upload the application architecture workbook; every app is checked per repository for
 * end-of-life technology and versions with known CVEs. Runs in the browser; nothing is saved or sent to the server.
 * The Advisory check tab (D19) asks the server to read one public advisory page; the workbook still stays in the browser.
 * Logic and the built-in data live in tracker/shared/techRisk.js.
 */
export default function TechRisk() {
  const fileInput = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState('apps');
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState('');
  const [onlyFindings, setOnlyFindings] = useState(true);
  const [live, setLive] = useState({});
  const [liveMsg, setLiveMsg] = useState('');
  const [advisory, setAdvisory] = useState(null);

  const apps = parsed?.apps || [];
  const liveFor = (app, repo) => live[`${app}|${repo}`] || [];

  async function readFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }).map((r) => r.map((c) => String(c ?? ''))) }));
      const result = analyzeWorkbook(sheets);
      if (!result.apps.length) throw new Error('No applications were found in it.');
      setParsed(result);
      setFileName(file.name);
      setLive({});
      setLiveMsg('');
      setAdvisory(null);
    } catch (e) {
      setError(`Couldn't read ${file.name}: ${e.message || e}. Save it as an Excel workbook (.xlsx) or .csv and try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function checkLive() {
    if (!parsed) return;
    setLiveMsg('Checking endoflife.date and OSV.dev…');
    let eolOk = 0;
    await Promise.all(Object.entries(LIFECYCLE).map(async ([key, L]) => {
      try {
        const res = await fetch(`https://endoflife.date/api/${L.eolKey}.json`, { cache: 'no-store' });
        if (res.ok && applyEndOfLifeRows(key, await res.json())) eolOk++;
      } catch { /* blocked or offline: keep the built-in dates */ }
    }));
    // Re-run the audits with the refreshed dates.
    const fresh = eolOk ? { ...parsed, apps: parsed.apps.map((a) => analyzeApp({ name: a.name, fields: a.fields, unitSource: a.unitSource, units: a.units.map(({ repo, url, fields, text, missing, missingWhy, appLevel, combined }) => ({ repo, url, fields, text, missing, missingWhy, appLevel, combined })) })) } : parsed;
    // OSV.dev for every exact package version, per repository.
    const queries = [];
    const meta = [];
    for (const a of fresh.apps) for (const u of a.units) for (const t of u.techs) {
      const pkg = OSV_PACKAGES[t.product];
      const v = t.version?.min || t.version?.raw;
      if (pkg && v && /^\d+\.\d+\.\d+$/.test(v)) { queries.push({ package: { ecosystem: pkg[0], name: pkg[1] }, version: v }); meta.push({ app: a.name, unit: u, t, v }); }
    }
    let osvOk = false;
    let added = 0;
    const found = {};
    if (queries.length) {
      try {
        const res = await fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }) });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        osvOk = true;
        const details = {};
        for (let i = 0; i < data.results.length; i++) {
          const m = meta[i];
          for (const { id } of (data.results[i].vulns || []).slice(0, 25)) {
            if (!details[id]) { try { details[id] = await (await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`)).json(); } catch { details[id] = { id }; } }
            const d = details[id];
            const alias = (d.aliases || []).find((x) => x.startsWith('CVE-')) || id;
            if (m.unit.vulns.some((v) => v.id === alias)) continue;
            const sevTxt = d.database_specific?.severity || '';
            const severity = /CRITICAL/i.test(sevTxt) ? 'Critical' : /HIGH/i.test(sevTxt) ? 'High' : /LOW/i.test(sevTxt) ? 'Low' : 'Medium';
            let fixed = '';
            for (const af of d.affected || []) for (const rg of af.ranges || []) for (const ev of rg.events || []) if (ev.fixed && vparse(ev.fixed)[0] === vparse(m.v)[0]) fixed = ev.fixed;
            const key = `${m.app}|${m.unit.repo}`;
            (found[key] = found[key] || []).push({ id: alias, cvss: '', severity, title: d.summary || (d.details || '').slice(0, 160), state: m.t.version.exact ? 'Affected' : 'Possibly affected (declared range starts below fix)', fixed, url: `https://osv.dev/vulnerability/${id}`, tech: m.t.tech, detected: m.t.detected, source: 'OSV.dev' });
            added++;
          }
        }
      } catch { /* blocked or offline */ }
    }
    if (eolOk) setParsed(fresh);
    if (osvOk) setLive(found);
    setLiveMsg(!eolOk && !osvOk
      ? "endoflife.date and OSV.dev couldn't be reached from this browser (network or proxy). The built-in data is still used."
      : `${eolOk ? `Lifecycle dates refreshed for ${eolOk} products. ` : "endoflife.date couldn't be reached. "}${osvOk ? `OSV.dev added ${added} advisories for ${queries.length} exact package versions.` : queries.length ? "OSV.dev couldn't be reached." : 'No exact package versions to send to OSV.dev.'}`);
  }

  function exportReport() {
    const wb = XLSX.utils.book_new();
    for (const [name, rows, widths] of reportSheets(apps, liveFor, advisory)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `${fileName.replace(/\.(xlsx|xlsm|csv)$/i, '') || 'workbook'} - Tech Risk Report.xlsx`);
  }

  const counts = useMemo(() => {
    const c = {};
    apps.forEach((a) => { c[a.risk] = (c[a.risk] || 0) + 1; });
    return c;
  }, [apps]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => (risk ? a.risk === risk : !onlyFindings || (a.risk !== 'OK' && !a.notAssessed)))
      .filter((a) => !q || [a.name, ...a.fields.map((f) => f.value), ...a.units.map((u) => u.repo), ...a.techs.map((t) => `${t.tech} ${t.detected}`), ...a.vulns.map((v) => v.id)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => sevRank(a.risk) - sevRank(b.risk) || b.affected - a.affected || b.eolCount - a.eolCount || a.name.localeCompare(b.name));
  }, [apps, query, risk, onlyFindings]);

  const techRows = useMemo(() => {
    const map = new Map();
    for (const a of apps) for (const u of a.units) for (const t of u.techs) {
      const k = `${t.tech}|${t.detected}`;
      if (!map.has(k)) map.set(k, { t, uses: [] });
      const label = u.appLevel ? a.name : `${a.name} › ${u.repo}`;
      if (!map.get(k).uses.includes(label)) map.get(k).uses.push(label);
    }
    const q = query.trim().toLowerCase();
    return [...map.values()]
      .filter(({ t, uses }) => !q || `${t.tech} ${t.detected} ${uses.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => sevRank(a.t.severity) - sevRank(b.t.severity) || b.uses.length - a.uses.length);
  }, [apps, query]);

  const assessed = apps.filter((a) => !a.notAssessed);
  const repoAudits = apps.reduce((n, a) => n + a.units.filter((u) => !u.missing && !u.appLevel).length, 0);

  return (
    <div className="at-root space-y-4">
      <div className="at-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <ShieldAlert className="w-5 h-5" style={{ color: 'var(--cs-primary)' }} aria-hidden />
        <h1 className="text-lg font-bold">Tech Risk Analyzer</h1>
        <span className="text-xs at-muted">Per application and repository: architecture, out-of-support technology and versions with known vulnerabilities.</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
          <button type="button" className="at-btn" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload className="w-3.5 h-3.5" aria-hidden /> {parsed ? 'Choose another file' : 'Choose Excel file'}
          </button>
          <button type="button" className="at-btn-ghost" onClick={checkLive} disabled={!parsed}>
            <RefreshCcw className="w-3.5 h-3.5" aria-hidden /> Check live sources
          </button>
          <button type="button" className="at-btn-ghost" onClick={exportReport} disabled={!parsed}>
            <Download className="w-3.5 h-3.5" aria-hidden /> Export report (.xlsx)
          </button>
        </div>
      </div>

      {error && <div className="at-alert at-alert--error">{error}</div>}
      {liveMsg && <div className="at-alert at-alert--info"><Info className="w-4 h-4 shrink-0" aria-hidden /><span>{liveMsg}</span></div>}

      {!parsed ? (
        <section className="at-card p-5">
          <label
            className="at-dropzone"
            style={dragOver ? { borderColor: 'var(--cs-primary)' } : undefined}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files[0]); }}
          >
            <Upload className="w-6 h-6 at-soft" aria-hidden />
            <span className="text-sm font-bold">{busy ? 'Reading workbook…' : 'Drop the application architecture workbook here, or choose a file'}</span>
            <span className="text-xs at-muted">.xlsx or .csv · one row per app with an "App Name" column; a sheet with a "Used by App(s)" column gives one audit per repository</span>
            <input type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <p className="mt-3 text-xs at-muted">The file is read in your browser and isn't saved or uploaded. Built-in data as of {fmtDate(KB_AS_OF)}.</p>
        </section>
      ) : (
        <>
          <p className="text-xs at-muted">
            <b>{fileName}</b>: {apps.length} apps read from "{parsed.primarySheet}"
            {parsed.extraSheets.length > 0 && <>, with repository rows from "{parsed.extraSheets.join(', ')}"</>}.
            {parsed.headerless && ' No header row was found, so column A was used as the app name.'} Built-in data as of {fmtDate(KB_AS_OF)}.
          </p>

          <section className="at-kpi-grid">
            <Kpi label="Applications" hint={`${repoAudits} repository audits · ${assessed.length} apps with technology details`}>{apps.length}</Kpi>
            <Kpi label="Critical apps" hint="Worst repository rated Critical">{counts.Critical || 0}</Kpi>
            <Kpi label="End-of-life technology" hint="Apps with at least one unsupported version">{assessed.filter((a) => a.eolCount > 0).length}</Kpi>
            <Kpi label="Confirmed vulnerable" hint="Apps with a version a CVE affects">{assessed.filter((a) => a.affected > 0).length}</Kpi>
            <Kpi label="To confirm" hint="Patch level needed to rule a CVE out">{assessed.filter((a) => a.affected === 0 && a.possible > 0).length}</Kpi>
            <Kpi label="Not assessed" hint="No repository or technology details">{apps.length - assessed.length}</Kpi>
          </section>

          <section className="cs-table-shell overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-3" style={{ borderBottom: '1px solid var(--cs-border)' }}>
              <div className="flex gap-2" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={view === 'apps'} className={view === 'apps' ? 'at-btn' : 'at-btn-ghost'} onClick={() => setView('apps')}>By application</button>
                <button type="button" role="tab" aria-selected={view === 'tech'} className={view === 'tech' ? 'at-btn' : 'at-btn-ghost'} onClick={() => setView('tech')}>By technology</button>
                <button type="button" role="tab" aria-selected={view === 'advisory'} className={view === 'advisory' ? 'at-btn' : 'at-btn-ghost'} onClick={() => setView('advisory')}>Advisory check</button>
              </div>
              {view !== 'advisory' && <span className="ml-auto flex flex-wrap items-center gap-2">
                <FilterSearch value={query} onChange={setQuery} placeholder="Search apps, repos, technologies or CVEs…" wide />
                {view === 'apps' && (
                  <FilterSelect icon={Gauge} label="Risk" value={risk} onChange={setRisk} allLabel="All" options={SEV_ORDER.map((s) => ({ value: s, label: `${RISK_LABEL[s] || s} (${counts[s] || 0})` }))} />
                )}
              </span>}
              {view === 'apps' && !risk && (
                <label className="flex items-center gap-1.5 text-xs at-muted">
                  <input type="checkbox" checked={onlyFindings} onChange={(e) => setOnlyFindings(e.target.checked)} /> Only apps with findings
                </label>
              )}
            </div>

            {view === 'advisory' ? (
              <AdvisoryCheck apps={apps} SevTag={SevTag} onResult={setAdvisory} />
            ) : view === 'apps' ? (
              <div className="p-3 space-y-2">
                <p className="text-xs at-muted">Showing {list.length} of {apps.length} apps, most at risk first. An app's risk is the worst of its repositories.</p>
                {list.length ? list.map((a, i) => <AppRow key={a.name} app={a} open={i === 0} liveFor={liveFor} />) : <p className="p-6 text-center text-sm at-muted">No apps match these filters.</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="cs-data-table">
                  <thead>
                    <tr><th>Technology</th><th>Version</th><th>Status</th><th>Security support ends</th><th className="text-right">Repos</th><th>Used by (app › repository)</th></tr>
                  </thead>
                  <tbody>
                    {techRows.map(({ t, uses }) => (
                      <tr key={`${t.tech}|${t.detected}`}>
                        <td className="font-bold">{t.tech}</td>
                        <td className="tabular-nums">{t.detected}</td>
                        <td><span className="flex flex-wrap items-center gap-1.5"><SevTag value={t.severity} /> {t.status}</span></td>
                        <td className="whitespace-nowrap">{t.eol ? fmtDate(t.eol) : '—'}</td>
                        <td className="text-right tabular-nums">{uses.length}</td>
                        <td className="text-xs">{uses.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <details className={cx('at-card px-4 py-3 text-xs at-muted')}>
        <summary className="cursor-pointer font-bold">How is this worked out?</summary>
        <div className="mt-2 space-y-2 max-w-4xl">
          <p>
            The page finds the sheet with an app name column ("App Name", "Application"…); each row is an app. If another sheet has a "Used by App(s)" column, each of its rows is
            audited as a separate repository of those apps. Without one, the app's columns are split by lines that start with a repository name (for example
            "buzz-core: Laravel Lumen 6"); if the repositories can't be told apart they are audited together, with a note.
          </p>
          <p>
            Versions written in the text (PHP 7.4, Angular 21 (^21.2.6), CakePHP 2.10.24, MySQL 8, .NET Framework 4.8, compileSdk 29…) are checked against support lifecycles
            (endoflife.date and vendor policies) and a curated list of CVEs with their fixed versions (OSV.dev, NVD, vendor advisories). "End of life" means no more security
            fixes; "EOL soon" means within 90 days. With only a major version, or a range such as ^21.2.6, a CVE is "Possibly affected" until the installed patch is confirmed.
            Old fixes on floating image tags (for example postgres:16) show as a low-noise patch check.
          </p>
          <p>
            "Advisory check" takes the link to one vulnerability write-up. The server reads that page (public https sites only; nothing is saved) and the page
            proposes the products it names that also appear in your workbook, with the fixed versions written after "before", "prior to" or under "Fixed".
            You can correct them. Each app and repository naming a product is then Affected (version below the fix on its branch), Possibly affected (no version
            written, or a floating tag such as "stable") or Not affected. If a page can't be read, paste its text instead. The result is added to the export.
          </p>
          <p>
            "Check live sources" refreshes lifecycle dates from endoflife.date and asks OSV.dev about exact package versions, from your browser. The built-in list is not a
            full scanner: keep running Dependabot, <code>composer audit</code>, <code>npm audit</code> and <code>dotnet list package --vulnerable</code> on each repository.
          </p>
        </div>
      </details>
    </div>
  );
}
