import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE_FACTORS, SIZE_BANDS, TEST_DURATION, TEST_TYPES, calculateSize, durationText, factorScore, sizeFromScore, sizeSummary } from '../shared/sizing.js';

const factor = (key) => SIZE_FACTORS.find((f) => f.key === key);

test('workbook model reproduces the SharePoint calculator values', () => {
  // The values the workbook's nested IFs give, per option.
  assert.equal(factorScore(factor('functionality'), 'Low Complexity', 'workbook'), 0.075);
  assert.equal(factorScore(factor('functionality'), 'Critical Complexity', 'workbook'), 0.3);
  assert.equal(factorScore(factor('pages'), '1 to 5', 'workbook'), 0.025);
  assert.equal(factorScore(factor('pages'), '301 or more', 'workbook'), 0.25);
  assert.ok(Math.abs(factorScore(factor('data'), '3 to 5', 'workbook') - 0.08) < 1e-12);
  assert.equal(factorScore(factor('integrations'), '1 to 2 apps', 'workbook'), 0.0375);
  assert.equal(factorScore(factor('roles'), '4 to 6', 'workbook'), 0.05);
  assert.equal(factorScore(factor('users'), '100,001 or more', 'workbook'), 0);
});

test('workbook example: Low complexity, 11-20 pages, 21+ data, no integrations, 4-6 roles = 40% Medium', () => {
  const answers = { functionality: 'Low Complexity', pages: '11 to 20', data: '21 or more', integrations: 'None', roles: '4 to 6' };
  const r = calculateSize(answers, 'workbook');
  assert.ok(Math.abs(r.total - 0.4) < 1e-9);
  assert.equal(r.size, 'Medium');
  assert.equal(r.complete, true); // the workbook ignores User base
  const adj = calculateSize({ ...answers, users: '1 to 1,000' });
  assert.equal(adj.size, 'Medium');
  assert.equal(calculateSize(answers).complete, false);
});

test('weights add up to 100% in both models', () => {
  for (const model of ['workbook', 'adjusted']) {
    const max = SIZE_FACTORS.reduce((s, f) => s + f.weights[model], 0);
    assert.ok(Math.abs(max - 1) < 1e-9, model);
    const top = Object.fromEntries(SIZE_FACTORS.map((f) => [f.key, f.options.at(-1)]));
    assert.equal(calculateSize(top, model).size, 'Critical');
    assert.equal(calculateSize({}, model).size, 'Low');
  }
});

test('band edges are inclusive, as in the workbook (<=25% Low, <=50% Medium, <=75% High)', () => {
  assert.equal(sizeFromScore(0.25), 'Low');
  assert.equal(sizeFromScore(0.25000000000000006), 'Low');
  assert.equal(sizeFromScore(0.2501), 'Medium');
  assert.equal(sizeFromScore(0.5), 'Medium');
  assert.equal(sizeFromScore(0.75), 'High');
  assert.equal(sizeFromScore(0.7501), 'Critical');
});

test('unknown answers score 0 and do not count as answered', () => {
  const r = calculateSize({ functionality: 'Huge', pages: '6 to 10' });
  assert.equal(r.answered, 1);
  assert.equal(r.breakdown.find((b) => b.key === 'functionality').score, 0);
});

test('adjusted model counts User base', () => {
  const base = { functionality: 'Medium Complexity', pages: '21 to 40', data: '3 to 5', integrations: '3 to 4 apps', roles: '4 to 6' };
  const small = calculateSize({ ...base, users: '1 to 1,000' });
  const large = calculateSize({ ...base, users: '100,001 or more' });
  assert.ok(large.total > small.total);
  assert.equal(calculateSize(base, 'workbook').total, calculateSize({ ...base, users: '100,001 or more' }, 'workbook').total);
});

test('summary explains the size, its drivers, effort and the workbook result', () => {
  const answers = { functionality: 'High Complexity', pages: '71 to 100', data: '6 to 10', integrations: '5 to 6 apps', roles: '4 to 6', users: '1,001 to 10,000' };
  const text = sizeSummary(answers, { appName: 'StaffCentral' });
  const r = calculateSize(answers);
  assert.match(text, new RegExp(`^StaffCentral is sized as ${r.size.toUpperCase()}`));
  assert.match(text, /driven mainly by functionality and features \(High Complexity/);
  assert.match(text, /Test duration for a Large rating.*Black-Box 72–96 hrs \(9–12 days\); Gray-Box 56–80 hrs \(7–10 days\); White-Box 72–104 hrs \(9–13 days\)/);
  assert.doesNotMatch(text, /man-hours|points\b.*monitoring/);
  assert.match(text, /Strike Team workbook/);
  assert.match(text, /- User base: 1,001 to 10,000/);
  assert.doesNotMatch(text, /not answered yet/);
  assert.match(sizeSummary({ pages: '1 to 5' }), /^The application is sized as LOW.*5 factor\(s\) not answered yet/s);
});

test('every size has a test duration for each test type, from the rating table', () => {
  for (const { size } of SIZE_BANDS) {
    for (const { key } of TEST_TYPES) {
      const [lo, hi] = TEST_DURATION[size][key];
      assert.ok(lo > 0 && hi >= lo, `${size} ${key}`);
    }
  }
  assert.deepEqual(TEST_DURATION.Low.whiteBox, [24, 32]);
  assert.deepEqual(TEST_DURATION.Critical.whiteBox, [120, 168]);
  assert.equal(TEST_DURATION.High.rating, 'Large');
  assert.equal(durationText([32, 48]), '32–48 hrs (4–6 days)');
});
