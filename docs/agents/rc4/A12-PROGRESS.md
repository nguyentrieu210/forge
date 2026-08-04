# RC4-A12 — Inventory / WMS Progress

Status: IMPLEMENTED INDEPENDENT SLICE — PR VALIDATION REQUIRED  
Branch: `agent/rc4-12-inventory-wms`  
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **CRITICAL**  
Date: 2026-08-04

## 1. Exact-state / authority audit

A12 starts from exact RC4 baseline `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33` and preserves the current authority model:

- `stock_ledger_entries` remains the only authoritative quantity/value movement source;
- canonical Purchase Receipt / Stock Entry / Delivery / Stock Reconciliation remain physical movement sources according to their owning flows;
- `Repost Item Valuation` remains the stock-owned valuation correction/reversal primitive already present on main;
- WMS planning remains non-ledger orchestration;
- no shadow stock balance, valuation ledger, reservation ledger or WMS quantity ledger is introduced;
- Finance owns historical downstream accounting propagation/reconciliation;
- App Factory / kernel owns shared persisted action/task/runtime contracts.

Current transaction-closure evidence already covers reservation lifecycle guards, tracked batch/serial identity, deterministic putaway/picking/wave/packing planners, cycle-count freeze through canonical Stock Reconciliation, FIFO/Moving Average valuation replay/audit, exact valuation repost reversal and stock-side Stock↔GL equality.

A12 does not rebuild those paths. It focuses on residuals that remain after the transaction-closure branch.

## 2. Independent A12 slice completed

### 2.1 Permission-aware server inventory scan resolution

Added:

- `server/packages/clouderp-stock/src/inventory-scan-resolution.ts`
- `server/apps/tenant-worker/src/inventory-scan-api.ts`
- `server/tests/inventory-scan-resolution.test.mjs`

The new server contract reuses canonical `normalizeInventoryScan()` and closes the previous backend-resolution gap without letting the client choose stock authority.

Behavior:

1. trusted tenant comes from the authenticated server context only;
2. client tenant selectors are rejected;
3. lookup is tenant-scoped over canonical `master_records` and excludes disabled records;
4. supported entity families are bounded to `Item`, `Batch`, `Serial No`, `Warehouse`;
5. exact name and known barcode/QR aliases are resolved server-side;
6. optional expected-doctype/company/warehouse values only narrow scope; they do not authorize access;
7. every candidate passes existing metadata permission checks before it may be returned;
8. inaccessible matches are filtered without being exposed as ambiguity detail;
9. ambiguous visible codes return `ambiguous`; the server never guesses an entity;
10. group warehouses are not returned as executable leaf targets;
11. candidate count is bounded to fail closed on pathological/ambiguous code sets;
12. response projects only operational identity fields and never returns a full master payload;
13. resolution writes no Stock Ledger, reservation or fulfillment state.

Native module route:

- `POST /api/v1/inventory/scan/resolve`

Frappe-compatible module route:

- `POST /api/method/metaforge.inventory.resolve_scan`

The route module is implemented but intentionally not mounted into the shared Tenant Worker wrapper in this branch; see `DR-A12-KERNEL-01`.

### 2.2 Stock package export correction

Updated:

- `server/packages/clouderp-stock/src/index.ts`

The stock package now exports the new scanner-resolution contract and the already-existing `landed-cost.ts` allocator. This does not introduce a second landed-cost implementation; it exposes the canonical stock-owned allocator through the package public surface.

### 2.3 Exact-head RC4 validation workflow

Added:

- `.github/workflows/rc4-a12-inventory-wms.yml`

The workflow is PR-only, branch-scoped to `agent/rc4-12-inventory-wms`, has no deploy step and validates exact PR head by:

- installing locked dependencies;
- emitting server dist;
- failing if the A12 scanner source files introduce TypeScript errors while transparently recording unrelated existing full-server TypeScript debt;
- running scanner/WMS regressions;
- running valuation/repost/procurement-landed-cost regressions.

No test PASS is claimed until the workflow actually completes green on the PR head.

## 3. Landed-cost valuation audit — blocker found, unsafe shortcut rejected

Procurement already produces deterministic approved allocation evidence with exact source identity:

`purchase_receipt + row_id + item_code + warehouse + allocated_cost_minor`.

Inventory already has:

- exact fixed-point largest-remainder allocation math;
- canonical Stock Ledger;
- FIFO / Moving Average replay;
- zero-quantity valuation adjustment support;
- exact submitted-revision reversal in `Repost Item Valuation`.

However, current `StockLedgerEntry` does **not** carry canonical source-voucher/source-line identity. More importantly, current FIFO replay handles a zero-quantity value adjustment by distributing the adjustment across all open FIFO layers in the stream.

Therefore a naive landed-cost command such as:

`allocated receipt cost -> generic zero-qty Stock Ledger adjustment`

would be incorrect for FIFO when older layers remain open: cost intended for one Purchase Receipt line could be spread onto unrelated older receipt layers. If part of the targeted receipt has already been consumed, downstream issue/COGS restatement also has to propagate through Finance-owned accounting.

A12 deliberately does **not** implement this unsafe shortcut and does not encode source identity into `line_key` conventions.

Result:

- landed-cost allocation remains valid Foundation evidence;
- authoritative source-targeted stock-value application/reversal remains dependency-blocked;
- `W01-021 Landed cost` must not be promoted to RC/Hardened from this branch.

## 4. Capability evidence assessment

