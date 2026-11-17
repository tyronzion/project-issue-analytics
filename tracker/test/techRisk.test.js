import test from 'node:test';
import assert from 'node:assert/strict';
import { setClock, detect, matchCves, workbookToApps, analyzeWorkbook, applyEndOfLifeRows, LIFECYCLE, reposFromText } from '../shared/techRisk.js';

// Pin "today" so lifecycle states don't drift with the calendar.
setClock(() => new Date('2026-11-17T00:00:00Z'));

const byTech = (list, prefix) => list.find((t) => t.detected.startsWith(prefix));

test('end-of-life runtimes and frameworks are found with their dates', () => {
  const t = detect('Backend: Laravel Lumen 6 (php-fpm + Nginx). Language: PHP 7.4. Data: MySQL 8 (2 connections); Redis.');
  assert.equal(byTech(t, 'PHP 7.4').status, 'End of life');
  assert.equal(byTech(t, 'PHP 7.4').severity, 'Critical'); // 3+ years without fixes
  assert.equal(byTech(t, 'Laravel Lumen 6').eol, '2022-09-06');
  const mysql = byTech(t, 'MySQL 8');
  assert.equal(mysql.cycle, '8.0');
  assert.equal(mysql.status, 'End of life');
  assert.equal(mysql.severity, 'High'); // databases are capped at High
});

test('supported, ending soon and security-only states', () => {
  const t = detect('PHP 8.5, PHP 8.2, Angular 21 (^21.2.6), Angular 20 (^20.3.25), .NET 10, .NET 9');
  assert.equal(byTech(t, 'PHP 8.5').status, 'Supported');
  assert.equal(byTech(t, 'PHP 8.2').status, 'EOL soon'); // security fixes stop 31 Dec 2026
  assert.equal(byTech(t, 'Angular ^21.2.6').status, 'Security fixes only');
  assert.equal(byTech(t, 'Angular ^20.3.25').status, 'EOL soon');
  assert.equal(byTech(t, '.NET 10').status, 'Supported');
  assert.equal(byTech(t, '.NET 9').status, 'End of life'); // 10 Nov 2026
});

test('versions an app was migrated away from are ignored', () => {
  const t = detect('Tap admin rebuilt on CakePHP 5.4 / PHP 8.5 (from CakePHP 3.10). Meeting room admin rebuilt from CakePHP 2.5 to 5.4.');
  assert.ok(t.some((x) => x.detected === 'CakePHP 5.4'));
  assert.ok(!t.some((x) => /CakePHP (3|2)/.test(x.detected)));
});

test('the Laravel/Lumen category label is not read as Lumen, and n8n workflow folders are not n8n servers', () => {
  const t = detect('Tech Category: Angular SPA + Laravel/Lumen (PHP). Integrations: Google Drive, n8n workflows. Backend: Laravel 12');
  assert.ok(!t.some((x) => x.product === 'lumen'));
  assert.ok(!t.some((x) => x.product === 'n8n'));
});

test('a generic version is dropped when a more specific one is present', () => {
  const t = detect('Frontend: Vue 3 (3.2.13; Vue CLI). Summary: Vue 3 Tap web frontend.');
  assert.deepEqual(t.filter((x) => x.product === 'vue').map((x) => x.detected), ['Vue 3.2.13']);
});

