import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { inflateRawSync } from 'node:zlib';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { createPia } from '../server/pia.js';
import { demoPiaPolicyDetail } from '../../monitor/server/demoData.js';
import { buildDocx } from '../server/docx.js';
import { matchAnswers } from '../server/policyAnswers.js';

// New-app scan + coverage decision, and the yearly reassessment check + Word document, end to end with a fake
// GitHub client (synthetic repositories) and the demo PIA policy answers.

process.env.PIA_DB_PATH = ':memory:';
const TODAY = Date.parse('2026-10-30T02:00:00Z');
const BASE = 'b'.repeat(40), HEAD = 'c'.repeat(40);

const REPOS = {
  'acme/hr-portal': {
    base: {
      'database/migrations/1.php': "$table->string('email');\n$table->string('mobile');",
      'package.json': '{"dependencies":{"@sendgrid/mail":"7"}}',
      '.env.example': 'APP_URL=https://hr.acme-demo.io\nDB_DATABASE=hr_main\nLEAVE_API_URL=https://leave-api.acme-demo.io',
      'resources/views/a.blade.php': '', 'resources/views/b.blade.php': '',
    },
    head: {
      'database/migrations/1.php': "$table->string('email');\n$table->string('mobile');",
      'database/migrations/2.php': "$table->string('tin');",
      'package.json': '{"dependencies":{"@sendgrid/mail":"7","twilio":"4"}}',
      '.env.example': 'APP_URL=https://hr.acme-demo.io\nDB_DATABASE=hr_main\nLEAVE_API_URL=https://leave-api.acme-demo.io',
      'resources/views/a.blade.php': '', 'resources/views/b.blade.php': '',
    },
  },
  'acme/leave-api': {
    head: { 'package.json': '{"dependencies":{"express":"4"}}', '.env.example': 'APP_URL=https://leave-api.acme-demo.io', 'src/routes/leave.js': '', 'src/controllers/leave.js': '' },
  },
  'acme/hr-portal-quiet': { base: { 'package.json': '{}' }, head: { 'package.json': '{}', 'README.md': 'x' } },
};
REPOS['acme/leave-api'].base = REPOS['acme/leave-api'].head;

const calls = [];
const sha1 = (t) => createHash('sha1').update(t).digest('hex');
const fakeGithub = {
  clearTokens() {},
  async test() { return [{ org: 'acme', ok: true }]; },
  async repo(r) { calls.push(r); if (!REPOS[r]) throw Object.assign(new Error('Not found on GitHub'), { status: 404 }); return { fullName: r, defaultBranch: 'main' }; },
  async headSha() { return HEAD; },
  async commitBefore() { return { sha: BASE }; },
  async tree(r) { return { truncated: false, entries: Object.keys(REPOS[r].head).map((p) => ({ path: p, sha: sha1(`${r}:${p}`), size: 10 })) }; },
  async blob(r, sha) { const p = Object.keys(REPOS[r].head).find((x) => sha1(`${r}:${x}`) === sha); return REPOS[r].head[p]; },
  async fileAt(r, p, ref) { return (ref === HEAD ? REPOS[r].head : REPOS[r].base)[p] ?? null; },
  async compare(r) {
    const b = REPOS[r].base, h = REPOS[r].head;
    const files = [...new Set([...Object.keys(b), ...Object.keys(h)])]
      .filter((p) => b[p] !== h[p]).map((p) => ({ path: p, status: !(p in b) ? 'added' : !(p in h) ? 'removed' : 'modified', previousPath: null }));
    return { totalCommits: files.length ? 3 : 0, files, truncated: false };
  },
};

const policies = [
  { id: 'demo-pia-0', product: 'HR Portal', state: 'approved', status: 'approved', version: '1', approvedAt: Date.parse('2025-09-01T02:00:00Z'), submittedAt: Date.parse('2025-08-01T02:00:00Z'), url: 'https://uberticket.cloudstaff.com/admin/policies/demo-pia-0/view' },
];
const secrets = { value: null };
const secretStore = { save: async (t) => { secrets.value = { token: t, savedAt: 1 }; return 1; }, load: async () => secrets.value, clear: async () => { secrets.value = null; } };

