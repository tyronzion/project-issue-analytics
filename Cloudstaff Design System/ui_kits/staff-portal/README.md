# Staff Portal — UI kit

An interactive, click-through recreation of the Cloudstaff staff/HR portal, built entirely from the design system's tokens, CSS classes, and bundled React components.

## Run it

Open `index.html`. It loads `../../styles.css` (the whole system), Font Awesome 6 Free, React 18, and the compiled `_ds_bundle.js`, then mounts the app.

## Flow

1. **Login** (`LoginScreen.jsx`) — split brand panel + sign-in form. "Sign in" advances to the dashboard.
2. **Dashboard** (`DashboardScreen.jsx`) — greeting topbar, stat tiles, "this week's submissions" table, team-availability rail, and a Job Fair announcement alert. "Review" or "See all" jumps to timesheets.
3. **Timesheet approvals** (`TimesheetsScreen.jsx`) — segmented status filter + search over the submissions table. "Review" opens a floating drawer with a day-by-day breakdown and Approve / Return actions (which update the row and fire an undo-style toast).
4. **Cloudstaff AI** (`AIPanel.jsx`) — the robot icon in the topbar opens a canned assistant panel demonstrating the AI chat surface.

Leave / Documents / My team are intentional stubs (empty-state) — the kit focuses on the dashboard and approval flows; the other areas reuse the same shell, tables, and cards.

## Files

| File | Role |
|---|---|
| `index.html` | Shell: loads deps + bundle, mounts the screen scripts in order |
| `data.jsx` | Shared mock data (team, timesheets) + `Logo` helper; registers globals |
| `AppShell.jsx` | Sidebar + topbar chrome (`.app-shell`, `.app-sidebar`, `.topbar`) |
| `LoginScreen.jsx` | Sign-in split layout |
| `DashboardScreen.jsx` | Stat tiles + tables + team rail + alert |
| `TimesheetsScreen.jsx` | Filterable table + review drawer |
| `AIPanel.jsx` | Cloudstaff AI assistant panel |
| `App.jsx` | Root state machine (navigation, review, AI, toasts) |

## Notes

- Components are read from `window.CloudstaffDesignSystem_e09b25` (the compiled bundle namespace). Each `.jsx` registers its exports on `window` because Babel gives each `text/babel` script its own scope.
- This is a **recreation for visual + interaction reference**, not production code — data is mocked and actions are local state only.
