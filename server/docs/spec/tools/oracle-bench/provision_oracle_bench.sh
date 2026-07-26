#!/usr/bin/env bash
# Provision a DISPOSABLE, pinned Frappe/ERPNext oracle bench for Gate 2E S4/S5.
#
# Runs on a Linux host (or WSL/Docker) with a WORKING Docker engine. It builds a
# custom frappe_docker image pinned to the two LOCKED versions, creates a throwaway
# site, installs ERPNext, then FAILS CLOSED unless the installed git commits equal
# source-lock.json. It never touches a production site and uses only synthetic data.
#
#   Frappe  v16.19.0  ba18090b141740e75d52aa97bfc525ff2f831f6c
#   ERPNext v16.20.0  ff46d20b259a2d65a7ded959df9f9a42991a3562
#
# NOTE: this script is AUTHORED but has NOT been executed in the CloudForge dev
# environment because no Docker engine is available there (see GATE2E_ORACLE_STATUS.md).
# After it succeeds, run:  CLOUDFORGE_ORACLE_SITE=oracle.localhost npm run oracle:o2c:bench
set -euo pipefail

FRAPPE_BRANCH="v16.19.0"
FRAPPE_SHA="ba18090b141740e75d52aa97bfc525ff2f831f6c"
ERPNEXT_SHA="ff46d20b259a2d65a7ded959df9f9a42991a3562"
SITE="${SITE:-oracle.localhost}"
IMAGE="cloudforge/oracle-erpnext:v16.20.0"
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v docker >/dev/null || { echo "docker not found on PATH"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker engine is not reachable — start it (this is the elevation step CloudForge CI cannot perform)"; exit 1; }

# 1. Build the custom image (frappe base pinned to v16.19.0 + erpnext v16.20.0 from apps.json).
if [ ! -d "$HERE/frappe_docker" ]; then
  git clone --depth 1 https://github.com/frappe/frappe_docker "$HERE/frappe_docker"
fi
APPS_JSON_BASE64="$(base64 -w0 "$HERE/apps.json")"
docker build \
  --build-arg FRAPPE_PATH=https://github.com/frappe/frappe \
  --build-arg FRAPPE_BRANCH="$FRAPPE_BRANCH" \
  --build-arg APPS_JSON_BASE64="$APPS_JSON_BASE64" \
  --tag "$IMAGE" \
  --file "$HERE/frappe_docker/images/layered/Containerfile" \
  "$HERE/frappe_docker"

# 2. Bring up mariadb + redis + the app, all disposable.
export IMAGE SITE
docker compose -p cloudforge-oracle -f "$HERE/compose.yml" up -d
echo "waiting for db..."; sleep 20

# 3. Create the throwaway site + install erpnext (synthetic admin password; disposable).
docker compose -p cloudforge-oracle exec -T backend bench new-site "$SITE" \
  --mariadb-root-password "$(cat "$HERE/.db_root" 2>/dev/null || echo 123)" \
  --admin-password oracle-admin --no-mariadb-socket --install-app erpnext

# 4. FAIL CLOSED unless the installed commits equal the lock.
FR="$(docker compose -p cloudforge-oracle exec -T backend git -C apps/frappe rev-parse HEAD)"
EN="$(docker compose -p cloudforge-oracle exec -T backend git -C apps/erpnext rev-parse HEAD)"
echo "frappe HEAD  = $FR (expect $FRAPPE_SHA)"
echo "erpnext HEAD = $EN (expect $ERPNEXT_SHA)"
[ "$FR" = "$FRAPPE_SHA" ]  || { echo "SOURCE_LOCK_MISMATCH frappe";  exit 2; }
[ "$EN" = "$ERPNEXT_SHA" ] || { echo "SOURCE_LOCK_MISMATCH erpnext"; exit 2; }

echo "ORACLE_BENCH_READY site=$SITE"
echo "Next: CLOUDFORGE_ORACLE_SITE=$SITE npm run oracle:o2c:bench"
