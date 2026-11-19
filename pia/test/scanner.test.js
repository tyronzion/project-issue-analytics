import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileKind, classifyIdentifier, scanFiles, surfaceOf, personalSummary } from '../server/scanner.js';
import { recommend } from '../server/recommend.js';
import { diffScans } from '../server/repoScan.js';

// All fixtures are synthetic (the repository is public): no real Cloudstaff schema.

const ids = (r) => r.fields.map((f) => f.identifier).sort();

test('which files are read', () => {
  assert.equal(fileKind('database/migrations/2024_01_01_create_people.php'), 'schema');
  assert.equal(fileKind('db/migrate/20240101_create_people.rb'), 'schema');
  assert.equal(fileKind('prisma/schema.prisma'), 'schema');
  assert.equal(fileKind('src/entities/person.entity.ts'), 'schema');
  assert.equal(fileKind('app/models.py'), 'schema');
  assert.equal(fileKind('package.json'), 'manifest');
  assert.equal(fileKind('.env.example'), 'config');
  assert.equal(fileKind('node_modules/x/package.json'), null);
  assert.equal(fileKind('tests/fixtures/schema.sql'), null);
  assert.equal(fileKind('src/components/Button.tsx'), null);
});

test('classifies personal, sensitive and credential identifiers; ignores look-alikes', () => {
  assert.equal(classifyIdentifier('email').category, 'Email');
  assert.equal(classifyIdentifier('mobileNumber').category, 'Phone');
  assert.equal(classifyIdentifier('first_name').category, 'Name');
  assert.equal(classifyIdentifier('name').confidence, 'low');
  assert.equal(classifyIdentifier('tin').sensitivity, 'sensitive');
  assert.equal(classifyIdentifier('philhealth_number').sensitivity, 'sensitive');
  assert.equal(classifyIdentifier('salary').category, 'Financial');
  assert.equal(classifyIdentifier('password').sensitivity, 'credential');
  assert.equal(classifyIdentifier('ip_address').category, 'Online identifier');
  for (const n of ['product_name', 'file_name', 'page', 'usage', 'title', 'status', 'created_at', 'stage', 'tinted', 'emailed_count_total_value_x']) {
    const c = classifyIdentifier(n);
    assert.ok(!c || n === 'emailed_count_total_value_x', `${n} -> ${JSON.stringify(c)}`);
  }
});

test('extracts fields per framework', () => {
  const files = [
    { path: 'database/migrations/2024_create_people.php', content: "Schema::create('people', function (Blueprint $table) {\n  $table->id();\n  $table->string('email')->unique();\n  $table->string('tin')->nullable();\n  // $table->string('phone');\n  $table->softDeletes();\n});" },
    { path: 'db/migrate/1_create_people.rb', content: 'create_table :people do |t|\n  t.string :mobile_number\n  t.date :birthdate\nend\nadd_column :people, :religion, :string' },
    { path: 'prisma/schema.prisma', content: 'model Person {\n  id Int @id\n  firstName String\n  salary Decimal\n  productName String\n}' },
    { path: 'db/schema.sql', content: 'CREATE TABLE people (\n  id INT PRIMARY KEY,\n  `home_address` VARCHAR(200),\n  status VARCHAR(10)\n);\nALTER TABLE people ADD COLUMN passport_number varchar(20);' },
    { path: 'app/models.py', content: 'class Person(models.Model):\n    last_name = models.CharField(max_length=50)\n    gender = models.CharField(max_length=10)' },
    { path: 'src/entities/person.entity.ts', content: '@Entity()\nexport class Person {\n  @Column()\n  emailAddress: string;\n  @Column({ nullable: true }) sssNumber?: string;\n}' },
    { path: 'src/models/person.model.js', content: "const s = new Schema({\n  avatar: { type: String },\n  employee_id: String,\n});" },
  ];
  const r = scanFiles({ paths: files.map((f) => f.path), files });
  assert.deepEqual(ids(r), ['avatar', 'birthdate', 'email', 'emailAddress', 'employee_id', 'firstName', 'gender', 'home_address', 'last_name', 'mobile_number', 'passport_number', 'religion', 'salary', 'sssNumber', 'tin'].sort());
  const email = r.fields.find((f) => f.identifier === 'email');
  assert.equal(email.line, 3);
  assert.equal(email.framework, 'laravel');
  assert.equal(r.storage.ownSchema, true);
  assert.equal(r.storage.softDeletes, true);
  assert.ok(r.controls.retention.some((c) => c.label === 'Soft deletes'));
  const summary = personalSummary(r.fields);
  assert.equal(summary[0].sensitivity, 'sensitive');
});

