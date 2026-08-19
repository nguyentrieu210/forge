#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL="${FORGE_GIT_SYNC_INTERVAL:-3}"
LOG_FILE="/tmp/forge-git-sync.log"

cd "$ROOT_DIR" || exit 1

echo "Forge GitHub auto-sync started." >> "$LOG_FILE"

while true; do
  BRANCH="$(git branch --show-current 2>/dev/null || true)"

  if [[ "$BRANCH" == "main" && -z "$(git status --porcelain 2>/dev/null)" ]]; then
    git fetch --quiet origin main >> "$LOG_FILE" 2>&1 || true

    LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
    REMOTE_SHA="$(git rev-parse origin/main 2>/dev/null || true)"
    BASE_SHA="$(git merge-base HEAD origin/main 2>/dev/null || true)"

    if [[ -n "$LOCAL_SHA" && -n "$REMOTE_SHA" && "$LOCAL_SHA" != "$REMOTE_SHA" && "$LOCAL_SHA" == "$BASE_SHA" ]]; then
      git merge --ff-only origin/main >> "$LOG_FILE" 2>&1 || true
    fi
  fi

  sleep "$INTERVAL"
done
