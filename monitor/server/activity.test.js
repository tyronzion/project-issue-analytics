import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeActivities } from './uberticket.js';
import { normalizeTicket } from './metrics.js';
import { makeCalendar } from './businessTime.js';

// Activity log of UB-3892147 (newest first, as the API returns it)
const activities = [
  { type: 'system', activity: 'Ticket has been automatically closed.', created_at: '2026-09-24T07:35:02.000000Z' },
  { type: 'attribute', activity: 'Ticket attributes has been updated. Status: Resolved ', created_at: '2026-09-24T07:31:58.000000Z' },
  { type: 'attribute', activity: 'Ticket attributes has been updated. <b>Assignee:</b> JaysonCo ', created_at: '2026-09-24T03:50:57.000000Z' },
  { type: 'attribute', activity: 'Ticket attributes has been updated. Status: On Going Assignee: ZionM ', created_at: '2026-09-24T03:03:03.000000Z' },
  { type: 'attribute', activity: 'Ticket has been endorsed from Ticket ID: UB-3892144 .', created_at: '2026-09-24T03:01:17.000000Z' },
];

test('activity log gives submitted (earliest entry) and resolved ("Status: Resolved") times', () => {
  const s = summarizeActivities(activities);
  assert.equal(s.activity_submitted_at, '2026-09-24T03:01:17.000Z');
  assert.equal(s.activity_resolved_at, '2026-09-24T07:31:58.000Z');
});

test('reopened then resolved again: MTTR ends at the latest resolution', () => {
  const s = summarizeActivities([
    { activity: 'Ticket attributes has been updated. Status: Resolved ', created_at: '2026-09-25T02:00:00.000000Z' },
    ...activities,
    { activity: 'Ticket attributes has been updated. Status: Re-opened ', created_at: '2026-09-24T08:00:00.000000Z' },
  ]);
  assert.equal(s.activity_resolved_at, '2026-09-25T02:00:00.000Z');
});

test('only "closed" in the log: closed time is used as resolved', () => {
  const s = summarizeActivities(activities.filter((a) => !a.activity.includes('Resolved')));
  assert.equal(s.activity_resolved_at, '2026-09-24T07:35:02.000Z');
});

test('DPSA MTTR is measured between the activity-log submitted and resolved times', () => {
  const raw = {
    id: 'c55da42d', serial: 3892147, template_id: 322255, status: 'resolved',
    // ticket fields deliberately different from the activity log
    created_at: '2026-09-23T03:00:00.000000Z', resolved_at: '2026-09-30 07:31:31',
    ...summarizeActivities(activities),
  };
  const t = normalizeTicket(raw, { calendar: makeCalendar(), envByTemplate: { 322255: 'Staging' }, targets: { mttrDays: 3 } });
  assert.equal(t.createdAt, Date.parse('2026-09-24T03:01:17Z'));
  assert.equal(t.resolvedAt, Date.parse('2026-09-24T07:31:58Z'));
  assert.equal(t.mttrDays, 0.5); // 03:01:17 -> 07:31:58 UTC = 4.5 business hours of a 9-hour day
  assert.equal(t.timesFrom, 'activity log');
});
