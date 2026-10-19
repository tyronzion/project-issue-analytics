import { parseUtc } from './businessTime.js';
import { readField } from './fullAssessment.js';

// "[PIA01] Privacy Impact Assessment" policy (template 379488). Form values are flat: data = { "18890": "NEO", ... }.
// Only these fields are read; the questionnaire answers (which describe personal data) are never kept.
export const PIA_FIELDS = {
  product: { id: 18890, label: 'Project or Product' },
  version: { id: 18891, label: 'Version' },
  riskRating: { id: 37936, label: 'Overall Risk Rating' },
  riskLabel: { id: 37937, label: 'Overall Risk Rating Label' },
};

const APPROVED = new Set(['approved', 'resolved', 'closed']);
const REJECTED = new Set(['rejected', 'removed', 'cancelled', 'canceled', 'declined']);

// state: 'approved' (counts as a completed PIA) | 'rejected' (ignored) | 'open' (submitted, not approved yet)
export function normalizePolicy(raw, { fields = PIA_FIELDS } = {}) {
  const f = (k) => readField(raw.data, fields[k]);
  const status = String(raw.status || '').toLowerCase();
  const approvedAt = parseUtc(raw.acknowledged_at) ?? parseUtc(raw.meta?.acknowledged_at) ?? parseUtc(raw.resolved_at);
  const state = REJECTED.has(status) || raw.rejected_at || raw.removed_at || raw.deleted_at ? 'rejected'
    : APPROVED.has(status) && approvedAt != null ? 'approved'
    : 'open';
  const product = f('product') || 'Unspecified product';
  const risk = Number(f('riskRating'));
  return {
    id: raw.id,
    serial: raw.serial,
    url: `https://uberticket.cloudstaff.com/admin/policies/${raw.id}/view`,
    status,
    state,
    product,
    version: f('version') || '',
    riskRating: Number.isFinite(risk) && f('riskRating') !== '' ? risk : null,
    riskLabel: f('riskLabel'),
    submitter: raw.submitter?.alias || raw.submitter?.name || '',
    approvedBy: state === 'approved' ? raw.acknowledger?.alias || raw.acknowledger?.name || (typeof raw.meta?.acknowledged_by === 'string' ? raw.meta.acknowledged_by : '') : '',
    submittedAt: parseUtc(raw.created_at),
    approvedAt: state === 'approved' ? approvedAt : null,
    updatedAt: parseUtc(raw.updated_at),
  };
}