test('CVE matching: exact, declared range, major only and no fix', () => {
  const ang = (s) => detect(s).find((x) => x.product === 'angular');
  // Exact 22.1.0 is below the 22.1.6 fix: affected.
  const exact = matchCves(ang('Angular 22 (22.1.0)')).find((v) => v.id === 'CVE-2026-88057');
  assert.equal(exact.state, 'Affected');
  assert.equal(exact.fixed, '22.1.6');
  // Exact 21.2.23 is the fix: not listed.
  assert.ok(!matchCves(ang('Angular 21 (21.2.23)')).some((v) => v.id === 'CVE-2026-88057'));
  // ^21.2.6 may already be patched in the lock file.
  assert.match(matchCves(ang('Angular 21 (^21.2.6)')).find((v) => v.id === 'CVE-2026-88057').state, /^Possibly affected/);
  // Angular 19 has no fix for the 2026 advisories.
  assert.match(matchCves(ang('Angular 19 (^19.2.7)')).find((v) => v.id === 'CVE-2026-88057').state, /^Affected \(no fix/);
  // PostgreSQL 12 never got the libpq fix.
  const pg = detect('PostgreSQL 12.4').find((x) => x.product === 'postgresql');
  assert.match(matchCves(pg).find((v) => v.id === 'CVE-2025-1094').state, /^Affected/);
});

test('old fixes with only a major version become a low-noise patch check', () => {
  const pg = detect('PostgreSQL 16').find((x) => x.product === 'postgresql');
  const v = matchCves(pg).find((x) => x.id === 'CVE-2025-1094');
  assert.equal(v.severity, 'Info');
  assert.match(v.state, /^Check patch level/);
});

test('repositories are read from URLs, org/repo pairs and issue links', () => {
  const r = reposFromText('https://github.com/cloudstaff-apps/payroll/issues\ncloudstaff-apps/SC-phoenix-spa-angular <- Frontend\nhttps://github.com/cloudstaff-apps/cs-osh-repo.git');
  assert.deepEqual(r.map((x) => x.name), ['payroll', 'SC-phoenix-spa-angular', 'cs-osh-repo']);
  assert.equal(r[0].url, 'https://github.com/cloudstaff-apps/payroll');
});

const APP_SHEET = [
  ['No.', 'App Name', 'Repository(ies)', 'Frontend', 'Backend / Framework', 'Database / Storage'],
  ['1', 'Buzz', 'https://github.com/o/buzz-core\nhttps://github.com/o/buzz-angular', 'buzz-angular: Angular 12 (~12.2.17)', 'buzz-core: Laravel Lumen 6', 'buzz-core: MySQL 8'],
  ['2', 'Solo', 'https://github.com/o/solo', 'Angular 22 (^22.1.4)', 'Laravel 13', 'PostgreSQL 17'],
  ['3', 'Lloyde.com', '', '', '', ''],
];

test('each repository of an app is audited separately (split by "repo: value" lines)', () => {
  const { apps } = analyzeWorkbook([{ name: 'App Architecture', rows: APP_SHEET }]);
  const buzz = apps.find((a) => a.name === 'Buzz');
  assert.equal(buzz.unitSource, 'split');
  const core = buzz.units.find((u) => u.repo === 'buzz-core');
  const web = buzz.units.find((u) => u.repo === 'buzz-angular');
  assert.ok(core.techs.some((t) => t.product === 'laravel') && !core.techs.some((t) => t.product === 'angular'));
  assert.ok(web.techs.some((t) => t.product === 'angular') && !web.techs.some((t) => t.product === 'laravel'));
  assert.equal(buzz.risk, 'Critical');
  const solo = apps.find((a) => a.name === 'Solo');
  assert.equal(solo.units.length, 1);
  assert.equal(apps.find((a) => a.name === 'Lloyde.com').notAssessed, true);
});

test('a repository sheet ("Used by App(s)") gives one audit per row, and unreadable repos are not audited', () => {
  const repoSheet = [
    ['Repository', 'GitHub URL', 'Used by App(s)', 'Tech Category', 'Backend / Framework'],
    ['buzz-core', 'https://github.com/o/buzz-core', 'Buzz', 'Laravel/Lumen (PHP)', 'Laravel Lumen 6'],
    ['buzz-angular', 'https://github.com/o/buzz-angular', 'Buzz', 'Angular SPA', 'Angular 12 (~12.2.17)'],
    ['buzz-job', 'https://github.com/o/buzz-job', 'Buzz', 'Not accessible', 'GitHub returned 404 for this account.'],
  ];
  const { apps } = analyzeWorkbook([{ name: 'App Architecture', rows: APP_SHEET }, { name: 'Repository Details', rows: repoSheet }]);
  const buzz = apps.find((a) => a.name === 'Buzz');
  assert.equal(buzz.unitSource, 'sheet');
  assert.deepEqual(buzz.units.map((u) => u.repo), ['buzz-core', 'buzz-angular', 'buzz-job']);
  assert.equal(buzz.units[2].missing, true);
  assert.equal(buzz.units[2].risk, 'Info');
});

test('a headerless sheet uses column A as the app name', () => {
  const r = workbookToApps([{ name: 'CSV', rows: [['Buzz', 'https://github.com/o/a\nhttps://github.com/o/b'], ['NHI', '']] }]);
  assert.equal(r.headerless, true);
  assert.deepEqual(r.apps.map((a) => a.name), ['Buzz', 'NHI']);
  assert.equal(r.apps[0].unitSource, 'combined');
});

test('live endoflife.date rows update the lifecycle table', () => {
  const before = LIFECYCLE.php.cycles['8.5'].latest;
  applyEndOfLifeRows('php', [{ cycle: '8.5', eol: '2029-12-31', support: '2027-12-31', latest: '8.5.99' }]);
  assert.equal(LIFECYCLE.php.cycles['8.5'].latest, '8.5.99');
  LIFECYCLE.php.cycles['8.5'].latest = before;
});
