#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-80}"
# Production (CT) runs the app as this systemd service; see scripts/security-issues-analytics.service.
SERVICE_NAME="${SERVICE_NAME:-security-issues-analytics}"
START_TS="$(date +%s)"
CURRENT_STAGE="initializing"
PULL_RESULT="not_started"
GIT_BEFORE="unknown"
GIT_AFTER="unknown"
FAILED_COMMAND=""
FAILED_LINE=""

trap 'FAILED_COMMAND="${BASH_COMMAND}"; FAILED_LINE="${LINENO}"' ERR

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
  if [ "$exit_code" -ne 0 ] && [ -n "${FAILED_COMMAND}" ]; then
    echo "[deploy][summary] failed_command=\"${FAILED_COMMAND}\" line=${FAILED_LINE}"
  fi

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
  local candidates=()
  if [ -n "${APP_DIR}" ]; then
    candidates+=("${APP_DIR}" "${APP_DIR}/project-issue-analytics")
  fi
  # Default to the repository this script lives in, then the legacy /opt location.
  candidates+=("$(dirname "${SCRIPT_DIR}")" "/opt/project-issue-analytics" "/opt/project-issue-analytics/project-issue-analytics")

  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -d "${candidate}/.git" ]; then
      echo "${candidate}"
      return 0
    fi
  done

  # stderr, so the message is not swallowed by the command substitution.
  echo "[deploy] ERROR: Could not find repository in:" >&2
  printf '  - %s\n' "${candidates[@]}" >&2
  return 1
}

CURRENT_STAGE="resolve_app_dir"
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

# When the app runs as the systemd service, never start a second copy: signal the service's main process (it runs
# as this user, so no root is needed) and systemd starts it again with the new code (the unit has Restart=always).
if command -v systemctl >/dev/null 2>&1 && systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  OLD_PID="$(systemctl show -p MainPID --value "${SERVICE_NAME}")"
  if [ "${OLD_PID:-0}" -eq 0 ]; then
    echo "[deploy] ERROR: service ${SERVICE_NAME} is not running. Start it as root: systemctl start ${SERVICE_NAME}"
    exit 1
  fi
  echo "[deploy] Restarting systemd service ${SERVICE_NAME} (main PID ${OLD_PID})"
  if ! kill -TERM "${OLD_PID}"; then
    echo "[deploy] ERROR: cannot signal PID ${OLD_PID} as $(id -un). Restart it as root: systemctl restart ${SERVICE_NAME}"
    exit 1
  fi
  RESTARTED=false
  for _ in $(seq 1 60); do
    sleep 1
    NEW_PID="$(systemctl show -p MainPID --value "${SERVICE_NAME}")"
    if [ "${NEW_PID:-0}" -ne 0 ] && [ "${NEW_PID}" != "${OLD_PID}" ] && curl -s -o /dev/null "http://127.0.0.1:${APP_PORT}/"; then
      RESTARTED=true
      break
    fi
  done
  if [ "${RESTARTED}" != true ]; then
    echo "[deploy] ERROR: ${SERVICE_NAME} did not come back on port ${APP_PORT} within 60s."
    echo "[deploy]        Check as root: systemctl status ${SERVICE_NAME}; journalctl -u ${SERVICE_NAME} -n 50"
    exit 1
  fi
  CURRENT_STAGE="completed"
  echo "[deploy] Deployment successful (service ${SERVICE_NAME}, main PID ${NEW_PID})"
  exit 0
fi

# Legacy servers without the service: start the app directly.
echo "[deploy] Restarting app with npm run dev (without PM2) on port ${APP_PORT}"

if [ "${APP_PORT}" -lt 1024 ] && [ "$(id -u)" -ne 0 ]; then
  echo "[deploy] WARNING: port ${APP_PORT} is privileged and $(id -un) is not root."
  echo "[deploy]          If startup fails with EACCES, run: sudo setcap 'cap_net_bind_service=+ep' \"\$(readlink -f \"\$(command -v node)\")\""
  echo "[deploy]          or deploy on a higher port: APP_PORT=8080 ./deploy.sh"
fi

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
pkill -f "vite --port=${APP_PORT}" || true
pkill -f "vite --port ${APP_PORT}" || true

# scripts/start-dev.sh reads the port from APP_PORT (it ignores CLI flags).
APP_PORT="${APP_PORT}" nohup npm run dev > "${APP_DIR}/app.log" 2>&1 &
DEV_PID=$!

# Wait up to 20s for the dev server to bind the port, failing fast if it exits.
STARTED=false
for _ in $(seq 1 20); do
  if ! kill -0 "${DEV_PID}" 2>/dev/null; then
    break
  fi
  if grep -q "Local:" "${APP_DIR}/app.log" 2>/dev/null || \
     { command -v lsof >/dev/null 2>&1 && [ -n "$(lsof -tiTCP:${APP_PORT} -sTCP:LISTEN 2>/dev/null || true)" ]; }; then
    STARTED=true
    break
  fi
  sleep 1
done

if [ "${STARTED}" != true ]; then
  echo "[deploy] ERROR: npm run dev failed to start. Last 40 lines from app.log:"
  tail -n 40 "${APP_DIR}/app.log" || true
  exit 1
fi

CURRENT_STAGE="completed"
echo "[deploy] Deployment successful"
echo "[deploy] App logs: ${APP_DIR}/app.log"
