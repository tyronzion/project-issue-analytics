import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { syncTickets } from '../server/sync.js';
import { enrich, matchKey } from '../shared/logic.js';

const ms = (iso) => Date.parse(`${iso}T00:00:00Z`) - 8 * 3_600_000; // midnight Manila

async function setup() {
  const db = await openDb(':memory:');
  db.prepare("INSERT INTO cycles (id, track, year) VALUES (1, 'biannual', 2026), (2, 'quarterly', 2026)").run();
  const add = db.prepare('INSERT INTO assessments (cycle_id, period, project, priority, security_tester, seal, seal_source) VALUES (?, ?, ?, ?, ?, ?, ?)');
  add.run(1, '2nd Half', 'MyStaff', 'High', 'Old Tester', null, null);
  add.run(1, '2nd Half', 'Pact-X', 'High', null, 'Secure', 'excel');
  add.run(1, '1st Half', 'Buzz', 'Low', null, null, null);
  add.run(2, '3rd Quarter', 'Payroll', 'Critical', null, null, null);
  add.run(1, '2nd Half', 'Payroll', 'Critical', null, null, null);
  return db;
}

const ticket = (o) => ({ key: 'UB-1', url: 'https://x/1', state: 'open', product: 'X', quarter: 'Q3', year: '2026', assignee: 'ZionM', createdAt: ms('2026-07-01'), resolvedAt: null, ...o });
const row = (db, project, period) => db.prepare('SELECT * FROM assessments WHERE project = ? AND period = ?').get(project, period);

test('matchKey ignores case, punctuation and a leading "Cloudstaff"', () => {
  assert.equal(matchKey('Cloudstaff Mystaff'), matchKey('MyStaff'));
  assert.equal(matchKey('Pact-X'), matchKey('pact x'));
  assert.notEqual(matchKey('MyStaff'), matchKey('MyStaff Mobile'));
});

test('open ticket -> In Progress with tester and start date', async () => {
  const db = await setup();
  const res = syncTickets(db, { full: [ticket({ product: 'Cloudstaff Mystaff' })], roe: [] });
  assert.equal(res.matchedApps, 1);
  const r = row(db, 'MyStaff', '2nd Half');
  assert.equal(r.ticket_state, 'open');
  assert.equal(r.security_tester, 'ZionM');
  assert.equal(r.actual_start, '2026-07-01');
  assert.equal(r.actual_end, null);
  assert.equal(enrich({ checks: {}, ticketState: r.ticket_state }).status, 'In Progress');
});

test('resolved ticket -> Done, end date, tester frozen at resolution', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ product: 'MyStaff', state: 'resolved', resolvedAt: ms('2026-07-20') })], roe: [] });
  let r = row(db, 'MyStaff', '2nd Half');
  assert.equal(r.actual_end, '2026-07-20');
  assert.equal(r.tester_frozen, 1);
  // Reassigned after resolution: tester stays.
  syncTickets(db, { full: [ticket({ product: 'MyStaff', state: 'resolved', resolvedAt: ms('2026-07-20'), assignee: 'Someone Else' })], roe: [] });
  r = row(db, 'MyStaff', '2nd Half');
  assert.equal(r.security_tester, 'ZionM');
  const e = enrich({ checks: {}, ticketState: 'resolved' });
  assert.equal(e.status, 'Done');
  assert.equal(e.checklistGap, true);
});

test('existing Excel seal is kept and tied to the resolved ticket', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ key: 'UB-9', product: 'PactX', state: 'resolved', resolvedAt: ms('2026-08-01') })], roe: [] });
  const r = row(db, 'Pact-X', '2nd Half');
  assert.equal(r.seal, 'Secure');
  assert.equal(r.seal_ticket_key, 'UB-9');
});

