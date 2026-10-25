# File Map

This is an index. Open only the entries relevant to the task.

## Data flow
```
Every request ──▶ auth/auth.js (Microsoft sign-in, session cookie; blocks tracker/data + monitor/data) ──▶ routes below

Jira API / Excel-CSV import / Postgres ──▶ App.tsx issue state (localStorage, optional Postgres mirror)
   ──▶ metricsEngine + projectMatcher ──▶ MetricsDashboard / Charts / Issues / Security Seal

UberTicket API (read-only, encrypted token) ──▶ monitor.js (DPSA, Full Assessment, RoE metrics) ──▶ /monitor/* pages (iframes)
                                             ├─▶ onRefresh ──▶ tracker sync.js ──▶ SQLite tracker.db ──▶ /api/tracker ──▶ tracker UI
                                             └─▶ [PIA01] policies ─▶ onRefresh ──▶ pia sync.js (+ tracker apps) ──▶ SQLite pia.db ──▶ /api/pia ──▶ PIA UI
Security Seal (client) ──▶ POST /api/tracker/assessments/:id/seal (snapshot on resolve)
```

## Server and build
| File | Purpose | Relationships |
|---|---|---|
| `auth/users.js` | **Security-sensitive.** Users and roles (admin/user), stored in `auth/data/users.json`. Handles `AUTH_ADMIN_EMAILS`, the last-admin guard, and least privilege when the file is unreadable. Tests are in `auth/users.test.js`. | Used by `auth.js` (`roleOf`, `/auth/users`). Created in `vite.config.ts`. |
| `auth/auth.js` | **Security-sensitive.** Sign-in page with two options, Microsoft Entra SSO (`/auth/microsoft`, then `/auth/callback` or `/callback`, whichever `AUTH_REDIRECT_URI` names) and the classic shared login (POST `/auth/login`, server-side, rate-limited). Handles `/auth/login`, `/callback`, `/logout`, `/me` and `/signed-out`, keeps sessions in memory, gates every request and blocks the data folders. Tests are in `auth/auth.test.js`. | First middleware in `vite.config.ts`. Sets `req.user` (with `role`). Exports `requireAdmin`, which `vite.config.ts` (issue save, Jira POST) uses; the tracker uses `isAdmin` and the monitor `settingsUser`. |
| `auth/envFromCi.js` | **Security-sensitive.** CLI run by `.github/workflows/deploy.yml`: merges the `AUTH_*` keys from GitHub Actions secrets/variables into the server's `.env.local` (mode 600, other lines kept, values never printed). Tests are in `auth/envFromCi.test.js`. | Called before `scripts/deploy.sh` |
| `vite.config.ts` | **The backend.** Serves `/api/state/issues` (Postgres), `/api/jira/issues` (Jira proxy using server-side creds), `/api/jira/site` (the Jira site address only, for issue-key links in the assessment report), `/monitor/*`, `/api/tracker` and `/design-system/{css,fonts,assets}` (read-only static). Loads `.env*` into `process.env` and enables HTTPS when `certificates/` exists. | Wires in `createMonitor` and `createTracker`, which share the monitor's tickets |
| `scripts/start-dev.sh`, `scripts/deploy.sh`, `scripts/security-issues-analytics.service`, `.github/workflows/deploy.yml` | Dev and production start (port 80). `deploy.sh` resets to `origin/main`, runs `npm ci` and lint, then restarts the systemd service by signalling its main process (falling back to starting `npm run dev` directly on servers without the unit). The workflow needs a self-hosted runner (none registered). | `npm run dev` |
| `docker-compose.yml` | Optional Postgres 16 for durable issue state | `DB_*` env |

