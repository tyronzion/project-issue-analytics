import { parseUtc } from './businessTime.js';

const DONE = new Set(['resolved', 'closed']);
const REJECTED = new Set(['rejected', 'cancelled', 'canceled', 'declined']);
const VERSION_RE = /^v?\d+(\.\d+)+/i;

// Turn a raw UberTicket row into what the page needs, with SLA timings
// measured in business time. `now` makes open-ticket ageing live.
export function normalizeTicket(raw, { calendar, envByTemplate, targets, now = Date.now() }) {
  const status = String(raw.status || '').toLowerCase();
  const state = REJECTED.has(status) || raw.rejected_at ? 'rejected' : DONE.has(status) || raw.resolved_at ? 'resolved' : 'open';
  // Submitted and resolved times come from the activity log; ticket fields are the fallback.
  const created = parseUtc(raw.activity_submitted_at) ?? parseUtc(raw.created_at);
  const resolved = state !== 'resolved' ? null
    : parseUtc(raw.activity_resolved_at) ?? parseUtc(raw.resolved_at) ?? parseUtc(raw.closed_at);

  const labels = (raw.tag?.ticket_label ?? []).map((l) => l.name || l.alias).filter(Boolean);
  const version = labels.find((l) => VERSION_RE.test(l)) ?? '';
  const app = labels.find((l) => !VERSION_RE.test(l)) ?? 'Unlabelled';

  // MTTR in business days; for open tickets this is the age so far.
  const resEnd = resolved ?? (state === 'open' ? now : null);
  const mttrDays = resEnd != null ? round(calendar.businessDays(created, resEnd), 2) : null;
  const resMet = mttrDays != null && mttrDays <= targets.mttrDays;

  return {
    id: raw.id,
    key: `UB-${raw.serial}`,
    serial: raw.serial,
    parentKey: raw.endorsed?.serial ? `UB-${raw.endorsed.serial}` : null,
    templateId: raw.template_id,
    env: envByTemplate[raw.template_id] ?? String(raw.template_id),
    templateName: raw.template?.name ?? '',
    status,
    state,
    priority: raw.priority,
    app,
    version,
    assignee: raw.assignee?.alias || raw.assignee?.name || 'Unassigned',
    url: `https://uberticket.cloudstaff.com/admin/tickets/${raw.id}/view`,
    submitter: raw.submitter?.alias || raw.submitter?.name || '',
    createdAt: created,
    resolvedAt: resolved,
    reopened: !!raw.reopened_at,
    timesFrom: raw.activity_submitted_at ? 'activity log' : 'ticket fields',
    mttrDays,
    resMet,
    // Compliance is judged only on finished tickets; open ones are "at risk" or "breached".
    slaMet: state === 'resolved' ? resMet : null,
    risk: state === 'open' ? (mttrDays > targets.mttrDays ? 'breached' : mttrDays > targets.mttrDays * 0.66 ? 'at-risk' : 'ok') : null,
  };
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
