# RC4-A3 — Migration / Cutover Residual Closure

Date: 2026-08-04
Agent: RC4-A3
Branch: `agent/rc4-03-migration-cutover`
PR: **#599** (draft; non-UI CRITICAL merge gate)
Exact seed: `main@d84fbe2cc78f73e1459f52e5c9042de788678a62`
Risk: **CRITICAL**
Status: **READY**

## Mission

Close the post-RC3 migration/cutover release-confidence gaps without creating a second document, ledger, migration-receipt or production-release authority.

Primary RC3 blocker scope:

1. `IM02-006..IM02-009`: make retry/correction/incremental/reconciliation machinery executable through the canonical import boundary where ownership is local;
2. `T01-015` + `IM02-016`: close tenant/legacy cutover crash-window and reconciliation contracts that do not require production/provider mutation;
3. `O01-017` + migration execution: resolve migration-number governance safely without renaming potentially applied files blindly;
4. preserve the canonical `MutationCommand -> AggregateCoordinator/DocumentKernel -> mutation_receipts` authority;
5. record exact Dependency Requests for WS12 production restore/rollback evidence and WS01/WS04/WS06 domain opening/reconciliation providers.

## Exact findings

- WS13 durable migration core is already merged and includes `D1MigrationJournal`, `KernelMigrationApplyPort`, receipt recovery, correction data, incremental cursor/checkpoint and reconciliation primitives.
- Native `/api/v1/import/apply` on the RC4 seed executed its own row loop and did **not** compose the WS13 durable journal/orchestrator.
- Canonical `buildCommand()` already emits deterministic IDs such as `frappe-<40 hex>`, and the durable orchestrator correctly accepts non-empty command IDs; existing WS13 tests exercise that prefixed form. No command-ID format incompatibility exists. A3 only adds a bounded-length guard while retaining command IDs as opaque stable identifiers.
- The real crash-window gap was whole-run replay: an identical request retried after all rows committed and the run reached `applied/completed` was rejected by lifecycle state rather than returning durable outcomes.
- Exact seed contains duplicate historical `0110_*` migration prefixes. The D1 runner journals full filenames, so A3 does not rename potentially applied migrations without environment applied-state evidence.

## Implementation completed

### Canonical native import runtime

`server/apps/tenant-worker/src/migration-api.ts` now owns the bounded native import integration seam and `index.ts` intercepts `/api/v1/import/apply` before the legacy core row loop.

The route:

- keeps server-side `import` + `create` permission checks;
- keeps the executable/non-child DocType guard;
- keeps bounded CSV parsing and historical create/error behavior by default;
- allows explicit `duplicate_policy=skip|update` only with a stable `name` column;
- requires document-level `save` permission before an update command is prepared;
- builds a deterministic WS13 migration plan and journals it through `D1MigrationJournal`;
- resolves authoritative autoname through existing metadata services;
- prepares create/save commands through canonical `buildCommand()`;
- delegates execution back through the existing `/api/v1/commands` core route;
- returns durable `run_id`, row outcomes and receipt-recovery count.

No business document, GL, stock or payroll table is written directly by the A3 integration.

### Whole-run lost-response recovery

`executeDurableMigrationPlan()` now treats an identical run already in `applied` or `completed` as a replayable durable result. It reads final journal rows and returns the summary without calling the apply port again.

This complements the existing row-level kernel receipt recovery:

`reserve target -> persist command identity -> execute canonical command -> persist outcome`

and closes the outer HTTP response-loss window after the whole run has already committed.

### Journal regression correctness

`server/scripts/test-migration-run-journal.py` previously used connection-wide `rollback()` for expected constraint failures. That erased earlier uncommitted fixtures and made the journal regression fail independently of schema correctness.

A3 replaces those expected-failure probes with SQLite savepoints, preserving surrounding fixtures while still proving:

- applying rows require command identity;
- exact command identity is stored before recovery;
- migration rows can join canonical kernel receipts;
- checkpoints preserve exact source + adapter identity;
- one command cannot be claimed by two rows in one tenant;
- tenant isolation remains intact.

## Verification evidence

Validation workflow: **RC4 A3 Migration Cutover Validation**.

Successful exact code candidate:

- head: `5eb994873e1aa130d2af44c4e8bd309bed045189`;
- run: `30868034772`;
- job: `91863981407`;
- conclusion: **SUCCESS**.

PASS:

- locked dependency install;
- TypeScript emit with **zero errors intersecting A3 changed authority**;
- known repository-wide TypeScript debt remained outside A3 and was not relabeled PASS;
- focused migration regressions: **32/32 PASS**;
- new whole-run replay regression PASS;
- existing row-level lost-response/kernel-receipt recovery regressions PASS;
- migration journal SQLite replay PASS;
- repository SQL verifier PASS.

The first validation attempt also exposed an unrelated stale `migration-correction` expectation on the RC4 baseline (`name` is now present in the correction CSV). A3 did not patch that separate behavior; the changed-authority gate was narrowed instead of manufacturing a green global migration-suite claim.

## Capability impact

A3 materially strengthens the evidence for:

- `IM02-005` duplicate handling;
- `IM02-006` error correction/retry;
- `IM02-008` incremental migration runtime foundation;
- `IM02-009` post-migration reconciliation plumbing;
- `T01-015` / `IM02-016` cutover crash-window safety.

A3 does **not** self-promote these to Hardened. RC promotion still depends on the remaining domain/provider/cutover evidence below.

## Dependencies / no-stop

- **DR-RC4-A3-01 -> WS12:** non-production backup/restore/PITR/cutover drill and RTO/RPO evidence. Blocks RC cutover evidence, not source/runtime convergence.
- **DR-RC4-A3-02 -> WS01/WS04/WS06:** concrete opening-data providers and authoritative domain reconciliation metrics. Blocks domain opening RC, not generic import durability.
- **DR-RC4-A3-03 -> environment owner:** read-only `d1_migrations` inventory from every relevant environment before any historical migration filename remediation. Until then preserve full filenames and add future-only governance rather than unsafe renames.

## Merge / deploy boundary

This lane is non-UI CRITICAL.

- Implementation and exact-head validation are complete.
- PR #599 remains draft/READY.
- **No merge or deploy performed.**
- No production migration, restore/PITR, provider mutation, DNS/secret change or customer-data mutation occurred.
