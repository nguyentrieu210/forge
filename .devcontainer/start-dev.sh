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
CREDENTIALS_FILE="$ROOT_DIR/.codespace-admin-credentials"
CODESPACE_ADMIN_USER="codespace-admin@forge.local"
PNPM=(corepack pnpm)

echo "[forge] workspace:      $ROOT_DIR"
echo "[forge] frontend:       $FRONTEND_PORT"
echo "[forge] backend:        $BACKEND_PORT"
echo "[forge] database mode:  restored C:\\alumdoor Wrangler state"
echo "[forge] backend mode:   full Alumdoor local multi-worker stack"

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

# Restore the exact local Wrangler state captured from the canonical C:\alumdoor
# runner. Never synthesize business data in this startup path.
if [[ "${CODESPACES:-}" == "true" && ! -f "$STATE_MARKER" && -n "${FORGE_CODESPACE_SNAPSHOT_KEY:-}" ]]; then
  echo "[forge] restoring latest encrypted C:\\alumdoor snapshot..."
  node "$ROOT_DIR/scripts/codespaces/restore-local-state.mjs"
fi

if [[ ! -d "$TENANT_STATE" ]]; then
  echo "[forge] ERROR: full local database snapshot has not been restored."
  echo "[forge] Run GitHub Actions workflow 'Snapshot Full Local State for Codespaces',"
  echo "[forge] then restore it with scripts/codespaces/restore-local-state.mjs."
  exit 2
fi

# Codespace-local worker secrets. Business data comes from the snapshot; only the
# runtime signing/session secrets are local to this Codespace.
DEV_VARS="$ROOT_DIR/server/apps/tenant-worker/.dev.vars"
if [[ ! -f "$DEV_VARS" ]]; then
  echo "[forge] creating Codespace-local worker secrets..."
  node - "$DEV_VARS" <<'NODE'
const { randomBytes } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const file = process.argv[2];
const secret = () => randomBytes(32).toString('hex');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, [
  `JWT_SECRET=${secret()}`,
  'JWT_ISSUER=https://auth.codespace.invalid',
  'JWT_AUDIENCE=cloudforge',
  `INTERNAL_AUTH_SECRET=${secret()}`,
  `INTERNAL_SERVICE_TOKEN=${secret()}`,
  `CONTROL_TOKEN=${secret()}`,
  `SESSION_SECRET=${secret()}`,
  'AUTH_MODE=development',
  'DEV_ACTOR_JSON={"user_id":"Administrator","roles":["System Manager"]}',
  '',
].join('\n'), 'utf8');
NODE
fi

# seed-local --auth-only uses the exact production password hashing code but mutates
# only the restored local D1. Build server once when dist is absent.
if [[ ! -f "$ROOT_DIR/server/dist/packages/frappe-api/src/index.js" ]]; then
  echo "[forge] building backend once for local credential provisioning..."
  "${PNPM[@]}" --dir "$ROOT_DIR/server" run build
fi

# A separate Codespace-only System Manager avoids depending on whatever password or
# MFA state happens to exist in the imported local database. Keep its random password
# in an ignored file so restarts use the same credential.
if [[ -f "$CREDENTIALS_FILE" ]]; then
  CODESPACE_ADMIN_PASSWORD="$(sed -n 's/^password=//p' "$CREDENTIALS_FILE" | head -n 1)"
fi
if [[ -z "${CODESPACE_ADMIN_PASSWORD:-}" ]]; then
  CODESPACE_ADMIN_PASSWORD="$(node -e "process.stdout.write(require('node:crypto').randomBytes(18).toString('base64url') + '!A7')")"
  printf 'user=%s\npassword=%s\n' "$CODESPACE_ADMIN_USER" "$CODESPACE_ADMIN_PASSWORD" > "$CREDENTIALS_FILE"
  chmod 600 "$CREDENTIALS_FILE" 2>/dev/null || true
fi

