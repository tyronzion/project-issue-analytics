# UberTicket Monitoring

Three pages, same server:

- **`/DPSA`**: Digital Product Security Assessment (MTTR)
- **`/FullAssessment`**: Security Full Assessment (priority SLA, times tested per application)
- **`/RulesOfEngagement`**: [PB-0933] Security Test – Rules of Engagement (same monitoring as Full Assessment)

## DPSA

Monitors **Digital Product Security Assessment** tickets in UberTicket against the Data Security Team targets:

- 100% compliance with security testing standards
- **MTTR** (mean time to resolve) within 1–3 business days

Templates watched: `322255` (DPSA in Staging), `1113577` (DPSA in UAT).

## Run

```bash
npm install
cp .env.example .env.local   # optional settings
npm start                    # http://localhost:3010/DPSA, then Settings → paste your UberTicket token
```

- `npm run demo`: same page with generated data, no token needed
- `npm run dev`: restarts on code changes
- `npm test`: business-hours calculation tests

**Token:** click **Settings** (top bar, every page) and paste the UberTicket bearer token; *Save & test* stores it and
reloads tickets right away. The panel shows whether the token works and when it expires (a top-bar warning appears in the
last 24 hours). The token is stored **encrypted** with AES-256-GCM in `data/token.enc`; the key is `data/secret.key`
(both readable only by your macOS user, both git-ignored). It is never shown again or sent anywhere except UberTicket.
This protects it in config files, logs and copies of the project, but anyone who can read both files as your user can decrypt it.
A token left in `.env.local` as `UBERTICKET_TOKEN=` is moved into encrypted storage on the next start.
The server only listens on `127.0.0.1` and only *reads* from UberTicket (`GET /v1/tickets` and `GET /v1/tickets/{id}/activities`).

## How the numbers are calculated

| Metric | Definition |
|---|---|
| MTTR | **Submitted → Resolved from the ticket's activity log** (`GET /tickets/{id}/activities`): submitted = first log entry, resolved = latest "Status: Resolved" entry ("Closed" if there is none). Business days (1 day = business hours per day). Falls back to `created_at` / `resolved_at` if a log has no entry. Cached in `data/activity.json`, re-read only when the ticket's `updated_at` changes. |
| SLA compliance | % of resolved tickets resolved within 3 business days (MTTR only; MTTA is not monitored) |
| Open ticket risk | Breached = open longer than 3 business days; at risk = 66% of that used |
| Non-compliant tickets | Resolved after, or still open past, 3 business days |

Business hours default to Mon–Fri 08:00–17:00 Manila time (UTC+8), and **Philippine regular holidays and special non-working days are not counted** (nationwide dates for 2024–2026 from the Malacañang proclamations, in `src/phHolidays.js`; add the next year when it is proclaimed — the server warns at startup if the current year is missing). Change `BUSINESS_*`, `HOLIDAYS` and the targets in `.env.local`.

## Full Assessment (`/FullAssessment`)

Template `1080829` (Security Full Assessment). Targets from the Data Security Team monitoring standard:

- Every tested application retested biannually
- Resolve SLA by priority: Low 5 · Medium 10 · High 15 · Critical 20 business days (UberTicket's **"Normal" priority = Medium**)

| Metric | Definition |
|---|---|
| SLA compliance | % of resolved assessments resolved within their priority's SLA (business days, submitted → resolved, both from the activity log) |
| Times tested | Per **Product** (field 28969): number of completed full assessments in the loaded history, how many this year, first/last tested, and any in progress. |
| Open risk | Past SLA = SLA due date passed; near SLA = less than 20% of the SLA left |

Settings: `FULL_TEMPLATE`, `FULL_LOOKBACK_DAYS` (default 3650 ≈ all history; also the window for "times tested"), `SLA_*_DAYS`.

## Rules of Engagement (`/RulesOfEngagement`)

Template `72913` ([PB-0933] Security Test – Rules of Engagement). Same page, rules and SLA as Full Assessment
(`public/assessment.html` serves both; the URL picks the monitor). This template stores its form as
`data.public` / `data.private` groups of `{ id, label, value }`; fields used: Product Name (19541), Type (30741),
Start / End Date of Security Test (3866 / 3867), Size (43044), Time Spent (22570). Quarter/Year are derived from the
test start date. Settings: `ROE_TEMPLATE`, `ROE_LOOKBACK_DAYS`; the `SLA_*_DAYS` values are shared.
