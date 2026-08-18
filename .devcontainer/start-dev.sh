#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
PORT="${FORGE_DEV_PORT:-5173}"
LOG_FILE="/tmp/forge-vite.log"
PID_FILE="/tmp/forge-vite.pid"

cd "$CLIENT_DIR"

if curl -fsS "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
  echo "Forge preview already running on port ${PORT}."
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

nohup pnpm --filter @metaforge/demo dev -- --host 0.0.0.0 --port "$PORT" >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
    echo "Forge preview ready on port ${PORT}."
    exit 0
  fi
  sleep 1
done

echo "Forge preview did not become ready. Last Vite output:"
tail -n 80 "$LOG_FILE" || true
exit 1
