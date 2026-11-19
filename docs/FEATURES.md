# Security Issues Analytics: feature documentation

Internal app of the Cloudstaff Data Security Team, at **https://security-analytics.cloudstaff.tech**. This page describes every feature: what it does, where it is, who can use it, where its data comes from and the rules behind it. It is written for the team and for anyone (or any AI agent) who has to run, change or move the app.

This file is `docs/FEATURES.md` in the repository, and the app shows the same file on its **Documentation** page (`/documentation`). Update it whenever a feature is added or changes. Deeper detail lives in `docs/DECISIONS.md` (why things are the way they are, D1–D17), `docs/FILE_MAP.md` (which file does what) and `docs/PROJECT_STATE.md` (current status and open issues).

## At a glance

| Area | Pages | Data source | Stored in |
|---|---|---|---|
| Issue analytics | Project Metrics, Dashboard, Security Seal, Dependabots Issues, All Issues, Projects & Aliases | Jira (filter / JQL), Excel or CSV import | The browser's local storage, mirrored to PostgreSQL `app_state` |
| UberTicket monitoring | DPSA Monitoring, Full Assessment, Rules of Engagement | UberTicket API, read-only | `monitor/data/` (encrypted token, activity cache) |
| Assessment Tracker | Monitoring, Assessment List, Time Report, Period Comparison, Checklist, Decommissioned, Size Calculator, Tech Risk Analyzer, App Access | UberTicket tickets (Full Assessment, RoE) plus edits in the app | SQLite `tracker/data/tracker.db` (+ `access.key`) |
| Privacy (PIA) | PIA Overview, PIA Matching | UberTicket `[PIA01]` policies plus tracker apps | SQLite `pia/data/pia.db` |
| Settings and access | Settings (9 sections), Users & Roles, sign-in | Entra ID, admins | `auth/data/users.json`, `.env.local` |

Everything runs in **one Vite server** (D1): the React UI, the Jira proxy, the Postgres mirror, the UberTicket monitor (an Express app) and the tracker and PIA routers are all middleware in `vite.config.ts`. `vite build` produces a frontend only; production runs `vite dev`.

## Sign-in, roles and security

**Sign-in** (`/auth/login`, D7). Two options side by side:

- **Sign in with Microsoft** (Entra ID, OIDC authorization code + PKCE). Who may sign in is controlled in Entra (Enterprise application, "Assignment required"). Needs `AUTH_TENANT_ID`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` and `AUTH_REDIRECT_URI` (production: `https://security-analytics.cloudstaff.tech/callback`).
- **Classic login**, the shared team account, checked on the server against a salted hash, limited to 10 failures per IP per 15 minutes, always an admin. `AUTH_CLASSIC_LOGIN=0` turns it off.

Sessions live in server memory (HttpOnly cookie; 8 h idle, 24 h total), so **a restart signs everyone out**. Every path needs a session except `/auth/*` and `/design-system/*`. The data folders `tracker/data`, `monitor/data`, `pia/data` and `auth/data` are never served.

**Roles** (D8), enforced on the server:

- **Admin**: everything, including saving the shared issue dataset, Jira settings, Import / Merge / Delete / Clear data, restoring backups, the UberTicket token, tracker Import Excel and UberTicket Sync, PIA changes, and Users & Roles.
- **User**: everything else, including editing the tracker and App Access, and "Sync from Jira" (which updates only their own browser).
- People in `AUTH_ADMIN_EMAILS` are permanent admins. New sign-ins start as User. The last admin can't be removed.

**Users & Roles** (`/settings/users`, admin): list users, add someone ahead of their first sign-in, change roles, remove.

## Issue analytics

Security issues come from Jira (or an Excel / CSV import). Each issue has a project, severity (Critical, High, Medium, Low, Informational), status, created date, security due date and type. Cancelled issues are kept in the dataset (for reports) but hidden from every analytics page. Apps decommissioned in the tracker are left out of every analytics page (D13). When the **Target Project List** switch is on, only target apps are shown (D11).

