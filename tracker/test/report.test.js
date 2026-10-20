import { test } from 'node:test';
import express from 'express';
import { createTracker } from '../server/tracker.js';
import assert from 'node:assert/strict';
import { CHECKS } from '../shared/logic.js';
import { reportReady, reportKind, sealFromCounts, buildReport, sealSpiel, fullAdvisory, roeFindings, normalizeReportInfo, parseRecommendations, reportFileName, reportAsOf, snapshotFor, needsSnapshot, normalizeSnapshot } from '../shared/report.js';

const all = Object.fromEntries(CHECKS.map((c) => [c.key, true]));

test('report is ready only when all 12 checklist items are ticked', () => {
  assert.equal(reportReady({ checks: all }), true);
  assert.equal(reportReady({ checks: { ...all, uploaded: false } }), false);
  assert.equal(reportReady({}), false);
});

test('template: Rules of Engagement tickets use the RoE report, everything else Full Assessment', () => {
  assert.equal(reportKind({ ticketSource: 'roe' }), 'roe');
  assert.equal(reportKind({ ticketSource: 'full' }), 'full');
  assert.equal(reportKind({}), 'full');
});

test('seal formula: band edges (A=Low, B=Medium, C=High, D=Critical)', () => {
  const s = (low, medium, high, critical) => sealFromCounts({ low, medium, high, critical });
  assert.equal(s(0, 0, 0, 0), 'Secure');
  assert.equal(s(15, 15, 0, 0), 'Secure');
  assert.equal(s(16, 0, 0, 0), 'Protected');
  assert.equal(s(30, 30, 0, 0), 'Protected');
  assert.equal(s(0, 0, 1, 0), 'Defended');
  assert.equal(s(31, 0, 0, 0), 'Defended');
  assert.equal(s(50, 50, 30, 0), 'Defended');
  assert.equal(s(0, 0, 31, 0), 'Vulnerable');
  assert.equal(s(0, 0, 50, 0), 'Vulnerable');
  assert.equal(s(0, 0, 0, 1), 'Exposed');
  assert.equal(s(50, 50, 50, 50), 'Exposed');
  assert.equal(s(51, 0, 0, 0), 'Compromised');
  assert.equal(s(0, 0, 0, 51), 'Compromised');
});

test('seal formula gives the same result as the previous Security Seal matrix', () => {
  const old = ({ low, medium, high, critical }) => {
    if (critical >= 51 || high >= 51 || medium >= 51 || low >= 51) return 'Compromised';
    if (critical >= 1) return 'Exposed';
    if (high >= 31) return 'Vulnerable';
    if (high >= 1 || medium >= 31 || low >= 31) return 'Defended';
    if (medium >= 16 || low >= 16) return 'Protected';
    return 'Secure';
  };
  const values = [0, 1, 15, 16, 30, 31, 50, 51, 60];
  for (const low of values) for (const medium of values) for (const high of values) for (const critical of values) {
    const c = { low, medium, high, critical };
    assert.equal(sealFromCounts(c), old(c), JSON.stringify(c));
  }
});

test('issues created inside the assessment window are New, others Backlog; overdue by due date', () => {
  const r = buildReport({
    today: '2026-10-20',
    assessment: { project: 'Redbean', period: '4th Quarter', ticketSource: 'full', actualStart: '2026-10-01', actualEnd: '2026-10-10', checks: all },
    issues: [
      { key: 'A-1', summary: 'old', created: '2026-09-01', dueDate: '2026-09-11', severity: 'low' },
      { key: 'A-2', summary: 'in window', created: '2026-10-05T03:00:00Z', dueDate: '2027-01-05', severity: 'medium' },
      { key: 'A-3', summary: 'last day', created: '2026-10-10', dueDate: '', severity: 'high' },
      { key: 'A-4', summary: 'after', created: '2026-10-11', dueDate: '2026-10-19', severity: 'informational' },
    ],
  });
  const type = Object.fromEntries(r.rows.map((x) => [x.key, x.type]));
  assert.deepEqual(type, { 'A-1': 'Backlog', 'A-2': 'New', 'A-3': 'New', 'A-4': 'Backlog' });
  assert.deepEqual(r.counts, { new: 2, backlog: 2, overdue: 2, unresolved: 4 });
  assert.deepEqual(r.rows.map((x) => x.key), ['A-3', 'A-2', 'A-1', 'A-4']); // New first, then by severity
  assert.equal(r.bySeverity.informational, 1);
  assert.equal(r.seal, 'Defended'); // one high
  assert.equal(r.kind, 'full');
});

