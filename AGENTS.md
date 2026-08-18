# Forge Agent Live Contract

This branch is the live development authority for the Alumdoor workstation.

## Normal code work

- Work directly on `agent-live`.
- Do not open a PR just to make local code visible.
- Do not invoke GitHub Actions, Bootstrap, CI, deployment, D1 backup, D1 lock, service stop/start, or port verification for ordinary source edits.
- Commit the requested source change to `agent-live`; the local live-sync daemon mirrors it into `C:\alumdoor` and the existing backend/Vite dev watchers reload it.
- Include `[skip ci]` in normal `agent-live` commit messages so GitHub Actions does not become part of the edit loop.
- Keep the change complete: inspect the relevant code, edit all required files, and run only targeted checks that can be performed without the GitHub/local bootstrap pipeline.

## Data mutation

Source sync and data mutation are separate concerns. Never auto-run an importer because code changed.

When the user explicitly requests a real local data mutation, use `forge-live apply <adapter>` (or `node scripts/live-sync/forge-live-apply.mjs <adapter>`). Supported adapters are `reason-master`, `item-master`, `uom`, `layer0`, `real-purchase`, `pricing`, `bom`, and `customer`.

The live apply wrapper must preserve the existing guarded importer safety contract: local-only authority, D1 lock, validated backup, post-verify, idempotency, and cleanup. Do not weaken those guards merely because the source branch is `agent-live`.

## Main

`main` is a stable checkpoint, not the edit-to-local transport. Do not merge or retarget `agent-live` to `main` unless the user explicitly requests promotion/checkpointing.

## Local authority

While live sync is enabled, `C:\alumdoor` is a runtime mirror of `origin/agent-live`. Tracked local edits may be backed up and replaced on the next remote update; ignored/untracked runtime state is never cleaned by live sync.
