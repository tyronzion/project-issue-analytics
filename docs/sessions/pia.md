# Plan: Privacy Impact Assessment (PIA) module

> **Progress (2026-10-15):** phase 1 (PIA monitor) is built and verified locally; not deployed. Phases 2 (GitHub scan) and 3 (coverage decisions) are not started. As built, phase 1 differs from this plan as follows. It reads `GET /v1/policies/search` only (no versions call; each version is its own policy in the list). Coverage tables were left for phase 3. Admins can hide an app with a reason. App detail is a drawer on the overview, not its own URL.

_Status: **finalised with the user, 2026-10-15**; ready for approval. No code written. §4 updated from the real NEO PIA and the Policies list in UberTicket (template 379488)._

**Goal:** Track each application's yearly PIA from UberTicket. Use a read-only GitHub scan to recommend whether an app needs its own PIA or is covered by a parent app, and record that decision with an audit trail.

## 1. Recommendation: build it inside this app, as a fourth module `pia/`

| | Inside this app (recommended) | Separate app |
|---|---|---|
| UberTicket | Reuses the monitor's refresh loop, read-only client and the **one** encrypted token (D2) | A second copy of the token and client, so two places to rotate and secure |
| Sign-in and roles | Gets Entra SSO, `requireAdmin` and the data-folder block for free (D7, D8) | Has to redo SSO, Entra registration, roles and the proxy/hostname setup (D9) |
| App inventory | Can read the tracker's app list, including its `repositories` column, and its `matchKey` name matching | Has to import or duplicate the inventory |
| Deploy | Same CT, `scripts/deploy.sh` and systemd unit | A new port, proxy host, cert and service |
| Risk | Grows the one process; a bug could touch shared code | Better isolation |

It fits D1 (a router mounted from `uberticketMonitorPlugin`, the same pattern as the tracker). Isolation comes from **its own SQLite file, `pia/data/pia.db`**, and its own router. The tracker DB is only read, never written.

## 2. Files to change

| Path | Change |
|---|---|
| `monitor/server/monitor.js` | Fetch PIA **policies** (`PIA_TEMPLATE` env, default `379488` = PIA01) in the same refresh, via the new GET-only `fetchPolicies`/`fetchPolicyVersions` in `uberticket.js` (see §4). Expose `piaPolicies()`. No activity log and no SLA logic. |
| `monitor/server/fullAssessment.js` | Add `PIA_FIELDS` (product/application field id and label, once known). Reuse `readField`, `normalizeFull`'s state/date handling and `PRIORITY`. |
| `monitor/server/demoData.js` | Add `demoPiaPolicies()`: synthetic apps that are current, coming due, overdue, never assessed and in progress, including a 29 Feb case. |
| `monitor/server/tokenStore.js` | Optional `name` parameter (default `token`) so the GitHub credential can reuse the same AES-256-GCM store under `pia/data/`. Existing behaviour stays the same. |
| **new** `pia/server/pia.js` | Express router `createPia({ root, getPolicies, getTrackerApps, isAdmin, user })`: apps, policies, reassessments, links, coverage, scans, GitHub settings |
| **new** `pia/server/db.js` | Schema and `toApi`/`toDb`. Reuses `tracker/server/sqlite.js` (node:sqlite or sql.js, D5). |
| **new** `pia/server/sync.js` | Matches PIA policies to apps with `matchKey` and manual links; creates apps from unmatched products only on admin confirmation |
| **new** `pia/shared/rules.js` | Pure reassessment rules (due date and status), shared with the UI |
| **new** `pia/server/github.js` | **Read-only** GitHub REST client: GET only, `api.github.com` only, with a repo-name allowlist |
| **new** `pia/server/scanner.js` | Pure, deterministic scanner: file paths and contents in, findings out. No network, no code execution. |
| **new** `pia/server/recommend.js` | Pure rules: scan findings to a coverage recommendation |
| **new** `pia/test/*.test.js` | See §9 |
| `vite.config.ts` | Mount `/api/pia` in `uberticketMonitorPlugin`; `monitor.onRefresh(() => pia.sync())`; add `**/pia/data/**` to the watch ignore |
| `auth/auth.js` (`isBlockedPath`) + `auth/auth.test.js` | Block `/pia/data` the same way as `tracker/data` and `monitor/data`. This **tightens** the gate. |
| `.gitignore` | Add `pia/data/` |
| `src/utils/routes.ts`, `src/types.ts`, `src/App.tsx` (sidebar) | New tabs and `ADMIN_TABS` entries |
| **new** `src/components/pia/*.jsx` + `api.js` | UI (§7). Styled with the tracker's `at-*` classes and design-system tokens (D4, D6). No new hex values. |
| `package.json` | `test:pia` script (both SQLite engines, like `test:tracker`) |
| `.env.example`, `docs/*` | Settings; PROJECT_STATE, FILE_MAP, ROADMAP, and a new **D10** (GitHub read-only, encrypted credential) |