test('open ticket: the window runs to today', () => {
  const r = buildReport({ today: '2026-10-20', assessment: { project: 'X', actualStart: '2026-10-15' }, issues: [{ key: 'B', created: '2026-10-19', severity: 'low' }] });
  assert.equal(r.rows[0].type, 'New');
});

test('no issues: Secure, with the no-issue wording', () => {
  const r = buildReport({ today: '2026-10-20', assessment: { project: 'X', ticketSource: 'roe' }, issues: [] });
  assert.equal(r.seal, 'Secure');
  assert.match(r.sealText[0], /no outstanding security issues were found/);
  assert.doesNotMatch(r.sealText.join(' '), /still present/);
  assert.equal(r.findings, 'During the assessment, no security issues were found.');
  assert.match(sealSpiel('Secure', 3)[0], /minor, easy-to-fix issues are still present/);
});

test('every seal has wording that names it', () => {
  for (const seal of ['Secure', 'Protected', 'Defended', 'Vulnerable', 'Exposed', 'Compromised']) {
    assert.match(sealSpiel(seal, 1)[0], new RegExp(`"${seal}\\."`));
  }
});

test('advisory and findings sentences agree in number', () => {
  assert.match(fullAdvisory({ new: 0, backlog: 14, overdue: 14, unresolved: 14 })[0], /no new issues were found\. However, there are 14 backlog issues still open\. All 14 unresolved issues are already past their due dates\./);
  assert.match(fullAdvisory({ new: 1, backlog: 0, overdue: 0, unresolved: 1 })[0], /1 new issue was found\./);
  assert.equal(fullAdvisory({ new: 0, backlog: 0, overdue: 0, unresolved: 0 }).length, 1);
  assert.equal(roeFindings([{ severity: 'medium' }]), 'During the assessment, 1 security issue was found: 1 medium-severity.');
  assert.equal(roeFindings([{ severity: 'high' }, { severity: 'low' }, { severity: 'low' }]), 'During the assessment, 3 security issues were found: 1 high-severity and 2 low-severity.');
});

test('report info validation', () => {
  assert.equal(normalizeReportInfo(null), null);
  assert.equal(normalizeReportInfo({ intro: '  ' }), null);
  assert.deepEqual(normalizeReportInfo({ intro: ' Hi ', dashboardUrl: 'https://x.test/d', unknown: 'dropped' }), { intro: 'Hi', dashboardUrl: 'https://x.test/d' });
  assert.throws(() => normalizeReportInfo({ dashboardUrl: 'javascript:alert(1)' }), /Dashboard link/);
  assert.throws(() => normalizeReportInfo({ scanResultsUrl: 'not a url' }), /Scan results link/);
  assert.throws(() => normalizeReportInfo({ intro: 5 }), /must be text/);
  assert.throws(() => normalizeReportInfo({ intro: 'x'.repeat(2001) }), /too long/);
  assert.throws(() => normalizeReportInfo([]), /object/);
});

test('recommendations and file name', () => {
  assert.deepEqual(parseRecommendations('Disable Directory Listing: Prevent browsing\n\nRestrict Files'), [
    { title: 'Disable Directory Listing', text: 'Prevent browsing' },
    { title: 'Restrict Files', text: '' },
  ]);
  assert.equal(reportFileName({ kind: 'full', project: 'Redbean User Microservice', period: '4th Quarter' }, 2026), '2026 Q4 Cloudstaff Redbean User Microservice Security Report');
  assert.equal(reportFileName({ kind: 'roe', project: 'Leew Rfp', period: '2nd Half' }, 2026), '2026 H2 Leew Rfp ROE Summary Report');
});

