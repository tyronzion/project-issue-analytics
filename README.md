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