The **global filter bar** (date range, project, severity) applies to Project Metrics, Dashboard, Security Seal, Dependabots, All Issues and Projects.

### Project Metrics (`/`)

The landing page. Six KPI cards: **Found** (created in the date range), **Resolved** (Done, status changed in the range), **Outstanding** (not Done and not Cancelled), **Overdue** (security due date passed, not Done or Cancelled), **Risk Accepted**, and **Applications**. "How are these counted?" shows each formula. Below is the **Application Metrics by Project** table, with drill-down per project.

**Sync from Jira** (every signed-in user): admins sync with their saved Jira profile and save to Postgres; users read the server's Jira credentials through `GET /api/jira/issues` (cached 60 s) and update only their own browser.

### Dashboard (`/charts`)

Total issues found, outstanding and resolved, each with a colour-coded icon and a 12-month sparkline, shown three ways: all issues, without GitHub issues, and GitHub issues only.

### Security Seal (`/security-seal`)

A seal per application from its **outstanding** issues by severity, using the team's spreadsheet formula (`sealFromCounts` in `tracker/shared/report.js`, D12), where A = Low, B = Medium, C = High, D = Critical:

| Seal | Rule (first match wins) |
|---|---|
| Secure | no High or Critical, Medium ≤ 15, Low ≤ 15 |
| Protected | no High or Critical, Medium ≤ 30, Low ≤ 30 |
| Defended | no Critical, High ≤ 30, Medium ≤ 50, Low ≤ 50 |
| Vulnerable | no Critical, High ≤ 50, Medium ≤ 50, Low ≤ 50 |
| Exposed | every severity ≤ 50 |
| Compromised | anything else |

When an assessment's UberTicket resolves, the tracker saves the seal at that moment.

### Dependabots Issues (`/dependabots`)

The same metrics and table as Project Metrics, limited to issues detected as Dependabot (dependency) findings.

### All Issues (`/issues`)

A searchable, filterable table of every issue, with source, severity, status and dates. Exports exactly what the table shows to CSV.

### Projects & Aliases (`/projects`)

Merge project names that mean the same app (aliases), delete a project from this browser's view, and **Decommission / Restore** an app. Decommissioning sets the app's rows in its latest tracker year (shared for everyone, D13).

### Formula Rules (`/settings/formulas`)

The rules behind the metrics: which statuses count as Done, Cancelled or Risk Accepted, severity keywords, and the formulas. Saved per browser.

## UberTicket monitoring

Read-only views of UberTicket tickets (D2). The client only calls GET endpoints. An admin pastes the UberTicket bearer token under **Settings** on any monitoring page; it is stored encrypted (AES-256-GCM, `monitor/data/token.enc` + `secret.key`) and never sent back to the browser. Times are **business days**: Mon–Fri 08:00–17:00 Manila time, Philippine holidays excluded (`monitor/server/phHolidays.js`, covers 2024–2026; **add 2027 once proclaimed**). Rejected tickets never count.

### DPSA Monitoring (`/dpsa`)

Digital Product Security Assessment tickets (templates 322255 Staging and 1113577 UAT). Target: **MTTR within 3 business days** (submitted → resolved from the activity log). Shows SLA compliance, open tickets at risk or breached, and non-compliant tickets.

### Full Assessment (`/full-assessment`)

Security Full Assessment tickets (template 1080829). Resolve SLA by priority: **Low 5, Medium 10, High 15, Critical 20 business days** (UberTicket "Normal" = Medium). Shows SLA compliance, open risk, and **times tested per product** (every app is retested twice a year).

### Rules of Engagement (`/rules-of-engagement`)

[PB-0933] Security Test – Rules of Engagement tickets (template 72913), the assessment of new apps. Same page and SLA rules as Full Assessment.

## Assessment Tracker

