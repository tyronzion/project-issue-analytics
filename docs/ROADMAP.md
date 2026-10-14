# Roadmap

## Now
- Enable "Sign in with Microsoft" (classic login works meanwhile):
  - Entra app registration
  - real sign-in test
  - HTTPS on the server
  - put the AUTH_* settings on the server

## Next
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
- Issue analytics: Jira, Excel and Postgres sources; metrics, formulas, charts and Dependabot issues
- Security Seal page
- UberTicket monitors: DPSA MTTR, Full Assessment SLA, Rules of Engagement; encrypted token
- Assessment Tracker merged in with UberTicket sync (2026-10-13)
- Cloudstaff Design System adopted as the visual design (2026-10-14)
- Microsoft Entra sign-in on the server, with data folders blocked (2026-10-14, built; awaiting go-live)
- User management with admin and user roles (2026-10-14)
- Auto-deploy on push to `main` (currently inactive: no runner registered)
- Moved production to the Proxmox CT at 10.6.99.208 with identical data (2026-10-14)
