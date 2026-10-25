// Assessment report (PDF) content: which template, the Security Seal, New / Backlog issues and the wording.
// Pure functions shared by the server (validation) and the browser (report page). The wording follows the
// team's Word templates ("Security Full Assessment" report and "Rules of Engagement" summary report) and the
// Security Seal spiel, grammar-checked.
import { CHECKS, checksDone } from './logic.js';

// The report can be downloaded once every App testing checklist item is ticked.
export const reportReady = (a) => checksDone(a?.checks) === CHECKS.length;

// Rules of Engagement tickets use the RoE summary template; everything else the Full Assessment report.
export const reportKind = (a) => (a?.ticketSource === 'roe' ? 'roe' : 'full');

// Text the team fills in per assessment (stored as JSON in assessments.report_info).
export const REPORT_INFO_FIELDS = {
  intro: { max: 2000 },
  dashboardUrl: { max: 1000, url: true },
  scanResultsUrl: { max: 1000, url: true },
  notes: { max: 4000 },
  testingType: { max: 60 },       // RoE: "Blackbox" | "Graybox" | "Whitebox" (TESTING_TYPES)
  testingScope: { max: 2000 },    // RoE: Scope and Limitations wording; empty = the type's default (TESTING_SCOPE)
  testingTime: { max: 120 },      // RoE: "6:00 am to 5:00 pm / Weekdays"
  recommendations: { max: 4000 }, // RoE: one per line, "Title: description"
};
export const REPORT_DEFAULTS = { testingType: 'Blackbox', testingTime: '6:00 am to 5:00 pm / Weekdays' };

// RoE type of testing (dialog dropdown) and the default Scope and Limitations wording for each.
// The team can edit the wording per report (reportInfo.testingScope).
export const TESTING_TYPES = ['Blackbox', 'Graybox', 'Whitebox'];
export const TESTING_SCOPE = {
  Blackbox: 'Without access to source code, system configurations, or internal architecture, testing was conducted from an external perspective to identify vulnerabilities through the application’s functionality, exposed interfaces, APIs, authentication, authorization, and observable behavior.',
  Graybox: 'With partial knowledge of the application, such as user accounts, roles, and architecture or API documentation, testing combined an external attacker’s perspective with authenticated access to identify vulnerabilities in the application’s functionality, access controls, business logic, APIs, and data handling.',
  Whitebox: 'With full access to source code, system configurations, and internal architecture, testing combined code review, static and dynamic analysis, and manual verification to identify vulnerabilities such as insecure coding practices, logic flaws, improper access controls, and misconfigurations.',
};

// Maps saved or typed values ("Black-box", "grey box", "WHITEBOX") to one of TESTING_TYPES; unknown → null.
export function testingTypeOf(value) {
  const s = String(value || '').toLowerCase();
  if (/black/.test(s)) return 'Blackbox';
  if (/gr[ae]y/.test(s)) return 'Graybox';
  if (/white/.test(s)) return 'Whitebox';
  return null;
}

// The Scope and Limitations wording the report uses: the team's text, else the type's default.
export function testingScopeText(info = {}) {
  const custom = String(info.testingScope || '').trim();
  if (custom) return custom;
  const type = testingTypeOf(info.testingType || REPORT_DEFAULTS.testingType);
  return type ? TESTING_SCOPE[type] : '';
}

// Validates and trims report info. Throws Error with a message fit for the user.
export function normalizeReportInfo(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('reportInfo must be an object');
  const out = {};
  for (const [key, rule] of Object.entries(REPORT_INFO_FIELDS)) {
    const v = value[key];
    if (v == null || v === '') continue;
    if (typeof v !== 'string') throw new Error(`reportInfo.${key} must be text`);
    const s = v.trim();
    if (!s) continue;
    if (s.length > rule.max) throw new Error(`reportInfo.${key} is too long (max ${rule.max} characters)`);
    if (rule.url && !isWebUrl(s)) throw new Error(`${key === 'dashboardUrl' ? 'Dashboard' : 'Scan results'} link must start with https:// or http://`);
    out[key] = s;
  }
  return Object.keys(out).length ? out : null;
}