test('manifests, config and paths: integrations, drivers, DB names, hosts, controls', () => {
  const files = [
    { path: 'package.json', content: JSON.stringify({ name: 'people-api', dependencies: { express: '4', mysql2: '3', '@sendgrid/mail': '7', '@azure/msal-node': '3', stripe: '1' } }) },
    { path: 'composer.json', content: JSON.stringify({ require: { 'spatie/laravel-activitylog': '4' } }) },
    { path: '.env.example', content: 'APP_URL=https://people-api.internal.acme-demo.io\nDB_DATABASE=people_hr\nPAYROLL_API_URL=https://payroll.corp.acme-demo.net/v1\n# DB_PASSWORD=\n' },
  ];
  const paths = ['src/routes/people.js', 'src/controllers/people.js', 'src/privacy/consent.js', 'src/jobs/purge-old-records.js'];
  const r = scanFiles({ paths, files });
  assert.deepEqual(r.integrations.map((i) => i.label).sort(), ['SendGrid', 'Stripe']);
  assert.deepEqual(r.storage.drivers, ['mysql2']);
  assert.equal(r.storage.ownSchema, false);
  assert.deepEqual(r.storage.databases, ['people_hr']);
  assert.ok(r.hosts.includes('payroll.corp.acme-demo.net'));
  assert.deepEqual(r.selfHosts, ['people-api.internal.acme-demo.io']);
  assert.ok(r.envKeys.includes('PAYROLL_API_URL'));
  assert.deepEqual(r.packageNames, ['people-api']);
  for (const k of ['auth', 'audit', 'consent', 'retention']) assert.ok(r.controls[k]?.length, k);
  assert.equal(r.surface.type, 'api');
});

test('UI vs API from paths', () => {
  assert.equal(surfaceOf(['resources/views/home.blade.php', 'resources/views/user.blade.php', 'routes/api.php']).type, 'web app with API');
  assert.equal(surfaceOf(['app/Http/Controllers/UserController.php', 'routes/api.php']).type, 'api');
  assert.equal(surfaceOf(['src/components/A.test.tsx', 'lib/util.js']).type, 'other');
});

test('hostile input: long lines and many lines finish quickly', () => {
  const evil = `$table->string('${'a'.repeat(50_000)}`;
  const big = Array.from({ length: 20_000 }, (_, i) => `  col_${i} VARCHAR(10),`).join('\n');
  const t = Date.now();
  scanFiles({ paths: [], files: [{ path: 'database/migrations/x.php', content: evil + '('.repeat(30_000) }, { path: 'x.sql', content: big }, { path: 'package.json', content: '{' + '"a":'.repeat(10_000) }] });
  assert.ok(Date.now() - t < 2000, `took ${Date.now() - t} ms`);
});

// ---- recommendation ----
const scanOf = (repo, files, paths = files.map((f) => f.path)) => {
  const r = scanFiles({ paths, files });
  return { repo, status: 'ok', fields: r.fields, summary: { ...r, fields: undefined } };
};
const parentScan = scanOf('acme/hr-portal', [
  { path: 'database/migrations/1.php', content: "$table->string('email');\n$table->string('mobile');" },
  { path: '.env.example', content: 'APP_URL=https://hr.acme-demo.io\nDB_DATABASE=hr_main\nLEAVE_API_URL=https://leave-api.acme-demo.io' },
], ['database/migrations/1.php', 'resources/views/a.blade.php', 'resources/views/b.blade.php']);
const parent = { id: 1, name: 'HR Portal', approvedPolicy: { id: 'pol-1', url: 'https://u/p' }, coverageStatus: 'own', scans: [parentScan] };

