#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${FORGE_CODESPACE_STATE_DIR:-$HOME/.cache/forge-codespace}"
LOG_DIR="$STATE_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$ROOT"

echo "== Forge Codespaces: dependencies =="
if command -v sudo >/dev/null 2>&1; then
  sudo corepack enable >/dev/null 2>&1 || corepack enable
else
  corepack enable
fi
pnpm install --frozen-lockfile

echo "== Forge Codespaces: local-only secrets =="
node server/scripts/ensure-dev-vars.mjs
node server/scripts/ensure-alumdoor-local-vars.mjs

echo "== Forge Codespaces: build backend =="
cd "$ROOT/server"
pnpm run build

echo "== Forge Codespaces: migrate LOCAL D1 =="
# Codespaces postCreate can expose a TTY even though nobody can answer prompts.
# Force Wrangler into CI mode so the LOCAL-only migration confirmation is skipped.
CI=1 pnpm exec wrangler d1 migrations apply cloudforge-demo --local --config apps/tenant-worker/wrangler.jsonc

echo "== Forge Codespaces: seed local login/demo base =="
pnpm run dev:seed

cd "$ROOT"
bash .devcontainer/start-codespace.sh --backend-only

echo "== Forge Codespaces: install Alumdoor app stack =="
cd "$ROOT/server"
export FORGE_ADMIN_PASSWORD="local-dev-password-1"
node scripts/forge-app.mjs apps-src/hrm --origin http://127.0.0.1:8799 --admin dev@example.com --provision-standard
node scripts/forge-app.mjs apps-src/alumdoor-attendance --origin http://127.0.0.1:8799 --admin dev@example.com
node scripts/forge-app.mjs apps-src/vn-accounting --origin http://127.0.0.1:8799 --admin dev@example.com
node scripts/forge-app.mjs briefs/alumdoor-v2.json --origin http://127.0.0.1:8799 --admin dev@example.com
unset FORGE_ADMIN_PASSWORD

echo "== Forge Codespaces: build MetaForge packages =="
cd "$ROOT/client"
pnpm exec tsc -b

cd "$ROOT"
git rev-parse HEAD > "$STATE_DIR/bootstrap.sha"
touch "$STATE_DIR/bootstrap.complete"

echo
echo "CODESPACE_BOOTSTRAP_PASS"
echo "Login: dev@example.com / local-dev-password-1"
echo "All database and Worker state is local to this Codespace; no Cloudflare remote resources were mutated."
