# Project State

_Last updated: 2026-10-20_

## Current phase
The app is in production use and gets features added incrementally. The Assessment Tracker was merged in on 2026-10-13, which brings all three parts (analytics, monitors and tracker) into one app.

## Current focus
The sign-in page offers two options, "Sign in with Microsoft" and the classic team login (D7 amended).
- **Enabled on production 2026-10-15.** The server's `.env.local` has all `AUTH_*` settings (redirect URI `https://security-analytics.cloudstaff.tech/callback`, as registered in Entra), and the log says `sign-in options: Microsoft + classic`. Set by hand with `auth/envFromCi.js` because no GitHub runner is registered (runner unpacked but not configured in `~/actions-runner`). The first real sign-in failed with `token exchange failed: invalid_state` (msal-node decodes a payload state it was not given in the request); fixed by passing `state` in the `acquireTokenByCode` request (`b0f966e`). **Verified 2026-10-15 02:05: a real Microsoft sign-in works in production** (`signed in: zionm@cloudstaff.com`).
- Classic login keeps working throughout.

## Recently completed
- **Target Project List as the guide** (2026-10-20; pushed to `main`, **not deployed**). The tracker's Monitoring, Assessment List and Checklist pages have a check panel (`TargetCheck.jsx`). It counts the list by app (platform entries once) and shows list apps in this cycle, on the other track of the same year, decommissioned, or missing, plus cycle apps not on the list. The list buttons show "N entries · M apps". New RoE apps already join the list (D11).
- **Decommissioned apps follow the tracker** (2026-10-20, D13; pushed to `main`, **not deployed**). The Projects page has Decommission/Restore and a Decommissioned Applications section. Decommissioned apps (from here or the assessment editor) are left out of every analytics page for everyone.
- **New / Old column** (2026-10-20; pushed to `main`, **not deployed**). The Assessment List has a New / Old column and filter (the filter also shows on Checklist and Time Report). It shows `classification`, which the UberTicket sync already sets: Rules of Engagement ticket = New, Full Assessment ticket = Old. Apps without a ticket keep their workbook or editor value.
- **Assessment report PDF** (2026-10-20, D12; pushed to `main` as `0a79a91`, print fixes `b18d8ad`, `548eaf2`, Jira links `e1b7920`, **not deployed**).
  - In the assessment editor, **Download report** turns on once all 12 checklist items are ticked. It opens a dialog for the Dashboard and Scan Results links (recommended), the Introduction and notes, and for RoE the testing type, testing time and recommendations. These are saved in `report_info`.
  - The dialog then opens a print-ready report in a new tab. The template is Full Assessment, or RoE when the ticket is RoE. The report has the team's seal badge image (`public/seals/`), New/Backlog/Overdue counts, the issue table and the grammar-checked seal wording. The browser's "Save as PDF" makes the file, named like `2026 Q4 Cloudstaff <App> Security Report`.
  - **Frozen after resolution:** the first download after the ticket resolves saves the issues as of the resolution date (`report_snapshot`). Later downloads use that copy, and the next assessment gets its own report. Admins can unfreeze. Checked in the demo: changing issues afterwards left the report unchanged.
  - The seal now comes from `sealFromCounts`, the user's spreadsheet formula. It gives the same results as the old matrix.
  - Checked in `issue-analytics-demo` with seeded fake issues: the dialog, the counts, both templates, the no-issue wording, and HTML/`javascript:` escaping. **Not yet checked:** the real print dialog and PDF output. The pane blocks new tabs, so the report was rendered in a tab by script. The SLA "Medium – 90 days" value in Appendix A was partly hidden in the template; confirm it.
- **Shared Target Project List** (2026-10-19, D11; pushed to `main` as `8fc6975`, **not deployed**).
  - The list and the "show only target projects" switch are now one shared copy on the server (`tracker/server/targets.js`, tables in `tracker.db`, `GET/PUT /api/tracker/targets`). Everyone reads it; only admins change it, with a history log. The browser's own copy is no longer used.
  - The first admin to open the app after deploy sets it up from that browser's list (or the 104-app default), with the switch on.
  - The UberTicket sync adds products from Rules of Engagement tickets created after setup that aren't covered by the list (platform variants count; removed apps aren't re-added).
  - When the switch is on, the analytics pages, Assessment Tracker pages and PIA Overview show only target apps (`tracker/shared/targets.js` `targetKey`). Admins can "Show all apps". UberTicket Sync and PIA Matching still see every app. It is a display filter, not access control.
