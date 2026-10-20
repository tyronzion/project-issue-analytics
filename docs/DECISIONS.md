# Decisions

Add a new entry only for decisions a future developer might otherwise reconsider.

### D1: One Vite server hosts the UI and every backend piece
- **Date:** pre-2026-10. Reaffirmed 2026-10-13 by the tracker merge.
- **Decision:** The Jira proxy, Postgres state, UberTicket monitor and tracker all run as middleware in `vite.config.ts`. Production runs `vite dev` under pm2.
- **Reason:** It gives one process, one port and one login for the whole team tool. It also keeps Jira and UberTicket secrets on the server.
- **Impact:** `vite build` produces a frontend only. Any new API goes in a `configureServer` plugin, or into the monitor or tracker apps. Don't add a second server without a decision.

### D2: UberTicket access is read-only and the token is encrypted at rest
- **Date:** 2026-10
- **Decision:** The client only calls GET endpoints. The token is stored with AES-256-GCM in `monitor/data/` (mode 0600) and never returned to the browser. Changing it requires the app login when embedded, or localhost or a password when standalone. A plaintext `UBERTICKET_TOKEN` in `.env.local` is migrated to encrypted storage and then blanked.
- **Reason:** It is a personal bearer token for a production ticketing system.
- **Impact:** Don't add write calls, logging of the token, or endpoints that echo it.

### D3: In tracker sync, UberTicket wins
- **Date:** 2026-10-13
- **Decision:** The tracker takes these values from UberTicket:
  - Status: open = In Progress, resolved = Done
  - Tester: the assignee, frozen once the ticket resolves
  - Actual start and end: the submitted and resolved dates
  - Time Spent (MM) from RoE and, since 2026-10-16, Full Assessment tickets (private field 22570; an empty field never clears a recorded time)
  - Rejected tickets never count (2026-10-16): sync skips them, and an app linked to a ticket that is rejected later is unlinked (status, actual dates and the synced time spent cleared, logged in history; a hand-entered time is kept). The monitor pages drop rejected tickets as soon as they load.
  - Seal: snapshotted from the client-side Security Seal when the ticket resolves

  Products are matched by name, ignoring case, punctuation and a leading "Cloudstaff". Products that don't match are linked manually through `ticket_links`.
- **Reason:** It removes manual double-entry from the old Excel workbook.
- **Impact:** Manual edits to the synced fields are overwritten. Don't make sync depend on user edits.

### D4: Tracker UI styling is isolated
- **Date:** 2026-10-13
- **Decision:** Tracker components use the `at-*` classes in `tracker.css` or inline styles, not Tailwind colour utilities.
- **Reason:** The global `.cloudstaff-theme` CSS repaints any class containing `bg-` and some text colours.
- **Impact:** New tracker UI must follow the same rule.

### D8: Two roles, admin and user, enforced on the server, managed in the app
- **Date:** 2026-10-14
- **Decision:**
  - **What admins can do that users can't:**
    - Data changes: saving the shared issue dataset (`POST /api/state/issues`), the Jira POST with user-supplied credentials, Import/Merge/Delete/Clear, and Restore Backup.
    - Monitor and tracker setup: the UberTicket token, tracker Excel import, and UberTicket sync and links.
    - Managing users (`/auth/users`).
  - **What users can do:** everything else, including tracker editing and the per-browser Formula/Projects/Target settings.
  - **Storage:** roles live in `auth/users.js` → `auth/data/users.json` (0600, git-ignored, blocked over HTTP). They are looked up on every request.
  - **Permanent admins:** `AUTH_ADMIN_EMAILS` are always admins and can't be changed from the app.
  - **Defaults and limits:** new sign-ins become "user". The last admin can't be demoted or removed. If the users file can't be read, everyone except `AUTH_ADMIN_EMAILS` is treated as "user" and changes are refused.
  - **Client:** the UI hides admin actions (`ADMIN_TABS` in `routes.ts`, handlers passed as `undefined`). Users' browsers don't auto-save issues or auto-sync Jira.
  - **Audit trail:** the tracker records the signed-in user's name, no longer the client `x-user` header.
- **Reason:**
  - The user asked for in-app user management.
  - Enforcing on the server keeps hidden buttons from being the only control.
