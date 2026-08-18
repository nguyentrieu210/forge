#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${FORGE_DEV_PORT:-5173}"
LOG_FILE="/tmp/forge-vite.log"
PID_FILE="/tmp/forge-vite.pid"
SYNC_PID_FILE="/tmp/forge-git-sync.pid"
SYNC_LOG_FILE="/tmp/forge-git-sync.log"

echo "[forge] workspace: $ROOT_DIR"
echo "[forge] app:       runtime"
echo "[forge] port:      $PORT"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[forge] ERROR: node is not available in this Codespace."
  exit 1
fi

echo "[forge] node: $(node --version)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[forge] pnpm missing; enabling Corepack..."
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
fi

echo "[forge] pnpm: $(pnpm --version)"

if [[ ! -d node_modules ]]; then
  echo "[forge] root node_modules missing; installing root workspace dependencies..."
  pnpm install --frozen-lockfile
fi

# Keep the Codespace synced with GitHub main, but never overwrite local changes.
if [[ -f "$ROOT_DIR/.devcontainer/auto-sync-github.sh" ]]; then
  if [[ ! -f "$SYNC_PID_FILE" ]] || ! kill -0 "$(cat "$SYNC_PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then
    nohup bash "$ROOT_DIR/.devcontainer/auto-sync-github.sh" >"$SYNC_LOG_FILE" 2>&1 &
    echo $! > "$SYNC_PID_FILE"
    echo "[forge] GitHub auto-sync started (pid $(cat "$SYNC_PID_FILE"))."
  fi
fi

# Always stop the preview process recorded by the previous startup. This is
# intentional: older Codespaces may still be running @metaforge/demo on 5173.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[forge] stopping stale preview pid $OLD_PID..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

: > "$LOG_FILE"
echo "[forge] starting Forge Runtime Vite..."
nohup pnpm --filter runtime dev -- --host 0.0.0.0 --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 &
VITE_PID=$!
echo "$VITE_PID" > "$PID_FILE"

for _ in $(seq 1 45); do
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "[forge] ERROR: Runtime Vite exited before opening port ${PORT}."
    echo "----- /tmp/forge-vite.log -----"
    cat "$LOG_FILE" || true
    echo "--------------------------------"
    exit 1
  fi

  if curl -fsS "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
    echo "[forge] READY: http://127.0.0.1:${PORT}"
    echo "[forge] Open forwarded port ${PORT} from the Codespaces Ports tab."
    exit 0
  fi
  sleep 1
done

echo "[forge] ERROR: Runtime Vite is alive but port ${PORT} did not become ready."
echo "----- /tmp/forge-vite.log -----"
cat "$LOG_FILE" || true
echo "--------------------------------"
exit 1