test('PATCH reportInfo: stored as an object, validated, and logged in history', async () => {
  const prev = process.env.TRACKER_DB_PATH;
  process.env.TRACKER_DB_PATH = ':memory:';
  const tracker = await createTracker({ root: '/unused', log: () => {} });
  if (prev === undefined) delete process.env.TRACKER_DB_PATH;
  else process.env.TRACKER_DB_PATH = prev;
  const outer = express();
  outer.use('/api/tracker', tracker.app);
  const http = outer.listen(0);
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${http.address().port}/api/tracker`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  try {
    const { body: cycle } = await call('POST', '/cycles', { track: 'quarterly', year: 2026 });
    const { body: app } = await call('POST', `/cycles/${cycle.id}/assessments`, { project: 'Redbean', period: '4th Quarter' });
    assert.equal(app.reportInfo, null);

    const ok = await call('PATCH', `/assessments/${app.id}`, { reportInfo: { dashboardUrl: ' https://dash.test/x ', intro: 'An API.', bogus: 'x' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.reportInfo, { intro: 'An API.', dashboardUrl: 'https://dash.test/x' });

    const bad = await call('PATCH', `/assessments/${app.id}`, { reportInfo: { scanResultsUrl: 'javascript:alert(1)' } });
    assert.equal(bad.status, 400);
    const badCreate = await call('POST', `/cycles/${cycle.id}/assessments`, { project: 'X', period: '4th Quarter', reportInfo: { dashboardUrl: 'ftp://x' } });
    assert.equal(badCreate.status, 400);

    const { body: rows } = await call('GET', `/cycles/${cycle.id}/assessments`);
    assert.deepEqual(rows.find((r) => r.id === app.id).reportInfo, { intro: 'An API.', dashboardUrl: 'https://dash.test/x' });
    const { body: history } = await call('GET', `/assessments/${app.id}/history`);
    assert.equal(history.filter((h) => h.field === 'reportInfo').length, 1);
  } finally {
    await new Promise((r) => http.close(r));
  }
});

test('reportAsOf / snapshotFor / needsSnapshot', () => {
  const resolved = { ticketKey: 'UB-1', ticketState: 'resolved', actualEnd: '2026-10-08' };
  assert.equal(reportAsOf(resolved, '2026-10-20'), '2026-10-08');
  assert.equal(reportAsOf({ ticketKey: 'UB-1', ticketState: 'open', actualEnd: null }, '2026-10-20'), '2026-10-20');
  assert.equal(reportAsOf({ actualEnd: '2026-05-27' }, '2026-10-20'), '2026-05-27'); // finished, no ticket
  assert.equal(needsSnapshot(resolved), true);
  const frozen = { ...resolved, reportSnapshot: { ticketKey: 'UB-1', asOf: '2026-10-08', issues: [] } };
  assert.equal(needsSnapshot(frozen), false);
  assert.equal(snapshotFor(frozen).asOf, '2026-10-08');
  // The next assessment (another ticket) does not reuse the old snapshot.
  const next = { ...frozen, ticketKey: 'UB-2', ticketState: 'open' };
  assert.equal(snapshotFor(next), null);
  assert.equal(needsSnapshot({ ...next, ticketState: 'resolved' }), true);
});

test('normalizeSnapshot keeps only known fields and valid values', () => {
  const s = normalizeSnapshot({ ticketKey: 'UB-1', asOf: '2026-10-08', issues: [{ key: 'A-1', summary: 'x', created: '2026-10-01', dueDate: 'soon', severity: 'evil', extra: 1 }] });
  assert.deepEqual(s.issues, [{ key: 'A-1', summary: 'x', created: '2026-10-01', dueDate: '', severity: null }]);
  assert.throws(() => normalizeSnapshot({ ticketKey: 'UB-1', asOf: 'today', issues: [] }), /asOf/);
  assert.throws(() => normalizeSnapshot({ asOf: '2026-10-08', issues: [] }), /ticketKey/);
  assert.throws(() => normalizeSnapshot({ ticketKey: 'UB-1', asOf: '2026-10-08', issues: 'x' }), /list/);
});

test('report snapshot route: only for the resolved ticket, written once, only admins clear it', async () => {
  const ms = (iso) => Date.parse(`${iso}T00:00:00Z`) - 8 * 3_600_000;
  let tickets = { full: [{ key: 'UB-1', url: 'https://x/1', state: 'open', product: 'Redbean', quarter: 'Q4', year: '2026', assignee: 'ZionM', createdAt: ms('2026-10-01'), resolvedAt: null }], roe: [] };
  const prev = process.env.TRACKER_DB_PATH;
  process.env.TRACKER_DB_PATH = ':memory:';
  const tracker = await createTracker({ root: '/unused', getTickets: () => tickets, isAdmin: (req) => req.headers['x-test-role'] === 'admin', log: () => {} });
  if (prev === undefined) delete process.env.TRACKER_DB_PATH;
  else process.env.TRACKER_DB_PATH = prev;
  const outer = express();
  outer.use('/api/tracker', tracker.app);
  const http = outer.listen(0);
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${http.address().port}/api/tracker`;
  const call = async (method, url, body, role) => {
    const res = await fetch(base + url, { method, headers: { ...(role ? { 'x-test-role': role } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const snap = (asOf, n) => ({ ticketKey: 'UB-1', asOf, issues: Array.from({ length: n }, (_, i) => ({ key: `R-${i}`, summary: 's', created: '2026-09-01', dueDate: '', severity: 'low' })) });
  try {
    const { body: cycle } = await call('POST', '/cycles', { track: 'quarterly', year: 2026 });
    const { body: app } = await call('POST', `/cycles/${cycle.id}/assessments`, { project: 'Redbean', period: '4th Quarter' });
    assert.equal(app.ticketKey, 'UB-1');
    assert.equal(app.ticketState, 'open');

    // Open ticket: nothing is frozen.
    assert.equal((await call('POST', `/assessments/${app.id}/report-snapshot`, snap('2026-10-08', 2))).body.reportSnapshot, null);

    tickets = { full: [{ ...tickets.full[0], state: 'resolved', resolvedAt: ms('2026-10-08') }], roe: [] };
    assert.equal((await call('POST', '/sync', {}, 'admin')).status, 200);
    assert.equal((await call('POST', `/assessments/${app.id}/report-snapshot`, { ...snap('2026-10-08', 1), ticketKey: 'UB-9' })).body.reportSnapshot, null);

    const first = await call('POST', `/assessments/${app.id}/report-snapshot`, snap('2026-10-08', 2), 'user');
    assert.equal(first.body.reportSnapshot.issues.length, 2);
    assert.equal(first.body.reportSnapshot.asOf, '2026-10-08');
    // A later capture (e.g. after issues changed) does not overwrite it.
    const again = await call('POST', `/assessments/${app.id}/report-snapshot`, snap('2026-10-08', 7), 'user');
    assert.equal(again.body.reportSnapshot.issues.length, 2);
    assert.equal(again.body.reportSnapshot.capturedAt, first.body.reportSnapshot.capturedAt);
    // Report text edits don't touch the frozen issues.
    const edited = await call('PATCH', `/assessments/${app.id}`, { reportInfo: { intro: 'x' } });
    assert.equal(edited.body.reportSnapshot.issues.length, 2);

    assert.equal((await call('DELETE', `/assessments/${app.id}/report-snapshot`, null, 'user')).status, 403);
    assert.equal((await call('DELETE', `/assessments/${app.id}/report-snapshot`)).status, 403);
    const cleared = await call('DELETE', `/assessments/${app.id}/report-snapshot`, null, 'admin');
    assert.equal(cleared.body.reportSnapshot, null);
    const { body: history } = await call('GET', `/assessments/${app.id}/history`);
    assert.equal(history.filter((h) => h.field === 'reportSnapshot').length, 2);
  } finally {
    await new Promise((r) => http.close(r));
  }
});