| Capability area | A12 disposition |
| --- | --- |
| `W02-010 Barcode` | backend server resolution slice implemented; exact-head validation still required |
| `W02-011 QR` | same backend resolver; exact-head validation still required |
| `W02-012 Mobile scanner` | server resolution contract implemented; end-to-end route mount + UI remains dependency-bound |
| `W02-004 Putaway task` | remains Missing until shared persisted Warehouse Task/action contract exists |
| `W02-013 Warehouse task assignment` | remains Missing until shared persisted Warehouse Task/action contract exists |
| `W02-009/014 Cycle count/freeze` | continue to reuse canonical Stock Reconciliation; no second count ledger created |
| `W01-019 Reservation` | existing Wired scope retained; evidence-backed consume + scheduled expiry remain dependencies |
| `W01-021 Landed cost` | remains Foundation; exact allocation exists but source-targeted valuation application is blocked |
| `W01-023/024 Backdate/repost` | stock-owned replay/repost remains implemented; Hardened cross-ledger claim blocked on Finance propagation |
| Stock↔GL reconciliation | existing stock-side balanced repost evidence retained; full downstream Finance reconciliation remains Finance-owned |

No capability is promoted to Hardened from branch-local source presence alone.

## 5. Dependency Requests

### DR-A12-KERNEL-01 -> A9 Architecture / Kernel — authenticated domain route mount

**Need:** mount the implemented inventory scanner route into the shared `server/apps/tenant-worker/src/index.ts` wrapper, or provide the canonical generic authenticated domain-route registration port.

**Why owner:** the wrapper is a shared authentication/routing hotspot used by multiple RC4 lanes. A12 owns inventory resolution semantics, not the cross-domain worker registration contract.

**A12-ready artifact:** `server/apps/tenant-worker/src/inventory-scan-api.ts`.

**Blocked scope:** executable production/native/Frappe scanner endpoint and full `W02-012` server integration.

**Can continue independently:** yes; resolver, permission policy, request parser and tests are isolated and complete in A12 scope.

### DR-A12-KERNEL-02 -> A9 Architecture / Kernel — source-targeted stock valuation identity

**Need:** one generic canonical way for stock valuation adjustment/replay to target an exact source voucher revision + source line/layer without relying on opaque `line_key` naming conventions or adding a shadow valuation ledger.

**Current blocker:** `StockLedgerEntry` exposes stock stream values but not a canonical source-voucher/source-line layer identity. Generic FIFO zero-qty adjustment spreads value over all open layers and therefore cannot safely represent receipt-specific landed cost.

**Blocked scope:** authoritative landed-cost stock-value application/reversal for `W01-021` and Procurement `P01-016` dependency `DR-C05-001`.

**Can continue independently:** allocation math and source-plan evidence remain valid.

### DR-A12-FIN-01 -> A4 Finance / Vietnam Statutory — historical valuation propagation

**Need:** canonical Finance propagation/reconciliation when source-targeted landed cost or a backdated stock mutation changes the valuation of quantities already consumed, including downstream COGS/expense/accounting dimensions and Daily Detailed Ledger reconciliation.

**Why owner:** GL and historical accounting restatement authority belongs to Finance.

**Blocked scope:** Hardened Stock↔GL claim for `W01-021`, `W01-023`, `W01-024` across historical consumption.

**Can continue independently:** stock-side replay/audit and exact repost reversal remain stock-owned.

### DR-A12-WS09-01 -> App Factory / shared platform owner — persisted Warehouse Task and scheduler seam

**Need:** persisted generic Warehouse Task action/state contract plus scheduled action seam for audited reservation expiry.

**Blocked scope:** `W02-004 Putaway task`, `W02-013 Warehouse task assignment`, automated reservation expiry.

**Rule:** Warehouse Task remains non-ledger orchestration; completion must create/drive canonical stock/business documents rather than mutate quantity directly.

### DR-A12-FLOW-01 -> A10/A11 Selling + Procurement — fulfillment-backed reservation consume

**Need:** reservation state `Đã dùng` must be backed by actual canonical outbound/inbound fulfillment evidence rather than a free manual state transition; putaway/picking outputs must flow through their owning Delivery/Purchase Receipt/Stock Entry paths.

**Blocked scope:** full reservation -> pick/putaway -> business transaction completion evidence.

### DR-A12-UI-01 -> A6 UI / Mobile — scanner UX integration

**Need:** mobile/barcode/QR UI to call the permission-aware server resolver after the shared route mount exists, then pass the resolved identity into canonical business actions.

**Blocked scope:** end-to-end `W02-012 Mobile scanner` UX evidence.

**Forbidden:** client-side entity guessing or client-owned stock movement.

## 6. Blast radius

- New stock/valuation ledger: **no**.
- Schema/migration: **no**.
- GL authority change: **no**.
- Existing stock movement semantics changed: **no**.
- New read-only scanner backend domain behavior: **yes**.
- Shared Tenant Worker route mount changed: **no; dependency recorded**.
- Production data mutation: **no**.
- Production deploy: **no**.

## 7. Validation truth

Local Forge checkout is unavailable in this execution environment because direct GitHub network access from the container fails DNS resolution. Therefore no local build/test PASS is claimed.

Exact-head validation is delegated to the PR-only workflow `.github/workflows/rc4-a12-inventory-wms.yml`. Before merge, A12 requires green focused scanner/WMS/valuation gates and the CRITICAL validation evidence required by the Forge completion skill.

## 8. Merge/deploy disposition

**STOP before merge/deploy.**

A12 changes backend behavior and is a CRITICAL Inventory/WMS lane. Open PR autonomously, collect exact-head evidence, then require explicit user approval before merge into `main` or any production deployment.
