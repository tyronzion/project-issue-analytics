import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCalendar, parseUtc } from './businessTime.js';
import { normalizeFull, parseFormDate } from './fullAssessment.js';

const calendar = makeCalendar({ offsetHours: 8 });
const slaDays = { low: 5, medium: 10, high: 15, critical: 20 };
const opts = (now) => ({ calendar, slaDays, offsetHours: 8, now });

// Shape of UB ticket [PB-0933.3] Security Full Assessment
const base = {
  id: '10b06ec6', serial: 3906000, template_id: 1080829, status: 'on-going', priority: 'critical',
  created_at: '2026-10-09T02:20:58.000000Z', assigned_at: '2026-10-09 02:20:58',
  data: { 28968: '', 28969: 'Cloudstaff Mystaff', 28970: 'Q4', 28971: '2026', 28972: '10/09/2026', 28973: 'Invalid date', 36034: '4' },
};

test('form dates are local calendar days; "Invalid date" is empty', () => {
  assert.equal(parseFormDate('10/09/2026', 8), Date.UTC(2026, 9, 8, 16));
  assert.equal(parseFormDate('Invalid date', 8), null);
});

test('addBusinessDays skips weekends', () => {
  // Fri 09:00 Manila + 1 business day = Mon 09:00 Manila
  assert.equal(calendar.addBusinessDays(parseUtc('2026-10-09 01:00:00'), 1), parseUtc('2026-10-12 01:00:00'));
});

test('"normal" priority is Medium with a 10 business-day SLA', () => {
  const t = normalizeFull({ ...base, priority: 'normal' }, opts(parseUtc('2026-10-12 03:00:00')));
  assert.equal(t.priority, 'medium');
  assert.equal(t.sla, 10);
});

test('open critical assessment: fields, due date and state', () => {
  const t = normalizeFull(base, opts(parseUtc('2026-10-12 03:00:00')));
  assert.equal(t.product, 'Cloudstaff Mystaff');
  assert.equal(t.occurrence, '4');
  assert.equal(t.endDate, null);
  assert.equal(t.state, 'open');
  assert.equal(t.risk, 'ok');
  assert.equal(t.dueAt, calendar.addBusinessDays(parseUtc(base.created_at), 20));
});

test('low priority resolved in 6 business days misses its 5-day SLA', () => {
  const t = normalizeFull({ ...base, priority: 'low', status: 'resolved', resolved_at: '2026-10-19 03:00:00' }, opts(parseUtc('2026-10-21 03:00:00')));
  assert.equal(t.slaMet, false);
});

import { ROE_FIELDS, readField } from './fullAssessment.js';

// Shape of UB ticket [PB-0933] Security Test - Rules of Engagement (template 72913)
const roe = {
  id: '38f51610', serial: 3890001, template_id: 72913, status: 'resolved', priority: 'normal',
  created_at: '2026-10-01 00:05:56', resolved_at: '2026-10-09 07:15:03',
  data: {
    public: {
      'field_Product Name': { id: 19541, label: 'Product Name', type: 'text', value: 'Nexus V2' },
      field_Type: { id: 30741, label: 'Type', type: 'dropdown', value: 'Web Application' },
    },
    private: {
      'field_Start Date of Security Test': { id: 3866, label: 'Start Date of Security Test', type: 'date', value: '10/01/2026' },
      'field_End Date of Security Test': { id: 3867, label: 'End Date of Security Test', type: 'date', value: '10/09/2026' },
      'field_Time Spent (MM)': { id: 22570, label: 'Time Spent (MM)', type: 'number', value: '900' },
      field_Size: { id: 43044, label: 'Size', type: 'dropdown', value: 'Medium' },
    },
  },
};

test('readField handles flat (Full Assessment) and grouped (Rules of Engagement) data', () => {
  assert.equal(readField(base.data, { id: 28969 }), 'Cloudstaff Mystaff');
  assert.equal(readField(roe.data, ROE_FIELDS.product), 'Nexus V2');
  assert.equal(readField(roe.data, ROE_FIELDS.size), 'Medium');
});

test('Full Assessment ticket reads Time Spent (MM) and Size, flat or under private fields', () => {
  const flat = normalizeFull({ ...base, data: { ...base.data, 22570: '500', 43044: 'Low' } }, opts(parseUtc('2026-10-12 03:00:00')));
  assert.equal(flat.timeSpent, '500');
  assert.equal(flat.size, 'Low');
  const grouped = normalizeFull({ ...base, data: { ...base.data, private: { 'field_Time Spent (MM)': { label: 'Time Spent (MM)', type: 'number', value: '500' } } } }, opts(parseUtc('2026-10-12 03:00:00')));
  assert.equal(grouped.timeSpent, '500');
});

test('Rules of Engagement ticket: product, priority SLA, derived quarter', () => {
  const t = normalizeFull(roe, { ...opts(parseUtc('2026-10-12 03:00:00')), fields: ROE_FIELDS });
  assert.equal(t.product, 'Nexus V2');
  assert.equal(t.appType, 'Web Application');
  assert.equal(t.timeSpent, '900');
  assert.equal(t.priority, 'medium'); // "Normal"
  assert.equal(t.sla, 10);
  assert.equal(t.quarter, 'Q4');
  assert.equal(t.year, '2026');
  assert.equal(t.slaMet, true); // 1 Oct 08:05 -> 9 Oct 15:15 Manila ≈ 6.8 business days < 10
});
