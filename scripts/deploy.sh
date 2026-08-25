#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/project-issue-analytics}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-project-analytics}"

cd "$APP_DIR"

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