test('API with no personal data of its own, called by an app with a PIA -> covered (no PIA needed)', () => {
  const api = scanOf('acme/leave-api', [
    { path: 'package.json', content: JSON.stringify({ dependencies: { express: '4' } }) },
    { path: '.env.example', content: 'APP_URL=https://leave-api.acme-demo.io' },
  ], ['src/routes/leave.js', 'src/controllers/leave.js']);
  const r = recommend({ app: { id: 2, name: 'Leave API' }, scans: [api], others: [parent] });
  assert.equal(r.recommendation, 'covered');
  assert.equal(r.parent.name, 'HR Portal');
  assert.equal(r.parent.policyId, 'pol-1');
  assert.ok(r.reasons.some((x) => /called by HR Portal/.test(x)));
});

test('API that shares the parent database -> covered', () => {
  const api = scanOf('acme/sync-worker', [{ path: '.env.example', content: 'DB_DATABASE=hr_main' }], ['src/api/sync.js']);
  const r = recommend({ app: { id: 3, name: 'Sync worker' }, scans: [api], others: [parent] });
  assert.equal(r.recommendation, 'covered');
  assert.ok(r.reasons.some((x) => /same database \(hr_main\)/.test(x)));
});

test('API with its own personal-data schema needs its own PIA even when related to an app with a PIA', () => {
  const api = scanOf('acme/leave-api', [
    { path: 'database/migrations/1.php', content: "$table->string('personal_email');" },
    { path: '.env.example', content: 'APP_URL=https://leave-api.acme-demo.io' },
  ], ['database/migrations/1.php', 'src/routes/leave.js']);
  const r = recommend({ app: { id: 2, name: 'Leave API' }, scans: [api], others: [parent] });
  assert.equal(r.recommendation, 'own');
});

test('not required, undecided and failed scans', () => {
  const plain = scanOf('acme/docs-site', [{ path: 'package.json', content: '{"dependencies":{"vite":"6"}}' }], ['index.html', 'src/pages/a.tsx']);
  assert.equal(recommend({ app: { id: 4, name: 'Docs' }, scans: [plain], others: [parent] }).recommendation, 'not_required');
  const lonelyApi = scanOf('acme/x-api', [], ['src/routes/a.js']);
  assert.equal(recommend({ app: { id: 5, name: 'X' }, scans: [lonelyApi], others: [] }).recommendation, 'undecided');
  assert.equal(recommend({ app: { id: 5, name: 'X' }, scans: [], others: [] }).recommendation, 'undecided');
  assert.equal(recommend({ app: { id: 5, name: 'X' }, scans: [{ repo: 'a/b', status: 'error', error: 'nope' }], others: [] }).recommendation, 'undecided');
  // A parent that is itself covered can't cover another app.
  assert.equal(recommend({ app: { id: 6, name: 'Y' }, scans: [scanOf('acme/y', [{ path: '.env.example', content: 'DB_DATABASE=hr_main' }], ['src/api/a.js'])], others: [{ ...parent, coverageStatus: 'covered' }] }).recommendation, 'undecided');
});

test('diffScans reports added/removed fields, services and controls', () => {
  const before = scanOf('a/b', [{ path: 'package.json', content: '{"dependencies":{"@sendgrid/mail":"1"}}' }, { path: 'database/migrations/1.php', content: "$table->string('email');" }]);
  const after = scanOf('a/b', [{ path: 'package.json', content: '{"dependencies":{"twilio":"1"}}' }, { path: 'database/migrations/1.php', content: "$table->string('email');\n$table->string('tin');" }]);
  const d = diffScans(before, after);
  assert.deepEqual(d.fieldsAdded.map((f) => f.identifier), ['tin']);
  assert.deepEqual(d.integrationsAdded.map((i) => i.label), ['Twilio']);
  assert.deepEqual(d.integrationsRemoved.map((i) => i.label), ['SendGrid']);
});
