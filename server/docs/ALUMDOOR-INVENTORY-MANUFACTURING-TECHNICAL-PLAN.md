# Technical plan — Alumdoor Inventory, Manufacturing and Item Catalog

Status: **G2 Plan approved for Slice A implementation**

Date: **2026-07-31**

Branch: `feat/inventory-manufacturing-item-catalog-20260731`

Requirement: `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`

Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`

## 1. Current code evidence

### Existing strengths

- `server/apps-src/alumdoor-worker/src/index.ts` already validates Item identity, stock nature, measurement profile, active colours and UOM conversions.
- `server/packages/clouderp-erpnext/src/controllers.ts` already contains:
  - `BillOfMaterialsController`;
  - `WorkOrderController`;
  - `AdvancedStockEntryController` with `Manufacture` purpose;
  - exact cancellation from original stock postings;
  - manufacturing progress entries for consumption and output.
- `server/packages/clouderp-stock/src/tracking.ts` and `controllers.ts` already support batch/serial tracked stock and catch weight.
- `server/packages/document-kernel/src/d1-store.ts` writes document, stock, manufacturing and mutation receipt data in one D1 batch.
- `server/packages/clouderp-erpnext/src/alumdoor-inventory.ts` already provides Alumdoor-specific Cut Order, reservation and stock reconciliation controllers.

### Proven gaps

1. `BillOfMaterialsController` validates positive quantities and Item existence, but does not currently enforce:
   - finished/raw Item category and manufacturing flags;
   - BOM revision/effective interval;
   - row UOM and conversion to stock UOM;
   - `qty_basis` semantics from v2 metadata;
   - circular/duplicate active BOM prevention.
2. `WorkOrderController` copies only Item, required quantity and source warehouse into `required_items`; it does not snapshot BOM revision, row UOM/basis, dimensions, operations or checksum.
3. `AdvancedStockEntryController` enforces Work Order quantity caps, but generic rows do not carry canonical Alumdoor lot/dimension identity or warehouse-role validation.
4. `manufacturing_progress_entries` stores Work Order, kind, Item and quantity. It is insufficient for immutable BOM row attribution, physical lot consumption, scrap/offcut and production variance.
5. Two Alumdoor briefs coexist. Business changes must be made only in v2.0.34; v1 remains compatibility/reference.
6. PR #14 introduces migration `0030`. This branch must not allocate a migration number until it rebases after #14 or confirms the default migration head.

## 2. Invariants

1. All writes remain in DocumentKernel/Durable Object.
2. D1 migrations are append-only.
3. Stock quantity/value and physical lot/dimension projections commit atomically.
4. Browser-supplied identity hashes, balances and valuation are never authoritative.
5. Released Work Orders retain immutable BOM snapshot and checksum.
6. Cancellation reverses original rows and values; it does not recalculate from current Item/BOM metadata.
7. No negative stock for normal production flows.
8. No production deployment, tenant mutation, secret change or FIFO activation from this branch.
9. Raw live catalog exports never enter Git.
10. Migration numbering is assigned only after rebasing over PR #14/default head.

## 3. Delivery slices

## Slice A — Authoritative metadata, catalog audit and server validators

### Files expected to change

- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-BRD.md`
- `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-TECHNICAL-PLAN.md`
- `server/briefs/alumdoor-v2.json`
- `server/apps-src/alumdoor-worker/src/index.ts`
- `server/scripts/audit-alumdoor-catalog.mjs` new
- `server/scripts/alumdoor-catalog-audit-planner.mjs` new
- `server/tests/alumdoor-catalog-audit.test.mjs` new
- existing Alumdoor worker tests or a focused new validator test file
- `server/package.json`

### Implementation

1. Declare v2.0.34 as authoritative in documentation and audit output. Do not duplicate changes into v1.
2. Build a pure audit planner that accepts sanitized arrays for:
   - Item;
   - Item Group;
   - UOM and conversion rows;
   - Measurement Profile;
   - Warehouse;
   - Bill of Materials and children;
   - Production Standard where present.
3. Return deterministic JSON:
   - source metadata version;
   - counts by entity/category;
   - error rows with stable code, severity, doctype, name and field;
   - summary counts;
   - SHA-256 checksum of canonical findings.
4. CLI modes:
   - `--input <fixture.json>` for local/staging-safe tests;
   - `--tenant <id>` remote read-only mode using existing Wrangler helpers;
   - `--output <path>`;
   - no write/repair mode in Slice A.
