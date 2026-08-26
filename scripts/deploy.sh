#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/project-issue-analytics}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-project-analytics}"
APP_PORT="${APP_PORT:-3000}"
HEALTH_PATH="${HEALTH_PATH:-/}"

GREEN="\033[0;32m"
BLUE="\033[1;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

TOTAL_START=$(date +%s)
TIME_GIT=0
TIME_NPM=0
TIME_LINT=0
TIME_PM2=0
TIME_HEALTH=0

section() {
  echo
  echo -e "${BLUE}=========================================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}=========================================================${NC}"
}

step() {
  echo
  echo -e "${YELLOW}$1${NC}"
}

success() {
  echo -e "${GREEN}OK${NC} $1"
}

fail() {
  echo -e "${RED}ERROR${NC} $1"
  exit 1
}

section "Project Issue Analytics Deployment"
echo "Server    : $(hostname)"
echo "Branch    : ${BRANCH}"
echo "Directory : ${APP_DIR}"
echo "Started   : $(date)"

# Some hosts are provisioned with placeholder proxy values that break git.
if [[ "${HTTP_PROXY:-}" == "YOUR_PROXY_HOST:PORT" || "${HTTPS_PROXY:-}" == "YOUR_PROXY_HOST:PORT" || "${http_proxy:-}" == "YOUR_PROXY_HOST:PORT" || "${https_proxy:-}" == "YOUR_PROXY_HOST:PORT" ]]; then
  echo "[deploy] Clearing invalid proxy placeholder values"
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy
fi

cd "$APP_DIR"

git config --global --unset-all http.proxy || true
git config --global --unset-all https.proxy || true
git config --global --add safe.directory "$APP_DIR" || true

step "Updating source code"
START=$(date +%s)
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
END=$(date +%s)
TIME_GIT=$((END-START))
success "Completed in ${TIME_GIT}s"

step "Installing dependencies"
START=$(date +%s)
npm ci
END=$(date +%s)
TIME_NPM=$((END-START))
success "Completed in ${TIME_NPM}s"

step "Running type check"
START=$(date +%s)
npm run lint
END=$(date +%s)
TIME_LINT=$((END-START))
success "Completed in ${TIME_LINT}s"

step "Restarting app with PM2"
START=$(date +%s)
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" --update-env
else
  pm2 start "npm run dev -- --host 0.0.0.0 --port ${APP_PORT}" --name "$PM2_APP_NAME"
fi
pm2 save
END=$(date +%s)
TIME_PM2=$((END-START))
success "Completed in ${TIME_PM2}s"

step "Health check"
START=$(date +%s)
HEALTH_URL="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
HEALTH_OK=""
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null --max-time 3 "$HEALTH_URL"; then
    HEALTH_OK="1"
    break
  fi
  sleep 1
done

if [[ -z "$HEALTH_OK" ]]; then
  fail "Application did not respond healthy at ${HEALTH_URL} within 20s"
fi

END=$(date +%s)
TIME_HEALTH=$((END-START))
success "Completed in ${TIME_HEALTH}s"

TOTAL_END=$(date +%s)
TOTAL_TIME=$((TOTAL_END-TOTAL_START))

section "Deployment Summary"
printf "%-25s %8ss\n" "Git Update" "$TIME_GIT"
printf "%-25s %8ss\n" "npm ci" "$TIME_NPM"
printf "%-25s %8ss\n" "Type Check" "$TIME_LINT"
printf "%-25s %8ss\n" "PM2 Restart" "$TIME_PM2"
printf "%-25s %8ss\n" "Health Check" "$TIME_HEALTH"
echo "---------------------------------------------------------"
printf "%-25s %8ss\n" "TOTAL" "$TOTAL_TIME"

echo
echo -e "${GREEN}Deployment completed successfully.${NC}"
echo "Finished: $(date)"
pm2 status