**No new npm dependencies.** GitHub App JWTs (RS256) are signed with `node:crypto`, HTTP uses `fetch`, and the scanner is regex-based.

## 3. Data model (`pia/data/pia.db`)

```
apps            id, name, match_key UNIQUE, source ('tracker'|'pia'|'manual'), active,
                repos TEXT (JSON ["org/repo", …]), notes, created_at, updated_at, updated_by
coverage        app_id PK → apps, status ('own'|'covered'|'not_required'|'undecided'),
                parent_app_id → apps NULL, parent_pia_uuid NULL (required when 'covered'), reason TEXT NOT NULL when status ≠ 'undecided',
                evidence_scan_id → scans NULL, decided_by, decided_at, needs_review INTEGER
coverage_history id, app_id, old_status, new_status, old_parent, new_parent, reason, scan_id, by, at
pia_links       product_key PK, app_id → apps          (manual matches, same idea as the tracker's)
pia_policies    uuid PK, title, product, product_key, app_id NULL, status, version, submitted_at,
                acknowledged_at, acknowledged_by, updated_at, risk_rating, seen_at   (see §4)
reassessments   id, app_id, policy_uuid, assessed_on, report_url, by, at                (admin-entered)
scans           id, app_id, repo, commit_sha, ruleset_version, status ('ok'|'error'|'truncated'),
                files_considered, files_read, started_at, finished_at, by, error
scan_findings   id, scan_id, path, line, framework, identifier, category, sensitivity ('personal'|'sensitive'),
                confidence ('high'|'medium'|'low')
settings        key PK, value                          (due-soon days, allowed GitHub orgs; never secrets)
```

- Policy rows are a cache that is rebuilt on every sync (UberTicket wins, same as D3). Coverage, links, reassessments and scans are user-owned and never overwritten by sync.
- **Data minimisation:** findings keep only the path, line number, identifier name and category. Repository file contents are never stored.

## 4. Finding PIAs in UberTicket (confirmed 2026-10-15 from a real PIA, NEO)

**PIAs are UberTicket *policies*, not tickets.** The example PIA is at `uberticket.cloudstaff.com/admin/policies/<uuid>/view`, so `fetchTemplateTickets` and the ticket activity log don't apply.

**Template:** `[PIA01] Privacy Impact Assessment`, **template ID `379488`** (confirmed from the Policies list filter). In the UI this is the "Uber Preferences" filter. Default `PIA_TEMPLATE=379488`.

**Application-name field:** label **`Project or Product`** (e.g. "NEO"). Its numeric field ID wasn't shown, so `PIA_FIELDS` matches by label through `readField`, and the ID gets filled in once the API JSON is seen.

**Other fields shown:**
- Status: e.g. **APPROVED**
- **Submitted at / by**
- **Acknowledged at / by**: the approver
- **Updated at / by**
- **Version** (1)
- Private fields: **Overall Risk Rating** and its label
- Section VII risk table: per-threat impact, probability and rating

**Read-only API endpoints the page calls:**
- `GET /v1/policies/{uuid}`
- `GET /v1/policies/versions/{uuid}`
- `GET /v1/policies/{uuid}/messages`
- `GET /v1/policies/{uuid}/attachments`

