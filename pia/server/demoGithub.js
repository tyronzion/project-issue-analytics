import { createHash } from 'node:crypto';
import { GithubError } from './github.js';

// DEMO=1 stand-in for the GitHub client: synthetic repositories in a "demo-org" organisation, so the scan and the
// reassessment check can be tried without a GitHub App. Every name and schema here is made up.
//   demo-org/neo          web app with its own personal data; since "a year ago" it added a TIN column and Twilio
//   demo-org/neo-api      API with no database of its own, called by NEO (NEO_API_URL)  -> covered by NEO
//   demo-org/jobs         web app, nothing privacy-relevant changed in the last year
//   demo-org/status-page  static site, no personal data                                  -> no PIA needed

const neoBase = {
  'package.json': JSON.stringify({ name: 'neo', dependencies: { '@sendgrid/mail': '7', mysql2: '3', '@azure/msal-node': '3' } }),
  'database/migrations/2023_01_01_create_staff.php': "Schema::create('staff', function (Blueprint $table) {\n  $table->id();\n  $table->string('first_name');\n  $table->string('last_name');\n  $table->string('work_email')->unique();\n  $table->string('mobile_number')->nullable();\n  $table->string('employee_id');\n  $table->softDeletes();\n});",
  '.env.example': 'APP_URL=https://neo.demo-cloudstaff.io\nDB_DATABASE=neo_main\nNEO_API_URL=https://neo-api.demo-cloudstaff.io\n',
  'resources/views/staff/index.blade.php': '', 'resources/views/staff/show.blade.php': '', 'app/Http/Controllers/StaffController.php': '', 'app/Policies/StaffPolicy.php': '',
};
const REPOS = {
  'demo-org/neo': {
    base: neoBase,
    head: {
      ...neoBase,
      'package.json': JSON.stringify({ name: 'neo', dependencies: { '@sendgrid/mail': '7', mysql2: '3', '@azure/msal-node': '3', twilio: '4' } }),
      'database/migrations/2026_03_01_add_tin_to_staff.php': "Schema::table('staff', function (Blueprint $table) {\n  $table->string('tin')->nullable();\n});",
    },
    commits: 48,
  },
  'demo-org/neo-api': {
    head: {
      'package.json': JSON.stringify({ name: 'neo-api', dependencies: { express: '4', axios: '1' } }),
      '.env.example': 'APP_URL=https://neo-api.demo-cloudstaff.io\nNEO_DB_HOST=neo-db.internal\n',
      'src/routes/staff.js': '', 'src/controllers/staff.js': '', 'openapi.yaml': '',
    },
  },
  'demo-org/jobs': {
    head: {
      'package.json': JSON.stringify({ name: 'jobs', dependencies: { pg: '8', '@sentry/node': '8' } }),
      'db/migrations/001_candidates.sql': 'CREATE TABLE candidates (\n  id SERIAL PRIMARY KEY,\n  full_name VARCHAR(120),\n  email VARCHAR(200),\n  resume_url TEXT\n);',
      'src/pages/index.tsx': '', 'src/pages/apply.tsx': '', 'src/privacy/notice.tsx': '',
    },
    commits: 12,
  },
  'demo-org/status-page': { head: { 'package.json': JSON.stringify({ name: 'status-page', dependencies: { vite: '6' } }), 'index.html': '', 'src/pages/status.tsx': '' } },
};
for (const r of Object.values(REPOS)) r.base ||= r.head;

const sha = (t) => createHash('sha1').update(t).digest('hex');
const HEAD = sha('head'), BASE = sha('base');
const repoOf = (r) => {
  if (!REPOS[r]) throw new GithubError(`Not found on GitHub (/repos/${r}). Demo repositories: ${Object.keys(REPOS).join(', ')}.`, 404);
  return REPOS[r];
};

export function demoGithub() {
  return {
    demo: true,
    repos: Object.keys(REPOS),
    clearTokens() {},
    async test() { return [{ org: 'demo-org', ok: true }]; },
    async repo(r) { repoOf(r); return { fullName: r, defaultBranch: 'main', private: true, archived: false }; },
    async headSha(r) { repoOf(r); return HEAD; },
    async commitBefore(r) { repoOf(r); return { sha: BASE, date: null }; },
    async tree(r) { return { truncated: false, entries: Object.keys(repoOf(r).head).map((p) => ({ path: p, sha: sha(`${r}:${p}`), size: 100 })) }; },
    async blob(r, s) { const h = repoOf(r).head; return h[Object.keys(h).find((p) => sha(`${r}:${p}`) === s)] ?? ''; },
    async fileAt(r, p, ref) { return (ref === HEAD ? repoOf(r).head : repoOf(r).base)[p] ?? null; },
    async compare(r) {
      const { base, head, commits = 3 } = repoOf(r);
      const files = [...new Set([...Object.keys(base), ...Object.keys(head)])].filter((p) => base[p] !== head[p])
        .map((p) => ({ path: p, status: !(p in base) ? 'added' : !(p in head) ? 'removed' : 'modified', previousPath: null }));
      return { totalCommits: commits, files, truncated: false };
    },
  };
}