export function isWebUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// Security Seal from outstanding issue counts, exactly the team's spreadsheet formula
// (A = Low, B = Medium, C = High, D = Critical):
// =IF(AND(C=0,D=0,B<=15,A<=15),"Secure", IF(AND(C=0,D=0,B<=30,A<=30),"Protected",
//  IF(AND(D=0,C<=30,B<=50,A<=50),"Defended", IF(AND(D=0,C<=50,B<=50,A<=50),"Vulnerable",
//  IF(AND(D<=50,C<=50,B<=50,A<=50),"Exposed", "Compromised")))))
export function sealFromCounts({ low = 0, medium = 0, high = 0, critical = 0 } = {}) {
  const [A, B, C, D] = [low, medium, high, critical];
  if (C === 0 && D === 0 && B <= 15 && A <= 15) return 'Secure';
  if (C === 0 && D === 0 && B <= 30 && A <= 30) return 'Protected';
  if (D === 0 && C <= 30 && B <= 50 && A <= 50) return 'Defended';
  if (D === 0 && C <= 50 && B <= 50 && A <= 50) return 'Vulnerable';
  if (D <= 50 && C <= 50 && B <= 50 && A <= 50) return 'Exposed';
  return 'Compromised';
}

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational'];
export const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', informational: 'Informational' };

// SLA per severity (Appendix A of the RoE template).
export const SLA_DAYS = { Critical: 30, High: 60, Medium: 90, Low: 120 };

const day = (s) => (s ? String(s).slice(0, 10) : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Builds everything the report shows.
 * assessment: tracker row (project, period, ticketSource, actualStart/End, testingUrl, reportInfo)
 * issues: the app's UNRESOLVED issues as { key, summary, created, dueDate, severity } where severity is
 *   'critical' | 'high' | 'medium' | 'low' | 'informational' | null and dates are YYYY-MM-DD.
 * today: YYYY-MM-DD (report date; due dates before it are overdue).
 */
export function buildReport({ assessment: a, issues = [], today }) {
  const kind = reportKind(a);
  const info = { ...REPORT_DEFAULTS, ...(a.reportInfo || {}) };
  const start = day(a.actualStart);
  const end = day(a.actualEnd) || today;

  // New = created inside the UberTicket assessment window; anything else is Backlog.
  const rows = issues.map((i) => {
    const created = day(i.created);
    const dueDate = day(i.dueDate);
    const isNew = !!(start && created && created >= start && created <= end);
    return { ...i, created, dueDate, type: isNew ? 'New' : 'Backlog', overdue: !!(dueDate && dueDate < today) };
  });
  const rank = (r) => { const i = SEVERITY_ORDER.indexOf(r.severity); return i < 0 ? SEVERITY_ORDER.length : i; };
  rows.sort((x, y) => (x.type === y.type ? 0 : x.type === 'New' ? -1 : 1) || rank(x) - rank(y) || (y.created || '').localeCompare(x.created || ''));

  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, rows.filter((r) => r.severity === s).length]));
  const seal = sealFromCounts(bySeverity);
  const counts = {
    new: rows.filter((r) => r.type === 'New').length,
    backlog: rows.filter((r) => r.type === 'Backlog').length,
    overdue: rows.filter((r) => r.overdue).length,
    unresolved: rows.length,
  };

  return {
    kind,
    title: kind === 'roe' ? 'Rules of Engagement' : 'Security Full Assessment',
    project: a.project,
    period: a.period,
    testingUrl: a.testingUrl || '',
    start,
    end,
    today,
    info,
    rows,
    bySeverity,
    counts,
    seal,
    sealText: sealSpiel(seal, counts.unresolved),
    advisory: kind === 'full' ? fullAdvisory(counts) : [],
    findings: kind === 'roe' ? roeFindings(rows) : '',
  };
}