5. Refuse repository output paths for reports containing row-level live identifiers unless `--redacted` is used. Default remote report contains counts/checksum and anonymized row hashes.
6. Extend Item validator with BRD category invariants:
   - service cannot be stock/manufacturing/batch/reorder;
   - manufactured finished/semi-finished Item requires correct supply/manufacturing flags;
   - raw/consumable Item cannot be self-contradictory;
   - active transaction UOM requires valid positive conversion unless using the documented dynamic m2-to-set rule;
   - measurement profile mode and required dimensions remain consistent;
   - disabled references cannot be used for new configuration.
7. Tests cover each error code, deterministic checksum and no-mutation behavior.

### Slice A acceptance

- Fixture audit reports expected pass/error counts.
- Same logical input in different row/key order yields identical checksum.
- Unknown category is unresolved, never guessed from Item name.
- CLI has no execute/write switch.
- Item validator allowed/forbidden cases pass.
- `brief:check`, server unit tests, typecheck and build pass.

### Rollback

Revert code/docs commit. No migration or tenant data changes exist in Slice A.

## Slice B — Warehouse roles and canonical physical stock identity

### Files expected to change

- `server/briefs/alumdoor-v2.json`
- `server/packages/contracts/src/*` for physical stock identity/entry contracts
- `server/packages/clouderp-core/src/types.ts`
- `server/packages/clouderp-stock/src/types.ts`
- `server/packages/clouderp-stock/src/tracking.ts`
- `server/packages/clouderp-erpnext/src/alumdoor-inventory.ts`
- `server/packages/clouderp-erpnext/src/controllers.ts`
- `server/packages/document-kernel/src/store.ts`
- `server/packages/document-kernel/src/d1-store.ts`
- D1/in-memory test stores
- append-only migration `00NN_inventory_physical_identity.sql`, number assigned after rebase
- SQL, controller and concurrency tests

### Schema design

Add append-only projections for physical identity rather than overloading Item code:

- `warehouse_roles` or a validated role field in Warehouse metadata;
- `physical_stock_lots` current identity/header projection;
- `physical_stock_movements` append-only movement rows;
- original voucher type/name/revision/line key;
- Item, warehouse, measurement profile, colour, condition, dimensions, physical count, batch/serial/Aluminium Lot source and parent movement;
- revision/sequence claims for concurrent mutation.

The exact table names are finalized after inspecting the post-#14 migration head and existing Aluminium Lot persistence.

### Controller changes

1. Build canonical identity server-side from Item/profile and document row.
2. Require physical identity for dimensioned modes.
3. Validate warehouse role by purpose:
   - receipt → raw/general/quarantine;
   - issue/manufacture source → raw/WIP;
   - manufacture output → WIP/finished/quarantine;
   - scrap/offcut → scrap role.
4. Persist generic stock, physical movement, manufacturing progress and document in one batch.
5. Transfers preserve total stock value and source lineage.
6. Cancellation reads original voucher rows and appends exact reversal.
7. Coordinate mutation by physical lot/warehouse key where document aggregate serialization is insufficient.

### Tests

- receive, transfer, issue and reverse dimensioned material;
- wrong colour/size/lot rejection;
- stale revision and concurrent issue;
- no stock/physical projection drift after failure;
- quarantine and scrap role rules;
- batch/serial compatibility regression.

### Rollback

New path remains disabled by rollout state until backfill/audit/staging. Forward migration correction only; do not edit a deployed migration.

## Slice C — Versioned BOM and immutable Work Order snapshot

### Files expected to change

- `server/briefs/alumdoor-v2.json`
- `server/packages/clouderp-erpnext/src/types.ts`
- `server/packages/clouderp-erpnext/src/controllers.ts`
- `server/packages/contracts/src/*`
- `server/packages/document-kernel/src/store.ts`
- `server/packages/document-kernel/src/d1-store.ts`
- append-only migration `00NN_manufacturing_revision_and_progress.sql`
- reports/read models
- controller, SQL and worker/concurrency tests

### BOM contract

Add normalized fields:

- `revision` integer;
- `effective_from`, optional `effective_to`;
- `status` Draft/Active/Retired;
- `output_uom`, `output_conversion_factor`;
- row `uom`, `conversion_factor`, `qty_basis`;
- optional operation/routing fields;
- canonical snapshot/checksum.

Server validation:

