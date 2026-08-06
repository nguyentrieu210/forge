#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
TENANT="${TENANT:-alu}"
APP_WORKER="${APP_WORKER:-cloudforge-app-alumdoor}"
DISPATCH_NAMESPACE="${DISPATCH_NAMESPACE:-cloudforge-production}"
TARGET_SHA="${WORKERS_CI_COMMIT_SHA:-$(git rev-parse HEAD)}"
BRANCH="${WORKERS_CI_BRANCH:-}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_release_identity() {
  [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "Missing CLOUDFLARE_API_TOKEN/build token."
  [ -n "$TARGET_SHA" ] || fail "Missing release SHA."

  cd "$REPO_ROOT"
  git fetch origin main --quiet
  git cat-file -e "$TARGET_SHA^{commit}" || fail "Release SHA $TARGET_SHA is not a commit."
  git merge-base --is-ancestor "$TARGET_SHA" origin/main \
    || fail "Refusing full ALU release: $TARGET_SHA is not merged into main."

  local head_sha
  head_sha="$(git rev-parse HEAD)"
  [ "$head_sha" = "$TARGET_SHA" ] \
    || fail "Build checkout drift: HEAD=$head_sha WORKERS_CI_COMMIT_SHA=$TARGET_SHA."

  # Cloudflare full release must run from its dedicated release trigger/branch, never from
  # ordinary main pushes. This preserves the manual full-release boundary that the GitHub
  # workflow currently enforces with workflow_dispatch + confirm=alu.
  if [ "${FORGE_CLOUDFLARE_FULL_RELEASE:-}" != "alu" ]; then
    fail "Refusing full ALU release: set build secret FORGE_CLOUDFLARE_FULL_RELEASE=alu only on the dedicated full-release Workers Build project."
  fi

  export VITE_FORGE_RELEASE_SHA="$TARGET_SHA"
  export PATH="$REPO_ROOT/client/node_modules/.bin:$REPO_ROOT/server/node_modules/.bin:$PATH"
}

reconcile_frozen_install() {
  cd "$REPO_ROOT"
  mapfile -t dirty < <({
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | sort -u)

  for file in "${dirty[@]}"; do
    case "$file" in
      pnpm-lock.yaml)
        echo "Restoring exact candidate lockfile after successful frozen install."
        git restore --source=HEAD --staged --worktree -- pnpm-lock.yaml
        ;;
      *)
        fail "Dependency install changed unexpected source path: $file"
        ;;
    esac
  done
  [ -z "$(git status --porcelain --untracked-files=all)" ] \
    || fail "Worktree is not clean after dependency-install reconciliation."
}

guard_generated_release_files() {
  cd "$REPO_ROOT"
  mapfile -t dirty < <({
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | sort -u)

  for file in "${dirty[@]}"; do
    case "$file" in
      client/apps/kho/dist-mobile/*|server/apps/gateway-worker/public/*) ;;
      *) fail "Unexpected worktree change after exact build: $file" ;;
    esac
  done

  echo "Approved generated release paths (${#dirty[@]}):"
  printf '  %s\n' "${dirty[@]}"
}

build_release() {
  require_release_identity
  reconcile_frozen_install
  cd "$REPO_ROOT"

  echo "Building exact ALU candidate $TARGET_SHA"
  pnpm --filter cloudforge run build
  pnpm --filter metaforge run build
  node server/scripts/stage-client-bundle.mjs

  guard_generated_release_files
}

deploy_release() {
  require_release_identity
  guard_generated_release_files
  cd "$REPO_ROOT"

  echo "Planning tenant migrations for $TENANT"
  (cd server && node scripts/migrate-tenant.mjs --tenant "$TENANT")

  local backup_dir verification
  backup_dir="$(mktemp -d /tmp/forge-alu-backup.XXXXXX)"
  verification="$backup_dir/alu-backup-verification.json"
  trap 'rm -rf "$backup_dir"' EXIT

  echo "Creating and verifying pre-migration backup"
  node server/scripts/backup-tenant.mjs \
    --tenant "$TENANT" \
    --execute \
    --output-dir "$backup_dir"

  mapfile -t backups < <(find "$backup_dir" -maxdepth 1 -type f -name '*.sql' -print | sort)
  [ "${#backups[@]}" -eq 1 ] \
    || fail "Expected exactly one SQL backup, found ${#backups[@]}."

  node server/scripts/verify-tenant-backup.mjs \
    --tenant "$TENANT" \
    --file "${backups[0]}" \
    --output "$verification"

  echo "Backup verification evidence:"
  cat "$verification"

  echo "Migrating tenant $TENANT"
  (cd server && node scripts/migrate-tenant.mjs \
    --tenant "$TENANT" \
    --execute \
    --confirm "$TENANT" \
    --allow-dirty)

  echo "Deploying tenant Worker"
  (cd server && node scripts/deploy-tenant.mjs \
    --tenant "$TENANT" \
    --execute \
    --confirm "$TENANT" \
    --allow-dirty)

  echo "Deploying Alumdoor app Worker"
  (cd server && pnpm exec wrangler deploy \
    --config apps-src/alumdoor-worker/wrangler.jsonc \
    --name "$APP_WORKER" \
    --dispatch-namespace "$DISPATCH_NAMESPACE" \
    --strict)

  echo "Deploying Gateway"
  pnpm --dir server exec wrangler deploy --config apps/gateway-worker/wrangler.jsonc

  echo "Full ALU release complete: $TARGET_SHA"
}

case "$MODE" in
  build) build_release ;;
  deploy) deploy_release ;;
  *) fail "Usage: bash server/scripts/cloudflare-alu-full-release.sh <build|deploy>" ;;
esac
