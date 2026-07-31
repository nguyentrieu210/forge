# Alumdoor Inventory/Manufacturing Slice B-C kickoff

Date: 2026-07-31

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.

## Branch topology

- Slice B: `feat/inventory-physical-stock-slice-b-20260731`, based on default commit `4d566a44fd1f04979e4e6de952fd81da9b28e93e`.
- Slice C: `feat/manufacturing-bom-workorder-slice-c-20260731`, stacked on the Slice B kickoff head.
- Slice C must target the Slice B branch until Slice B is merged, then rebase/retarget to default.

## Current gate

- G0 scope: PASS from the approved inventory/manufacturing BRD.
- G1 requirements: PASS.
- G2 technical plan: approved in `ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`, refreshed here for the current repository state.
- G3 implementation: not started for Slice B/C.

## Migration coordination

- Default already contains RBAC migration `0030_rbac_audit.sql` through merged PR #45.
- Purchase PR #14 is still open/draft and currently owns `0031_purchase_allocation_control_metadata.sql`.
- Neither Slice B nor Slice C may commit a migration number until PR #14 is merged/closed and the current default migration head is rechecked.
- Expected next slot is not reserved by this document.

## Slice B boundary

Deliver warehouse roles and canonical physical stock identity:

1. Server-built identity for dimensioned stock, colour, condition, lot/batch/serial and physical count.
2. Append-only physical stock movement projection with source voucher/revision/line identity.
3. Atomic commit with generic stock/document/manufacturing projections.
4. Warehouse-role validation for receipt, transfer, issue, manufacture, quarantine and scrap/offcut.
5. Exact cancellation from original movement rows.
6. Concurrency and stale-revision protection.
7. Rollout disabled until audit/backfill/staging gates pass.

Slice B must not implement BOM revision or Work Order snapshot semantics beyond contracts strictly required by physical stock identity.

## Slice C boundary

Deliver versioned BOM and immutable Work Order lifecycle on top of Slice B contracts:

1. BOM revision, effective interval, status, UOM conversion and quantity basis.
2. Canonical BOM checksum and circular/overlap validation.
3. Immutable Work Order snapshot at release.
4. Append-only issue/consume/produce/scrap/offcut progress tied to BOM row and physical movement.
5. Partial production, concurrency, over-consumption/over-production guards and exact reversal.
6. Legacy Work Orders remain readable; new behavior remains rollout-gated.

Slice C must not duplicate or redefine canonical physical identity owned by Slice B.

## First implementation checkpoint

Before runtime or schema edits:

1. Inspect current post-RBAC D1 store, Aluminium Lot persistence, generic stock tracking and manufacturing progress tables.
2. Freeze contract names and transaction boundaries.
3. Add focused failing tests for identity normalization and BOM snapshot selection.
4. Recheck PR #14/default migration head.
5. Allocate migrations only after that check.

## Safety

- No production deployment.
- No tenant migration or mutation.
- No Cloudflare secret changes.
- No FIFO activation.
- Do not commit `.env`, `server/work/`, `tmp/`, backups or generated reports.
