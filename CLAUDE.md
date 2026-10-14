# CLAUDE.md

## Project

**Security Issues Analytics** is an internal app for the Cloudstaff Data Security Team. It has three parts that run in one Vite server:

1. **Issue analytics.** Security issues are loaded from Jira, Excel or CSV, and from Postgres. The app shows per-project metrics, user-editable formulas, charts, Dependabot issues and the **Security Seal** rating.
2. **UberTicket monitors.** These are read-only and cover DPSA MTTR, Full Assessment SLA, and Rules of Engagement, all measured in business days.
3. **Assessment Tracker.** This replaces the SharePoint "Security Full Assessment Tracker" workbook. It uses SQLite and is synced from UberTicket.

Details are in `docs/` and are not repeated here.

## Read order (working memory)

Read these first and stop as soon as you know enough:

1. The current task
2. `docs/PROJECT_STATE.md`
3. The active file in `docs/sessions/`, if there is one
4. The relevant part of `docs/ROADMAP.md`
5. The relevant entries in `docs/FILE_MAP.md`. It is an index; don't open every file it lists.
6. The relevant entries in `docs/DECISIONS.md`
7. Relevant source and tests
8. Git history, when it is available. This copy has no `.git` right now.

Don't redo analysis that project memory already holds, unless the source has changed, the docs may be stale, or you need to verify something.

**Source of truth:** source code, then `docs/`, then conversation history. When the code and the docs disagree, the code wins. Decide which one is wrong, and fix the docs or (if the task needs it) the code.

## Development rules

- Understand the existing architecture before you add files. Change existing modules rather than duplicating them, and reuse the existing utilities.
- Keep existing behaviour unless the change requires otherwise. No unrelated refactors, no speculative abstractions, and no new dependencies without a clear reason.
- Security-sensitive logic must stay explicit and auditable. That covers auth and roles (`auth/`, D7 and D8; admin-only routes call `requireAdmin`), token storage, UberTicket and Jira credentials, and scoring and seal rules. **Never weaken a security control to make a test pass.**
- Follow the local patterns. The server side is plain ESM JS plus `node:test`. The analytics UI is React and TSX with Tailwind. Tracker UI must use the `at-*` classes in `tracker.css` or inline styles, not Tailwind colour utilities (see DECISIONS).
- **Design:** the Cloudstaff Design System is the visual foundation (DECISIONS D6). Style with its tokens (`var(--color-…)`, `var(--component-…)`, `--cs-*`), never new hex values. The guide is `Cloudstaff Design System/readme.md`; read the relevant section only.
- Never commit or overwrite live data: `tracker/data/`, `monitor/data/` and `.env*`. When you test locally, use `DEMO=1 TRACKER_DB_PATH=<scratch copy>`.
- After meaningful changes, run what is relevant:
  - `npm run lint` (tsc)
  - `npm run test:auth`
  - `npm run test:monitor`
  - `npm run test:tracker`
  - `npm run build`
  - To check in the browser, use the `issue-analytics` preview config (port 5199).

## Working style

- Start from PROJECT_STATE, then: find what changed, find the relevant files, inspect those files and their direct dependencies, implement, verify, update memory.
- Treat completed work as done. Revisit it only for a bug, a requirement change, a conflict, or a security or correctness need.
- Stop exploring once you have enough evidence. Do investigate any real uncertainty that affects correctness or security.
- In responses, don't restate architecture or completed work. Report what changed, why, the files touched, verification, remaining issues, and the next step.

## Memory updates

After each change, ask whether a future session would need to know about it. If not, change nothing. If so, update the **smallest** relevant file:

| What changed | File to update |
|---|---|
| Project state or status | `PROJECT_STATE.md` |
| What a file is responsible for | `FILE_MAP.md` |
| Architectural or security decision | `DECISIONS.md` |
| Planned work | `ROADMAP.md` |
| Progress on multi-step work | `docs/sessions/<task>.md` |

Don't copy code into docs or log trivia. Commands: `/continue`, `/plan`, `/review`, `/checkpoint`.
