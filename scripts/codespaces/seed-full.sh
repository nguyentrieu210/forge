#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
ORIGIN="${FORGE_ORIGIN:-http://127.0.0.1:8799}"
ADMIN_USER="codespace-admin@forge.local"
ADMIN_CREDENTIALS="$ROOT_DIR/.codespace-admin-credentials"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
RUN_DIR="$ROOT_DIR/local-backups/codespace-full-seed/$RUN_ID"
PNPM=(corepack pnpm)

case "$ORIGIN" in
  http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;;
  *) echo "CODESPACE_FULL_SEED_REMOTE_FORBIDDEN origin=$ORIGIN" >&2; exit 2 ;;
esac
if [[ "$*" == *--remote* ]]; then
  echo "CODESPACE_FULL_SEED_REMOTE_FORBIDDEN flag=--remote" >&2
  exit 2
fi
if [[ ! -f "$ADMIN_CREDENTIALS" ]]; then
  echo "Missing $ADMIN_CREDENTIALS; run .devcontainer/start-dev.sh first." >&2
  exit 2
fi
ADMIN_PASSWORD="$(sed -n 's/^password=//p' "$ADMIN_CREDENTIALS" | head -n 1)"
if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "Codespace admin password file is invalid." >&2
  exit 2
fi

mkdir -p "$RUN_DIR" "$ROOT_DIR/local-imports"
export FORGE_ORIGIN="$ORIGIN"
export FORGE_ADMIN_USER="$ADMIN_USER"
export FORGE_ADMIN_PASSWORD="$ADMIN_PASSWORD"

run_node() {
  local script="$1"; shift
  node "$script" "$@"
}

need_api() {
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' "$ORIGIN/api/method/metaforge.api.get_boot" || true)"
  case "$status" in 200|401|403) ;; *) echo "Codespace backend unavailable: HTTP $status" >&2; exit 1;; esac
}

need_api

echo "[seed-full] backup local Wrangler state..."
run_node "$SERVER_DIR/scripts/backup-local-state.mjs"

echo "[seed-full] canonical Item source -> 587-item master..."
SOURCE="$ROOT_DIR/local-imports/alumdoor-item-source-records.json"
SOURCE_REPORT="$RUN_DIR/item-source.report.json"
ITEMS="$RUN_DIR/items.json"
ITEMS_AUDIT="$RUN_DIR/items.audit.json"
ITEM_PREIMAGE="$RUN_DIR/items.preimage.json"
run_node "$SERVER_DIR/scripts/extract-alumdoor-real-source-records.mjs" "$SOURCE" "$SOURCE_REPORT"
run_node "$SERVER_DIR/scripts/build-alumdoor-item-master-payload.mjs" "$SOURCE" "$ITEMS" "$ITEMS_AUDIT"
run_node "$SERVER_DIR/scripts/import-alumdoor-item-master-local.mjs" "$ITEMS" "$ITEM_PREIMAGE"
run_node "$SERVER_DIR/scripts/import-alumdoor-item-master-local.mjs" "$ITEMS" "$RUN_DIR/items.replay.preimage.json"

echo "[seed-full] canonical Customer master..."
run_node "$SERVER_DIR/scripts/import-alumdoor-customer-local.mjs" "$RUN_DIR/customers.preflight.json"
run_node "$SERVER_DIR/scripts/import-alumdoor-customer-local.mjs" "$RUN_DIR/customers.pass1.json" --apply
run_node "$SERVER_DIR/scripts/import-alumdoor-customer-local.mjs" "$RUN_DIR/customers.pass2.json" --apply --expect-idempotent

echo "[seed-full] canonical BOM + deferred BOM templates..."
STRICT_BOM="$RUN_DIR/bom.strict.json"
STRICT_AUDIT="$RUN_DIR/bom.strict.audit.json"
BOM_PAYLOAD="$RUN_DIR/bom.importable.json"
BOM_AUDIT="$RUN_DIR/bom.importable.audit.json"
set +e
run_node "$SERVER_DIR/scripts/build-alumdoor-canonical-bom-payload.mjs" "$SOURCE" "$ITEMS" "$STRICT_BOM" "$STRICT_AUDIT"
STRICT_STATUS=$?
set -e
if [[ ! -s "$STRICT_BOM" || ! -s "$STRICT_AUDIT" ]]; then
  echo "Strict BOM evidence builder produced no evidence (status=$STRICT_STATUS)." >&2
  exit 1
