# Roadmap

## Now
- Enable "Sign in with Microsoft" (classic login works meanwhile):
  - Entra app registration
  - real sign-in test
  - HTTPS on the server
  - put the AUTH_* settings on the server

## Next
- **PIA (approved plan: `docs/sessions/pia.md`)**
  - Deploy phase 1; back up `pia/data/pia.db`; record past reassessments.
  - Phases 2 + 3 and the reassessment document are built (2026-10-30, D15). To go live: push, create and install the read-only GitHub App (org owner), enter it on PIA Matching, back up `pia/data/github.enc` with `pia.db` and `secret.key`, and check the first real reassessment document against its UberTicket policy.

These candidates come from known issues and need user approval first.
- Server move follow-ups (see `docs/sessions/server-migration.md`):
  - delete `~/sia-migration` on the CT once no longer needed as a backup
  - router DHCP reservation or exclusion for .208
  - delete the old VM eventually
  - optional: GitHub runner on the CT
- Design-system polish (optional):
  - Font Awesome icons instead of lucide
  - sentence case and en-AU copy
  - restore semantic status colours
  - dark mode
  - fix the overflow in the Tracked Applications card
- Refresh the stale docs: the AI Studio boilerplate in `README.md`, and the standalone-era paths and scripts in `monitor/README.md`.

## Later
- Add the 2027 PH holidays to `monitor/server/phHolidays.js` once they are proclaimed.

## Completed
- Feature documentation (`docs/FEATURES.md`) shown in the app at `/documentation` (2026-11-17)
- Tech Risk Analyzer page, one audit per repository (2026-11-17)
- App Access: web URL / build folder link and test accounts per app, encrypted copy-only passwords (2026-11-12)
- Issue analytics: Jira, Excel and Postgres sources; metrics, formulas, charts and Dependabot issues
- Security Seal page
- UberTicket monitors: DPSA MTTR, Full Assessment SLA, Rules of Engagement; encrypted token
- Assessment Tracker merged in with UberTicket sync (2026-10-13)
- Cloudstaff Design System adopted as the visual design (2026-10-14)
- Microsoft Entra sign-in on the server, with data folders blocked (2026-10-14, built; awaiting go-live)
- User management with admin and user roles (2026-10-14)
- PIA phases 2 + 3: repository scan, own PIA / covered decisions, yearly reassessment Word document (2026-10-30; local, not pushed)
- PIA monitor phase 1: UberTicket [PIA01] policies, yearly reassessment status, matching (2026-10-15; pushed to `main` 2026-10-19, not deployed)
- Auto-deploy on push to `main` (currently inactive: no runner registered)
- Moved production to the Proxmox CT at 10.6.99.208 with identical data (2026-10-14)
