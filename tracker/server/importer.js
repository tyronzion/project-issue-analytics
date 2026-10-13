import XLSX from 'xlsx';
import { CHECKS, TRACKS, enrich, normalizePriority, normalizeSeal } from '../shared/logic.js';

// Full-assessment sheets the importer recognises, e.g. "2026 Bi Annual Full assessment".
const SHEET_PATTERNS = [
  { track: 'biannual', re: /^(\d{4})\s+bi[\s-]?annual\s+full\s+assessment\s*$/i },
  { track: 'quarterly', re: /^(\d{4})\s+quarterly\s+full\s+assessment\s*$/i },
];

const HEADERS = {
  project: /^project$/,
  quarter: /^quarter$/,
  isActive: /^is active$/,
  classification: /^classification$/,
  repositories: /^repositor/,
  testingUrl: /^testing url$/,
  priority: /^priority$/,
  baAssigned: /^ba assigned$/,
  securityTester: /^security tester$/,
  coTester: /^co-?tester$/,
  app: /^app$/,
  dependabots: /^dependabot/,
  codeReview: /^code review$/,
  report: /^report$/,
  status: /^status$/,
  plannedStart: /^planned start/,
  plannedEnd: /^planned end/,
  actualStart: /^actual start/,
  actualEnd: /^actual end/,
  timeSpent: /^time spent/,
  seal: /^seal$/,
};

const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function periodFromSection(label, track) {
  const s = label.toLowerCase();
  const periods = TRACKS[track].periods;
  if (track === 'biannual') return s.includes('2nd') || s.includes('second') ? periods[1] : periods[0];
  const n = s.match(/^(\d)/);
  return n ? periods[Number(n[1]) - 1] : null;
}

function toIsoDate(cell) {
  if (!cell || cell.v === '' || cell.v == null) return null;
  if (typeof cell.v === 'number') {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (!d || d.y < 1990) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const t = Date.parse(String(cell.v));
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readChecklistRow(ws, row) {
  const checks = {};
  CHECKS.forEach((c, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: 1 + i })];
    checks[c.key] = cell?.v === true || String(cell?.v).toUpperCase() === 'TRUE';
  });
  const mobile = ws[`N${row}`];
  return { checks, mobileApp: mobile?.v === true || String(mobile?.v).toUpperCase() === 'TRUE' };
}

function parseSheet(wb, sheetName, track) {
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const col = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = norm(ws[XLSX.utils.encode_cell({ r: 0, c })]?.v).toLowerCase();
    for (const [key, re] of Object.entries(HEADERS)) if (col[key] === undefined && re.test(h)) col[key] = c;
  }
  if (col.project === undefined || col.priority === undefined) throw new Error(`"${sheetName}": missing Project/Priority headers`);

  const cell = (r, key) => (col[key] === undefined ? undefined : ws[XLSX.utils.encode_cell({ r, c: col[key] })]);
  const val = (r, key) => norm(cell(r, key)?.w ?? cell(r, key)?.v);

  const rows = [];
  let period = TRACKS[track].periods[0];
  for (let r = 1; r <= range.e.r; r++) {
    const project = val(r, 'project');
    if (!project) continue;
    const priority = val(r, 'priority');
    if (!priority && /half|quarter/i.test(project)) {
      period = periodFromSection(project, track) || period;
      continue;
    }

    // The "App" formula points at this app's checklist row: COUNTIF('<checklist>'!B<n>:M<n>, TRUE)
    let checks = {};
    let mobileApp = false;
    const appCell = cell(r, 'app');
    const m = appCell?.f?.match(/'([^']+)'!\$?B\$?(\d+):\$?M/);
    if (m && wb.Sheets[m[1]]) ({ checks, mobileApp } = readChecklistRow(wb.Sheets[m[1]], Number(m[2])));
    else if (val(r, 'app') === 'Uploaded') checks = Object.fromEntries(CHECKS.map((c) => [c.key, true]));

    const active = val(r, 'isActive');
    rows.push({
      period,
      sortOrder: rows.length,
      project,
      quarter: val(r, 'quarter') || null,
      isActive: !active ? null : /decom/i.test(active) ? 'Decommissioned' : 'Active',
      classification: val(r, 'classification') || null,
      repositories: String(cell(r, 'repositories')?.v ?? '').replace(/\r/g, '').trim() || null,
      testingUrl: String(cell(r, 'testingUrl')?.v ?? '').replace(/\r/g, '').trim() || null,
      priority: normalizePriority(priority) || priority,
      baAssigned: val(r, 'baAssigned') || null,
      securityTester: val(r, 'securityTester') || null,
      coTester: val(r, 'coTester') || null,
      checks,
      mobileApp,
      dependabots: val(r, 'dependabots') || 'Not Started',
      codeReview: val(r, 'codeReview') || 'Not Started',
      report: val(r, 'report') || 'Not Started',
      plannedStart: toIsoDate(cell(r, 'plannedStart')),
      plannedEnd: toIsoDate(cell(r, 'plannedEnd')),
      actualStart: toIsoDate(cell(r, 'actualStart')),
      actualEnd: toIsoDate(cell(r, 'actualEnd')),
      timeSpent: Number(cell(r, 'timeSpent')?.v) || null,
      seal: normalizeSeal(val(r, 'seal')) || null,
      excelStatus: val(r, 'status'),
    });
  }
  return rows;
}