let s;
before(async () => {
  const pia = await createPia({
    root: '/unused', getPolicies: () => policies, getTrackerApps: () => [{ name: 'HR Portal', repositories: 'https://github.com/acme/hr-portal' }, { name: 'Leave API' }],
    isAdmin: (req) => req.user?.role === 'admin', now: () => TODAY, log: () => {}, github: fakeGithub, secretStore,
    fetchPolicy: async (id) => demoPiaPolicyDetail(id, 379488, TODAY),
  });
  pia.sync();
  const outer = express();
  outer.use((req, _res, next) => { const role = req.headers['x-test-role']; if (role) req.user = { name: `Test ${role}`, role }; next(); });
  outer.use('/api/pia', pia.app);
  const http = outer.listen(0);
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${http.address().port}/api/pia`;
  const call = async (method, path, { role = 'admin', body, raw } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'x-test-role': role, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  s = { call, close: () => new Promise((r) => http.close(r)) };
});
after(() => s?.close());

const idOf = async (name) => (await s.call('GET', '/apps')).body.apps.find((a) => a.name === name).id;

test('GitHub settings: admin only, key validated, never returned', async () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
  assert.equal((await s.call('PUT', '/github', { role: 'user', body: { appId: '1' } })).status, 403);
  assert.equal((await s.call('POST', '/github/test', { role: 'user' })).status, 403);
  assert.equal((await s.call('PUT', '/github', { body: { privateKey: 'not a key' } })).status, 400);
  assert.equal((await s.call('PUT', '/github', { body: { orgs: ['bad org!'] } })).status, 400);
  const r = await s.call('PUT', '/github', { body: { appId: '123', privateKey: pem, orgs: ['acme'] } });
  assert.equal(r.status, 200);
  assert.deepEqual({ ...r.body, keySavedAt: undefined }, { configured: true, appId: '123', orgs: ['acme'], keySet: true, keySavedAt: undefined });
  assert.ok(!JSON.stringify(r.body).includes('PRIVATE KEY'));
  assert.equal(secrets.value.token, pem.trim());
  const read = await s.call('GET', '/github', { role: 'user' });
  assert.ok(!JSON.stringify(read.body).includes('PRIVATE KEY'));
});

test('repos: admin only, GitHub names only, allowed orgs only; tracker links suggested', async () => {
  const hr = await idOf('HR Portal');
  assert.deepEqual((await s.call('GET', `/apps/${hr}`, { role: 'user' })).body.suggestedRepos, ['acme/hr-portal']);
  assert.equal((await s.call('PUT', `/apps/${hr}/repos`, { role: 'user', body: { repos: ['acme/hr-portal'] } })).status, 403);
  assert.equal((await s.call('PUT', `/apps/${hr}/repos`, { body: { repos: ['https://gitlab.com/acme/x'] } })).status, 400);
  assert.match((await s.call('PUT', `/apps/${hr}/repos`, { body: { repos: ['other-org/x'] } })).body.error, /outside the allowed/);
  const ok = await s.call('PUT', `/apps/${hr}/repos`, { body: { repos: ['https://github.com/acme/hr-portal'] } });
  assert.deepEqual(ok.body.githubRepos, ['acme/hr-portal']);
  assert.equal((await s.call('POST', `/apps/${hr}/scan`, { role: 'user' })).status, 403);
});

test('new app: an API called by an app with a PIA is recommended "covered"; the admin decides', async () => {
  const hr = await idOf('HR Portal');
  const leave = await idOf('Leave API');
  const scanHr = await s.call('POST', `/apps/${hr}/scan`);
  assert.equal(scanHr.status, 200);
  assert.equal(scanHr.body.recommendation.recommendation, 'own');
  assert.ok(scanHr.body.scans[0].fields.some((f) => f.identifier === 'tin'));
  assert.ok(!JSON.stringify(scanHr.body.scans).includes('$table'), 'no file contents are stored or returned');

  await s.call('PUT', `/apps/${leave}/repos`, { body: { repos: ['acme/leave-api'] } });
  const scan = await s.call('POST', `/apps/${leave}/scan`);
  const rec = scan.body.recommendation;
  assert.equal(rec.recommendation, 'covered');
  assert.equal(rec.parent.name, 'HR Portal');

  // Decision rules: reason required, parent must be picked with its approved policy.
  assert.equal((await s.call('PUT', `/apps/${leave}/coverage`, { role: 'user', body: { status: 'covered', reason: 'x' } })).status, 403);
  assert.equal((await s.call('PUT', `/apps/${leave}/coverage`, { body: { status: 'covered', reason: '' } })).status, 400);
  assert.equal((await s.call('PUT', `/apps/${leave}/coverage`, { body: { status: 'covered', parentAppId: hr, parentPolicyId: 'nope', reason: 'API of HR Portal' } })).status, 400);
  assert.equal((await s.call('PUT', `/apps/${leave}/coverage`, { body: { status: 'covered', parentAppId: leave, parentPolicyId: 'demo-pia-0', reason: 'self' } })).status, 400);
  const ok = await s.call('PUT', `/apps/${leave}/coverage`, { body: { status: 'covered', parentAppId: hr, parentPolicyId: 'demo-pia-0', reason: 'Internal API of HR Portal, no own data' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.coverage.status, 'covered');
  assert.equal(ok.body.coverage.parentName, 'HR Portal');
  assert.equal(ok.body.coverageHistory.length, 1);

  // The parent can't now be exempted (no chains), and the list shows the decision.
  assert.equal((await s.call('PUT', `/apps/${hr}/coverage`, { body: { status: 'not_required', reason: 'try', confirmSensitive: true } })).status, 400);
  const list = (await s.call('GET', '/apps')).body.apps;
  assert.deepEqual(list.find((a) => a.id === leave).coverage, { status: 'covered', parentName: 'HR Portal', needsReview: false });
});

test('exempting an app with sensitive data needs an explicit confirmation; later scans flag drift', async () => {
  const id = (await s.call('POST', '/apps', { body: { name: 'Payroll Helper' } })).body.id;
  REPOS['acme/payroll-helper'] = { head: { 'src/models/pay.model.js': "const s = new Schema({\n salary: Number,\n});" } };
  REPOS['acme/payroll-helper'].base = REPOS['acme/payroll-helper'].head;
  await s.call('PUT', `/apps/${id}/repos`, { body: { repos: ['acme/payroll-helper'] } });
  await s.call('POST', `/apps/${id}/scan`);
  const refused = await s.call('PUT', `/apps/${id}/coverage`, { body: { status: 'not_required', reason: 'Batch job only' } });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.needsConfirm, true);
  assert.equal((await s.call('PUT', `/apps/${id}/coverage`, { body: { status: 'not_required', reason: 'Batch job only', confirmSensitive: true } })).status, 200);

  REPOS['acme/payroll-helper'].head = { ...REPOS['acme/payroll-helper'].head, 'src/models/person.model.js': "const p = new Schema({\n email: String,\n});" };
  const after = await s.call('POST', `/apps/${id}/scan`);
  assert.equal(after.body.coverage.needsReview, true);
  assert.match(after.body.coverage.reviewNote, /Email/);
  assert.equal(after.body.coverage.status, 'not_required', 'the decision itself is never changed by a scan');
});

test('reassessment: changes since the last assessment, mapped to the PIA questions, and the Word document', async () => {
  const hr = await idOf('HR Portal');
  assert.equal((await s.call('POST', `/apps/${hr}/reassessment-check`, { role: 'user' })).status, 403);
  const check = await s.call('POST', `/apps/${hr}/reassessment-check`);
  assert.equal(check.status, 200);
  assert.equal(check.body.since, '2025-09-01');
  assert.equal(check.body.material, true);
  const q = Object.fromEntries(check.body.questions.map((x) => [x.id, x]));
  assert.equal(q['I.1'].status, 'changed');
  assert.ok(q['I.1'].evidenceLines.some((l) => /"tin" \(Government ID\)/.test(l)));
  assert.equal(q['III.1'].status, 'changed');
  assert.ok(q['III.1'].evidenceLines.some((l) => /Twilio/.test(l)));
  assert.equal(q['IV.1'].status, 'unchanged');
  assert.equal(q['V.2'].status, 'manual');

  assert.equal((await s.call('POST', `/apps/${hr}/reassessment-document`, { role: 'user', body: { checkId: check.body.id } })).status, 403);
  const doc = await s.call('POST', `/apps/${hr}/reassessment-document`, { body: { checkId: check.body.id, confirmations: { 'V.2': true, 'I.1': true } }, raw: true });
  assert.equal(doc.status, 200);
  assert.match(doc.headers.get('content-disposition'), /HR Portal PIA Reassessment 2026-10-30\.docx/);
  const xml = unzip(doc.buf)['word/document.xml'];
  assert.match(xml, /Annual reassessment/);
  assert.match(xml, /Changed since last assessment/);
  assert.match(xml, /Employee name, work email and mobile number/, 'old answer carried over');
  assert.match(xml, /Confirmed still accurate by Test admin/);
  assert.ok(!/Confirmed still accurate[^<]*<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:pStyle w:val="Heading3"\/><\/w:pPr><w:r><w:t xml:space="preserve">What data is to be collected/.test(xml));
});

test('reassessment with no changes says so and carries the answers over', async () => {
  const hr = await idOf('HR Portal');
  await s.call('PUT', `/apps/${hr}/repos`, { body: { repos: ['acme/hr-portal-quiet'] } });
  const check = await s.call('POST', `/apps/${hr}/reassessment-check`);
  assert.equal(check.body.material, false);
  const doc = await s.call('POST', `/apps/${hr}/reassessment-document`, { body: { checkId: check.body.id }, raw: true });
  const xml = unzip(doc.buf)['word/document.xml'];
  assert.match(xml, /No material change found/);
  assert.doesNotMatch(xml, /Changed since last assessment/);
});

test('policy answers are matched to questions by label; Word text is escaped', () => {
  const m = matchAnswers(demoPiaPolicyDetail('demo-pia-0', 379488, TODAY));
  assert.ok(m.matched >= 12, `matched ${m.matched}`);
  assert.match(m.answers['I.1'], /^• Employee name/);
  const xml = unzip(buildDocx([{ type: 'p', text: '<w:script>&"' }]))['word/document.xml'];
  assert.match(xml, /&lt;w:script&gt;&amp;&quot;/);
});

// Minimal zip reader for the tests (central directory + deflate).
function unzip(buf) {
  const out = {};
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(end + 16);
  const n = buf.readUInt16LE(end + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(start, start + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
