#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/project-issue-analytics}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-80}"
START_TS="$(date +%s)"
CURRENT_STAGE="initializing"
PULL_RESULT="not_started"
GIT_BEFORE="unknown"
GIT_AFTER="unknown"

print_summary() {
  local exit_code="$?"
  local end_ts duration outcome

  end_ts="$(date +%s)"
  duration="$((end_ts - START_TS))"

  if [ "$exit_code" -eq 0 ]; then
    outcome="SUCCESS"
  else
    outcome="FAILED"
  fi

  echo
  echo "[deploy][summary] outcome=${outcome} exit_code=${exit_code} duration=${duration}s"
  echo "[deploy][summary] stage=${CURRENT_STAGE} branch=${BRANCH}"

  case "${PULL_RESULT}" in
    updated)
      echo "[deploy][summary] pull=SUCCESS (changes applied ${GIT_BEFORE} -> ${GIT_AFTER})"
      ;;
    no_changes)
      echo "[deploy][summary] pull=NO_CHANGES (already at ${GIT_AFTER})"
      ;;
    failed)
      echo "[deploy][summary] pull=FAILED"
      ;;
    *)
      echo "[deploy][summary] pull=${PULL_RESULT}"
      ;;
  esac
}

trap print_summary EXIT

resolve_app_dir() {
  local candidate_a="${APP_DIR}"
  local candidate_b="${APP_DIR}/project-issue-analytics"

  if [ -d "${candidate_a}/.git" ]; then
    echo "${candidate_a}"
    return
  fi

  if [ -d "${candidate_b}/.git" ]; then
    echo "${candidate_b}"
    return
  fi

  echo "[deploy] ERROR: Could not find repository in:"
  echo "  - ${candidate_a}"
  echo "  - ${candidate_b}"
  exit 1
}

APP_DIR="$(resolve_app_dir)"
cd "${APP_DIR}"

echo "[deploy] Starting deployment"
echo "[deploy] Branch: ${BRANCH}"
echo "[deploy] Directory: ${APP_DIR}"

# Handle common broken proxy placeholders and stale git proxy settings.
if [[ "${HTTP_PROXY:-}" == "YOUR_PROXY_HOST:PORT" || "${HTTPS_PROXY:-}" == "YOUR_PROXY_HOST:PORT" || "${http_proxy:-}" == "YOUR_PROXY_HOST:PORT" || "${https_proxy:-}" == "YOUR_PROXY_HOST:PORT" ]]; then
  echo "[deploy] Clearing invalid proxy placeholder values"
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy
fi
git config --global --unset-all http.proxy || true
git config --global --unset-all https.proxy || true
git config --global --add safe.directory "${APP_DIR}" || true

if [ ! -w "${APP_DIR}/.git" ]; then
  CURRENT_STAGE="permission_check"
  echo "[deploy] ERROR: Runner user cannot write to ${APP_DIR}/.git"
  echo "[deploy] Run on server: sudo chown -R $(id -un):$(id -gn) ${APP_DIR}"
  exit 1
fi

CURRENT_STAGE="git_sync"
echo "[deploy] Fetching latest code"
GIT_BEFORE="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"

# Force repository to exactly match origin/main so changed files fully replace old ones.
git reset --hard "origin/${BRANCH}"
git clean -fd
GIT_AFTER="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

if [ "${GIT_BEFORE}" = "${GIT_AFTER}" ]; then
  PULL_RESULT="no_changes"
else
  PULL_RESULT="updated"
fi

CURRENT_STAGE="dependency_install"
echo "[deploy] Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

CURRENT_STAGE="validation"
echo "[deploy] Running checks"
if ! npm run lint; then
  echo "[deploy] ERROR: lint/type-check failed. Auto-fix is not safe in deploy script."
  exit 1
fi

CURRENT_STAGE="restart_app"
echo "[deploy] Restarting app with npm run dev (without PM2)"

# Stop any process currently listening on the target app port.
if command -v lsof >/dev/null 2>&1; then
  ACTIVE_PIDS="$(lsof -tiTCP:${APP_PORT} -sTCP:LISTEN || true)"
  if [ -n "${ACTIVE_PIDS}" ]; then
    echo "[deploy] Stopping existing process on port ${APP_PORT}: ${ACTIVE_PIDS}"
    kill ${ACTIVE_PIDS} || true
  fi
fi

# Extra cleanup for previous npm/vite dev processes.
pkill -f "npm run dev -- --host 0.0.0.0 --port ${APP_PORT} --strictPort" || true
pkill -f "vite --port ${APP_PORT}" || true

nohup npm run dev -- --host 0.0.0.0 --port "${APP_PORT}" --strictPort > "${APP_DIR}/app.log" 2>&1 &

# Give the process a moment to either bind successfully or fail.
sleep 2

# Validate that a process is running after restart.
if ! pgrep -f "npm run dev -- --host 0.0.0.0 --port ${APP_PORT} --strictPort" >/dev/null 2>&1 && \
   ! pgrep -f "vite --port ${APP_PORT}" >/dev/null 2>&1; then
  echo "[deploy] ERROR: npm run dev failed to start. Last 40 lines from app.log:"
  tail -n 40 "${APP_DIR}/app.log" || true
  exit 1
fi

CURRENT_STAGE="completed"
echo "[deploy] Deployment successful"
echo "[deploy] App logs: ${APP_DIR}/app.log"