// Same person typed as "Jaysonco" / "JaysonCo" -> use the most common spelling.
function canonicalizeNames(rows, key) {
  const counts = new Map();
  for (const r of rows) if (r[key]) {
    const k = r[key].toLowerCase();
    const m = counts.get(k) || new Map();
    m.set(r[key], (m.get(r[key]) || 0) + 1);
    counts.set(k, m);
  }
  const best = new Map([...counts].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  for (const r of rows) if (r[key]) r[key] = best.get(r[key].toLowerCase());
}

export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
  const cycles = [];
  for (const name of wb.SheetNames) {
    for (const { track, re } of SHEET_PATTERNS) {
      const m = name.match(re);
      if (!m) continue;
      const rows = parseSheet(wb, name, track);
      canonicalizeNames(rows, 'securityTester');
      const mismatches = rows
        .filter((r) => r.excelStatus && enrich(r).status !== r.excelStatus)
        .map((r) => ({ project: r.project, period: r.period, excel: r.excelStatus, app: enrich(r).status }));
      cycles.push({ track, year: Number(m[1]), sheet: name, rows, mismatches });
    }
  }
  if (!cycles.length) throw new Error('No "<year> Bi Annual / Quarterly Full assessment" sheets found in this workbook.');
  return cycles.sort((a, b) => b.year - a.year || a.track.localeCompare(b.track));
}

const COLS = ['period', 'sort_order', 'project', 'quarter', 'is_active', 'classification', 'repositories', 'testing_url', 'priority', 'ba_assigned', 'security_tester', 'co_tester', 'checks', 'mobile_app', 'dependabots', 'code_review', 'report', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'time_spent', 'seal', 'seal_source'];

// Replaces the selected cycles (track+year) with the workbook's contents.
export function importCycles(db, parsed, selected, user) {
  const insertCycle = db.prepare('INSERT INTO cycles (track, year) VALUES (?, ?) ON CONFLICT(track, year) DO UPDATE SET year = excluded.year RETURNING id');
  const insertRow = db.prepare(`INSERT INTO assessments (cycle_id, ${COLS.join(', ')}, updated_by) VALUES (?, ${COLS.map(() => '?').join(', ')}, ?)`);
  const results = [];
  db.exec('BEGIN');
  try {
    for (const c of parsed) {
      if (selected && !selected.includes(`${c.track}:${c.year}`)) continue;
      const { id } = insertCycle.get(c.track, c.year);
      db.prepare('DELETE FROM assessments WHERE cycle_id = ?').run(id);
      for (const r of c.rows) {
        insertRow.run(id, r.period, r.sortOrder, r.project, r.quarter, r.isActive, r.classification, r.repositories, r.testingUrl, r.priority, r.baAssigned, r.securityTester, r.coTester, JSON.stringify(r.checks), r.mobileApp ? 1 : 0, r.dependabots, r.codeReview, r.report, r.plannedStart, r.plannedEnd, r.actualStart, r.actualEnd, r.timeSpent, r.seal, r.seal ? 'excel' : null, user || 'Excel import');
      }
      results.push({ track: c.track, year: c.year, imported: c.rows.length });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return results;
}

export function previewOf(parsed) {
  return parsed.map((c) => ({
    key: `${c.track}:${c.year}`,
    track: c.track,
    year: c.year,
    sheet: c.sheet,
    rows: c.rows.length,
    byPeriod: Object.fromEntries(TRACKS[c.track].periods.map((p) => [p, c.rows.filter((r) => r.period === p).length])),
    mismatches: c.mismatches,
  }));
}