# Always re-apply auth-only after a snapshot restore. This does not touch business
# records; it only guarantees one known System Manager account in the Codespace copy.
echo "[forge] provisioning Codespace-only System Manager account..."
(
  cd "$ROOT_DIR/server"
  node scripts/seed-local.mjs --auth-only --user "$CODESPACE_ADMIN_USER" --password "$CODESPACE_ADMIN_PASSWORD"
)

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
echo "[forge] starting full Alumdoor local backend on $BACKEND_PORT..."
nohup "${PNPM[@]}" --dir "$ROOT_DIR/server" run dev:alumdoor-local >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

BACKEND_READY=0
for _ in $(seq 1 90); do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[forge] ERROR: Alumdoor backend exited before opening port $BACKEND_PORT."
    echo "----- /tmp/forge-backend.log -----"
    tail -n 160 "$BACKEND_LOG" || true
    echo "----------------------------------"
    exit 1
  fi
  if curl -sS -o /dev/null "http://127.0.0.1:${BACKEND_PORT}/api/method/metaforge.api.get_boot" 2>/dev/null; then
    BACKEND_READY=1
    echo "[forge] backend READY: http://127.0.0.1:${BACKEND_PORT}"
    break
  fi
  sleep 1
done

if [[ "$BACKEND_READY" != "1" ]]; then
  echo "[forge] ERROR: backend did not become ready on $BACKEND_PORT."
  tail -n 160 "$BACKEND_LOG" || true
  exit 1
fi

# Verify the actual login endpoint before telling the user the credential works.
LOGIN_BODY="/tmp/forge-codespace-login.json"
LOGIN_COOKIES="/tmp/forge-codespace-login.cookies"
LOGIN_STATUS="$(curl -sS -o "$LOGIN_BODY" -w '%{http_code}' -c "$LOGIN_COOKIES" \
  -X POST \
  --data-urlencode "usr=$CODESPACE_ADMIN_USER" \
  --data-urlencode "pwd=$CODESPACE_ADMIN_PASSWORD" \
  "http://127.0.0.1:${BACKEND_PORT}/api/method/login" || true)"
if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "[forge] ERROR: Codespace admin login self-check returned HTTP $LOGIN_STATUS."
  cat "$LOGIN_BODY" 2>/dev/null || true
  echo
  echo "----- /tmp/forge-backend.log -----"
  tail -n 160 "$BACKEND_LOG" || true
  echo "----------------------------------"
  exit 1
fi
rm -f "$LOGIN_BODY" "$LOGIN_COOKIES"

echo "[forge] LOGIN VERIFIED"
echo "[forge] user:     $CODESPACE_ADMIN_USER"
echo "[forge] password: $CODESPACE_ADMIN_PASSWORD"

: > "$VITE_LOG"
echo "[forge] starting Forge Runtime Vite against restored Alumdoor backend..."
nohup env VITE_FORGE_BACKEND="http://127.0.0.1:${BACKEND_PORT}" "${PNPM[@]}" --filter runtime dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort >"$VITE_LOG" 2>&1 &
VITE_PID=$!
echo "$VITE_PID" > "$VITE_PID_FILE"

for _ in $(seq 1 60); do
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "[forge] ERROR: Runtime Vite exited before opening port ${FRONTEND_PORT}."
    echo "----- /tmp/forge-vite.log -----"
    tail -n 160 "$VITE_LOG" || true
    echo "--------------------------------"
    exit 1
  fi

  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
    echo "[forge] FULL STACK READY: http://127.0.0.1:${FRONTEND_PORT}"
    echo "[forge] Backend: full Alumdoor local stack | Database: restored C:\\alumdoor state"
    echo "[forge] Login credential is also stored in .codespace-admin-credentials"
    exit 0
  fi
  sleep 1
done

echo "[forge] ERROR: Runtime Vite is alive but port ${FRONTEND_PORT} did not become ready."
tail -n 160 "$VITE_LOG" || true
exit 1