The page also requests `/v1/policies/{uuid}/edit`, presumably for edit permissions; the PIA module won't call it. **List endpoint (confirmed):** `GET /v1/policies/search?page=N&_keyword=&_category=&_assignees=&_submitters=&_templates=379488&_tags=&_labels=&_applicableTos=&_acknowledgedBys=&_submittedRange=&_hasAdvanceFilter=true`. It's the same paging shape as `/v1/tickets`, so `fetchPolicies` mirrors `fetchTemplateTickets`. Unfiltered, the UI uses `GET /v1/policies?…`. Whether archived or removed policies need an extra flag is unverified; the list sidebar has Open, Approved, Resolved, Rejected and Removed statuses.

**Client change:**
- Add GET-only `fetchPolicies({ templateId })` and `fetchPolicyVersions(uuid)` to `monitor/server/uberticket.js`, with tests that assert GET only.
- Same token and same D2 rules. Do not call `/edit` or any write endpoint.
- **Messages are not stored.** They can hold personal data (names, emails).

**Matching:** `matchKey("Project or Product")` against `apps.match_key`, then `pia_links`. Unmatched PIAs go to the admin matching page.

**Reassessments don't create a new policy or version.** In the NEO example, the reassessment 9 months ago was a **message plus a SharePoint report link** on the same policy, still at Version 1. So the "last assessed" date can't come from UberTicket dates alone. Proposal:
- **Initial PIA date** = `Acknowledged at` (approval). `Submitted at` is shown too.
- **Reassessment date** comes from, in order of preference:
  - a newer policy **version** that has been approved;
  - otherwise a **reassessment record** that an admin enters in the PIA module (date, report link, optional policy message reference), stored in a `reassessments` table (id, app_id, policy_uuid, assessed_on, report_url, by, at).
- **Last assessed** = the latest of these.
- Open question 2 asks whether to also auto-detect reassessments from messages, e.g. "completed the reassessment". That would be fragile and would mean reading message bodies, so I recommend against it.

**Data model changes:**
- `pia_tickets` becomes **`pia_policies`**: uuid, title, product, product_key, app_id, status, version, submitted_at, acknowledged_at, acknowledged_by, updated_at, risk_rating.
- New `reassessments` table (above).

## 5. Reassessment rules (`pia/shared/rules.js`, pure)

Dates are calendar days in Manila time (`offsetHours`), **not** business days.

1. Ignore rejected or cancelled policies.
2. A **completed PIA** is an **APPROVED** policy. Its date is `Acknowledged at`.
3. **Last assessed** = the latest of:
   - that date;
   - a newer approved policy version;
   - an admin-entered reassessment (see §4 and open question 2).
4. **Due date** = last assessed + 12 calendar months. 29 Feb rolls to 28 Feb.
5. Status for an app whose coverage is `own` or `undecided`:
   - **Never assessed:** no PIA policy at all
   - **Initial in progress:** has a PIA policy that isn't approved yet
   - **Current:** due date more than *N* days away (`PIA_DUE_SOON_DAYS`, default **30**, editable in PIA settings)
   - **Coming due:** 0 to *N* days until the due date
   - **Overdue:** past the due date
   - Coming due and Overdue get a **"reassessment in progress"** badge if the policy changed (new version, or `Updated at`) after the last assessment, but stay Overdue until a reassessment is recorded (open question 4).
6. Status for `covered` apps: shown as "Covered by <parent>" with the **parent's** status and due date. They are not counted on their own.
7. `not_required` apps and apps marked inactive (or decommissioned in the tracker) are listed but excluded from the counts.
8. Each app gets a sortable "days until due / days overdue" number.

## 6. GitHub access (read-only)

**Recommended: a GitHub App** created and installed by the org owner on the Cloudstaff org(s), for **selected repositories only**.
- Permissions: `Contents: read` and `Metadata: read`. Nothing else, and no webhooks.
- The app exchanges a JWT (signed with `node:crypto`) for an installation token that lasts 1 hour and stays in memory.
- The private key (PEM) and App ID are pasted on an admin-only settings page and stored with the existing AES-256-GCM token store in `pia/data/` (mode 0600). They are never returned to the browser or logged; the page shows only "set, saved at …".
- **Decided: GitHub App only.** A PAT is tied to one person, has broader scope and is long-lived; PAT support is not built. **Setup needs** an org owner of the Cloudstaff github.com org to create and install the App, and the org name entered as the single allowed org.

