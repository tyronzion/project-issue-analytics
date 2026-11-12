# App access: test accounts, web URL, mobile build

## Goal
Each project gets one place that holds the details an assessor needs: several test accounts (username, password, role), and either the web URL (for a web app) or the IPA/APK build (for a mobile app), with a link used when an upload isn't possible. Requested by MichaelC on 2026-11-12.

## Current status
**Done (2026-11-12, D16), local only, not pushed or deployed.** Phase 2 (IPA/APK upload) is **dropped** (user, 2026-11-12): builds stay in a shared folder and the app keeps only the folder link, to save server storage. The upload sections below are kept for reference only.

### Built vs plan (phase 1)
- The cipher is a separate `tracker/server/fieldCipher.js` (same AES-256-GCM scheme). `tokenStore.js` was **not** refactored, so the working UberTicket token code is untouched.
- The tracker hints are computed on read, not seeded into the table: the first save writes the row.
- Routes are `/api/tracker/access`, `/access/apps/:key`, `/access/apps/:key/accounts[/:id]` and `/access/apps/:key/accounts/:id/copy` (the plan's `reveal`). They are all for signed-in users, and each checks `req.user` itself.
- Only apps on the Target Project List or in the tracker can get details. The name always comes from there.
- No `app_builds` table and no upload: the mobile field is a **build folder link**.

## What exists today (checked 2026-11-12)
- `assessments.testing_url` and `assessments.mobile_app` (`tracker/server/db.js`) are stored **per period row**, not per app. A new period starts empty or copies the values across, so they drift.
- One app = `targetKey`, which ignores platform (D11, D13). `target_projects.entry_key` = `matchKey`, which keeps "Staffcentral IOS" separate from "Staffcentral".
- AES-256-GCM storage already exists in `monitor/server/tokenStore.js`, but it saves one secret per file. There is no field-level helper yet.
- `adminOnly` / `isAdmin` already exist in the tracker router. `/tracker/data` is already blocked over HTTP (D7).
- The tracker router's JSON limit is 2 MB. Excel import uses `express.raw` with a 50 MB limit.
- Production sits behind OpenResty (D9). **Its `client_max_body_size` is unknown.** The nginx default is 1 MB, which would block every IPA/APK upload.

## Proposed design

### Where it lives
The data goes in `tracker.db`. The Target Project List is the app list, and the tracker backup already covers this file (D5, D11). The UI is a new page, **Assessment Tracker → App Access**: a searchable list of target apps, where each row opens a drawer. The assessment editor also gets a read-only "Access" summary that links to that drawer.

### Data (new tables, created in `ensureTargetTables`-style `ensureAccessTables`)
- `app_access`: `app_key` (matchKey, so each platform entry is separate), `name`, `kind` ('web' | 'mobile'), `platform` ('ios' | 'android' | null), `web_url`, `build_url`, `updated_by`, `updated_at`.
- `app_accounts`: `id`, `app_key`, `username`, `password_enc` (JSON `{v, iv, tag, data}`), `role`, `environment` (optional, e.g. UAT or Staging), `notes`, `created_by`, `created_at`, `updated_by`, `updated_at`.
- `app_builds`: `id`, `app_key`, `file_name` (sanitised), `sha256`, `size`, `platform`, `version` (optional, typed in by hand), `uploaded_by`, `uploaded_at`. The file sits at `tracker/data/builds/<sha256>.<ipa|apk>`.
- `app_access_history`: append-only log of every add, change, delete, upload, download and **password reveal** (who and when; never the value).
- Seeding on first run: `kind = 'mobile'` where the app's latest row has `mobile_app = 1`, and `web_url` from the latest `testing_url`. The old columns stay as they are.

### Encryption
- Add `encryptField` / `decryptField` to a small shared module that reuses the tokenStore cipher code (move the code, don't copy it). That gives AES-256-GCM, a random 12-byte IV per value, and an auth tag.
- The key goes in its **own** file, `tracker/data/access.key` (0600). A copy of `tracker.db` alone then reveals no passwords. The key file must be added to the production backup next to `tracker.db`. If the key is lost, the passwords can't be recovered.
- Passwords are **never** returned by list or read routes. Responses carry `hasPassword: true` only.

### Routes (`/api/tracker/access`)
| Route | Who | Notes |
|---|---|---|
| `GET /access` | signed in | apps with kind, URL and account count |
| `GET /access/:appKey` | signed in | accounts (username, role and notes; no passwords) and builds |
| `PUT /access/:appKey` | signed in (D8) | kind, platform, web URL, build URL (http(s) only) |
| `POST/PATCH/DELETE /access/:appKey/accounts[/:id]` | signed in (D8) | validated lengths; the password is encrypted before insert |
| `POST /access/accounts/:id/reveal` | **signed in** | backs the **Copy** button: returns the one password with `Cache-Control: no-store`, logs who copied it in history, rate-limited (e.g. 30 per user per 10 min) |
| `POST /access/:appKey/builds` | **admin** | streamed upload, see below |
| `GET /access/builds/:id` | signed in | `Content-Disposition: attachment`, `application/octet-stream`, `nosniff`, logged |
| `DELETE /access/builds/:id` | **admin** | removes the row and the file |

### Build upload
- The upload is streamed to a temp file under `tracker/data/builds/`, and the SHA-256 is hashed while it streams. It is renamed once it passes the checks.
- Checks: the extension is `.ipa` or `.apk`; the first bytes are a ZIP header `PK\x03\x04` (both formats are ZIP); the size is ≤ `BUILD_MAX_MB` (default 500); the file name is sanitised (no path parts). The file is never unzipped, parsed or run.
- Retention: keep the latest 3 builds per app (configurable) so the CT's disk doesn't fill up.
- If uploads are off or too big for the proxy, the UI shows the **build link** field only (TestFlight, Firebase App Distribution, Drive). That is MichaelC's stated fallback.

## Files to change
- `tracker/server/access.js` (new): tables, seeding, validation, routes, upload stream, history.
- `monitor/server/tokenStore.js` → expose the cipher as `encryptField` / `decryptField` (same file or a shared `secretCipher.js`), with tokenStore using it.
- `tracker/server/db.js`: call `ensureAccessTables`.
- `tracker/server/tracker.js`: mount the access routes (signed-in for accounts and URLs; `adminOnly` for build upload/delete), plus their own raw-stream route (not `express.json`).
- `src/components/tracker/AppAccess.jsx` (new) + `api.js` client + `tracker.css` (`at-*` classes, design tokens only, D4 and D6).
- `src/components/tracker/Editor.jsx`: a read-only Access summary with a link.
- `src/utils/routes.ts` + sidebar: `/assessment-tracker/app-access`.
- `.env.example`: `BUILD_UPLOADS=1`, `BUILD_MAX_MB=500`.
- `tracker/test/access.test.js` (new).
- Docs: D16 in DECISIONS, FILE_MAP, PROJECT_STATE (backup now includes `access.key` and `builds/`).

## Phasing
1. **Phase 1:** app kind, web URL, build link, accounts (encrypted, reveal, history). There is no upload risk, so it can ship on its own.
2. **Phase 2:** IPA/APK upload and download, once the proxy body limit and disk space are confirmed.

## Decided
- **Passwords (user, 2026-11-12):** these are test accounts only. Passwords are encrypted at rest and always shown masked (`••••••`), never in plain text on screen. Every signed-in user gets a **Copy** button that fetches the password on click, copies it to the clipboard and clears the value from memory. There is no "show" toggle. Copies are logged (who and when). Signed-out requests get 401, as with every route. The UI labels the section "Test accounts only".

- **Editing (user, 2026-11-12):** every signed-in user can add, edit and delete accounts and set the app's kind and URLs, as with other tracker edits (D8). The app has only a few users. All changes are logged in `app_access_history`.

## Open decisions (need the user / MichaelC)
2. **Per platform or per app?** Recommended: per Target Project List entry (`matchKey`). "Staffcentral IOS" and "Staffcentral AOS" each get their own build, and an entry like "Staffcentral" can be web.
3. ~~Uploads at all?~~ **Decided: no.** Folder link only.
4. **Which accounts are allowed?** Recommended: test or UAT accounts only, never real staff or production personal accounts, stated in the UI. Also consider whether the team's password manager (if Cloudstaff has one) should hold these instead, with the app keeping only a reference.

## Risks
- Stored passwords make `tracker.db` plus `access.key` a high-value pair. Keep both 0600 and out of git, and keep the existing `/tracker/data` HTTP block.
- Malicious builds: files are only stored and returned as downloads, never opened by the server. Assessors should treat them as untrusted.
- No conflict with D1–D15. This adds D16. No D8 change needed.

## Verification
- `npm run test:tracker` + new `access.test.js` (both SQLite engines): encrypt/decrypt round trip and tamper detection; list/read never include a password; signed-out → 401 on every route; non-admin → 403 on build upload/delete; every copy and every change writes history; upload rejects the wrong extension, a non-ZIP file, an oversized file, and a traversal file name; retention deletes old files.
- `npm run test:auth` (data folder still blocked, including `tracker/data/builds`), `npm run test:monitor` (tokenStore still works after the refactor), `npm run lint`, `npm run build`.
- Browser check in `issue-analytics-demo` as admin and as user, on a scratch copy of `dev-copy.db`.
- Run `security-baseline:secure-coding` during the build (auth, secrets and uploads).

## Next action
Copy the changed files to GitHub `main` and deploy with `scripts/deploy.sh`. After deploy, add `tracker/data/access.key` to the backup. Then fold this file into PROJECT_STATE and delete it.
