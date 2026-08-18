#!/usr/bin/env bash
set -euo pipefail

PORT="${FORGE_PREVIEW_PORT:-5173}"
LOG_FILE="${FORGE_PREVIEW_LOG:-/tmp/forge-vite.log}"
PID_FILE="${FORGE_PREVIEW_PID_FILE:-/tmp/forge-vite.pid}"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "Forge preview already running (pid $PID) on port $PORT"
    exit 0
  fi
fi

nohup pnpm --filter @metaforge/demo run dev -- --host 0.0.0.0 --port "$PORT" >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "Forge preview starting on port $PORT"
echo "Log: $LOG_FILE"
