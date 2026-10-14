# Project State

_Last updated: 2026-10-14_

## Current phase
The app is in production use and gets features added incrementally. The Assessment Tracker was merged in on 2026-10-13, which brings all three parts (analytics, monitors and tracker) into one app.

## Current focus
Classic login stays until SSO is set up (D7 amended). Deploying no longer locks anyone out. Microsoft sign-in switches on once the four `AUTH_*` settings are on the server, which needs HTTPS and the Entra app registration.

## Recently completed
- **User management with two roles** (2026-10-14, D8). Admins can do everything; users can't make data changes or monitor/tracker setup. Enforced on the server. `zionm@cloudstaff.com` is a permanent admin via `AUTH_ADMIN_EMAILS` in the local `.env.local`.
- **Sign-in on the server** (2026-10-14, D7).
  - Classic shared login, checked server-side (hash only) and rate-limited, until Microsoft Entra is configured.
  - The client-side hardcoded login was removed.
  - `/tracker/data` and `/monitor/data` are now blocked. Before this, the tracker database was downloadable without logging in.
- **Cloudstaff Design System applied** (2026-10-14) to the analytics UI, monitor pages, tracker and login, with the official logo. It works through tokens and the existing overrides; no TSX markup was rewritten.
- **Project memory system** set up (2026-10-14).
- **Assessment Tracker merged** (2026-10-13). It runs on SQLite and is served at `/api/tracker`. After each monitor refresh it syncs from UberTicket's Full Assessment (1080829) and RoE (72913) tickets. Its data was copied from the standalone app, which is now superseded. The pre-merge backup is `~/Downloads/project-issue-analytics-backup-2026-10-13.tgz`.
- **UberTicket monitors embedded** under `/monitor/*` as sidebar tabs. Changing the token requires the app login.
- **Security Seal page.** The seal is snapshotted into the tracker when a ticket resolves.

## Current issues / known limitations
These are recorded only, not fixed.
- **Production still runs the old build** until a deploy. That build has client-only login, an exposed `/tracker/data/tracker.db`, and probably exposed `monitor/data` key files. Treat the old password (`csdatasec` login) as public: change it anywhere else it is used. Consider rotating the UberTicket token after deploying.
- **Entra client secret expires.** Renew it in Entra before the expiry date, or sign-in stops working.
- **Production runs `vite dev`** under pm2 (see `scripts/deploy.sh`). All APIs live in Vite `configureServer` plugins, so `vite build` / `dist/` contains **no backend**.
- **Some docs are stale.** The top of `README.md` is AI Studio boilerplate. `monitor/README.md` describes the old standalone package: it refers to `src/phHolidays.js` (the file is now `monitor/server/phHolidays.js`) and to `npm start/demo` (the root script is `npm run monitor`).
- **Holidays need a yearly update.** `monitor/server/phHolidays.js` covers 2024–2026, so 2027 must be added once it is proclaimed.
- **Design-system adoption is partial by design.** Icons are still lucide (the design system recommends Font Awesome Free), the existing copy and Title Case were kept, there is no dark mode, and coloured status text is still flattened to brand blue by the existing overrides.
- **Pre-existing layout bug.** On the Project Metrics page, the Tracked Applications card's "All Apps" button overflows the card at about 1440px (it did before the restyle too).
- **No git history here.** This local copy has no `.git`, so changes can't be diffed. The deploy flow assumes `main` on GitHub.

## Architecture notes (only what saves time)
- The whole backend runs as Vite middleware in `vite.config.ts`: Jira, Postgres state, the monitor (an Express app), and the tracker (an Express router).
- Issue data is stored in `localStorage` first, with Postgres `app_state` as an optional mirror. Analytics settings and formulas live only in `localStorage`.
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
See `DECISIONS.md`: D1 single Vite server, D2 encrypted read-only UberTicket, D3 UberTicket wins in tracker sync, D4 tracker styling isolation, D5 SQLite fallback, D6 design system through tokens, D7 server-side Microsoft sign-in, D8 admin/user roles.

## Verification (2026-10-14, after Microsoft sign-in)
| Check | Result |
|---|---|
| `npm run test:auth` | 25/25 pass (classic and Microsoft sign-in, roles) |
| `npm run test:monitor` | 26/26 pass |
| `npm run test:tracker` | 16/16 pass (node:sqlite and sql.js) |
| `npm run lint` (tsc) | clean |
| `vite build` | succeeds; fonts bundled |
| Browser check (`issue-analytics-demo` preview) | design pages checked. Auth checked live: fails closed (503), data folders 404, dev bypass and sign-out work. Classic login checked live (`issue-analytics-classic` preview, generated test credentials). Roles checked live in both preview configs: admin Users page (add, change role, remove), and as user every admin action returns 403 while admin pages redirect. The real Entra round trip is **not yet tested** (no app registration). |

## Next action
Pushed to `main` on 2026-10-14; it auto-deploys with the classic login. To switch to SSO:
1. Register the app in Entra (steps in README).
2. Test a real sign-in locally with `AUTH_REDIRECT_URI=http://localhost:5199/auth/callback`.
3. Arrange HTTPS on the server.
4. Put the four `AUTH_*` settings and `AUTH_ADMIN_EMAILS=zionm@cloudstaff.com` in the server's `.env.local`, then restart.