- **One filter design + rejected tickets never count** (2026-10-16; pushed to `main` as `a69e3cb`, **not deployed**). Every page's filters now use the global filter bar's chip (`FilterChips.tsx`): tracker cycle/period header, Assessment List, Monitoring, Time Report, Period Comparison, Decommissioned, All Issues, PIA, and the UberTicket monitor pages (their segmented date / environment / priority buttons became dropdown chips). Rejected UberTicket tickets are excluded everywhere (D3 note).
- **UI clean-up from MichaelC's review** (2026-10-16; pushed to `main` as `dff7034`, **not deployed**).
  - Time Report and Period Comparison redesigned to read at a glance: a plain-language headline, size cards with range strip vs the man-hours estimate (`estimateMinutes`/`vsEstimate` in `logic.js`), tester bars, an "Above/Within/Below estimate" badge per app, and period columns per track.
  - Dashboard: colour-coded icons plus a 12-month sparkline behind each total.
  - Project Metrics / Dependabots: six quiet KPI cards; the formulas moved into a collapsed "How are these counted?".
  - New **Settings** page (`/settings/*`): Application Settings, Formula Rules, Target Project List, Jira, Merge Data, Import Excel, UberTicket Sync, Users & Roles, Danger Zone. Those entries left the sidebar; old paths still work. **Delete All Data now exists only in the Danger Zone** (removed from the navbar menu, Project Metrics, Dependabots and All Issues).
- **Time spent from Full Assessment tickets** (2026-10-16; pushed to `main` as `875b440`, **not deployed**). Full Assessment (1080829) tickets have Time Spent (MM), Size and Seal under Private Fields; `FULL_FIELDS` now reads Time Spent and Size (ids 22570/43044 as in RoE, label fallback for grouped data) and sync no longer limits time spent to RoE. **Unverified against a real Full Assessment payload:** after deploy, check a resolved Full Assessment ticket (e.g. the one with 500) shows its time in the tracker; if not, the template uses different field ids.
- **Tracker Period Comparison page** (2026-10-16; pushed to `main` as `7fb847f`, **not deployed**). The comparison between periods moved off Time Report to its own sidebar page "Period Comparison" (`/assessment-tracker/period-comparison`, `tracker-comparison`); `PeriodComparison` is still exported from `TimeReport.jsx`.
- **Tracker Time Report** (2026-10-16; pushed to `main` as `397f18b`, **not deployed**). New sidebar page "Time Report" (`/assessment-tracker/time-report`, `tracker-time`, everyone can view) asked for by MichaelC: summary KPIs, by application size (= priority), by security tester, per app (filters + CSV), and a comparison between periods across all cycles, grouped by track (Bi-Annual vs Quarterly are never compared). Uses `timeByGroup` in `logic.js`; Monitoring's priority table is now the shared `TimeByPriorityTable`.
- **Tracker time spent per app** (2026-10-16; pushed to `main` as `a82e2e3`, **not deployed**). The existing `time_spent` (minutes; from the RoE ticket or the editor) is now shown per app: a Time spent column on Assessment List and Monitoring, plus a "Time Spent by Priority" table on Monitoring (apps with time, hours range, average, total, vs the workbook man-hours estimate). Apps without time are left out of the range. Logic is `timeStats`/`timeByPriority` in `tracker/shared/logic.js`; formatting is `fmtMinutes` in `ui.jsx`.
- **PIA monitor, phase 1** (2026-10-15, D10; pushed to `main` as `14acd59` on 2026-10-19, **not deployed**).
  - New `pia/` module at `/api/pia`, with sidebar pages "PIA Overview" and "PIA Matching" (admins only).
  - Reads UberTicket **policies** of template `[PIA01] Privacy Impact Assessment` (379488) through `GET /v1/policies/search`; the product is field 18890.
  - The app list is tracker apps plus PIA products plus admin-added apps.
  - Reassessment is due 12 months after the last approved PIA or admin-recorded reassessment; "coming due" is 30 days and editable.
  - Data lives in its own `pia/data/pia.db`.
  - The plan for phases 2 and 3 (GitHub scan, coverage decisions) is in `docs/sessions/pia.md`.