## Analytics UI (`src/`)
| File | Purpose | Relationships |
|---|---|---|
| `src/App.tsx` | Root. Holds issue state and its load/save, signed-in user display and sign-out (POST `/auth/logout`), tab routing and sidebar, and every modal. Large file. | Uses everything below |
| `src/utils/routes.ts` | Tab ↔ URL path map and aliases (old paths of pages moved into Settings, e.g. `/jira`, stay as aliases), plus `ADMIN_TABS` (pages hidden from users) | `types.ts` `ActiveTab` |
| `src/utils/metricsEngine.ts` | Per-project summaries, severity normalisation, Dependabot detection | MetricsDashboard and the seal |
| `src/utils/projectMatcher.ts` | Maps issues to projects using aliases and fuzzy matching | metricsEngine |
| `src/utils/securitySeal.ts` | Seal (Secure → Compromised) from outstanding severities, via `sealFromCounts` in `tracker/shared/report.js` | SecuritySealDashboard and the tracker seal snapshot |
| `src/utils/storage.ts` | localStorage for issues, settings, formulas and the Jira profile. `normalizeSettings` / `normalizeJiraProfile` validate stored and imported settings. | App, SettingsModal (settings-only export/import) |
| `src/utils/trackerApps.ts` | Shared copy of `/api/tracker/apps` (`useTrackerApps`), `decommissionedMatcher` (hides decommissioned apps from the analytics pages, D13), `setAppDecommissioned` (Projects page) | App.tsx, AssessmentTracker (refresh) |
| `src/utils/reportIssues.ts` | An app's unresolved issues in the shape the assessment report needs (App.tsx `reportIssuesFor`) | metricsEngine (`ProjectSummary.issues`) |
| `src/utils/sharedTargets.ts` | Client for `/api/tracker/targets`: one copy per page (`useSharedTargets`), `saveSharedTargets`, `activeTargetNames` | App.tsx, tracker, PIA |
| `src/utils/remotePersistence.ts` | Client for `/api/state/issues` | App |
| `src/utils/excelParser.ts` | Excel/CSV import and export, and row → `IssueRecord` mapping | ImportModal, App |
| `src/utils/sampleData.ts` | Default and sample data | Bootstrap |
| `src/types.ts` | Shared TS types (`IssueRecord`, `ActiveTab`, `AppSettings`, …) | Everywhere |
| `src/components/MetricsDashboard.tsx` | Project Metrics and Dependabots page: `MetricKpi` cards (formula in tooltip + "How are these counted?") and the main project metrics table. Large file. | metricsEngine |
| `src/components/ChartsDashboard.tsx` | Dashboard totals with colour-coded icons and a 12-month sparkline (found / open at month end / resolved) | `index.css` `.dashboard-*` |
| `src/components/FilterChips.tsx` | `FilterSelect` / `FilterSearch` / `FilterReset`: the one filter look (`.cs-filter-*` in index.css), used by the global bar, tracker, All Issues and PIA. The monitor pages mirror it in `monitor/public/theme.css` (`.selectbox`, `.search`, `.ftitle`). | DateRangeFilterBar and every page filter |
| `src/components/SettingsPage.tsx` | Settings shell (`SETTINGS_SECTIONS`, `SettingsLayout`), dialog launcher panels, and the Danger Zone (the only Delete All Data entry point) | App.tsx renders each section |
| `src/components/FormulaEditorModal.tsx` | User-defined metric formulas | settings |
| `src/components/JiraIntegrationPage.tsx` | Jira connection UI. Posts its config to `/api/jira/issues`. | storage (Jira profile) |
| `src/components/UsersPage.tsx` | Users & Roles page (admins only): list, add by email, change role, remove | `/auth/users` |
| `src/components/MonitorFrame.tsx` | Embeds the `/monitor/*` pages as tabs | routes |
| `src/components/tracker/*` | Assessment Tracker UI. `AssessmentTracker.jsx` is the shell; `api.js` is the `/api/tracker` client; `SyncPage.jsx` handles UberTicket links; `TargetCheck.jsx` compares the cycle with the Target Project List by app; `TimeReport.jsx` is the time-spent report (also exports `TimeByPriorityTable` for Monitoring and `PeriodComparison` for its own page); `tracker.css` holds the `at-*` styles. `SizeCalculator.jsx` is the stand-alone Size Calculator page (D14; rendered by App.tsx, not the shell). `report/ReportDialog.jsx` (opened by Editor's "Download report": links and text, preview of seal and counts) and `report/renderReport.js` (print-ready HTML of both templates, escaped; seal badges from `public/seals/<seal>.png`, the team's official images) build the assessment report: a preview tab where the text can be edited (this download only), then Save as PDF or Download Word (`downloadWordReport`, an MHTML `.doc` with light-theme tokens resolved and PNG images). | `tracker/shared/logic.js` |

## UberTicket monitor (`monitor/`)
| File | Purpose | Relationships |
|---|---|---|
| `monitor/server/monitor.js` | Express app with config, the refresh loop, the activity cache, `/api/*` and the token endpoints with their login gate. Exposes `assessmentTickets()` and `onRefresh()`. | uberticket, metrics, fullAssessment, tokenStore |
| `monitor/server/uberticket.js` | **Read-only** UberTicket API client (tickets and activities). `AuthError`. | monitor |
| `monitor/server/tokenStore.js` | **Security-sensitive.** AES-256-GCM token storage (`data/token.enc` and `secret.key`, mode 0600) | monitor |
| `monitor/server/businessTime.js`, `phHolidays.js` | Business-hours maths in Manila time, with PH holidays | metrics, fullAssessment |
| `monitor/server/metrics.js`, `fullAssessment.js` | DPSA MTTR, priority SLA, times tested | monitor |
| `monitor/server/piaPolicy.js` | `[PIA01]` policy (template 379488) → `{ product, version, state, approvedAt, … }`. Keeps only fields 18890/18891/37936/37937; questionnaire answers are dropped. | monitor (`piaPolicies()`), pia |
| `monitor/server/server.js` | Standalone mode (`npm run monitor`, 127.0.0.1:3010) | monitor |
| `monitor/public/*.html`, `common.js` | Monitor pages (`assessment.html` serves both FullAssessment and RoE) | `/monitor/api/*` |

