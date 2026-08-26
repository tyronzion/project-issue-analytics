#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/project-issue-analytics}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-project-analytics}"
APP_PORT="${APP_PORT:-3000}"

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
  echo "[deploy] ERROR: Runner user cannot write to ${APP_DIR}/.git"
  echo "[deploy] Run on server: sudo chown -R $(id -un):$(id -gn) ${APP_DIR}"
  exit 1
fi

echo "[deploy] Fetching latest code"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"

# Force repository to exactly match origin/main so changed files fully replace old ones.
git reset --hard "origin/${BRANCH}"
git clean -fd

echo "[deploy] Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "[deploy] Running checks"
if ! npm run lint; then
  echo "[deploy] ERROR: lint/type-check failed. Auto-fix is not safe in deploy script."
  exit 1
fi

echo "[deploy] Restarting app via PM2 using npm run dev"
if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_APP_NAME}" --update-env
else
  pm2 start "npm run dev -- --host 0.0.0.0 --port ${APP_PORT}" --name "${PM2_APP_NAME}"
fi

pm2 save

echo "[deploy] Deployment successful"
pm2 status "${PM2_APP_NAME}" || true