- **User management with two roles** (2026-10-14, D8). Admins can do everything; users can't make data changes or monitor/tracker setup. Enforced on the server. `zionm@cloudstaff.com` is a permanent admin via `AUTH_ADMIN_EMAILS` in the local `.env.local`.
- **Sign-in on the server** (2026-10-14, D7).
  - Two options: Microsoft SSO and the classic shared login, checked server-side (hash only) and rate-limited.
  - The client-side hardcoded login was removed.
  - `/tracker/data` and `/monitor/data` are now blocked. Before this, the tracker database was downloadable without logging in.
- **Cloudstaff Design System applied** (2026-10-14) to the analytics UI, monitor pages, tracker and login, with the official logo. It works through tokens and the existing overrides; no TSX markup was rewritten.
- **Project memory system** set up (2026-10-14).
- **Assessment Tracker merged** (2026-10-13). It runs on SQLite and is served at `/api/tracker`. After each monitor refresh it syncs from UberTicket's Full Assessment (1080829) and RoE (72913) tickets. Its data was copied from the standalone app, which is now superseded. The pre-merge backup is `~/Downloads/project-issue-analytics-backup-2026-10-13.tgz`.
- **UberTicket monitors embedded** under `/monitor/*` as sidebar tabs. Changing the token requires the app login.
- **Security Seal page.** The seal is snapshotted into the tracker when a ticket resolves.

## Current issues / known limitations
These are recorded only, not fixed.
- **PIA needs a production backup entry.** `pia/data/pia.db` holds admin-recorded reassessments; add it to whatever backs up `tracker/data/tracker.db`. Past reassessments (e.g. NEO, Jan 2026) must be recorded once by an admin after deploy.
- **PIA policy statuses** were confirmed only for `approved`. Treating `resolved`/`closed` as approved and `rejected`/`removed` as ignored is an assumption (`monitor/server/piaPolicy.js`); check it against real data after deploy.
- **Production still runs the old build** until a deploy. That build has client-only login, an exposed `/tracker/data/tracker.db`, and probably exposed `monitor/data` key files. Treat the old password (`csdatasec` login) as public: change it anywhere else it is used. Consider rotating the UberTicket token after deploying.
- **Entra client secret expires.** Renew it in Entra before the expiry date, or sign-in stops working.
- **Production** has been the Proxmox CT since 2026-10-14, at **10.6.99.213** (final address; .208 belonged to the old VM and is not reused, see the session file). It was moved from the old VM; see `docs/sessions/server-migration.md`.
  - Debian 12, Node 22, PostgreSQL 16 native on localhost.
  - systemd unit `security-issues-analytics` (`npm run dev` = `vite dev` on port 80, user csdatasec, starts on boot). No pm2, no Docker.
  - There's no `sudo`; use `su -c`.
  - All APIs live in Vite `configureServer` plugins, so `vite build` / `dist/` contains **no backend**.
  - **Public URL:** `https://security-analytics.cloudstaff.tech`, via the OpenResty proxy, which provides HTTPS and reaches the CT from 10.69.100.1 on its `netweb` network (D9). The server's `.env.local` has `APP_HOSTNAMES` and `TRUST_PROXY`.
  - To update the server, run `bash scripts/deploy.sh` there as csdatasec (no root needed); it restarts the service. Don't run `npm install` or `npm audit fix` on the server.
  - The README's deploy and pm2 section is stale.
  - No GitHub runner is registered, so pushes don't deploy.
- **Some docs are stale.** The top of `README.md` is AI Studio boilerplate. `monitor/README.md` describes the old standalone package: it refers to `src/phHolidays.js` (the file is now `monitor/server/phHolidays.js`) and to `npm start/demo` (the root script is `npm run monitor`).
- **Holidays need a yearly update.** `monitor/server/phHolidays.js` covers 2024–2026, so 2027 must be added once it is proclaimed.
- **Design-system adoption is partial by design.** Icons are still lucide (the design system recommends Font Awesome Free), the existing copy and Title Case were kept, there is no dark mode, and coloured status text is still flattened to brand blue by the existing overrides.
- **Pre-existing layout bug.** On the Project Metrics page, the Tracked Applications card's "All Apps" button overflows the card at about 1440px (it did before the restyle too).
- **No git history here.** This local copy has no `.git`, so changes can't be diffed. The deploy flow assumes `main` on GitHub.