## Reference material (not app code)
| Path | Purpose | Relationships |
|---|---|---|
| `Cloudstaff Design System/` | Cloudstaff Design System v2.10.2 (~21 MB). The app uses only `fonts/`, `css/tokens.css` and `assets/logos/`. The rest (`components.css`, React wrappers, UI kits) is reference material. Start with `readme.md`. | Loaded by `src/index.css` and, via `/design-system/*`, by the monitor pages (DECISIONS D6) |
| `src/index.css` | **The app's whole visual theme.** Contains the layer order, the design-system font and token imports, Tailwind `@theme` (radii, shadows, fonts), the `--cs-*` palette and the `.cloudstaff-theme` overrides that restyle Tailwind classes app-wide. | `tracker.css` and `monitor/public/theme.css` mirror the same `--cs-*` palette |

## Assessment Tracker (`tracker/`)
| File | Purpose | Relationships |
|---|---|---|
| `tracker/server/tracker.js` | Express router: cycles, assessments, history, seal, report snapshot (freeze), apps list + decommission (D13), sync, links, import | db, sync, importer |
| `tracker/server/sync.js` | UberTicket → tracker matching and updates (product name, then quarter → period) | logic.js `matchKey` |
| `tracker/server/targets.js` | **Shared Target Project List** (D11): tables, read/save (admin), `addTargetsFromRoe` after each sync, `addRowsForTargets` (Not Started rows for list apps missing from this year) + `ignoreTargetRow` | tracker.js, db.js |
| `tracker/server/db.js`, `sqlite.js` | Schema, field mapping (`toApi`/`toDb`), node:sqlite or sql.js adapter | tracker |
| `tracker/server/importer.js`, `cli-import.js` | Workbook import | tracker |
| `tracker/shared/logic.js` | **Scoring and status rules ported from the Excel formulas.** Shared by the server and the UI. | sync, UI, App.tsx |
| `tracker/shared/report.js` | **Assessment report rules** (D12): `reportReady` (12 checks), `reportKind` (RoE/Full), `sealFromCounts` (the spreadsheet seal formula, also used by `securitySeal.ts`), `buildReport` (New/Backlog/overdue, counts, seal and advisory wording), `normalizeReportInfo` (server validation), freeze rules `reportAsOf` / `snapshotFor` / `needsSnapshot` / `normalizeSnapshot` | tracker.js, ReportDialog, securitySeal.ts |
| `tracker/shared/sizing.js` | **Web Application Size Calculator** (D14): `SIZE_FACTORS` (options + workbook/adjusted weights), `TEST_DURATION` (rating table hours per test type), `calculateSize`, `sizeFromScore`, `sizeSummary` (the assessment summary text) | SizeCalculator.jsx |
| `tracker/shared/targets.js` | `targetKey` / `targetMatcher`: is an app on the Target Project List (ignores platform and filler words) | targets.js, tracker + PIA UI |
| `tracker/test/*.test.js` | Tests for logic and sync (in-memory DB) | `npm run test:tracker` |

## Privacy Impact Assessments (`pia/`, D10)
| File | Purpose | Relationships |
|---|---|---|
| `pia/server/pia.js` | Express router at `/api/pia`: apps + status, app detail, admin-only reassessments / hide / add app / links / settings / sync. Fails closed without `isAdmin`. Report links must be https. | db, sync, rules; wired in `vite.config.ts` |
| `pia/server/sync.js` | Tracker apps + PIA policies → app list (matchKey, `pia_links`); rebuilds the policy cache; never touches admin-entered rows | `tracker/shared/logic.js` `matchKey`, tracker `apps()` |
| `pia/server/db.js` | Schema of `pia/data/pia.db` (reuses `tracker/server/sqlite.js`) and `*ToApi` mappers | pia, sync |
| `pia/shared/rules.js` | **Reassessment rules** (calendar days, Manila): due = last assessed + 12 months; never / initial / current / due-soon / overdue; in-progress badge | server and UI |
| `pia/test/*.test.js` | Rules, sync, routes (roles, validation) | `npm run test:pia` |
| `src/components/pia/*` | UI: `PrivacyImpact.jsx` (shell + overview), `AppDetail.jsx` (drawer, record reassessment), `MatchingPage.jsx`, `badges.jsx`, `api.js`, `pia.css` (status colours from tokens; reuses `tracker.css`) | `/api/pia` |
