---
description: Plan a task (no implementation) using project memory and targeted inspection
---
Plan this task without implementing it: $ARGUMENTS

1. Read `docs/PROJECT_STATE.md`, plus the relevant entries in `docs/FILE_MAP.md` and `docs/DECISIONS.md`.
2. Inspect only the files the task touches and their direct dependencies.
3. Produce the plan:
   - **Goal:** one line.
   - **Files to change:** path, and what changes in it.
   - **Smallest implementation:** reuse existing modules and patterns. No unrelated refactoring and no new dependencies unless justified.
   - **Dependencies and risks:** especially auth, the UberTicket token, sync rules, scoring and seal logic, and live data in `tracker/data` or `monitor/data`.
   - **Conflicts:** any conflict with a decision in DECISIONS.md.
   - **Verification:** which `npm run lint`, `test:auth`, `test:monitor`, `test:tracker` or `build` commands to run, the new or updated tests, and any browser check (preview `issue-analytics-demo`: demo data, a copy of the tracker DB, local sign-in bypass).
4. Don't write code unless explicitly asked.
