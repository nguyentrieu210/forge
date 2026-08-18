#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_PORT="${FORGE_DEV_PORT:-5173}"
BACKEND_PORT="${FORGE_BACKEND_PORT:-8799}"
VITE_LOG="/tmp/forge-vite.log"
VITE_PID_FILE="/tmp/forge-vite.pid"
BACKEND_LOG="/tmp/forge-backend.log"
BACKEND_PID_FILE="/tmp/forge-backend.pid"
SYNC_PID_FILE="/tmp/forge-git-sync.pid"
SYNC_LOG_FILE="/tmp/forge-git-sync.log"
STATE_MARKER="$ROOT_DIR/.codespace-local-state.json"
TENANT_STATE="$ROOT_DIR/server/apps/tenant-worker/.wrangler/state"
PNPM=(corepack pnpm)

echo "[forge] workspace:      $ROOT_DIR"
echo "[forge] frontend:       $FRONTEND_PORT"
echo "[forge] backend:        $BACKEND_PORT"
echo "[forge] database mode:  restored local Wrangler state"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[forge] ERROR: node is not available in this Codespace."
  exit 1
fi
if ! command -v corepack >/dev/null 2>&1; then
  echo "[forge] ERROR: corepack is not available in this Codespace."
  exit 1
fi

echo "[forge] node: $(node --version)"
echo "[forge] pnpm: $("${PNPM[@]}" --version)"

echo "[forge] ensuring frontend + backend dependencies..."
"${PNPM[@]}" install --filter runtime... --filter cloudforge... --frozen-lockfile --prefer-offline

# First Codespace boot: if the encrypted snapshot key is available, restore the
# latest full local Wrangler state before starting either server. We never seed a
# synthetic database here; the user's canonical C:\alumdoor state is the source.
if [[ "${CODESPACES:-}" == "true" && ! -f "$STATE_MARKER" && -n "${FORGE_CODESPACE_SNAPSHOT_KEY:-}" ]]; then
  echo "[forge] restoring latest encrypted C:\\alumdoor snapshot..."
  node "$ROOT_DIR/scripts/codespaces/restore-local-state.mjs"
fi

if [[ ! -d "$TENANT_STATE" ]]; then
  echo "[forge] ERROR: full local database snapshot has not been restored."
  echo "[forge] Run GitHub Actions workflow 'Snapshot Full Local State for Codespaces',"
  echo "[forge] expose the same FORGE_CODESPACE_SNAPSHOT_KEY to this Codespace, then run:"
  echo "[forge]   node scripts/codespaces/restore-local-state.mjs"
  exit 2
fi

# Local worker secrets are Codespace-local and never committed. They only enable
# the restored D1 state to run under AUTH_MODE=development; business data remains
# exactly what came from the snapshot.
DEV_VARS="$ROOT_DIR/server/apps/tenant-worker/.dev.vars"
if [[ ! -f "$DEV_VARS" ]]; then
  echo "[forge] creating Codespace-local worker secrets..."
  node - "$DEV_VARS" <<'NODE'
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const file = process.argv[2];
const secret = () => randomBytes(32).toString('hex');
writeFileSync(file, [
  `JWT_SECRET=${secret()}`,
  'JWT_ISSUER=https://auth.codespace.invalid',
  'JWT_AUDIENCE=cloudforge',
  `INTERNAL_AUTH_SECRET=${secret()}`,
  'INTERNAL_AUTH_KEY_ID=k1',
  `INTERNAL_SERVICE_TOKEN=${secret()}`,
  `CONTROL_TOKEN=${secret()}`,
  `SESSION_SECRET=${secret()}`,
  'AUTH_MODE=development',
  'DEV_ACTOR_JSON={"user_id":"Administrator","roles":["System Manager"]}',
  '',
].join('\n'), 'utf8');
NODE
fi

# Keep this Codespace source synced to GitHub main without overwriting local edits.
if [[ -f "$ROOT_DIR/.devcontainer/auto-sync-github.sh" ]]; then
  if [[ ! -f "$SYNC_PID_FILE" ]] || ! kill -0 "$(cat "$SYNC_PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then
    nohup bash "$ROOT_DIR/.devcontainer/auto-sync-github.sh" >"$SYNC_LOG_FILE" 2>&1 &
    echo $! > "$SYNC_PID_FILE"
    echo "[forge] GitHub auto-sync started (pid $(cat "$SYNC_PID_FILE"))."
  fi
fi

stop_pid_file() {
  local pid_file="$1"
  local label="$2"
  if [[ -f "$pid_file" ]]; then
    local old_pid
    old_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "[forge] stopping stale $label pid $old_pid..."
      kill "$old_pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi
}

stop_pid_file "$BACKEND_PID_FILE" "backend"
stop_pid_file "$VITE_PID_FILE" "frontend"

: > "$BACKEND_LOG"
echo "[forge] starting local Cloudflare Worker backend on $BACKEND_PORT..."
(
  cd "$ROOT_DIR/server"
  nohup "${PNPM[@]}" exec wrangler dev --config apps/tenant-worker/wrangler.jsonc --port "$BACKEND_PORT" --local >"$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
)
BACKEND_PID="$(cat "$BACKEND_PID_FILE")"

for _ in $(seq 1 60); do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[forge] ERROR: backend exited before opening port $BACKEND_PORT."
    echo "----- /tmp/forge-backend.log -----"
    tail -n 120 "$BACKEND_LOG" || true
    echo "----------------------------------"
    exit 1
  fi
  if curl -sS -o /dev/null "http://127.0.0.1:${BACKEND_PORT}/api/method/metaforge.api.get_boot" 2>/dev/null; then
    echo "[forge] backend READY: http://127.0.0.1:${BACKEND_PORT}"
    break
  fi
  sleep 1
done

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "[forge] ERROR: backend is not running."
  tail -n 120 "$BACKEND_LOG" || true
  exit 1
fi

: > "$VITE_LOG"
echo "[forge] starting Forge Runtime Vite against restored backend..."
nohup env VITE_FORGE_BACKEND="http://127.0.0.1:${BACKEND_PORT}" "${PNPM[@]}" --filter runtime dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort >"$VITE_LOG" 2>&1 &
VITE_PID=$!
echo "$VITE_PID" > "$VITE_PID_FILE"

for _ in $(seq 1 60); do
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "[forge] ERROR: Runtime Vite exited before opening port ${FRONTEND_PORT}."
    echo "----- /tmp/forge-vite.log -----"
    tail -n 120 "$VITE_LOG" || true
    echo "--------------------------------"
    exit 1
  fi

  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
    echo "[forge] FULL STACK READY: http://127.0.0.1:${FRONTEND_PORT}"
    echo "[forge] Backend: 127.0.0.1:${BACKEND_PORT} | Database: restored C:\\alumdoor local state"
    exit 0
  fi
  sleep 1
done

echo "[forge] ERROR: Runtime Vite is alive but port ${FRONTEND_PORT} did not become ready."
tail -n 120 "$VITE_LOG" || true
exit 1
