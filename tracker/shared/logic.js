// Business rules ported from the "Security Full Assessment Tracker" workbook.
// Used by both the server (import, API) and the browser (live recalculation).

// The 12 checklist items counted by the "App" formula (checklist columns B..M).
export const CHECKS = [
  { key: 'testing', label: 'Testing' },
  { key: 'portScanning', label: 'Port Scanning' },
  { key: 'directoryListing', label: 'Directory Listing' },
  { key: 'securityHeaders', label: 'Security Headers' },
  { key: 'dataPrivacy', label: 'Data Privacy Check' },
  { key: 'bruteforcing', label: 'Bruteforcing' },
  { key: 'privilegeEscalation', label: 'Privilege Escalation' },
  { key: 'brokenAccessControl', label: 'Broken Access Control' },
  { key: 'injection', label: 'Injection' },
  { key: 'dos', label: 'Denial of Service' },
  { key: 'googleDorking', label: 'Google Dorking' },
  { key: 'uploaded', label: 'Uploaded' },
];

export const TRACKS = {
  biannual: {
    label: 'Bi-Annual',
    periods: ['1st Half', '2nd Half'],
  },
  quarterly: {
    label: 'Quarterly',
    periods: ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'],
  },
};

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const TASK_STATUSES = ['Not Started', 'In Progress', 'Done', 'Done - N/A', 'Done - Uploaded', 'No repository'];
export const SEALS = ['Secure', 'Defended', 'Protected', 'Vulnerable', 'Exposed', 'Compromised'];
export const ACTIVE_VALUES = ['Active', 'Decommissioned'];
export const CLASSIFICATIONS = ['Old', 'New'];
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

// Monitoring sheet: points earned per finished app, by severity.
export const POINTS = { Critical: 4, High: 3, Medium: 2, Low: 1 };
// Monitoring sheet: "Man Hours" column.
export const MAN_HOURS = { Critical: '25 - 33', High: '15 - 21', Medium: '13 - 17', Low: '5 - 10' };

const DONE_VALUES = new Set(['Done', 'Done - N/A', 'Done - Uploaded', 'No repository']);
export const isTaskDone = (v) => DONE_VALUES.has(v);

// "App" column: IFS(count=0,"Not Started", count<=11,"In Progress", count=12,"Uploaded")
export function appStatus(checks = {}) {
  const n = CHECKS.filter((c) => checks[c.key]).length;
  if (n === 0) return 'Not Started';
  if (n < CHECKS.length) return 'In Progress';
  return 'Uploaded';
}

export function checksDone(checks = {}) {
  return CHECKS.filter((c) => checks[c.key]).length;
}

// "Column1" / "Completion Rate": the nested-IF ladder resolves to
// App uploaded = 40 points, each of Dependabots / Code Review / Report done = 20.
export function completion(a) {
  let score = appStatus(a.checks) === 'Uploaded' ? 40 : 0;
  for (const f of ['dependabots', 'codeReview', 'report']) if (isTaskDone(a[f])) score += 20;
  return score;
}

// UberTicket is the source of truth for status once a ticket is linked:
// open ticket = In Progress, resolved ticket = Done.
export function ticketStatus(a) {
  if (a.ticketState === 'resolved') return 'Done';
  if (a.ticketState === 'open') return 'In Progress';
  return null;
}

// Without a ticket, the Excel formula:
// "Status": IFS(App="In Progress","In Progress", K=0,"Not Started", K<=99,"In Progress", K=100,"Done")
export function overallStatus(a) {
  const fromTicket = ticketStatus(a);
  if (fromTicket) return fromTicket;
  const k = completion(a);
  if (appStatus(a.checks) === 'In Progress') return 'In Progress';
  if (k === 0) return 'Not Started';
  if (k < 100) return 'In Progress';
  return 'Done';
}

// Monitoring "Score": points for the severity when Done, else 0.
export function monitoringScore(a) {
  return overallStatus(a) === 'Done' ? POINTS[a.priority] || 0 : 0;
}

export const isDecommissioned = (a) => a.isActive === 'Decommissioned';

export function enrich(a) {
  const pct = completion(a);
  const status = overallStatus(a);
  return {
    ...a,
    app: appStatus(a.checks),
    checksDone: checksDone(a.checks),
    completion: pct,
    status,
    score: monitoringScore(a),
    // UberTicket says Done but the checklist / deliverables are not complete.
    checklistGap: status === 'Done' && a.ticketState === 'resolved' && pct < 100,
  };
}