// The Security Seal spiel (Summary of Findings). "Secure" with no issues at all gets its own wording.
export function sealSpiel(seal, unresolved) {
  const opener = `This is to inform you that the latest round of security testing on your application has been completed. The results show that your application received a security score of "${seal}."`;
  const urgent = 'While this is concerning news, it is imperative to act quickly to address the reported vulnerabilities. We recommend working closely with your development team to remediate the issues and implement stronger security measures.';
  const sla = 'While this is concerning news, it is imperative to act in accordance with the SLA for the reported vulnerabilities. We recommend working closely with your development team to remediate the issues and implement stronger security measures.';
  const closing = 'We understand that this may be a challenging process, but restoring the integrity of your product is of the utmost importance. Please feel free to contact us if you have any questions.';
  const risk = "which attackers could exploit, putting your clients' sensitive information at risk.";
  switch (seal) {
    case 'Compromised':
      return [`${opener} This means that your application contains an alarming number of vulnerabilities, ranging from low to critical severity, ${risk}`, urgent, closing];
    case 'Exposed':
      return [`${opener} This means that your application contains vulnerabilities, ranging from low to critical severity, ${risk}`, urgent, closing];
    case 'Vulnerable':
      return [`${opener} This means that your application has no critical issues, but an alarming number of vulnerabilities, ranging from low to high severity, are still present, ${risk}`, sla, closing];
    case 'Defended':
      return [`${opener} This means that your application has no critical issues, but vulnerabilities ranging from low to high severity are still present, ${risk}`, sla, closing];
    case 'Protected':
      return [`${opener} This means that your application has no critical or high-severity issues, but vulnerabilities ranging from low to medium severity are still present, ${risk}`, sla, closing];
    default:
      if (!unresolved) {
        return [
          `${opener} This means that your application meets the security standard, and no outstanding security issues were found.`,
          'This is excellent news. We recommend that you continue following secure development practices to maintain the integrity of your product.',
          'If you have any questions, feel free to reach out to us. Keep up the outstanding effort!',
        ];
      }
      return [
        `${opener} This means that your application meets the security standard, but minor, easy-to-fix issues are still present.`,
        'While this is excellent news, it is still important to act in accordance with the SLA for the reported vulnerabilities. We recommend working closely with your development team to remediate them.',
        'We recommend that you maintain the integrity of your product. If you have any questions, feel free to reach out to us. Keep up the outstanding effort!',
      ];
  }
}

// Full Assessment "Security Advisory" paragraphs, worded from the counts.
export function fullAdvisory({ new: n, backlog: b, overdue: o, unresolved: u }) {
  if (!u) return ['During this round of security testing, no new issues were found, and there are no outstanding backlog issues.'];
  const found = n ? `During this round of security testing, ${plural(n, 'new issue')} ${n === 1 ? 'was' : 'were'} found.` : 'During this round of security testing, no new issues were found.';
  let backlog = '';
  if (b) backlog = ` ${n ? 'There' : 'However, there'} ${b === 1 ? 'is' : 'are'} ${plural(b, 'backlog issue')} still open.`;
  let overdue = '';
  if (o && o === u) overdue = u === 1 ? ' This issue is already past its due date.' : ` All ${u} unresolved issues are already past their due dates.`;
  else if (o) overdue = ` ${plural(o, 'unresolved issue')} ${o === 1 ? 'is' : 'are'} already past ${o === 1 ? 'its due date' : 'their due dates'}.`;
  const act = o
    ? ' We strongly recommend addressing the overdue issues immediately to mitigate potential future risks.'
    : ' We recommend addressing these issues within their SLA to mitigate potential future risks.';
  // The seal wording that follows covers acting within the SLA, so it isn't repeated here.
  return [found + backlog + overdue + act];
}

// RoE "Summary of Findings" first sentence, e.g. "During the assessment, 1 security issue was found: 1 medium-severity."
export function roeFindings(rows) {
  if (!rows.length) return 'During the assessment, no security issues were found.';
  const parts = SEVERITY_ORDER.map((s) => [s, rows.filter((r) => r.severity === s).length]).filter(([, c]) => c)
    .map(([s, c]) => `${c} ${s === 'informational' ? 'informational' : `${s}-severity`}`);
  const verb = rows.length === 1 ? 'issue was' : 'issues were';
  return `During the assessment, ${rows.length} security ${verb} found${parts.length ? `: ${joinList(parts)}` : ''}.`;
}

