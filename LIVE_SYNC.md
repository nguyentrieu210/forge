# Forge Live Sync

`agent-live` is the direct edit branch for the Alumdoor workstation.

## Contract

Code flow is deliberately only:

`GitHub agent-live -> C:\alumdoor -> existing dev watchers`

Live sync does **not** run GitHub Actions, bootstrap, tests, builds, D1 mutations, backups, service stop/start, port checks, or imports. Backend Wrangler dev and Desk Vite already watch the working tree and consume changed files themselves.

`C:\alumdoor` is treated as a runtime mirror while live sync is enabled. When a new remote commit arrives, tracked local changes are recorded under `C:\ForgeServices\Alumdoor\live-sync-backups` and the checkout is reset to the exact `origin/agent-live` commit. Untracked/ignored runtime state is never cleaned.

Dependency installation is the only automatic side effect beyond Git source update, and runs only when a package manifest, workspace definition, or `pnpm-lock.yaml` changes.

Normal `agent-live` commits should include `[skip ci]` in the commit message. GitHub Actions is not part of this live path.

## One-time installation

The installer preserves a dirty worktree before switching branches, so the safest first activation is a single PowerShell command that downloads and runs the installer from `agent-live`:

```powershell
$p = Join-Path $env:TEMP 'install-forge-live-sync.ps1'; Invoke-WebRequest 'https://raw.githubusercontent.com/nguyentrieu210/forge/agent-live/scripts/live-sync/install-forge-live-sync.ps1' -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

After installation, remote edits to `agent-live` are polled every two seconds and applied directly to `C:\alumdoor`.

## Explicit data mutation

Code sync never imports data automatically. When a real local mutation is explicitly required, use:

```bat
forge-live apply pricing
forge-live apply bom
forge-live apply customer
```

The same wrapper also accepts the existing guarded domains: `reason-master`, `item-master`, `uom`, `layer0`, and `real-purchase`.

`forge-live apply` temporarily pauses live sync and presents the exact live commit to the existing guarded importer as a local-only `main` authority. The existing lock, backup, local-only guard, verification, and idempotency contracts remain in force. The true GitHub origin and `agent-live` branch are restored afterward and live sync resumes.

Useful local commands:

```bat
forge-live status
forge-live once
forge-live stop
forge-live start
forge-live apply pricing
```