Replaces the SharePoint "Security Full Assessment Tracker" workbook (Bi-Annual and Quarterly tracks, Checklist → Full assessment → Monitoring). One row per app per period, in SQLite. Scoring rules are ported from the workbook formulas (`tracker/shared/logic.js`).

**UberTicket sync** runs after every monitor refresh (D3): UberTicket wins. Open ticket = In Progress, resolved = Done; tester = assignee (frozen once resolved); actual start / end = submitted / resolved dates; Time Spent and Priority come from the ticket; the seal is captured on resolution. Products are matched by name (ignoring case, punctuation and a leading "Cloudstaff"); others are linked by hand on **UberTicket Sync**. A Rules of Engagement ticket marks an app **New**, a Full Assessment ticket **Old**. Target Project List apps missing from this year get a Not Started row automatically (D11).

### Monitoring (`/assessment-tracker`)

The "Qx Monitoring" sheet for the chosen cycle and period: applications, done, in progress, not started, current points vs goal, goal points per month, progress by severity, time spent by priority, and a check against the Target Project List.

### Assessment List (`/assessment-tracker/assessments`)

Every app in the cycle with status, priority, tester, ticket, seal, New / Old, time spent and dates. Click a row to open the **assessment editor**: dates, tester, priority, testing URL, mobile flag, the 12-item testing checklist, decommission, notes, link to App Access, and the **assessment report**.

**Assessment report** (D12): enabled when all 12 checklist items are ticked. A dialog asks for the Dashboard and Scan Results links, introduction, notes and (for RoE) testing type, time and recommendations. It opens a preview in the PIA document style (Security Full Assessment or Rules of Engagement template), which can be saved as **PDF** or **Word (.doc)**. Issues are the app's unresolved issues, split into New (created during the assessment) and Backlog, with the seal and its wording. After the ticket resolves, the first download **freezes** the issues as of the resolution date; only admins can unfreeze.

### Time Report (`/assessment-tracker/time-report`)

Time spent per assessment: a plain-language headline, by application size (= priority) against the man-hours estimate, by security tester, and per app, with filters and CSV export.

### Period Comparison (`/assessment-tracker/period-comparison`)

Time and output compared across periods and cycles, grouped by track (Bi-Annual and Quarterly are never compared with each other).

### Checklist (`/assessment-tracker/checklist`)

The workbook's checklist grid, one row per app and one column per test, ticked in place. The 12 items: Testing, Port Scanning, Directory Listing, Security Headers, Data Privacy Check, Bruteforcing, Privilege Escalation, Broken Access Control, Injection, Denial of Service, Google Dorking, Uploaded.

### Decommissioned (`/assessment-tracker/decommissioned`)

Apps marked decommissioned in the chosen cycle, with Restore.

### Size Calculator (`/assessment-tracker/size-calculator`)

The Strike Team's "Web Application Size Calculator" workbook as a page (D14). Answer six factors (functionality, pages / API endpoints, data, integrations, roles, user base) to get **Small / Medium / Large / Critical**, the tracker priority, test duration for Black-, Gray- and White-Box testing, and a copyable assessment summary. Default is an adjusted matrix that counts user base; the original workbook matrix is one click away. Nothing is saved.

### Tech Risk Analyzer (`/assessment-tracker/tech-risk`)

Upload the application architecture workbook (.xlsx or .csv) to get, for each app and **each of its repositories separately**, the technologies that are out of support and the versions with known vulnerabilities (D17).

