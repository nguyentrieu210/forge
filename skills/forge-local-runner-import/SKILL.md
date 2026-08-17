---
name: forge-local-runner-import
description: Canonical execution contract for Forge/Alumdoor local data mutation on the Windows self-hosted runner.
---

# Forge Local Runner Import

Use this skill for every task that mutates the local Alumdoor/Forge D1 state, including bootstrap, Item, UOM, Reason Master, Layer 0, Real Purchase History, Pricing, BOM, and future real-data convergence imports.

## Runtime authority

- Canonical repo/runtime root: `C:\alumdoor`.
- Canonical mutation authority: exact clean `main` matching `origin/main`.
- Bootstrap may begin from a clean behind-main checkout, but source fast-forward happens only inside the guarded execution contract after lock + runtime quiescence + backup.
- Node: `>=22`.
- Package manager authority: root `package.json` must declare `pnpm@9.15.0`.
- Wrangler must be invoked from the installed repo binary, never through ad-hoc `npx` resolution.
- D1 mutation is local-only. `--remote` or a non-loopback Forge origin is forbidden.
- `FORGE_LOCAL_EXPECTED_SHA` must match the runtime SHA (or `origin/main` target for bootstrap) before mutation proceeds.

Do not create a hybrid execution model where code is executed from `${{ github.workspace }}` while state or business scripts come from `C:\alumdoor`.

## Canonical entry point

All supported mutations go through:

```text
node scripts\local-runner\run-local-import.mjs <adapter> [adapter options]
```

Current adapters:

- `bootstrap`
- `layer0`
- `uom`
- `item-master --source=C:\alumdoor\local-imports\...json`
- `reason-master`
- `real-purchase`
- `pricing`

`real-purchase` owns the complete historical purchase convergence lifecycle: canonical Item Gate A reconciliation, exact Supplier reconciliation, historical Draft Purchase Receipt plan, guarded local D1 execution, persisted-D1 verification evidence, and second-pass idempotency. Purchase child scripts may build plans, use the authenticated loopback API, and verify supplied evidence, but they must never spawn Wrangler themselves.

`pricing` owns deterministic real pricing extraction, canonical Item evidence rebuild, pricing payload reproducibility, authenticated zero-write preflight, guarded Price List / Item Price / Pricing Rule apply, persisted local-D1 evidence, and second-pass zero-mutation idempotency. The pricing importer remains API-based and may keep the managed local API running, but lock, backup, persisted-D1 audit, and execution status belong to the canonical runner.

Future BOM adapters must be added to this execution layer instead of placing backup, lock, Wrangler, source-sync, process-control, or mutation orchestration directly in workflow YAML.

## Required gate order

Every mutating adapter must preserve this order:

1. infrastructure preflight;
2. source/data/schema preflight;
3. acquire global local-D1 mutation lock;
4. if direct D1 access needs quiescence, enable managed maintenance and prove ports 8799/5173 quiet;
5. save and validate a non-empty local Wrangler-state backup;
6. mutate through the guarded adapter;
7. post-verify;
8. idempotency/no-op rerun where the importer contract supports it;
9. restore runtime in cleanup/finally;
10. release the lock.

A green workflow is not sufficient evidence if any required phase was skipped.

## Global concurrency and lock

Every GitHub workflow that may mutate the same local D1 uses:

```yaml
concurrency:
  group: alumdoor-local-d1-mutation
  cancel-in-progress: false
```

The process-level authority is `C:\alumdoor\local-locks\local-d1-mutation.lock`.

Lock evidence includes PID, hostname, timestamp, workflow/run identity, command and repo SHA. Do not delete an active, cross-host, malformed or unreadable lock to make a run pass. A lock may be reaped only when it belongs to the same host and its owner PID is proven dead; age alone is never proof that a lock is stale.

## Backup rule

