# Alumdoor Manufacturing Slice C kickoff

Date: 2026-07-31

Branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.

Stack base: `feat/inventory-physical-stock-slice-b-20260731` at `80175a96af0753dabf2d7ab92ce2f54c2ec1833b`.

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.

## Dependency contract

Slice C depends on Slice B for:

- canonical physical stock identity;
- append-only physical movement references;
- warehouse-role semantics;
- exact movement reversal;
- stale revision/concurrency claims.

Slice C must not create a competing lot, dimension, warehouse-role or physical movement model.

## Scope

1. Versioned BOM with revision, effective interval and Draft/Active/Retired status.
2. Output and row UOM/conversion plus quantity-basis semantics.
3. Canonical BOM snapshot and checksum.
4. Circular, overlapping-active and self-consumption guards.
5. Immutable Work Order snapshot at release.
6. Append-only manufacturing progress for issue, consume, produce, scrap, offcut/by-product and reversal.
7. Partial issue/manufacture and over-consumption/over-production guards.
8. Concurrency-safe manufacture commands.
9. Legacy Work Orders remain readable; rollout for new behavior remains disabled.

## First test seams

- Active revision selection at an effective timestamp.
- Snapshot remains unchanged after BOM edit/retire.
- Duplicate/overlapping active revision rejection.
- Circular BOM rejection.
- Partial issue and manufacture.
- Concurrent manufacture cannot exceed Work Order output.
- Exact cancellation reversal.
- Dimensioned input and offcut lineage use Slice B physical references.

## Migration coordination

- Default includes `0030_rbac_audit.sql`.
- PR #14 remains open/draft and currently owns `0031_purchase_allocation_control_metadata.sql`.
- This branch may not allocate a migration number before Slice B rechecks the post-#14/default migration head.
- Slice C migration must be ordered after the final Slice B migration.

## PR topology

- While Slice B is open, Slice C PR targets the Slice B branch.
- After Slice B merges, rebase Slice C onto current default and retarget the PR.
- Exact-head CI must be rerun after any rebase/retarget.

## Safety

- Draft planning branch only at kickoff.
- No production deployment.
- No tenant migration or mutation.
- No secret changes.
- FIFO remains disabled.
