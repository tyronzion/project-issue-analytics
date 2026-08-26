#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/project-issue-analytics}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-project-analytics}"

# Some hosts are provisioned with placeholder proxy values that break git.
if [[ "${HTTP_PROXY:-}" == "YOUR_PROXY_HOST:PORT" || "${HTTPS_PROXY:-}" == "YOUR_PROXY_HOST:PORT" || "${http_proxy:-}" == "YOUR_PROXY_HOST:PORT" || "${https_proxy:-}" == "YOUR_PROXY_HOST:PORT" ]]; then
  echo "[deploy] Clearing invalid proxy placeholder values"
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy
fi

cd "$APP_DIR"

git config --global --unset-all http.proxy || true
git config --global --unset-all https.proxy || true

echo "[deploy] Pulling latest changes from $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[deploy] Installing dependencies"
npm ci

echo "[deploy] Running type check"
npm run lint

echo "[deploy] Restarting app with PM2"
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME"
else
  pm2 start "npm run dev -- --host 0.0.0.0 --port 3000" --name "$PM2_APP_NAME"
fi

pm2 save

echo "[deploy] Deployment complete"
