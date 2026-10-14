---
description: Resume development from the documented project state without rescanning the repo
---
Resume work on this project. Task hint (optional): $ARGUMENTS

1. Read `CLAUDE.md` and `docs/PROJECT_STATE.md`. Read any non-template file in `docs/sessions/` and the relevant part of `docs/ROADMAP.md`.
2. Identify the current task. Use, in order: $ARGUMENTS, then the active session file, then PROJECT_STATE "Next action". If the task is still unclear, ask.
3. Look up only the matching entries in `docs/FILE_MAP.md` and `docs/DECISIONS.md`.
4. Inspect only the files needed for this task and their immediate dependencies. Don't scan the repo, and don't redo anything listed under "Do not redo" or already marked completed.
5. Continue from the documented state. Implement, then verify with the relevant `npm run lint`, `test:auth`, `test:monitor`, `test:tracker` or `build`.
6. Give a short summary of where things stand and what you are doing next. Don't restate the architecture.