**Client rules (`github.js`):**
- GET only, host fixed to `https://api.github.com`.
- `owner/repo` must match `^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$` **and** the owner must be in the `allowed orgs` setting, which prevents SSRF and scanning arbitrary repos.
- Endpoints used: `GET /repos/{r}` (default branch), `GET /repos/{r}/commits/{branch}` (SHA), `GET /repos/{r}/git/trees/{sha}?recursive=1`, `GET /repos/{r}/git/blobs/{sha}` for **candidate files only**.
- Limits: at most 300 candidate files, 512 KB per file and 30 s per scan; truncation is recorded. Honour `X-RateLimit-Remaining`. Scans are queued one at a time.
- No cloning, no `git`, no running repository code. Repo content is untrusted text, handled only by regex.

## 7. "Needs its own PIA" vs "covered by a parent app"

**Scanner (`scanner.js`):**
1. **Finds persistence:** migrations (`database/migrations/*.php`, `db/migrate/*.rb`, `migrations/**/*.{sql,py,js,ts}`, `*.sql`), schema files (`prisma/schema.prisma`, `schema.rb`, `*.entity.ts`, Sequelize/Mongoose models, Django `models.py`, SQLAlchemy models), and ORM or DB drivers in `package.json`, `composer.json`, `requirements*.txt`, `pyproject.toml` and `Gemfile`.
2. **Extracts field and column names** with per-framework regexes.
3. **Classifies them** against a versioned dictionary, `RULESET_VERSION` (an identifier → category table with tests; tunable).
   - Personal: name, email, phone, address, DOB, photo, IP, location, employee ID.
   - **Sensitive (PH Data Privacy Act):** government IDs (TIN, SSS, PhilHealth, Pag-IBIG, passport), health, salary and bank details, religion, ethnicity, biometrics.
   - Credentials such as `password` are flagged separately, not as PII.
4. **Detects a shared datastore:** the DB name or host in config or `.env.example`, compared with the parent app's scan.

**Recommendation (`recommend.js`, pure; shown with the evidence):**

| Scan result | Recommendation |
|---|---|
| Own schema or migrations containing personal or sensitive fields | **Own PIA needed** |
| No persistence and no personal fields found | **Not required** (or covered); confirm |
| Personal data only through a parent's DB or API (no own schema; shared DB name matches the parent's) | **Covered by parent:** pick the parent |
| Scan failed or truncated, or no repos linked | **Undecided:** manual review |

**Decision, by a human and recorded:**
- Admin-only (open question 7) `PUT /api/pia/apps/:id/coverage` with `{status, parentAppId, reason}`.
- Validation:
  - A reason is always required.
  - `covered` needs a parent whose own status is `own` **and a link to the parent's approved PIA policy** (`parent_pia_uuid`, picked from the synced PIA policies), with no cycles and no chains deeper than one level.
  - `covered` or `not_required` while the latest scan found **sensitive** fields needs an explicit override reason, highlighted in the UI.
- Records `decided_by` (`req.user`), the time, the evidence scan ID and commit SHA, plus a `coverage_history` row.
- **Drift:** when a later scan finds a category the evidence scan didn't have, or a new own schema, `needs_review = 1` and the app is flagged. The decision itself never changes automatically.

## 8. UI pages (sidebar group "Privacy (PIA)")

