# File Map

This is an index. Open only the entries relevant to the task.

## Data flow
```
Every request ──▶ auth/auth.js (Microsoft sign-in, session cookie; blocks tracker/data + monitor/data) ──▶ routes below

Jira API / Excel-CSV import / Postgres ──▶ App.tsx issue state (localStorage, optional Postgres mirror)
   ──▶ metricsEngine + projectMatcher ──▶ MetricsDashboard / Charts / Issues / Security Seal

UberTicket API (read-only, encrypted token) ──▶ monitor.js (DPSA, Full Assessment, RoE metrics) ──▶ /monitor/* pages (iframes)
                                             └─▶ onRefresh ──▶ tracker sync.js ──▶ SQLite tracker.db ──▶ /api/tracker ──▶ tracker UI
Security Seal (client) ──▶ POST /api/tracker/assessments/:id/seal (snapshot on resolve)
```

## Server and build
| File | Purpose | Relationships |
|---|---|---|
| `auth/users.js` | **Security-sensitive.** Users and roles (admin/user), stored in `auth/data/users.json`. Handles `AUTH_ADMIN_EMAILS`, the last-admin guard, and least privilege when the file is unreadable. Tests are in `auth/users.test.js`. | Used by `auth.js` (`roleOf`, `/auth/users`). Created in `vite.config.ts`. |
| `auth/auth.js` | **Security-sensitive.** Sign-in page with two options, Microsoft Entra SSO (`/auth/microsoft`, then `/auth/callback` or `/callback`, whichever `AUTH_REDIRECT_URI` names) and the classic shared login (POST `/auth/login`, server-side, rate-limited). Handles `/auth/login`, `/callback`, `/logout`, `/me` and `/signed-out`, keeps sessions in memory, gates every request and blocks the data folders. Tests are in `auth/auth.test.js`. | First middleware in `vite.config.ts`. Sets `req.user` (with `role`). Exports `requireAdmin`, which `vite.config.ts` (issue save, Jira POST) uses; the tracker uses `isAdmin` and the monitor `settingsUser`. |
| `auth/envFromCi.js` | **Security-sensitive.** CLI run by `.github/workflows/deploy.yml`: merges the `AUTH_*` keys from GitHub Actions secrets/variables into the server's `.env.local` (mode 600, other lines kept, values never printed). Tests are in `auth/envFromCi.test.js`. | Called before `scripts/deploy.sh` |
| `vite.config.ts` | **The backend.** Serves `/api/state/issues` (Postgres), `/api/jira/issues` (Jira proxy using server-side creds), `/monitor/*`, `/api/tracker` and `/design-system/{css,fonts,assets}` (read-only static). Loads `.env*` into `process.env` and enables HTTPS when `certificates/` exists. | Wires in `createMonitor` and `createTracker`, which share the monitor's tickets |
| `scripts/start-dev.sh`, `scripts/deploy.sh`, `scripts/security-issues-analytics.service`, `.github/workflows/deploy.yml` | Dev and production start (port 80). `deploy.sh` resets to `origin/main`, runs `npm ci` and lint, then restarts the systemd service by signalling its main process (falling back to starting `npm run dev` directly on servers without the unit). The workflow needs a self-hosted runner (none registered). | `npm run dev` |
| `docker-compose.yml` | Optional Postgres 16 for durable issue state | `DB_*` env |

## Analytics UI (`src/`)
| File | Purpose | Relationships |
|---|---|---|
| `src/App.tsx` | Root. Holds issue state and its load/save, signed-in user display and sign-out (POST `/auth/logout`), tab routing and sidebar, and every modal. Large file. | Uses everything below |
| `src/utils/routes.ts` | Tab ↔ URL path map and aliases, plus `ADMIN_TABS` (pages hidden from users) | `types.ts` `ActiveTab` |
| `src/utils/metricsEngine.ts` | Per-project summaries, severity normalisation, Dependabot detection | MetricsDashboard and the seal |
| `src/utils/projectMatcher.ts` | Maps issues to projects using aliases and fuzzy matching | metricsEngine |
| `src/utils/securitySeal.ts` | **Seal matrix** (Secure → Compromised) from outstanding severities | SecuritySealDashboard and the tracker seal snapshot |
| `src/utils/storage.ts` | localStorage for issues, settings, formulas and the Jira profile. `normalizeSettings` / `normalizeJiraProfile` validate stored and imported settings. | App, SettingsModal (settings-only export/import) |
| `src/utils/remotePersistence.ts` | Client for `/api/state/issues` | App |
| `src/utils/excelParser.ts` | Excel/CSV import and export, and row → `IssueRecord` mapping | ImportModal, App |
| `src/utils/sampleData.ts` | Default and sample data | Bootstrap |
| `src/types.ts` | Shared TS types (`IssueRecord`, `ActiveTab`, `AppSettings`, …) | Everywhere |
| `src/components/MetricsDashboard.tsx` | Main project metrics table. Large file. | metricsEngine |
| `src/components/FormulaEditorModal.tsx` | User-defined metric formulas | settings |
| `src/components/JiraIntegrationPage.tsx` | Jira connection UI. Posts its config to `/api/jira/issues`. | storage (Jira profile) |
| `src/components/UsersPage.tsx` | Users & Roles page (admins only): list, add by email, change role, remove | `/auth/users` |
| `src/components/MonitorFrame.tsx` | Embeds the `/monitor/*` pages as tabs | routes |
| `src/components/tracker/*` | Assessment Tracker UI. `AssessmentTracker.jsx` is the shell; `api.js` is the `/api/tracker` client; `SyncPage.jsx` handles UberTicket links; `TimeReport.jsx` is the time-spent report (also exports `TimeByPriorityTable` for Monitoring and `PeriodComparison` for its own page); `tracker.css` holds the `at-*` styles. | `tracker/shared/logic.js` |

## UberTicket monitor (`monitor/`)
| File | Purpose | Relationships |
|---|---|---|
| `monitor/server/monitor.js` | Express app with config, the refresh loop, the activity cache, `/api/*` and the token endpoints with their login gate. Exposes `assessmentTickets()` and `onRefresh()`. | uberticket, metrics, fullAssessment, tokenStore |
| `monitor/server/uberticket.js` | **Read-only** UberTicket API client (tickets and activities). `AuthError`. | monitor |
| `monitor/server/tokenStore.js` | **Security-sensitive.** AES-256-GCM token storage (`data/token.enc` and `secret.key`, mode 0600) | monitor |
| `monitor/server/businessTime.js`, `phHolidays.js` | Business-hours maths in Manila time, with PH holidays | metrics, fullAssessment |
| `monitor/server/metrics.js`, `fullAssessment.js` | DPSA MTTR, priority SLA, times tested | monitor |
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
| `tracker/server/tracker.js` | Express router: cycles, assessments, history, seal, sync, links, import | db, sync, importer |
| `tracker/server/sync.js` | UberTicket → tracker matching and updates (product name, then quarter → period) | logic.js `matchKey` |
| `tracker/server/db.js`, `sqlite.js` | Schema, field mapping (`toApi`/`toDb`), node:sqlite or sql.js adapter | tracker |
| `tracker/server/importer.js`, `cli-import.js` | Workbook import | tracker |
| `tracker/shared/logic.js` | **Scoring and status rules ported from the Excel formulas.** Shared by the server and the UI. | sync, UI, App.tsx |
| `tracker/test/*.test.js` | Tests for logic and sync (in-memory DB) | `npm run test:tracker` |
