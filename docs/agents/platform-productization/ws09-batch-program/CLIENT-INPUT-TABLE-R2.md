# WS09 Client Input Table R2

Date: 2026-08-04
Branch: `platform/ws09-input-table-native-r2`
Replaces: stale delivery PR #542
Target: WS09 program control
Risk: STANDARD client metadata/presentation seam

## Purpose

Replay only the verified net client delta from #542 onto the current WS09 control baseline, avoiding stale UI ancestry while preserving current MetaForge presentation.

## Contract

- `AppAction.input_tables` is first-class client metadata.
- When first-class and matching legacy `BulkTransaction:<json>` fields coexist, first-class metadata wins.
- The client removes only matching compatibility fields at the presentation boundary, lowers the normalized table into the existing proven grid renderer and never mutates the server action.
- Legacy-only installed packages remain unchanged.
- Server permission, tenant, validation, BatchAction idempotency and domain authority remain authoritative.
- Defensive client bounds are capped at 500 rows; server bounds remain authoritative.

## Current-baseline reconciliation

R2 is created from the current WS09 control branch. It does not carry #542's old shell/UI ancestry and does not change V2/V3 presentation files.

Changed client authority is limited to:
- core AppAction input-table typing/export;
- views presentation adapter;
- standalone action and composed-screen public boundaries;
- views package exports/test script;
- targeted regression.

No backend, schema, migration, stock, BOM, ledger or production route is changed.

## Validation gate

Exact-head CI must:
1. install locked dependencies;
2. build core + visual + charts dependency packages;
3. build/test views input-table path;
4. build the runtime production bundle.

The old #542 failure is not accepted as evidence because its views test never executed. R2 must be green before convergence.