1. **PIA overview** `/pia`: KPI tiles (Overdue, Coming due, Never assessed, Current, Covered, Needs review) and an app table (app, coverage, last PIA, due date, days, status, PIA link). Filter and search.
2. **Application detail** `/pia/apps/:id`: PIA policy and reassessment timeline (links to UberTicket and the report), the coverage decision panel with recommendation, evidence and history, linked repos, and scans with findings grouped by category (path:line links to GitHub at that commit). Users see everything; admins see the edit and scan buttons.
3. **Repository scans** `/pia/scans`: list of scans with status, SHA, ruleset version and counts; "Scan now" for admins.
4. **PIA matching** `/pia/uberticket-matching` (admin): unmatched PIA policies, linked to an app or used to create one. The application detail page also gets an admin "Record reassessment" form (date and report link).
5. **PIA settings** `/pia/settings` (admin): GitHub credential status (set or replace or clear; never shown), allowed orgs, due-soon days, app inventory import from the tracker. The tracker's `repositories` text is parsed for GitHub URLs to suggest repos.

## 9. Security considerations

- **UberTicket:** stays GET-only with one token (D2). The PIA list adds no new endpoints that echo it.
- **GitHub:** read-only GitHub App (private key encrypted at rest; installation tokens in memory for 1 hour), in memory once decrypted, never sent to the browser or logged; client errors strip the token. Covered by the new decision D10.
- **Data at rest:**
  - `pia/data/` is blocked over HTTP (`isBlockedPath`), git-ignored and excluded from the watch.
  - Findings hold no file contents. Internal schema names are still sensitive, so they stay behind sign-in.
  - The **repo is public**: test fixtures must be synthetic, with no real Cloudstaff schemas.
- **Authorisation:** every mutating route (coverage, links, scans, settings, credential) calls `requireAdmin`/`adminOnly` (D8). Reads require sign-in only.
- **Input:** repo-name regex plus org allowlist (SSRF). Size, count and time limits (DoS). Regex-only parsing of untrusted content, avoiding catastrophic-backtracking patterns (tested with large inputs). React escaping only, no `dangerouslySetInnerHTML`.
- **Integrity:** the coverage audit trail is append-only. Decisions are never changed by sync or scans, only flagged.
- **Credential lifecycle:** document how to rotate the App's private key, and show when the key was saved on the settings page.

## 10. Tests and verification

New `npm run test:pia` (node:test, node:sqlite + sql.js):
- `rules.test.js`
  - Due date ± boundaries, 29 Feb, the Manila-midnight boundary
  - Rejected policies ignored; unapproved policy; admin reassessment wins when newer; never assessed
  - Covered app inherits the parent's status; inactive apps excluded
- `sync.test.js`: matching by `matchKey`, manual links, rebuilding the cache leaves coverage untouched, unmatched list
- `scanner.test.js`
  - Synthetic fixtures per framework (Laravel, Rails, Prisma, Django, TypeORM, Mongoose, raw SQL), with expected categories and lines
  - False positives (`product_name`, `file_name`, comments) and a ReDoS input with a time limit
- `recommend.test.js`: each row of the table in §7
- `coverage.test.js`: reason required, parent validation and cycles, sensitive override, history rows, drift sets `needs_review`
- `github.test.js` (fake `fetch`)
  - Only GETs to `api.github.com`; rejected repo names and orgs; limits and truncation
  - The token never appears in errors or logs; JWT signing shape
- `routes.test.js`: a user gets 403 on every write; an admin succeeds; the credential is never in a response

Existing suites:
- `test:auth`: add `/pia/data` blocked
- `test:monitor`: PIA policies fetched only when `PIA_TEMPLATE` is set; the policy client is GET-only; demo policies
- `test:tracker`: unchanged, must still pass

Then `npm run lint`, `npm run build`, and a browser check in `issue-analytics-demo` (DEMO=1, demo PIA policies, GitHub scan against fixtures or a mocked client; user vs admin views).

## 11. Delivery phases

1. **PIA monitor:** UberTicket list, DB, rules, overview, detail and matching pages. All its inputs are decided.
2. **GitHub connection and scanner:** credential settings, client, scanner, scans page. Needs the org name and the installed GitHub App (decision 6).
3. **Coverage decisions:** recommendation, decision panel, history, drift review.

## 12. Conflicts with DECISIONS

- None blocking.
- D1 holds (no second server).
- D2 is extended (a new template list, same token).
- D4 and D6 constrain the UI styling.
- D8 requires admin gating.
- The `isBlockedPath` change tightens D7.
- New **D10** (GitHub read-only, encrypted credential, org allowlist, human decision required) to be added.

