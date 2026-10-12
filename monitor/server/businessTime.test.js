import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCalendar, parseUtc } from './businessTime.js';

const cal = makeCalendar({ offsetHours: 8, start: '08:00', end: '17:00', holidays: ['2026-09-21'] });
const utc = (s) => parseUtc(s);

test('parses both UberTicket timestamp formats as UTC', () => {
  assert.equal(utc('2026-09-23 08:35:02'), utc('2026-09-23T08:35:02.000000Z'));
});

test('same-day minutes inside business hours', () => {
  // 09:00 -> 09:45 Manila (01:00 -> 01:45 UTC), Tuesday
  assert.equal(cal.businessMinutes(utc('2026-09-22 01:00:00'), utc('2026-09-22 01:45:00')), 45);
});

test('after-hours submission starts the clock next business morning', () => {
  // Tue 18:00 Manila -> Wed 08:30 Manila = 30 business minutes
  assert.equal(cal.businessMinutes(utc('2026-09-22 10:00:00'), utc('2026-09-23 00:30:00')), 30);
});

test('weekends and holidays are skipped', () => {
  // Fri 16:00 Manila -> Tue 09:00 Manila, Mon 2026-09-21 is a holiday => 1h Fri + 1h Tue
  assert.equal(cal.businessMinutes(utc('2026-09-18 08:00:00'), utc('2026-09-22 01:00:00')), 120);
});

test('full business days', () => {
  // Tue 08:00 -> Thu 08:00 Manila = 2 business days
  assert.equal(cal.businessDays(utc('2026-09-22 00:00:00'), utc('2026-09-24 00:00:00')), 2);
});

test('end before start is zero', () => {
  assert.equal(cal.businessMinutes(utc('2026-09-22 05:00:00'), utc('2026-09-22 04:00:00')), 0);
});

import { phHolidayList } from './phHolidays.js';

test('Philippine holidays are not business days', () => {
  const ph = makeCalendar({ offsetHours: 8, holidays: phHolidayList() });
  // Tue 23 Dec 2025 08:00 Manila -> Fri 26 Dec 08:00: 24 (Christmas Eve) and 25 (Christmas) are holidays => 1 business day
  assert.equal(ph.businessDays(utc('2025-12-23 00:00:00'), utc('2025-12-26 00:00:00')), 1);
  // Holy Week 2026: Wed 1 Apr 08:00 -> Mon 6 Apr 08:00 skips Maundy Thu, Good Fri, Black Sat and Sunday => 1 business day
  assert.equal(ph.businessDays(utc('2026-04-01 00:00:00'), utc('2026-04-06 00:00:00')), 1);
  // SLA due date moves past a holiday: Fri 20 Mar 2026 is Eid'l Fitr
  assert.equal(ph.addBusinessDays(utc('2026-03-19 01:00:00'), 1), utc('2026-03-23 01:00:00')); // Thu 09:00 -> Mon 09:00
});
