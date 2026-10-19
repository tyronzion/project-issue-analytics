import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePolicy } from './piaPolicy.js';
import { demoPiaPolicies } from './demoData.js';

// Shape of a [PIA01] policy from GET /v1/policies/search (template 379488); questionnaire text shortened.
const raw = {
  id: '00000000-0000-5000-8000-000000000001', serial: 70001, template_id: 379488, status: 'approved', priority: 'low',
  data: { 18888: '', 18890: 'NEO', 18891: '1', 18893: 'First name, Last name, Home Address …', 37936: '0', 37937: '' },
  meta: { acknowledged_at: '2025-04-24 00:42:19', acknowledged_by: 'ApproverA', effectivity_date: '2025-04-24 00:00:00' },
  acknowledged_at: '2025-04-24 00:42:19', closed_at: '2025-04-24 00:42:19', resolved_at: null, rejected_at: null, removed_at: null, deleted_at: null,
  created_at: '2024-10-28T06:36:11.000000Z', updated_at: '2026-01-16T00:25:11.000000Z',
  submitter: { id: 1, alias: 'SubmitterB' }, acknowledger: { alias: 'ApproverA' },
};

test('reads product, version and approval from a real PIA policy shape', () => {
  const p = normalizePolicy(raw);
  assert.equal(p.product, 'NEO');
  assert.equal(p.version, '1');
  assert.equal(p.state, 'approved');
  assert.equal(p.approvedAt, Date.parse('2025-04-24T00:42:19Z'));
  assert.equal(p.submittedAt, Date.parse('2024-10-28T06:36:11Z'));
  assert.equal(p.approvedBy, 'ApproverA');
  assert.equal(p.submitter, 'SubmitterB');
  assert.equal(p.riskRating, 0);
  assert.equal(p.url, 'https://uberticket.cloudstaff.com/admin/policies/00000000-0000-5000-8000-000000000001/view');
});

test('questionnaire answers are not carried over', () => {
  assert.equal(JSON.stringify(normalizePolicy(raw)).includes('Home Address'), false);
  assert.equal('data' in normalizePolicy(raw), false);
});

test('states: open until approved; rejected and removed are not counted', () => {
  assert.equal(normalizePolicy({ ...raw, status: 'open', acknowledged_at: null, meta: {} }).state, 'open');
  assert.equal(normalizePolicy({ ...raw, status: 'approved', acknowledged_at: null, meta: {} }).state, 'open'); // no approval date
  assert.equal(normalizePolicy({ ...raw, status: 'rejected' }).state, 'rejected');
  assert.equal(normalizePolicy({ ...raw, status: 'approved', removed_at: '2026-01-01 00:00:00' }).state, 'rejected');
  assert.equal(normalizePolicy({ ...raw, status: 'resolved' }).state, 'approved');
  assert.equal(normalizePolicy({ ...raw, status: 'open', acknowledged_at: null, meta: {} }).approvedAt, null);
});

test('missing product falls back to a visible placeholder', () => {
  assert.equal(normalizePolicy({ ...raw, data: {} }).product, 'Unspecified product');
});

test('demo policies normalize, one per reassessment case', () => {
  const list = demoPiaPolicies(379488, Date.parse('2026-10-15T00:00:00Z')).map((r) => normalizePolicy(r));
  assert.ok(list.some((p) => p.state === 'open'));
  assert.ok(list.some((p) => p.state === 'rejected'));
  assert.ok(list.every((p) => p.product && p.product !== 'Unspecified product'));
});