- **Input:** a sheet with an app name column (one row per app). A second sheet with a **"Used by App(s)"** column gives one audit per repository; otherwise lines that start with a repository name (`buzz-core: Laravel Lumen 6`) are split per repository.
- **Checks:** support lifecycles (PHP, Angular, Laravel / Lumen, .NET, .NET Framework, Node.js, CakePHP, MySQL, MariaDB, PostgreSQL, Redis, Vue, Python, Kotlin, Android SDK level against the Google Play rule) and a curated list of CVEs with fixed versions. "End of life" = no more security fixes; "EOL soon" = within 90 days. A CVE is **Affected** only with an exact version, otherwise **Possibly affected** until the installed patch is confirmed.
- **Views:** by application (risk = the worst repository) and by technology (which app › repository uses each version). **Export** to an .xlsx report (summary, repository audit, outdated technology, vulnerabilities, architecture).
- **Check live sources** refreshes dates from endoflife.date and asks OSV.dev about exact package versions, from the browser (works only where the network allows those sites).
- **Advisory check** (D19): paste the link to one vulnerability write-up. The server reads that public page (https only, private addresses refused, nothing stored; 6 reads per person per minute) and the page proposes the products it names that the workbook also names, with the fixed versions it gives. Correct them if needed; every app and repository is then **Affected** (version below the fix), **Possibly affected** (no version written, or a floating tag such as `stable`) or **Not affected**. If the page can't be read, paste its text instead. The result is added to the export as an "Advisory Check" sheet, and **Export affected apps (.xlsx)** saves just the affected and possibly affected apps with the advisory details (products, fixed versions, CVEs).
- Runs in the browser; the file isn't saved or uploaded (the advisory check sends only the link). The built-in data is dated (`KB_AS_OF` in `tracker/shared/techRisk.js`) and must be refreshed from time to time.

### App Access (`/assessment-tracker/app-access`)

One place for what testers need per app (D16): Web or Mobile, the web URL, or for mobile the platform and the **build folder link** (SharePoint / OneDrive / Drive folder with the IPA or APK), plus **test accounts** (username, password, role, environment, notes). **Test accounts only.**

- Passwords are encrypted at rest (AES-256-GCM, key `tracker/data/access.key`) and **never shown**: the Copy button fetches one at a time into the clipboard (logged, 30 per user per 10 minutes).
- Every signed-in user can view, edit and copy. Every change and copy is logged.
- No IPA / APK upload: builds stay in the shared folder.

### UberTicket Sync (`/settings/uberticket-sync`, admin)

Sync status, unmatched tickets and manual ticket ↔ app links.

### Import Excel (`/settings/import-excel`, admin)

Imports cycles from the old SharePoint workbook.

## Privacy Impact Assessments (PIA)

Yearly privacy reassessment status per app (D10), from UberTicket **policies** of template `[PIA01] Privacy Impact Assessment` (379488). Only the product, version and risk-rating fields are kept; questionnaire answers are never stored.

### PIA Overview (`/pia`)

Every app (tracker apps, PIA products and admin-added apps) with its status: **Current**, **Due soon** (default 30 days, admin-set), **Overdue**, **Never assessed**, with an in-progress badge. Reassessment is due **12 months** after the latest approved policy or admin-recorded reassessment. The app drawer shows history; admins record reassessments (date + https report link).

### PIA Matching (`/pia/uberticket-matching`, admin)

Link PIA products whose names don't match a tracker app, hide apps, add apps, and set the "coming due" window.

## Settings (`/settings`)

| Section | Path | Who | What |
|---|---|---|---|
| Application Settings | `/settings` | everyone | Where issue data is saved, date range defaults, settings backup / restore |
| Formula Rules | `/settings/formulas` | everyone (per browser) | Status and severity rules behind the metrics |
| Target Project List | `/settings/target-projects` | read: everyone; change: admin | The shared list of apps in scope and the "show only target projects" switch (D11) |
| Jira Integration | `/settings/jira` | admin | Jira site, credentials, filter / JQL, field mapping |
| Merge Data | `/settings/merge-data` | admin | Merge an Excel / CSV file into the dataset |
| Import Excel | `/settings/import-excel` | admin | Tracker workbook import |
| UberTicket Sync | `/settings/uberticket-sync` | admin | Tracker sync and ticket links |
| Users & Roles | `/settings/users` | admin | Roles |
| Danger Zone | `/settings/danger-zone` | admin | Delete all data (the only place it exists) |

