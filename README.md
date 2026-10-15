<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2f6e33a0-f681-4ab9-8603-9a9562d6f318

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Sign-in: Microsoft or classic login

The sign-in page offers two options.

**Sign in with Microsoft**
- Works once the four Microsoft settings below are configured. Until then the button is shown but disabled.
- If the settings are incomplete or invalid, the button stays disabled and the server log says why.
- Each person gets their own role (see Roles).

**Classic login** (the shared team account)
- Works as before: the same username and password.
- The password is checked on the server; only a salted hash is kept in the code.
- Failed attempts are rate-limited.
- The shared account is always an admin.
- Settings in `.env.local`:
  - `AUTH_CLASSIC_USERNAME` and `AUTH_CLASSIC_PASSWORD` replace the built-in account.
  - `AUTH_CLASSIC_LOGIN=0` turns classic login off, for example once everyone uses Microsoft.

Code: `auth/auth.js` (tests: `npm run test:auth`).

### Microsoft sign-in setup

1. **Register the app.** In the Entra admin center, go to App registrations → New registration:
   - Supported account types: **this organizational directory only (single tenant)**.
   - Redirect URI: platform **Web**, `https://<server>/auth/callback` (or `https://<server>/callback`; the app accepts either). Add `http://localhost:5199/auth/callback` for local testing.
2. **Copy the IDs.** From Overview, copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. **Create a secret.** Certificates & secrets → New client secret. Copy its **Value**, and note when it expires.
4. **Limit access.** Enterprise applications → this app:
   - Properties → **Assignment required = Yes**.
   - Users and groups → add the people or group allowed in.
5. **Configure the server.** In `.env.local`, set:
   - `AUTH_TENANT_ID`
   - `AUTH_CLIENT_ID`
   - `AUTH_CLIENT_SECRET`
   - `AUTH_REDIRECT_URI`: exactly the redirect URI registered above.
   - `AUTH_ADMIN_EMAILS`: the permanent admins, for example `zionm@cloudstaff.com`.

   Or keep them in GitHub instead: Settings → Secrets and variables → **Actions**. Put `AUTH_CLIENT_SECRET` (and
   `AUTH_CLASSIC_PASSWORD`, if used) under **Secrets**; the others can be **Variables** or Secrets. On each deploy the
   workflow runs `auth/envFromCi.js`, which writes only these keys into the server's `.env.local` (mode 600) and keeps
   the rest of the file. This needs the self-hosted runner on the server. After changing a value in GitHub, re-run
   the Deploy workflow. When the Entra secret is renewed, update it in GitHub too.

### Roles

There are two roles:
- **Admin** can do everything:
  - data changes: Import Data, Merge Data, delete or clear data, restore a backup, Jira Integration
  - UberTicket token
  - tracker Import Excel and UberTicket Sync links
  - the **Users & Roles** page
- **User** can do everything else.

Roles are enforced on the server.

- **Permanent admins:** people in `AUTH_ADMIN_EMAILS` are always admins.
- **New sign-ins:** everyone else starts as User.
- **Changing roles:** admins change roles, or add people ahead of time, on the Users & Roles page.
- **Where roles are stored:** `auth/data/users.json` (git-ignored; back it up).

Notes:
- **HTTPS is required on the server.** Microsoft accepts `http://` redirect URIs only for `localhost`.
- **Sign-out:** sessions are kept in server memory, so restarting the app signs everyone out. They sign in again with one click.
- **Local development without Entra:** set `AUTH_DEV_BYPASS=1`. Only requests from the same machine are let in. Never set it on a server.

## Durable Data Persistence (Docker + Postgres)

This app can persist issue data to PostgreSQL so data survives app restarts, browser refreshes, and server reboot.

1. Copy [.env.example](.env.example) values for:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
2. Start PostgreSQL via Docker:
   `docker compose up -d postgres`
3. Start the app:
   `npm run dev`

Notes:
- The app auto-creates the `app_state` table on first run.
- Data is stored in Docker volume `project_analytics_postgres_data`, so container restarts do not delete it.
- If DB is unavailable, the app gracefully falls back to local browser storage.

## Auto-sync Jira Filter (No Manual Import)

This app can automatically pull issues from Jira on startup, so you don't need to manually upload Excel files each time.

1. Create `.env.local` (or update it) with:
   - `JIRA_BASE_URL` (e.g. `https://your-domain.atlassian.net`)
   - `JIRA_EMAIL`
   - `JIRA_API_TOKEN`
   - one of: `JIRA_FILTER_ID` or `JIRA_JQL`
   - optional: `JIRA_SEVERITY_FIELD`, `JIRA_SECURITY_DUE_DATE_FIELD`
2. Start the app with `npm run dev`.
3. If old data is already saved in browser storage, clear data once in-app so the Jira bootstrap can load fresh data.

Notes:
- Jira credentials are used server-side only (in Vite dev middleware), not exposed to browser code.
- If Jira is not configured or unavailable, the app falls back to the bundled workbook datasource.

## Auto Deploy On Push (GitHub Actions + SSH)

This project includes:
- [scripts/deploy.sh](scripts/deploy.sh) (server deploy script)
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml) (deploy on push to main)

### 1. One-time setup on Ubuntu server

Run these commands on the server:

```bash
cd /opt/project-issue-analytics
chmod +x scripts/deploy.sh
npm ci
pm2 start "npm run dev -- --host 0.0.0.0 --port 3000" --name project-analytics
pm2 save
```

### 2. Add GitHub Actions secrets in repository settings

Go to: Settings -> Secrets and variables -> Actions -> New repository secret

Add these secrets:
- `SERVER_HOST` = `10.6.99.213`
- `SERVER_USER` = `csdatasec`
- `SERVER_PORT` = `22`
- `SERVER_SSH_KEY` = private SSH key content for that server user
- `APP_DIR` = `/opt/project-issue-analytics`

### 3. Push to main

Every push to `main` will run deploy automatically.

### 4. Manual trigger (optional)

You can also run deploy manually from GitHub Actions using `workflow_dispatch`.

## Assessment Tracker (Security Full Assessment Tracker workbook)

Sidebar → **Assessment Tracker**: Monitoring, Assessment List, Checklist, Decommissioned, UberTicket Sync, Import Excel.
It replaces the SharePoint "Security Full Assessment Tracker" Excel (Checklist → Full assessment → Monitoring sheets,
Bi-Annual and Quarterly). Scoring rules ported from the workbook formulas are in `tracker/shared/logic.js`.

- **Storage:** SQLite file at `tracker/data/tracker.db` (git-ignored, back it up). Uses Node's built-in `node:sqlite` on
  Node 22.13+, otherwise `sql.js` (WebAssembly SQLite) with the same file. `TRACKER_DB_PATH` overrides the location.
- **Seed / reload from Excel:** Import Excel page, or `node tracker/server/cli-import.js <workbook.xlsx>`.
- **UberTicket sync** (after every monitor refresh, using the UberTicket token saved in Settings):
  Full Assessment (1080829) and Rules of Engagement (72913) tickets are matched to apps by product name (ignoring case,
  spaces, punctuation and a leading "Cloudstaff") and by quarter/year → period (Quarterly cycle first, else Bi-Annual).
  UberTicket sets **status** (open = In Progress, resolved = Done), **tester** (assignee, frozen at resolution),
  **actual start/end** (submitted/resolved) and Rules of Engagement **time spent**. Unmatched products can be linked once on the
  UberTicket Sync page. When a ticket is resolved, the app's **Security Seal** is captured from the Security Seal page.
- **Tests:** `npm run test:tracker`.