function joinList(xs) {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

// RoE recommendations: one per line, "Title: description" (description optional).
export function parseRecommendations(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? { title: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { title: l, text: '' };
  });
}

export const DEFAULT_RECOMMENDATIONS = [
  { title: 'Address Reported Vulnerabilities', text: 'Remediate the issues listed in this report within their SLA, starting with the highest severity.' },
  { title: 'Conduct Regular Security Scans', text: 'Periodically check for missing security headers and other vulnerabilities.' },
  { title: 'Enable Logging and Monitoring', text: 'Track and analyze HTTP traffic for suspicious activity.' },
  { title: 'Apply Secure Web Development Practices', text: 'Make security headers part of the standard deployment process.' },
];

// Suggested PDF file name, following the team's naming: "2026 Q4 Cloudstaff <App> Security Report".
export function reportFileName(report, year) {
  const q = /(\d)(st|nd|rd|th) Quarter/.exec(report.period || '');
  const h = /(\d)(st|nd) Half/.exec(report.period || '');
  const when = [year, q ? `Q${q[1]}` : h ? `H${h[1]}` : ''].filter(Boolean).join(' ');
  const name = report.kind === 'roe' ? `${report.project} ROE Summary Report` : `Cloudstaff ${report.project} Security Report`;
  return `${when} ${name}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---- Frozen reports ------------------------------------------------------------------------------------
// Once an assessment's UberTicket is resolved, its report is frozen: the app's issues as they stood on the
// resolution date are saved once (assessments.report_snapshot, keyed by the ticket) and every later download
// uses that copy. The next assessment (another period row / ticket) gets its own snapshot.

// The date a report describes: the resolution date for a resolved ticket (or a finished assessment without
// a ticket), otherwise today.
export function reportAsOf(a, today) {
  const end = day(a?.actualEnd);
  if (a?.ticketKey) return a.ticketState === 'resolved' && end ? end : today;
  return end && end < today ? end : today;
}

// The snapshot that belongs to the assessment's current ticket, or null.
export const snapshotFor = (a) => (a?.ticketKey && a.reportSnapshot?.ticketKey === a.ticketKey ? a.reportSnapshot : null);

// Resolved ticket without a frozen report yet.
export const needsSnapshot = (a) => a?.ticketState === 'resolved' && !!a.ticketKey && !!day(a.actualEnd) && !snapshotFor(a);

const SNAPSHOT_MAX_ISSUES = 5000;
const SEVERITIES = new Set(SEVERITY_ORDER);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').slice(0, max);

// Validates a snapshot sent by the browser. Throws Error with a message fit for the user.
export function normalizeSnapshot({ ticketKey, asOf, issues } = {}) {
  if (typeof ticketKey !== 'string' || !ticketKey) throw new Error('ticketKey is required');
  if (typeof asOf !== 'string' || !DAY_RE.test(asOf)) throw new Error('asOf must be a YYYY-MM-DD date');
  if (!Array.isArray(issues)) throw new Error('issues must be a list');
  if (issues.length > SNAPSHOT_MAX_ISSUES) throw new Error(`Too many issues (max ${SNAPSHOT_MAX_ISSUES})`);
  return {
    ticketKey,
    asOf,
    issues: issues.map((i) => {
      if (!i || typeof i !== 'object') throw new Error('Each issue must be an object');
      const created = str(i.created, 10);
      const dueDate = str(i.dueDate, 10);
      return {
        key: str(i.key, 60),
        summary: str(i.summary, 1000),
        created: DAY_RE.test(created) ? created : '',
        dueDate: DAY_RE.test(dueDate) ? dueDate : '',
        severity: SEVERITIES.has(i.severity) ? i.severity : null,
      };
    }),
  };
}
