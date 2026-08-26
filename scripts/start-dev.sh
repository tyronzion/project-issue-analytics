#!/usr/bin/env bash
set -Eeuo pipefail

PORT="${APP_PORT:-80}"

find_listeners() {
  lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

PIDS="$(find_listeners)"
if [ -n "${PIDS}" ]; then
  echo "[dev] Releasing port ${PORT}: ${PIDS}"
  kill ${PIDS} 2>/dev/null || true

  # Give processes a moment to shut down gracefully.
  sleep 1

  PIDS="$(find_listeners)"
  if [ -n "${PIDS}" ]; then
    echo "[dev] Force-killing remaining listeners on port ${PORT}: ${PIDS}"
    kill -9 ${PIDS} 2>/dev/null || true
    sleep 1
  fi
fi

PIDS="$(find_listeners)"
if [ -n "${PIDS}" ]; then
  echo "[dev] ERROR: Port ${PORT} is still in use by PID(s): ${PIDS}"
  echo "[dev] If owned by another user/root, run: sudo lsof -nP -iTCP:${PORT} -sTCP:LISTEN"
  echo "[dev] Then stop it with: sudo kill -9 <PID>"
  exit 1
fi

echo "[dev] Starting Vite on port ${PORT}"
exec vite --port="${PORT}" --host=0.0.0.0 --strictPort
