import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, appStatus, completion, overallStatus, monitoringScore, monitoringSummary, timeStats, timeByPriority, timeByGroup } from '../shared/logic.js';

const all = Object.fromEntries(CHECKS.map((c) => [c.key, true]));
const app = (over) => ({ checks: {}, dependabots: 'Not Started', codeReview: 'Not Started', report: 'Not Started', priority: 'High', ...over });

test('App status follows the 12 checklist items', () => {
  assert.equal(appStatus({}), 'Not Started');
  assert.equal(appStatus({ testing: true }), 'In Progress');
  assert.equal(appStatus(all), 'Uploaded');
});

test('completion: App 40 + 20 per finished deliverable (matches the Excel ladder)', () => {
  assert.equal(completion(app({ checks: all, dependabots: 'Done', codeReview: 'Done - N/A', report: 'Done - Uploaded' })), 100);
  assert.equal(completion(app({ checks: all, dependabots: 'No repository', codeReview: 'Done' })), 80);
  assert.equal(completion(app({ dependabots: 'Done', codeReview: 'Done', report: 'Done' })), 60);
  assert.equal(completion(app({ checks: all })), 40);
  assert.equal(completion(app({ report: 'Done' })), 20);
  assert.equal(completion(app({})), 0);
});

test('status and monitoring score', () => {
  assert.equal(overallStatus(app({ checks: { testing: true }, dependabots: 'Done', codeReview: 'Done', report: 'Done' })), 'In Progress');
  const done = app({ checks: all, dependabots: 'Done', codeReview: 'Done', report: 'Done' });
  assert.equal(overallStatus(done), 'Done');
  assert.equal(monitoringScore(done), 3);
  assert.equal(monitoringScore({ ...done, priority: 'Critical' }), 4);
  assert.equal(monitoringScore(app({})), 0);
});

test('monitoring summary totals', () => {
  const done = app({ checks: all, dependabots: 'Done', codeReview: 'Done', report: 'Done', seal: 'Secure' });
  const s = monitoringSummary([done, app({ priority: 'Low' }), { ...done, priority: 'Medium' }]);
  assert.equal(s.goalPoints, 3 + 1 + 2);
  assert.equal(s.currentPoints, 5);
  assert.equal(s.done, 2);
  assert.equal(s.seals.Secure, 2);
});

test('time spent: range ignores apps with no time recorded', () => {
  const rows = [
    { priority: 'High', timeSpent: 360 },
    { priority: 'High', timeSpent: 2600 },
    { priority: 'High', timeSpent: null },
    { priority: 'Low', timeSpent: 0 },
  ];
  assert.deepEqual(timeStats(rows.slice(0, 3)), { apps: 3, recorded: 2, min: 360, max: 2600, avg: 1480, total: 2960 });
  const t = timeByPriority(rows);
  assert.deepEqual(t.byPriority.map((x) => x.priority), ['High', 'Low']);
  assert.equal(t.byPriority[1].recorded, 0);
  assert.equal(t.byPriority[1].min, null);
  assert.equal(t.overall.recorded, 2);
  assert.equal(t.overall.total, 2960);
});

test('time spent per group: most total time first, blank key kept', () => {
  const rows = [
    { securityTester: 'NasQ', timeSpent: 120 },
    { securityTester: 'ZionM', timeSpent: 600 },
    { securityTester: 'NasQ', timeSpent: 60 },
    { securityTester: '', timeSpent: null },
  ];
  const g = timeByGroup(rows, (r) => r.securityTester);
  assert.deepEqual(g.map((x) => [x.key, x.apps, x.recorded, x.total]), [['ZionM', 1, 1, 600], ['NasQ', 2, 2, 180], ['', 1, 0, 0]]);
  assert.equal(g[1].min, 60);
  assert.equal(g[1].max, 120);
});
