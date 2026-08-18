#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${FORGE_CODESPACE_STATE_DIR:-$HOME/.cache/forge-codespace}"
LOG_DIR="$STATE_DIR/logs"
mkdir -p "$LOG_DIR"
BACKEND_ONLY=false
if [[ "${1:-}" == "--backend-only" ]]; then
  BACKEND_ONLY=true
fi

health_backend() {
  node -e "fetch('http://127.0.0.1:8799/api/method/metaforge.api.get_boot',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit((r.ok||r.status===401||r.status===403)?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1
}

health_desk() {
  node -e "fetch('http://127.0.0.1:5173',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1
}

if ! health_backend; then
  echo "Starting local Alumdoor Worker cluster on :8799 ..."
  (
    cd "$ROOT/server"
    nohup pnpm run dev:alumdoor-local >"$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$STATE_DIR/backend.pid"
  )
fi

for _ in $(seq 1 90); do
  if health_backend; then
    break
  fi
  sleep 2
done
if ! health_backend; then
  echo "Backend failed to become ready. Last log lines:" >&2
  tail -n 80 "$LOG_DIR/backend.log" >&2 || true
  exit 1
fi

echo "Backend ready: http://127.0.0.1:8799"

if "$BACKEND_ONLY"; then
  exit 0
fi

if [[ ! -f "$STATE_DIR/bootstrap.complete" ]]; then
  echo "Codespace bootstrap is not complete yet; run: bash .devcontainer/bootstrap-codespace.sh" >&2
  exit 2
fi

if ! health_desk; then
  echo "Starting MetaForge Desk on :5173 ..."
  (
    cd "$ROOT/client/apps/runtime"
    nohup env VITE_FORGE_BACKEND=http://127.0.0.1:8799 pnpm run dev -- --host 0.0.0.0 --port 5173 >"$LOG_DIR/desk.log" 2>&1 &
    echo $! > "$STATE_DIR/desk.pid"
  )
fi

for _ in $(seq 1 60); do
  if health_desk; then
    break
  fi
  sleep 2
done
if ! health_desk; then
  echo "Desk failed to become ready. Last log lines:" >&2
  tail -n 80 "$LOG_DIR/desk.log" >&2 || true
  exit 1
fi

if [[ -n "${CODESPACE_NAME:-}" && -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  DESK_URL="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  DESK_URL="http://127.0.0.1:5173"
fi

echo
echo "FORGE_CODESPACE_READY"
echo "Desk: $DESK_URL"
echo "Login: dev@example.com / local-dev-password-1"
echo "Backend: http://127.0.0.1:8799 (local-only Worker/D1 state)"
