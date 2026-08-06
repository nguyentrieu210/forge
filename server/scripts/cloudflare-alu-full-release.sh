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

  if [ -n "$BRANCH" ] && [ "$BRANCH" != "main" ]; then
    fail "Refusing full ALU release from branch $BRANCH; expected main."
  fi

  if [ "${FORGE_CLOUDFLARE_FULL_RELEASE:-}" != "alu" ]; then
    fail "Refusing full ALU release: set build secret FORGE_CLOUDFLARE_FULL_RELEASE=alu on the production Workers Build project."
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

  # Workers Builds sets WRANGLER_CI_OVERRIDE_NAME to the Worker connected in the
  # dashboard (cloudforge-gateway). If it remains set, every nested wrangler deploy
  # is renamed to that Worker, including cloudforge-app-alumdoor. Each deploy below
  # already has an authoritative config/name, so disable the CI-level name override.
  unset WRANGLER_CI_OVERRIDE_NAME

  echo "Planning tenant migrations for $TENANT"
  (cd server && node scripts/migrate-tenant.mjs --tenant "$TENANT")

  echo "Migrating tenant $TENANT without backup (explicit operator choice)"
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
  (cd server && pnpm exec wrangler deploy \
    --config apps/gateway-worker/wrangler.jsonc \
    --strict)

  echo "Full ALU release complete: $TARGET_SHA"
}

case "$MODE" in
  build) build_release ;;
  deploy) deploy_release ;;
  *) fail "Usage: bash server/scripts/cloudflare-alu-full-release.sh <build|deploy>" ;;
esac