## Architecture notes (only what saves time)
- The whole backend runs as Vite middleware in `vite.config.ts`: Jira, Postgres state, the monitor (an Express app), and the tracker (an Express router).
- Issue data is stored in `localStorage` first, with Postgres `app_state` as an optional mirror. Analytics settings and formulas live only in `localStorage`, except the Target Project List and its switch (server, D11).
- The tracker DB uses `node:sqlite` on Node 22.13+ and falls back to `sql.js`. Tests run on both.

## Constraints (do not break)
- The UberTicket client is **read-only** (GET only). The token is encrypted at rest (AES-256-GCM, `monitor/data/`) and is never returned to the browser.
- Tracker sync rules:
  - UberTicket status wins (open = In Progress, resolved = Done).
  - The tester is frozen once the ticket resolves.
  - Manual links live in `ticket_links`.
- Scoring formulas in `tracker/shared/logic.js` are ported from the workbook. Change them only if the workbook rules change.
- Never commit, or test against, live `tracker/data/` or `monitor/data/`. For browser checks, use the `issue-analytics-demo` launch config (`DEMO=1`, `tracker/data/dev-copy.db`, `AUTH_DEV_BYPASS=1`).
- New routes that change shared data or setup must call `requireAdmin` (D8).
- `authPlugin()` stays first in `vite.config.ts`. Never weaken the gate, `PUBLIC_PREFIXES` or the data-folder block to make something work (D7).
- The `@layer` order at the top of `src/index.css` (design-system layers before Tailwind's) must not change; see D6.

## Last important decisions
See `DECISIONS.md`: D1 single Vite server, D2 encrypted read-only UberTicket, D3 UberTicket wins in tracker sync, D4 tracker styling isolation, D5 SQLite fallback, D6 design system through tokens, D7 server-side Microsoft sign-in, D8 admin/user roles, D10 PIA module, D11 shared Target Project List.

## Verification (2026-10-14, after Microsoft sign-in)
| Check | Result |
|---|---|
| `npm run test:auth` | 34/34 pass (both sign-in options side by side, roles, `pia/data` blocked) — rerun 2026-10-15 |
| `npm run test:monitor` | 33/33 pass (incl. PIA policy client and normalizer) — 2026-10-16 |
| `npm run test:pia` | 20/20 pass on node:sqlite and sql.js — 2026-10-15 |
| `npm run test:tracker` | 47/47 pass (node:sqlite and sql.js, incl. shared Target Project List, assessment report, report freeze and decommission) — 2026-10-20 |
| `npm run lint` (tsc) | clean |
| `vite build` | succeeds; fonts bundled |
| Browser check (`issue-analytics-demo` preview) | design pages checked. Auth checked live: fails closed (503), data folders 404, dev bypass and sign-out work. Classic login checked live (`issue-analytics-classic` preview, generated test credentials). Roles checked live in both preview configs: admin Users page (add, change role, remove), and as user every admin action returns 403 while admin pages redirect. The real Entra round trip was verified in production on 2026-10-15. |

## Next action
PIA phase 1 is on `main` (pushed 2026-10-19; verified locally in a 2026-10-15 browser check in `issue-analytics-demo`, admin and user roles). To ship it: deploy, confirm the live PIA01 fetch in the log (`[pia] UberTicket sync: N PIA policies`), link any mismatched products on PIA Matching, record past reassessments, add `pia/data/pia.db` to backups. Phase 2 (GitHub scan) needs the GitHub org name and an org owner to install a read-only GitHub App.

Microsoft sign-in is live in production (2026-10-15). Remaining, none urgent:
1. Assign the people/group who should sign in to the app's Enterprise Application in Entra (Assignment required = Yes), and give roles on the Users & Roles page.
2. Once everyone uses Microsoft: set `AUTH_CLASSIC_LOGIN=0` (the old classic password should be treated as public), or set a strong `AUTH_CLASSIC_PASSWORD`.
3. Note the Entra client secret's expiry date; renew it before then (in Entra and in GitHub/`.env.local`).
4. GitHub deploys: either finish registering the runner (`~/actions-runner` is unpacked; run `config.sh`, then `svc.sh install` as root) or delete `~/actions-runner` and keep deploying by hand with `scripts/deploy.sh`. The repo is public: never add a `pull_request` trigger to `deploy.yml`.