`server/scripts/backup-local-state.mjs` must succeed after lock acquisition and, for direct D1 mutation, after the runtime is proven quiesced when quiescence is applicable. The wrapper validates `LOCAL_STATE_BACKUP_OK`, the manifest, and non-zero copied state before mutation starts.

Import-specific authenticated pre-images remain additive evidence; they do not replace the Wrangler-state backup. Multi-pass adapters may take an additional backup before replay, but no first mutation may occur without the canonical pre-image.

## Runtime/service rule

Direct D1 mutation that requires the worker/Desk to be stopped must use `server/scripts/alumdoor-runtime-maintenance.mjs` when managed services exist and prove ports 8799/5173 remain quiet before backup/mutation.

Do not use blind `taskkill`, `stop-local-dev.mjs`, generic Node kills, blind sleeps, or retries inside canonical mutation workflows. If unmanaged/unknown listeners remain where quiescence is required, print process ownership evidence and fail closed so the operator can stop the exact process explicitly.

Runtime maintenance must be removed in cleanup/finally even when import or verification fails.

API-based importers may keep the local API running but still require exact-SHA preflight, global mutation lock, validated local-state backup, post-verification and idempotency evidence. If an API runtime view can be stale after guarded direct-D1 work, the runner itself must capture persisted D1 evidence through the pinned local Wrangler invocation and pass that evidence to a pure verifier; the verifier must not invoke Wrangler independently.

## Failure classification

The execution layer emits separate statuses and a final outcome:

- `INFRA_STATUS`
- `DATA_STATUS`
- `IMPORT_STATUS`
- `VERIFY_STATUS`
- `EXECUTION_STATUS=INFRA_BLOCKED|DATA_BLOCKED|IMPORT_FAILED|VERIFY_FAILED|SUCCESS`

Failure evidence includes `failure_class`, `failure_stage`, canonical repo, working directory, local D1 state path, run ID and workflow/run identity.

Supported failure classes include `CHECKOUT`, `PATH`, `WORKING_DIRECTORY`, `DEPENDENCY`, `ENV`, `PERMISSION`, `FILE_LOCK`, `WRANGLER`, `D1_STATE`, `SOURCE_FILE`, `SCHEMA`, `DATA`, `IMPORTER`, `VERIFY`, `CONCURRENCY`, `TIMEOUT`, `STALE_WORKTREE`, `REMOTE_MUTATION_GUARD`, and `OTHER`.

Never relabel a dependency, permission, process-ownership, source mismatch, data blocker or verify failure as "runner flaky".

## Remote mutation guard

A local convergence task must not:

- add `--remote` to Wrangler;
- target a non-loopback API origin;
- mutate Cloudflare production as a fallback;
- delete/reset local state to recover from a failed preflight;
- bypass a failed gate with `continue-on-error`;
- mutate through raw Wrangler or `sync-local.bat --bootstrap` directly in a workflow;
- hide a raw Wrangler call inside a child importer or verifier.

## Workflow inventory rule

The contract workflow must enumerate every self-hosted workflow that can mutate the canonical local D1 and assert the shared concurrency group plus the canonical runner call. At the current convergence point the managed mutation inventory is seven workflows: bootstrap, Layer 0, Reason Master, Item Master, UOM reconciliation, Real Purchase History, and Pricing. Adding another mutating workflow requires updating the inventory and routing it through an adapter in the same change.

## Completion evidence

Before calling the execution layer STABLE, retain evidence for:

- exact `origin/main` SHA and runtime SHA;
- Windows runner/host evidence;
- canonical repo + working directory;
- local D1 path;
- lock acquisition/release;
- backup success;
- importer success;
- post-verification success;
- idempotent/no-op rerun for at least the real importer used as acceptance proof;
- local-only/remote guard;
- successful execution from the Windows self-hosted runner.

Until a new adapter has that acceptance proof, downstream convergence may prepare payloads and preflight reports but must not mutate local D1 through an ad-hoc path.