test('quarterly apps take precedence; quarter picks the period; ROE time spent', async () => {
  const db = await setup();
  syncTickets(db, { full: [], roe: [ticket({ product: 'Payroll', timeSpent: '480' }), ticket({ key: 'UB-2', product: 'Buzz', quarter: 'Q1' })] });
  assert.equal(row(db, 'Payroll', '3rd Quarter').ticket_key, 'UB-1');
  assert.equal(row(db, 'Payroll', '3rd Quarter').time_spent, 480);
  assert.equal(row(db, 'Payroll', '2nd Half').ticket_key, null);
  assert.equal(row(db, 'Buzz', '1st Half').ticket_key, 'UB-2');
});

test('unmatched tickets are reported; a manual link fixes them; rejected are ignored', async () => {
  const db = await setup();
  let res = syncTickets(db, { full: [ticket({ product: 'Staff Portal' }), ticket({ key: 'UB-3', product: 'Buzz', state: 'rejected', quarter: 'Q1' })], roe: [] });
  assert.equal(res.unmatched.length, 1);
  assert.equal(res.unmatched[0].product, 'Staff Portal');
  db.prepare('INSERT INTO ticket_links (product_key, product, project) VALUES (?, ?, ?)').run(matchKey('Staff Portal'), 'Staff Portal', 'MyStaff');
  res = syncTickets(db, { full: [ticket({ product: 'Staff Portal' })], roe: [] });
  assert.equal(res.unmatched.length, 0);
  assert.equal(row(db, 'MyStaff', '2nd Half').ticket_key, 'UB-1');
  assert.equal(row(db, 'Buzz', '1st Half').ticket_key, null);
});

test('latest ticket wins when an app has several in the period', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ key: 'UB-OLD', product: 'MyStaff', createdAt: ms('2026-07-01') }), ticket({ key: 'UB-NEW', product: 'MyStaff', createdAt: ms('2026-09-01') })], roe: [] });
  assert.equal(row(db, 'MyStaff', '2nd Half').ticket_key, 'UB-NEW');
});

test('classification: Rules of Engagement = New, Full Assessment = Old', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ product: 'MyStaff' })], roe: [ticket({ key: 'UB-2', product: 'Buzz', quarter: 'Q1' })] });
  assert.equal(row(db, 'MyStaff', '2nd Half').classification, 'Old');
  assert.equal(row(db, 'Buzz', '1st Half').classification, 'New');
});