// App names are the same project when they differ only by case, spaces, punctuation
// or a leading "Cloudstaff": "Cloudstaff Mystaff" = "MyStaff", "Pact-X" = "pact x".
export function matchKey(name) {
  const lower = String(name || '').toLowerCase().normalize('NFKD');
  const stripped = lower.replace(/^\s*cloudstaff(?![a-z0-9])[\s\-_.:]*/, '');
  const key = stripped.replace(/[^a-z0-9]/g, '');
  return key || lower.replace(/[^a-z0-9]/g, '');
}

// Quarter number (1-4) -> the period it belongs to in a track.
export function periodForQuarter(track, quarter) {
  const periods = TRACKS[track].periods;
  return track === 'biannual' ? periods[quarter <= 2 ? 0 : 1] : periods[quarter - 1];
}

// Recorded time spent (minutes) for a set of apps: how many have it, min / max / avg / total.
// Apps with no time (null or 0) are left out of the range, not counted as 0.
export function timeStats(rows) {
  const mins = rows.map((r) => Number(r.timeSpent) || 0).filter((m) => m > 0);
  const total = mins.reduce((s, m) => s + m, 0);
  return {
    apps: rows.length,
    recorded: mins.length,
    min: mins.length ? Math.min(...mins) : null,
    max: mins.length ? Math.max(...mins) : null,
    avg: mins.length ? total / mins.length : null,
    total,
  };
}

// Time stats per priority (only priorities that have apps) plus an overall row.
export function timeByPriority(rows) {
  const byPriority = PRIORITIES.map((p) => ({ priority: p, manHours: MAN_HOURS[p], ...timeStats(rows.filter((r) => r.priority === p)) }))
    .filter((x) => x.apps > 0);
  return { byPriority, overall: timeStats(rows) };
}

// Time stats per group (e.g. per security tester), most total time first.
export function timeByGroup(rows, keyOf) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r) || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups].map(([key, list]) => ({ key, ...timeStats(list) }))
    .sort((a, b) => b.total - a.total || b.apps - a.apps || a.key.localeCompare(b.key));
}

// Everything the Monitoring sheet's summary block shows, for one set of apps.
export function monitoringSummary(rows) {
  const enriched = rows.map((r) => (r.status ? r : enrich(r)));
  const bySeverity = PRIORITIES.map((sev) => {
    const list = enriched.filter((r) => r.priority === sev);
    const done = list.filter((r) => r.status === 'Done').length;
    const inProgress = list.filter((r) => r.status === 'In Progress').length;
    const notStarted = list.length - done - inProgress;
    return {
      severity: sev,
      pointsPerSize: POINTS[sev],
      totalApps: list.length,
      goalPoints: POINTS[sev] * list.length,
      done,
      inProgress,
      notStarted,
      undone: inProgress + notStarted,
      manHours: MAN_HOURS[sev],
    };
  }).filter((s) => s.totalApps > 0);

  const totalApps = enriched.length;
  const goalPoints = bySeverity.reduce((s, x) => s + x.goalPoints, 0);
  const currentPoints = enriched.reduce((s, r) => s + r.score, 0);
  const done = enriched.filter((r) => r.status === 'Done').length;
  const inProgress = enriched.filter((r) => r.status === 'In Progress').length;
  const notStarted = totalApps - done - inProgress;

  const seals = Object.fromEntries(SEALS.map((s) => [s, 0]));
  for (const r of enriched) if (r.seal && seals[r.seal] !== undefined) seals[r.seal]++;

  return {
    totalApps,
    goalPoints,
    goalPointsPerMonth: goalPoints / 3,
    currentPoints,
    pointsPct: goalPoints ? currentPoints / goalPoints : 0,
    done,
    donePct: totalApps ? done / totalApps : 0,
    inProgress,
    notStarted,
    bySeverity,
    seals,
    timeSpent: enriched.reduce((s, r) => s + (Number(r.timeSpent) || 0), 0),
  };
}

export function normalizePriority(v) {
  const s = String(v || '').trim().toLowerCase();
  return PRIORITIES.find((p) => p.toLowerCase() === s) || '';
}

export function normalizeSeal(v) {
  const s = String(v || '').trim().toLowerCase();
  return SEALS.find((p) => p.toLowerCase() === s) || (s ? String(v).trim() : '');
}