- finished Item must be manufacturable;
- material Item must be stock/manufacturing eligible;
- valid UOM conversion to stock UOM;
- positive representable yield and row quantity;
- no circular BOM;
- no overlapping duplicate Active revision for same scope;
- no self-consumption unless explicitly supported by a later rework design.

### Work Order snapshot

At submit/release, store:

- BOM name/revision/effective timestamp;
- BOM checksum;
- exact normalized material rows including row identity, UOM, conversion, basis and required stock quantity;
- operations when enabled;
- warehouse-role expectations;
- output quantity and UOM.

Existing Work Orders remain readable. New behavior is rollout-gated until backfill rules are defined.

### Manufacturing progress

Extend append-only progress with:

- `bom_row_id`;
- physical lot/movement reference;
- issued, consumed, produced, scrap, offcut/by-product kinds;
- stock quantity/value and optional physical quantity/dimensions;
- operation/QC reference;
- reversal reference.

### Tests

- active revision selection by effective time;
- snapshot survives later BOM edit/retire;
- partial issue and partial manufacture;
- over-consumption/over-production rejection;
- two concurrent manufacture commands;
- cancellation exact reversal;
- circular/duplicate BOM rejection;
- dimensioned material and offcut lineage.

### Rollback

Feature flag/rollout remains disabled. Existing legacy Work Orders keep legacy behavior until backfilled or completed. Schema rollback is forward-only.

## Slice D — UI, reports, staging and release evidence

### Metadata/UI

- Make Item tabs category-aware while retaining all fields and server authority.
- Add computed completeness panel for Item and BOM.
- Add Work Order panels for snapshot, requirement, issued, produced, scrap/offcut and variance.
- Add physical lot selector for dimensioned Stock Entry rows.
- Add confirmation/reason surfaces for reconciliation, variance override and reversal.

### Reports

- stock available by physical identity;
- stock reserved/WIP;
- lot age and quarantine;
- Work Order shortage/progress;
- standard vs actual material/value variance;
- scrap/offcut and reusable balance.

### Browser journeys

1. Create valid/invalid Items by category.
2. Create and activate BOM revision.
3. Release Work Order.
4. Receive/transfer material.
5. Partial issue and manufacture.
6. Record scrap/offcut and QC failure.
7. Cancel/reverse allowed movement.
8. Verify reports and permissions on desktop/mobile.

## 4. Verification commands

Run narrow checks first, then repository gates.

```bash
pnpm --dir server run build
node --test server/tests/alumdoor-catalog-audit.test.mjs
pnpm --dir server run test:unit
pnpm --dir server run test:sql
pnpm --dir server run brief:check
pnpm --filter metaforge run lint
pnpm run test
pnpm run typecheck
pnpm run build
```

Where repository scripts differ, use the exact scripts defined in the current `package.json`. Record skipped commands with a concrete reason.

For migrations:

```bash
python3 server/scripts/verify-sql.py
python3 <new focused migration test>
```

For provider evidence:

- CI checks must be green for exact PR head SHA.
- Staging deployment must reach terminal success.
- Browser smoke must cover the changed journey.

## 5. Risk matrix

| Risk | Severity | Mitigation |
|---|---|---|
| Migration number conflicts with PR #14 | High | No migration commit before rebase; allocate number from current default head. |
| Live Item catalog contains inconsistent legacy rows | High | Dry-run audit first; rollout gate blocks activation on Critical/High errors. |
| Stock ledger and physical lot diverge | Critical | Single MutationPlan/D1 batch, invariant tests and reconciliation query. |
| BOM edits alter active production | Critical | Immutable Work Order snapshot/checksum. |
| Dimension variant explosion | High | Stable Item identity; dimensions on lot/movement. |
| Parallel issue/production exceeds stock/order | Critical | DO coordination, optimistic revision claims and concurrency tests. |
| Cancellation after downstream use | High | Dependency checks and exact append-only reversal order. |
| Worker validator latency | Medium | Reuse existing per-request master cache and batch reads. |
| Branch overlaps PR #14 | High | Rebase after merge and rerun full gates. |
| UI hides fields but API bypasses rules | High | Server-side validators and permission tests. |

## 6. Gate state

- G0 Scope: **complete**.
- G1 BRD: **approved by user delegation on 2026-07-31**.
- G2 Technical plan: **approved for Slice A**.
- G3 Local verification: **not started**.
- G4 Exact-head CI: **not started**.
- G5 Staging: **not started**.

Implementation begins with Slice A only. Slice B/C schema work requires a fresh plan check after PR #14 is merged/rebased and the migration head is known.