## 13. Decisions (answered 2026-10-15)

1. **UberTicket source:** PIA01 policies, template `379488`, listed with `GET /v1/policies/search?_templates=379488`; the application field is "Project or Product". **Still to confirm when building:** which policy statuses count. Proposal: Approved (and Resolved, if PIAs use it) counts as completed; Rejected and Removed are ignored.
2. **Reassessments:** an admin records each one (date and report link) on the app's page. A newer approved policy version also counts automatically. Policy messages are never read.
3. **Cycle:** the next reassessment is due 12 months after the last completed PIA or reassessment.
4. **Coming due:** 30 days before the due date (editable in PIA settings). An app with a reassessment under way **stays Overdue** with an "in progress" badge until the reassessment is recorded.
5. **Inventory:** active Assessment Tracker apps plus every product named in a PIA policy. Admins can add or hide apps by hand. Apps with no PIA show as "Never assessed".
6. **GitHub:** a GitHub App (Contents and Metadata read, selected repos) on one Cloudstaff org on github.com. No PAT support. **Needed at setup:** the org name and an org owner to create and install the App.
7. **Who decides:** admins only, for coverage decisions and reassessment records (`requireAdmin`). Users can view everything.
8. **Covered by parent:** the decision must pick the parent app, link the parent's approved PIA policy, and give a reason.
9. **Storage:** a separate `pia/data/pia.db`, blocked over HTTP and git-ignored. It needs adding to the server backup routine.

**No open questions block phase 1.** Before phase 2, I need the GitHub org name and an org owner to install the App.

---

## Phase 1 deploy checklist (prepared 2026-10-15)

Compared with GitHub `main` at `b0f966e`. Everything below is PIA work, apart from newer lines in `docs/PROJECT_STATE.md` from the Microsoft sign-in go-live.

### 1. Files to push to `main` (one commit)

**New**
- `pia/server/pia.js`, `pia/server/db.js`, `pia/server/sync.js`
- `pia/shared/rules.js`
- `pia/test/rules.test.js`, `pia/test/sync.test.js`, `pia/test/routes.test.js`
- `monitor/server/piaPolicy.js`, `monitor/server/piaPolicy.test.js`
- `src/components/pia/PrivacyImpact.jsx`, `AppDetail.jsx`, `MatchingPage.jsx`, `badges.jsx`, `api.js`, `pia.css`
- `docs/sessions/pia.md`

**Changed**
- `.gitignore`: adds `pia/data/`. **Must ship in the same commit.** `deploy.sh` runs `git clean -fd`, which keeps ignored files only, so without this line every deploy would delete `pia/data/pia.db`.
- `auth/auth.js`, `auth/auth.test.js`: block `/pia/data`. **Must ship in the same commit**, or Vite would serve `pia.db` over HTTP.
- `vite.config.ts`: mounts `/api/pia` and ignores `pia/data` in the file watcher.
- `monitor/server/monitor.js`, `uberticket.js`, `uberticket.test.js`, `demoData.js`
- `tracker/server/db.js`, `tracker/server/tracker.js`, `tracker/test/sync.test.js`
- `src/App.tsx`, `src/types.ts`, `src/utils/routes.ts`
- `package.json`: `test:pia` script. **`package-lock.json` is unchanged**, so the deploy skips `npm ci`.
- `.env.example`, `.claude/launch.json`
- `docs/PROJECT_STATE.md`, `DECISIONS.md`, `FILE_MAP.md`, `ROADMAP.md`

**Do not push**
- `docs/sessions/server-migration.md` (git-ignored: internal IPs)
- anything under `*/data/`, `.env.local`, `dist/`

**Before pushing**, run locally:
- `npm run lint`
- `npm run test:auth`
- `npm run test:monitor`
- `npm run test:tracker`
- `npm run test:pia`

On 2026-10-15 all of these passed.

### 2. Deploy

On the CT, as `csdatasec`, in the app folder, run `bash scripts/deploy.sh`.

