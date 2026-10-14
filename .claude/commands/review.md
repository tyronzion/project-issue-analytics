---
description: Review an implementation against project architecture, security and regression risk
---
Review this implementation: $ARGUMENTS (if nothing is given, review the files changed in this session).

1. Read `docs/PROJECT_STATE.md` and the relevant entries in `docs/DECISIONS.md`. Inspect the changed files and their direct callers only.
2. Check:
   - **Correctness:** edge cases and error paths.
   - **Security:**
     - No weakened auth or token handling.
     - New routes that change shared data or setup call `requireAdmin`.
     - The UberTicket client stays read-only.
     - No secrets in client code or logs.
     - Input validation on `/api/*`.
     - No writes to live `tracker/data` or `monitor/data`.
   - **Architecture:** does it fit the decisions in DECISIONS.md (D1–D8) and existing patterns? Is anything duplicated that already exists?
   - **Regression risk:** sync rules, scoring in `tracker/shared/logic.js`, the seal matrix, routes.
   - **Code quality and unnecessary complexity.**
   - **Tests:** do they exist and cover the change? Run the relevant `npm run lint`, `test:auth`, `test:monitor`, `test:tracker` or `build`.
   - **Docs:** do PROJECT_STATE, FILE_MAP or DECISIONS need an update?
3. List findings, most severe first, each with `file:line`, the problem and a suggested fix. Don't rewrite unrelated code.