- **Impact:**
  - Any new route that changes shared data or setup must call `requireAdmin` (or the tracker's `adminOnly`).
  - Who may sign in at all is still controlled in Entra; removing a person in the app only resets their role.

### D7: Server-side sign-in with two options, Microsoft SSO and classic login
- **Amended 2026-10-14:** at the user's request, both options are offered side by side on `/auth/login`.
  - **"Sign in with Microsoft"** goes to `/auth/microsoft`, then the callback (`/auth/callback` or `/callback`, see D9). It's enabled when all four `AUTH_*` settings are valid; otherwise the button is shown disabled and the problems are logged.
  - **Classic form** (POST `/auth/login`):
    - Uses the original shared account, verified server-side against a salted scrypt hash (`BUILT_IN_CLASSIC`), or `AUTH_CLASSIC_USERNAME`/`AUTH_CLASSIC_PASSWORD` instead.
    - Brute-force limit: 10 failures per IP per 15 minutes.
    - The account is always an admin.
    - `AUTH_CLASSIC_LOGIN=0` turns it off.
  - **Lock-out:** with neither option available, the app returns 503.
  - **Exposed flags:** `auth.methods = { microsoft, classic }`, and `auth.mode` is `login`, `dev-bypass` or `unconfigured`.
  - **Trade-off:** the shared classic account remains an admin entry point next to SSO. Recommend a strong `AUTH_CLASSIC_PASSWORD`, or turning classic off, once SSO is proven.
  - The original record below still applies otherwise.
- **Date:** 2026-10-14
- **Decision:**
  - `auth/auth.js` is the first middleware in `vite.config.ts`. It uses OIDC authorization code + PKCE through `@azure/msal-node` as a confidential client.
  - Sessions live in server memory behind an opaque HttpOnly, SameSite=Lax cookie (Secure when the redirect URI is https). They end after 8 hours idle or 24 hours total.
  - Every path needs a session except `/auth/*` and `/design-system/*`.
  - Entra decides who gets in ("Assignment required"). The code also checks the token's `tid`, the `nonce`, and that `state` is bound to the browser.
  - With no `AUTH_*` settings, every request is refused (503). `AUTH_DEV_BYPASS=1` admits only loopback requests and is ignored once Entra is configured.
  - `tracker/data` and `monitor/data` are refused for every request.
  - The old hardcoded login (`appLogin.ts`, `LoginScreen.tsx`) was deleted. Monitor token changes need `req.user` (option `settingsUser`).
- **Reason:**
  - Signing in only in the browser (MSAL.js) would leave `/api/*` unprotected.
  - The Vite dev server, which runs in production, served the tracker database and probably the monitor's key files to anyone.
- **Impact:**
  - `authPlugin()` must stay first in the plugin list.
  - A server restart signs everyone out.
  - Production needs HTTPS and the Entra settings **before** this is deployed, or the app is locked for everyone.
  - New public paths must be added to `PUBLIC_PREFIXES` deliberately.

### D9: Reverse proxy and hostname are explicit settings
- **Date:** 2026-10-14
- **Decision:**
  - Production is reached as `https://security-analytics.cloudstaff.tech` through an OpenResty proxy (`proxy-nsoc`, 10.6.99.71). The proxy connects to the CT over a separate network: the CT's `netweb` card, 10.69.100.110, with the proxy coming **from 10.69.100.1**. So `TRUST_PROXY=10.69.100.1`; use the address the CT actually sees.
  - `APP_HOSTNAMES` feeds Vite `server.allowedHosts`. Never set it to `true`.
  - `TRUST_PROXY` lists the proxy IPs. Only from those IPs does `auth/auth.js` believe:
    - `X-Forwarded-For`: the right-most untrusted hop is the client IP for the login rate limit.
    - `X-Forwarded-Proto`: https means Secure cookies.
- **Reason:**
  - Vite's host check prevents DNS rebinding.
  - Behind a proxy, every client shares the proxy's IP, so one person's failed logins would lock everyone out.
  - The forwarded headers are forgeable unless they come from the proxy.
- **Impact:**
  - Both settings live in the server's `.env.local`.
  - Microsoft sign-in uses `https://security-analytics.cloudstaff.tech/callback` as its redirect URI (2026-10-15: that is what is registered in Entra). `AUTH_REDIRECT_URI` may end in `/auth/callback` or `/callback`; only the configured path answers, and `/callback` is public only when it is that path.

### D6: Cloudstaff Design System is the visual foundation, applied through tokens
- **Date:** 2026-10-14
- **Decision:**
  - `src/index.css` loads the design system's `fonts/fonts.css` and `css/tokens.css` from `Cloudstaff Design System/`.
  - The app's `--cs-*` variables and the `.cloudstaff-theme` overrides read from design-system tokens.
  - Tailwind `@theme` maps `rounded-*`, `shadow-*`, `font-sans` and `font-mono` to design-system values.
  - Monitor pages link the same files through `/design-system/{css,fonts,assets}`, served read-only by `vite.config.ts`. `theme.css` has hex fallbacks for standalone mode.
  - The official logo replaced the hand-drawn one.
  - The design system's `base.css`, `components.css` and `utilities.css` are **not** loaded.
- **Reason:** It gives the official brand look without rewriting about 14k lines of Tailwind markup. The design system's reset and neutral class names (`.grid-2`, `.stack`, …) would fight Tailwind.
- **Impact:**
  - The `@layer` order at the top of `index.css` must keep the design-system layers **before** Tailwind's. The design system's `--container-*` and `--blur-*` share names with Tailwind's but have different values and formats; if they won, `max-w-md` and `backdrop-blur` would break.
  - New UI should use design-system tokens (`var(--color-…)`, `--component-…`), not hex values.
  - The `Cloudstaff Design System/` folder must be deployed with the app.
  - Lucide icons and the existing copy were kept; the design system recommends Font Awesome and en-AU sentence case.

### D5: The tracker database is SQLite, using node:sqlite with a sql.js fallback
- **Date:** 2026-10-13
- **Decision:** The database file is `tracker/data/tracker.db` (git-ignored). `TRACKER_DB_PATH` overrides the location and `TRACKER_SQLITE=sqljs` forces the fallback.
- **Reason:** It needs no extra service and works on Node versions older than 22.13.
- **Impact:** Tests run on both backends. SQL must work on both.

### D10: Privacy Impact Assessments are a module of this app, read from UberTicket policies
- **Date:** 2026-10-15
- **Decision:**
  - **Placement:** `pia/` is a fourth module inside this app (D1), with its own SQLite file `pia/data/pia.db` (blocked over HTTP, git-ignored). The tracker database is only read (`tracker.apps()`).
  - **Source:** PIAs are UberTicket **policies**, not tickets: template `[PIA01] Privacy Impact Assessment` = 379488 (`PIA_TEMPLATE`), listed with GET-only `/v1/policies/search?_templates=379488`. The product is form field 18890 ("Project or Product"). Only the product, version and risk-rating fields are kept; the questionnaire answers and policy messages are never stored. Same token and rules as D2. A PIA fetch failure doesn't fail the other monitors.
  - **Reassessment:** due 12 calendar months after the latest of an approved policy (`acknowledged_at`) or an **admin-recorded reassessment** (date + https report link). Today, reassessments are a message on the existing policy with no new version, so they can't be detected automatically. "Coming due" defaults to 30 days and is admin-set. Overdue stays overdue, with an "in progress" badge, until a reassessment is recorded or a newer policy is approved.
  - **App list:** tracker apps, plus PIA products (as their own app when no name matches), plus admin-added apps. Apps without a PIA show as "Never assessed".
  - **Roles:** every PIA change is admin-only (D8); users can see everything.
- **Reason:** It reuses sign-in, roles, the encrypted UberTicket token and the tracker's app list. The user chose admin-recorded reassessments over parsing messages, which hold personal data.
- **Impact:**
  - Back up `pia/data/pia.db`.
  - Phase 2 (read-only GitHub App scan) and phase 3 (own PIA vs covered by parent, decided by an admin with the parent's PIA linked) are planned in `docs/sessions/pia.md`. They must keep GitHub access GET-only, with an org allowlist.

### D11: The Target Project List is one shared list on the server
- **Date:** 2026-10-19
- **Decision:**
  - The Target Project List and "show only target projects" moved from each browser's `localStorage` to the tracker database (`target_projects`, `target_history`, `target_settings`), served at `/api/tracker/targets`. Reads need sign-in; changes are admin-only and fail closed without `isAdmin`.
  - New Rules of Engagement products are added by the UberTicket sync, only for tickets created after the list was set up (no backfill of years of old RoE apps). Apps an admin removed stay removed.
  - Entries are unique by `matchKey` (platform entries such as "Staffcentral IOS" stay separate, as the analytics pages count them separately). Tracker and PIA pages match apps with `targetKey`, which ignores platform and filler words.
  - The filter is applied in the UI only.
- **Reason:** The user wanted one list for everyone that grows with new RoE apps and limits the analytics, tracker and PIA pages. A per-browser list can't be updated by the server.
- **Impact:** Restoring a settings backup or clearing data no longer changes the list unless an admin does it. The list is in `tracker.db`, so the tracker backup covers it.
- **Amended 2026-10-20 (list as the tracker's guide):** every list app with no row in this year's tracker gets a **Not Started** row (`addRowsForTargets`). It goes on the app's track this year (otherwise Bi-Annual), for the current period and the later ones; past periods are not backfilled. One row per app (platform entries merged). This runs on startup, before each UberTicket sync, after a list save, and after a cycle is created. A Full Assessment ticket for the app is then matched to that row by the sync (same name and period), which fills in its link, status, tester and dates instead of leaving it unmatched. Apps decommissioned this year are skipped. Deleted auto-added rows are remembered in `target_row_ignores` and not re-added.


### D12: Assessment report is a print-ready page; the seal formula lives in one place
- **Date:** 2026-10-20
- **Decision:**
  - The assessment report (Security Full Assessment, or Rules of Engagement when the linked ticket is RoE) is built in the browser, because only the browser has the issues. It opens as a print-ready page, and the user picks "Save as PDF". No PDF library: the design-system fonts are woff2 only and jsPDF can't embed them.
  - The report can be downloaded only once all 12 App testing checklist items are ticked. The "Report" deliverable can't be the gate, because it is the report itself.
  - The issue list is the app's **unresolved** issues, the same set the seal counts. An issue is **New** if it was created between the assessment's actual start and end dates (the UberTicket dates, or the planned dates; the end defaults to today), and **Backlog** otherwise.
  - The seal comes from `sealFromCounts` in `tracker/shared/report.js`, a direct port of the team's spreadsheet formula (A = Low, B = Medium, C = High, D = Critical). `src/utils/securitySeal.ts` uses it too. A test checks that it matches the earlier matrix for every band edge.
  - The text the team writes per report (Introduction, Dashboard and Scan Results links, notes, and for RoE the testing type, testing time and recommendations) is saved as JSON in `assessments.report_info`. It is validated on the server: whitelisted keys, length limits, and http(s) links only. Every user can edit it, as with other tracker fields (D8).
  - **Frozen once resolved:** a resolved ticket's report uses a snapshot of the app's issues **as of the resolution date** (`actualEnd`). These are issues created by then that were still open then, including any closed later. The snapshot is stored in `assessments.report_snapshot`, keyed by the ticket. It is written at the first download after resolution (`POST /assessments/:id/report-snapshot`; the server accepts it only for the row's current resolved ticket and never overwrites it), and every later download reuses it. The next assessment is another row and ticket, so it gets its own report. Only admins can unfreeze (`DELETE`, fails closed). Report text and links stay editable.
  - **Cancelled issues count if cancelled after the resolution date.** The app now keeps cancelled issues in its dataset (local storage, the Postgres mirror and backups). The analytics pages still leave them out: App.tsx derives `issues` from `allIssues` without them, and they are never outstanding. The report's as-of filter uses the full list, so an issue cancelled after the resolution date counts, and one cancelled on or before it does not. Datasets saved before this change have already lost their cancelled issues; a Jira sync brings them back.
  - The snapshot is taken at download, not automatically when the tracker loads. A browser with stale or partial issue data would otherwise freeze wrong reports (target-list apps count as "matched" even with no data). The person downloading sees the counts before they are frozen.
- **Reason:** The user asked for PDFs that follow the SharePoint Word templates, with grammar-checked seal wording (including a version for when no issues are found).
- **Impact:** Changing the seal rules means editing `sealFromCounts` only. The report wording lives in `report.js` (seal text, advisory, findings) and `renderReport.js` (fixed template sections).

### D13: Decommissioned is one shared flag, owned by the Assessment Tracker
- **Date:** 2026-10-20
- **Decision:**
  - An app is decommissioned when its rows in its **latest** tracker cycle are `is_active = 'Decommissioned'` (`listApps`, `GET /api/tracker/apps`).
  - The analytics pages (Project Metrics, Dashboard, Seal, All Issues, Dependabots) leave decommissioned apps out for everyone (`computeProjectSummaries` `isExcluded`). The match is by `targetKey`, so platform variants ("Radio AOS") follow "Radio".
  - The Projects page can decommission or restore an app (`POST /api/tracker/apps/decommission`). That sets every row of the app in its latest tracker year and logs it in history. It is open to every signed-in user, like editing in the tracker (D8).
  - Decommissioning in the assessment editor has the same effect.
  - Delete (per-browser `deletedProjects`) is unchanged.
- **Reason:** The user wanted "decommissioned" on the Projects page to follow the tracker automatically, and asked for decommissioned apps to be hidden from metrics but restorable.
- **Impact:** Older cycles keep their own state; only the latest year changes. An app the tracker doesn't know can't be decommissioned from the Projects page (no button).
