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
- `SERVER_HOST` = `10.6.99.208`
- `SERVER_USER` = `csdatasec`
- `SERVER_PORT` = `22`
- `SERVER_SSH_KEY` = private SSH key content for that server user
- `APP_DIR` = `/opt/project-issue-analytics`

### 3. Push to main

Every push to `main` will run deploy automatically.

### 4. Manual trigger (optional)

You can also run deploy manually from GitHub Actions using `workflow_dispatch`.
