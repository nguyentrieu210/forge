# RC4-A3 — Migration / Cutover Residual Closure

Date: 2026-08-04
Agent: RC4-A3
Branch: `agent/rc4-03-migration-cutover`
Exact seed: `main@d84fbe2cc78f73e1459f52e5c9042de788678a62`
Risk: **CRITICAL**
Status: **RUNNING**

## Mission

Close the post-RC3 migration/cutover release-confidence gaps without creating a second document, ledger, migration-receipt or production-release authority.

Primary RC3 blocker scope:

1. `IM02-006..IM02-009`: make retry/correction/incremental/reconciliation machinery executable through the canonical import boundary where ownership is local;
2. `T01-015` + `IM02-016`: close tenant/legacy cutover crash-window and reconciliation contracts that do not require production/provider mutation;
3. `O01-017` + migration execution: resolve migration-number governance safely without renaming potentially applied files blindly;
4. preserve the canonical `MutationCommand -> AggregateCoordinator/DocumentKernel -> mutation_receipts` authority;
5. record exact Dependency Requests for WS12 production restore/rollback evidence and WS01/WS04/WS06 domain opening/reconciliation providers.

## Exact findings at start

- WS13 durable migration core is already merged and includes `D1MigrationJournal`, `KernelMigrationApplyPort`, receipt recovery, correction data, incremental cursor/checkpoint and reconciliation primitives.
- Native `/api/v1/import/apply` on the RC4 seed still executes its own row loop and does **not** compose the WS13 durable journal/orchestrator.
- `executeDurableMigrationPlan()` currently validates `command_id` as 64 lowercase hex, while Forge's canonical `buildCommand()` emits deterministic IDs such as `frappe-<40 hex>`. Existing WS13 durable tests already use the canonical prefixed form, so the current validation contract is internally inconsistent and blocks real wiring.
- Exact seed contains duplicate historical `0110_*` migration prefixes. The D1 runner journals full filenames, so A3 will not rename potentially applied migrations without environment applied-state evidence.

## Implementation direction

- treat canonical command IDs as opaque non-empty stable IDs; continue requiring SHA-256 payload hashes;
- add whole-run replay semantics so a lost HTTP response after an `applied/completed` run can return the durable result instead of failing lifecycle validation;
- intercept the existing native import apply route in the tenant-worker wrapper and execute through WS13 durable planning/journal + `KernelMigrationApplyPort` while delegating authoritative writes back to the existing core command endpoint;
- preserve import/create permission checks and add per-document save permission for explicit update policy;
- expose durable `run_id`, retry recovery count and row outcomes without weakening the existing default create/error behavior;
- add targeted regression for canonical prefixed command IDs and applied-run replay.

## Dependencies / no-stop

- **DR-RC4-A3-01 -> WS12:** non-production backup/restore/PITR/cutover drill and RTO/RPO evidence. Blocks RC cutover evidence, not source/runtime convergence.
- **DR-RC4-A3-02 -> WS01/WS04/WS06:** concrete opening-data providers and authoritative domain reconciliation metrics. Blocks domain opening RC, not generic import durability.
- **DR-RC4-A3-03 -> environment owner:** read-only `d1_migrations` inventory from every relevant environment before any historical migration filename remediation. Until then preserve full filenames and add future-only governance rather than unsafe renames.

## Merge / deploy boundary

This lane is non-UI CRITICAL.

- Implementation, tests, commits and PR are allowed.
- Stop before merge/deploy.
- No production migration, restore/PITR, provider mutation, DNS/secret change or customer-data mutation without explicit user approval.