## Documentation (`/documentation`)

This page, in the sidebar under Settings, for everyone. It shows `docs/FEATURES.md` with a contents list and search. Edit the file in the repository to change it (D18).

## Data, configuration and backups

| What | Where | Back up? |
|---|---|---|
| Issue dataset | Browser local storage, mirrored to PostgreSQL table `app_state` (`DB_*` settings) | Yes (Postgres) |
| Tracker (cycles, assessments, history, targets, report text and snapshots, App Access) | `tracker/data/tracker.db` | **Yes** |
| App Access encryption key | `tracker/data/access.key` | **Yes, with tracker.db** (without it the saved passwords can't be decrypted) |
| PIA reassessments and matching | `pia/data/pia.db` | **Yes** |
| Users and roles | `auth/data/users.json` | **Yes** |
| UberTicket token | `monitor/data/token.enc` + `secret.key` | Yes (or paste the token again) |
| Settings, secrets | `.env.local` (never committed) | Yes, securely |

Main `.env.local` settings: `AUTH_*` (sign-in), `APP_HOSTNAMES` and `TRUST_PROXY` (reverse proxy, D9), `JIRA_*` (Jira base URL, email, API token, filter or JQL, field ids), `DB_*` (Postgres), and optional monitor settings (`DPSA_TEMPLATES`, `FULL_TEMPLATE`, `ROE_TEMPLATE`, `PIA_TEMPLATE`, `SLA_*_DAYS`, `MTTR_TARGET_DAYS`). `.env.example` lists them with comments.

## Running, deploying and moving the app

**Local development:** `npm install`, then `DEMO=1 AUTH_DEV_BYPASS=1 TRACKER_DB_PATH=<scratch copy> npx vite --port 5199` (never test against live data). Checks: `npm run lint`, `npm run test:auth`, `npm run test:monitor`, `npm run test:tracker`, `npm run test:pia`, `npm run build`.

**Production:** a Proxmox container at **10.6.99.213** (Debian 12, Node 22, PostgreSQL 16 on localhost), reached through the OpenResty proxy as `https://security-analytics.cloudstaff.tech` (the proxy connects from 10.69.100.1). The app runs as the systemd service `security-issues-analytics` (`npm run dev` = `vite dev` on port 80, user `csdatasec`). There is no `sudo`; use `su -c`.

**Deploy:** push to `main` on GitHub (`tyronzion/project-issue-analytics`), then on the server as `csdatasec` run `bash scripts/deploy.sh`. It resets to `origin/main`, runs `npm ci` and lint, and restarts the service. Pushing alone does not deploy: no GitHub Actions runner is registered.

**Moving to a new server (checklist):**

1. Install Node 22+ and PostgreSQL 16; clone the repo; `npm ci`.
2. Copy `.env.local`, `tracker/data/` (including `access.key`), `pia/data/`, `auth/data/users.json` and `monitor/data/` from the old server, keeping file modes (0600 for keys).
3. Restore the Postgres `app_state` table (or let an admin re-sync from Jira).
4. Install `scripts/security-issues-analytics.service` as the systemd unit.
5. Update `APP_HOSTNAMES`, `TRUST_PROXY` and the reverse proxy target; keep the Entra redirect URI the same, or register the new one in Entra and in `AUTH_REDIRECT_URI`.
6. Sign in, open each monitor page (the token should still work), run an UberTicket sync, and spot-check the tracker, PIA and App Access (copy one password).

## Keeping this documentation current

- When you add or change a feature, update the matching section here, plus `docs/DECISIONS.md` for decisions and `docs/FILE_MAP.md` for new files.
- Recurring upkeep: renew the Entra client secret before it expires; add next year's Philippine holidays to `monitor/server/phHolidays.js`; refresh the Tech Risk Analyzer's built-in data (`tracker/shared/techRisk.js`).