test('a Rules of Engagement ticket for an unknown app creates it as a New app', async () => {
  const db = await setup();
  const res = syncTickets(db, { full: [], roe: [ticket({ key: 'UB-50', product: 'Staff Portal', priority: 'high', targetLink: 'https://portal.example', state: 'resolved', resolvedAt: ms('2026-08-10'), timeSpent: '600' })] });
  assert.equal(res.created.length, 1);
  assert.equal(res.unmatched.length, 0);
  const r = row(db, 'Staff Portal', '2nd Half');
  assert.equal(r.cycle_id, 1);
  assert.equal(r.classification, 'New');
  assert.equal(r.priority, 'High');
  assert.equal(r.testing_url, 'https://portal.example');
  assert.equal(r.ticket_key, 'UB-50');
  assert.equal(r.ticket_state, 'resolved');
  assert.equal(r.actual_end, '2026-08-10');
  assert.equal(r.time_spent, 600);
  assert.equal(r.created_from_ticket, 'UB-50');
  // Next sync: matched, not created again.
  const again = syncTickets(db, { full: [], roe: [ticket({ key: 'UB-50', product: 'Staff Portal', state: 'resolved', resolvedAt: ms('2026-08-10') })] });
  assert.equal(again.created.length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assessments WHERE project = 'Staff Portal'").get().n, 1);
});

test('one app per period even with several tickets; Full Assessment tickets never create apps', async () => {
  const db = await setup();
  const res = syncTickets(db, {
    full: [ticket({ key: 'UB-60', product: 'Ghost App' })],
    roe: [ticket({ key: 'UB-61', product: 'New Tool' }), ticket({ key: 'UB-62', product: 'new-tool', createdAt: ms('2026-09-01') })],
  });
  assert.equal(res.created.length, 1);
  assert.equal(row(db, 'New Tool', '2nd Half').ticket_key, 'UB-62');
  assert.equal(row(db, 'Ghost App', '2nd Half'), undefined);
  assert.equal(res.unmatched.length, 1);
});

test('no backfill for old years; a new year gets its Bi-Annual cycle', async () => {
  const db = await setup();
  const res = syncTickets(db, { full: [], roe: [ticket({ key: 'UB-70', product: 'Old Thing', year: '2023' }), ticket({ key: 'UB-71', product: 'Next Year App', year: '2027', quarter: 'Q1' })] });
  assert.equal(res.created.length, 1);
  assert.equal(res.unmatched[0].product, 'Old Thing');
  const c = db.prepare("SELECT id FROM cycles WHERE track = 'biannual' AND year = 2027").get();
  assert.ok(c);
  assert.equal(row(db, 'Next Year App', '1st Half').cycle_id, c.id);
});

test('an ignored ticket (its app was deleted) is not re-created', async () => {
  const db = await setup();
  db.prepare("INSERT INTO ticket_ignores (ticket_key, product) VALUES ('UB-80', 'Unwanted')").run();
  const res = syncTickets(db, { full: [], roe: [ticket({ key: 'UB-80', product: 'Unwanted' })] });
  assert.equal(res.created.length, 0);
  assert.equal(res.unmatched.length, 1);
});

test('listApps: one entry per app, from its most recent cycle', async () => {
  const { listApps } = await import('../server/db.js');
  const db = await setup();
  db.prepare("INSERT INTO cycles (id, track, year) VALUES (3, 'biannual', 2025)").run();
  db.prepare("INSERT INTO assessments (cycle_id, period, project, is_active, repositories) VALUES (3, '1st Half', 'Cloudstaff MyStaff', 'Decommissioned', 'old-repo')").run();
  const apps = listApps(db);
  assert.deepEqual(apps.map((a) => a.name).sort(), ['Buzz', 'MyStaff', 'Pact-X', 'Payroll']);
  assert.equal(apps.find((a) => a.name === 'MyStaff').decommissioned, false);
});

test('Full Assessment time spent is synced too; an empty field keeps the recorded time', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ product: 'MyStaff', timeSpent: '500' })], roe: [] });
  assert.equal(row(db, 'MyStaff', '2nd Half').time_spent, 500);
  syncTickets(db, { full: [ticket({ product: 'MyStaff', timeSpent: '' })], roe: [] });
  assert.equal(row(db, 'MyStaff', '2nd Half').time_spent, 500);
});

test('a linked ticket that is rejected later is unlinked and stops counting', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ product: 'MyStaff', timeSpent: '500', state: 'resolved', resolvedAt: ms('2026-07-10') })], roe: [] });
  assert.equal(row(db, 'MyStaff', '2nd Half').ticket_key, 'UB-1');
  const res = syncTickets(db, { full: [ticket({ product: 'MyStaff', timeSpent: '500', state: 'rejected' })], roe: [] });
  const r = row(db, 'MyStaff', '2nd Half');
  assert.equal(r.ticket_key, null);
  assert.equal(r.ticket_state, null);
  assert.equal(r.actual_end, null);
  assert.equal(r.time_spent, null);
  assert.equal(res.updated, 1);
  assert.equal(enrich({ checks: {}, ticketState: r.ticket_state }).status, 'Not Started');
});

test('unlinking a rejected ticket keeps a time spent entered by hand', async () => {
  const db = await setup();
  syncTickets(db, { full: [ticket({ product: 'MyStaff', timeSpent: '500' })], roe: [] });
  db.prepare("UPDATE assessments SET time_spent = 720 WHERE project = 'MyStaff'").run();
  syncTickets(db, { full: [ticket({ product: 'MyStaff', timeSpent: '500', state: 'rejected' })], roe: [] });
  assert.equal(row(db, 'MyStaff', '2nd Half').time_spent, 720);
});