No new `.env.local` settings are needed: `PIA_TEMPLATE` defaults to 379488, and the coming-due window defaults to 30 days.

### 3. Post-deploy checks

**a. Log lines.** The first refresh runs at start, then every 5 minutes. Read the log as root: `su -c 'journalctl -u security-issues-analytics -n 200'`.

Expected:
- `[pia] database ready (node:sqlite)`
- `[monitor] loaded … tickets`, then `[pia] UberTicket sync: N PIA policies, M apps[, added …]`. N should be about the number of PIA01 policies in UberTicket.

Problems:
- `[monitor] PIA policies failed: …`: the policies call failed, but the other monitors keep working. If it's a 401 or 403, the token may lack Policies access.
- `[pia] UberTicket sync failed: …` or `PIA database could not be opened`: report it.

**b. Data folder is blocked.** On the CT, `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/pia/data/pia.db` must print `404`.

**c. Pages.**
- **PIA Overview:** the counts look plausible, and NEO shows the 25 Apr 2025 approval (Overdue until its reassessment is recorded).
- **PIA Matching:**
  - "PIA products not in the tracker" lists only real separate apps. Link the rest to their tracker app.
  - Policies with no product show as "Unspecified product"; fix them in UberTicket.
- **Policy statuses:** only `approved` was seen during development. Open a few apps listed as "Initial PIA in progress" and compare them with UberTicket. If an approved PIA shows as in progress, report its status value; `monitor/server/piaPolicy.js` maps statuses.

**d. Back up `pia/data/pia.db`.** It holds the admin-recorded reassessments, which UberTicket doesn't have.
- The repo has no backup job for `tracker/data/tracker.db` either; this covers both.
- `VACUUM INTO` writes a consistent copy while the app runs (WAL mode).
- Create `~/backup-dbs.sh` on the CT as `csdatasec` (no root needed):

  ```bash
  #!/usr/bin/env bash
  # Daily copies of the app's SQLite databases; keeps 30 days.
  set -euo pipefail
  APP=/path/to/project-issue-analytics   # the deploy folder
  OUT="$HOME/db-backups"; mkdir -p "$OUT"; chmod 700 "$OUT"
  DAY=$(date +%F)
  for db in pia/data/pia.db tracker/data/tracker.db; do
    [ -f "$APP/$db" ] || continue
    node -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" "$APP/$db" "$OUT/$(basename "$db" .db)-$DAY.db"
  done
  find "$OUT" -name '*.db' -mtime +30 -delete
  ```

- `chmod 700 ~/backup-dbs.sh`, run it once, and check the two files in `~/db-backups/`. If it fails with "No such built-in module: node:sqlite", the CT's Node is older than 22.13: change `node -e` to `node --experimental-sqlite -e`. The startup log line `[pia] database ready (…)` shows which SQLite engine the app is using.
- `crontab -e`: add `30 1 * * * $HOME/backup-dbs.sh >> $HOME/db-backups/backup.log 2>&1`.
- If the CT is also snapshotted in Proxmox, these copies are inside it. For off-host safety, also copy `~/db-backups` off the CT.

**e. Record past reassessments.** These are one-off admin steps, needed because today's reassessments are only messages on the policy.
1. Open **PIA Overview** and filter **Overdue**.
2. For each app with a completed reassessment report (the CSDataSecurity SharePoint folder "Security Reports / 2025 Privacy Impact Assessment"), open the app, then **Record reassessment**:
   - **Completed on:** the date the reassessment was completed (the date of the "completed the reassessment" message on the policy)
   - **Report link:** the SharePoint report URL
3. Start with NEO: its reassessment was posted in January 2026.
4. The app should move to Current, with the next due date 12 months later. A mistaken entry can be removed with the bin icon; the removal is kept in the history.

### 4. Rollback

- **Turn off the PIA fetch:** add `PIA_TEMPLATE=0` to `.env.local` and restart the service. The pages stay, the other monitors are unaffected, and `pia.db` is kept.
- **Full rollback:** revert the commit on `main` and redeploy. `pia/data/` is git-ignored, so the database survives and is reused on the next deploy.