fi
run_node "$SERVER_DIR/scripts/build-alumdoor-canonical-bom-importable.mjs" "$SOURCE" "$ITEMS" "$STRICT_BOM" "$STRICT_AUDIT" "$BOM_PAYLOAD" "$BOM_AUDIT"
run_node "$SERVER_DIR/scripts/import-alumdoor-canonical-bom-local.mjs" "$BOM_PAYLOAD" "$RUN_DIR/bom.pass1.json"
run_node "$SERVER_DIR/scripts/import-alumdoor-canonical-bom-local.mjs" "$BOM_PAYLOAD" "$RUN_DIR/bom.pass2.json"
run_node "$SERVER_DIR/scripts/import-alumdoor-bom-template-local.mjs" "$BOM_PAYLOAD" "$RUN_DIR/bom-template.pass1.json"
run_node "$SERVER_DIR/scripts/import-alumdoor-bom-template-local.mjs" "$BOM_PAYLOAD" "$RUN_DIR/bom-template.pass2.json"

echo "[seed-full] canonical pricing..."
PRICING_SOURCE="$RUN_DIR/pricing-source.json"
PRICING_SOURCE_REPORT="$RUN_DIR/pricing-source.report.json"
PRICING_PAYLOAD="$RUN_DIR/pricing-payload.json"
PRICING_REPORT="$RUN_DIR/pricing-payload.report.json"
run_node "$SERVER_DIR/scripts/extract-alumdoor-pricing-source.mjs" "$PRICING_SOURCE" "$PRICING_SOURCE_REPORT"
run_node "$SERVER_DIR/scripts/build-alumdoor-pricing-payload.mjs" "$PRICING_SOURCE" "$ITEMS" "$PRICING_PAYLOAD" "$PRICING_REPORT"
run_node "$SERVER_DIR/scripts/validate-alumdoor-pricing-payload.mjs" "$PRICING_SOURCE" "$PRICING_PAYLOAD" "$PRICING_REPORT"
run_node "$SERVER_DIR/scripts/import-alumdoor-pricing-local.mjs" "$PRICING_PAYLOAD" "$RUN_DIR/pricing.pass1.preimage.json" --apply
run_node "$SERVER_DIR/scripts/import-alumdoor-pricing-local.mjs" "$PRICING_PAYLOAD" "$RUN_DIR/pricing.pass2.preimage.json" --apply --expect-idempotent

echo "[seed-full] current aluminium stock from repository workbook..."
run_node "$SERVER_DIR/scripts/import-aluminium.mjs" \
  --file "$ROOT_DIR/data/ton-nhom.xlsx" \
  --origin "$ORIGIN" \
  --admin "$ADMIN_USER" \
  --warehouse "Xưởng 1" \
  --reset \
  --apply

echo "[seed-full] local D1 summary..."
"${PNPM[@]}" --dir "$SERVER_DIR" exec wrangler d1 execute cloudforge-demo \
  --local \
  --config apps/tenant-worker/wrangler.jsonc \
  --command "SELECT doctype,COUNT(*) AS records FROM documents WHERE tenant_id='demo' AND doctype IN ('Item','Customer','Supplier','Bill of Materials','BOM Template','Price List','Item Price','Pricing Rule','Aluminium Lot','Purchase Receipt') GROUP BY doctype ORDER BY doctype;"

printf 'format=codespace-full-seed/v1\nrun_id=%s\nsha=%s\ncompleted_at=%s\n' \
  "$RUN_ID" "$(git -C "$ROOT_DIR" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "$ROOT_DIR/server/apps/tenant-worker/.wrangler/state/.forge-codespace-full-seed-v1"

echo "CODESPACE_FULL_DATA_SEED_PASS run_id=$RUN_ID evidence=$RUN_DIR"
