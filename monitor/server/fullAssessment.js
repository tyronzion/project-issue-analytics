import { parseUtc } from './businessTime.js';

// Form fields per assessment template: { key: { id, label } }.
// "Security Full Assessment" (1080829) stores flat values: data = { "28969": "Cloudstaff Mystaff", ... }.
export const FULL_FIELDS = {
  comment: { id: 28968, label: 'Comment' },
  product: { id: 28969, label: 'Product' },
  quarter: { id: 28970, label: 'Quarter' },
  year: { id: 28971, label: 'Year' },
  startDate: { id: 28972, label: 'Start Time' },
  endDate: { id: 28973, label: 'End Time' },
  occurrence: { id: 36034, label: 'Occurrence' },
};

// "[PB-0933] Security Test - Rules of Engagement" (72913) stores grouped fields:
// data = { public: { "field_Product Name": { id: 19541, label, type, value } }, private: { ... } }.
export const ROE_FIELDS = {
  comment: { id: 3862, label: 'Comment' },
  product: { id: 19541, label: 'Product Name' },
  appType: { id: 30741, label: 'Type' },
  targetLink: { id: 3864, label: 'Target Link' },
  startDate: { id: 3866, label: 'Start Date of Security Test' },
  endDate: { id: 3867, label: 'End Date of Security Test' },
  timeSpent: { id: 22570, label: 'Time Spent (MM)' },
  size: { id: 43044, label: 'Size' },
};

// Reads one form field from either data shape (by id, falling back to label).
export function readField(data, spec) {
  if (!data || !spec) return '';
  const flat = data[spec.id] ?? data[String(spec.id)];
  if (flat != null && typeof flat !== 'object') return String(flat).trim();
  for (const group of [data.public, data.private, data]) {
    if (!group || typeof group !== 'object') continue;
    for (const v of Object.values(group)) {
      if (v && typeof v === 'object' && (Number(v.id) === Number(spec.id) || v.label === spec.label)) return String(v.value ?? '').trim();
    }
  }
  return '';
}

const DONE = new Set(['resolved', 'closed']);
const REJECTED = new Set(['rejected', 'cancelled', 'canceled', 'declined']);

// UberTicket priorities -> the SLA names used by the Data Security Team ("normal" is Medium).
export const PRIORITY = {
  low: 'low',
  normal: 'medium',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
  urgent: 'critical',
};

// Form dates are "MM/DD/YYYY" calendar days in local (Manila) time; empty ones come back as "Invalid date".
// Returns the UTC instant of local midnight at the start of that day.
export function parseFormDate(s, offsetHours) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])) - offsetHours * 3_600_000;
}

export function normalizeFull(raw, { calendar, slaDays, offsetHours, fields = FULL_FIELDS, now = Date.now() }) {
  const f = (k) => readField(raw.data, fields[k]);
  const status = String(raw.status || '').toLowerCase();
  const state = REJECTED.has(status) || raw.rejected_at ? 'rejected' : DONE.has(status) || raw.resolved_at ? 'resolved' : 'open';
  // Submitted / resolved come from the activity log; ticket fields are the fallback.
  const created = parseUtc(raw.activity_submitted_at) ?? parseUtc(raw.created_at);
  const resolved = state !== 'resolved' ? null
    : parseUtc(raw.activity_resolved_at) ?? parseUtc(raw.resolved_at) ?? parseUtc(raw.closed_at);

  const priority = PRIORITY[String(raw.priority || '').toLowerCase()] ?? 'medium';
  const sla = slaDays[priority];
  const dueAt = calendar.addBusinessDays(created, sla);
  const resEnd = resolved ?? (state === 'open' ? now : null);
  const resolveDays = resEnd != null ? round(calendar.businessDays(created, resEnd), 2) : null;
  const slaMet = state === 'resolved' ? resolveDays <= sla : null;

  // Start / End Time from the form: shown for reference, not monitored.
  const startDate = parseFormDate(f('startDate'), offsetHours);
  const endDate = parseFormDate(f('endDate'), offsetHours);
  let risk = null;
  if (state === 'open') {
    const left = calendar.businessDays(now, dueAt);
    risk = now >= dueAt ? 'breached' : left <= Math.max(1, sla * 0.2) ? 'at-risk' : 'ok';
  }

  const product = f('product') || 'Unspecified product';
  // Templates without Quarter / Year fields: derive them from the test start (or submission) date.
  const when = new Date((startDate ?? created) + offsetHours * 3_600_000);
  return {
    id: raw.id,
    key: `UB-${raw.serial}`,
    serial: raw.serial,
    url: `https://uberticket.cloudstaff.com/admin/tickets/${raw.id}/view`,
    archived: !!raw.is_archived,
    status,
    state,
    priority,
    rawPriority: raw.priority,
    sla,
    product,
    productKey: product.toLowerCase().replace(/\s+/g, ' '),
    quarter: f('quarter') || `Q${Math.floor(when.getUTCMonth() / 3) + 1}`,
    year: f('year') || String(when.getUTCFullYear()),
    occurrence: f('occurrence'),
    comment: f('comment'),
    appType: f('appType'),
    size: f('size'),
    timeSpent: f('timeSpent'),
    targetLink: f('targetLink'),
    assignee: raw.assignee?.alias || raw.assignee?.name || 'Unassigned',
    submitter: raw.submitter?.alias || raw.submitter?.name || '',
    createdAt: created,
    resolvedAt: resolved,
    dueAt,
    resolveDays,
    slaMet,
    risk,
    startDate,
    endDate,
    // When this assessment counts as "done" for the biannual retest cycle.
    assessedAt: state === 'resolved' ? (endDate ?? resolved) : null,
  };
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
