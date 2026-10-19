import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piaStatus, addYear, dayOf, daysBetween, isDay } from '../shared/rules.js';

const at = (day, hh = 2) => Date.parse(`${day}T${String(hh).padStart(2, '0')}:00:00Z`); // 10:00 Manila
const approved = (day) => ({ state: 'approved', approvedAt: at(day), submittedAt: at(day) - 30 * 86_400_000 });
const open = (day) => ({ state: 'open', approvedAt: null, submittedAt: at(day) });
const rejected = (day) => ({ state: 'rejected', approvedAt: null, submittedAt: at(day) });

test('addYear keeps the day; 29 Feb becomes 28 Feb', () => {
  assert.equal(addYear('2025-04-24'), '2026-04-24');
  assert.equal(addYear('2024-02-29'), '2025-02-28');
  assert.equal(addYear('2023-12-31'), '2024-12-31');
});

test('dayOf uses Manila time (UTC+8)', () => {
  assert.equal(dayOf(Date.parse('2026-01-31T15:59:00Z')), '2026-01-31');
  assert.equal(dayOf(Date.parse('2026-01-31T16:00:00Z')), '2026-02-01');
  assert.equal(daysBetween('2026-10-15', '2026-11-14'), 30);
  assert.equal(daysBetween('2026-10-15', '2026-10-14'), -1);
});

test('isDay accepts real calendar dates only', () => {
  assert.equal(isDay('2026-02-28'), true);
  for (const bad of ['2026-02-30', '2026-2-1', '20260201', '', null, '2026-13-01']) assert.equal(isDay(bad), false, String(bad));
});

test('no policy at all: never assessed; rejected policies do not count', () => {
  assert.equal(piaStatus({ policies: [], today: '2026-10-15' }).status, 'never');
  assert.equal(piaStatus({ policies: [rejected('2026-01-01')], today: '2026-10-15' }).status, 'never');
});

test('submitted but not approved: initial PIA in progress', () => {
  const s = piaStatus({ policies: [open('2026-09-01')], today: '2026-10-15' });
  assert.equal(s.status, 'initial');
  assert.equal(s.dueOn, null);
});

test('due 12 months after approval; current, coming due and overdue around the window', () => {
  const policies = [approved('2025-11-20')];
  assert.deepEqual(
    (({ status, lastAssessed, dueOn, daysLeft, lastSource }) => ({ status, lastAssessed, dueOn, daysLeft, lastSource }))(piaStatus({ policies, today: '2026-10-15' })),
    { status: 'current', lastAssessed: '2025-11-20', dueOn: '2026-11-20', daysLeft: 36, lastSource: 'policy' },
  );
  assert.equal(piaStatus({ policies, today: '2026-10-21' }).status, 'due-soon'); // 30 days left
  assert.equal(piaStatus({ policies, today: '2026-10-20' }).status, 'current'); // 31 days left
  assert.equal(piaStatus({ policies, today: '2026-11-20' }).status, 'due-soon'); // due today
  assert.equal(piaStatus({ policies, today: '2026-11-21' }).status, 'overdue');
  assert.equal(piaStatus({ policies, today: '2026-10-15', dueSoonDays: 60 }).status, 'due-soon');
});

test('a recorded reassessment resets the cycle; the latest of policy and reassessment wins', () => {
  const policies = [approved('2024-10-28')];
  assert.equal(piaStatus({ policies, today: '2026-10-15' }).status, 'overdue');
  const s = piaStatus({ policies, reassessments: [{ assessedOn: '2026-01-16' }], today: '2026-10-15' });
  assert.equal(s.status, 'current');
  assert.equal(s.lastAssessed, '2026-01-16');
  assert.equal(s.lastSource, 'reassessment');
  assert.equal(s.firstApproved, '2024-10-28');
  // An older reassessment doesn't move the date back.
  assert.equal(piaStatus({ policies: [approved('2026-03-01')], reassessments: [{ assessedOn: '2025-12-01' }], today: '2026-10-15' }).lastAssessed, '2026-03-01');
});

test('a newer policy under review shows "in progress" but stays overdue until it is approved', () => {
  const s = piaStatus({ policies: [approved('2025-01-10'), open('2026-09-01')], today: '2026-10-15' });
  assert.equal(s.status, 'overdue');
  assert.equal(s.inProgress, true);
  // An open policy from before the last assessment isn't "in progress".
  assert.equal(piaStatus({ policies: [open('2024-12-01'), approved('2025-01-10')], today: '2026-10-15' }).inProgress, false);
  // Approving the new version resets the cycle.
  assert.equal(piaStatus({ policies: [approved('2025-01-10'), approved('2026-10-01')], today: '2026-10-15' }).status, 'current');
});

test('a 29 Feb approval is due on 28 Feb', () => {
  const s = piaStatus({ policies: [approved('2028-02-29')], today: '2029-02-28' });
  assert.equal(s.dueOn, '2029-02-28');
  assert.equal(s.status, 'due-soon');
  assert.equal(piaStatus({ policies: [approved('2028-02-29')], today: '2029-03-01' }).status, 'overdue');
});
