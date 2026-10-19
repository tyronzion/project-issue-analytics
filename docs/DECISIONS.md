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

