# WS04 — Inventory + WMS

Status: **ACTIVE**  
Owner: **ChatGPT-WS04**  
Branch: `agent/ent-04-inventory-wms`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from branch head: `a936d8b1ca3846767be6e7cf0a0411cf9df7c257`  
Initial sync main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Checkpoint PR: **#307** (Draft)  
Current branch head is always read from exact GitHub state; do not churn this file for every commit.  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Exact compare at the prior checkpoint showed branch behind current `main` only by WS14 client/mobile/PWA plus status-doc commits; no server stock source overlap. Recheck exact compare before final verification rather than rebasing for cosmetic drift.

## Mission

Đưa stock RC lên inventory/WMS production-grade: valuation, backdate/repost, reservation/ATP, batch/serial, reconciliation và warehouse execution **without creating a second stock ledger**.

## Capability families

`W01-W02`.

## Critical invariants

- Canonical stock ledger remains the only quantity/value movement source.
- Fixed-point quantity/value semantics; no silent float authority.
- Backdate/repost must be traceable and reconcile finance.
- Correction/reversal never silently rewrites history.
- Warehouse must respect tenant/company/leaf/disabled scope before new posting.
- Tracked item identity must keep Item/Batch/Serial consistent.
- Reservation/planning/task layers never masquerade as physical stock movement.

## Phase A audit — maturity/evidence

### W01 Inventory Core

- `W01-005 Warehouse` / `W01-006 hierarchy`: **Wired** base evidence exists through Warehouse master/tree (`parent_warehouse`, `is_group`, company, stock_role). WS04 adds reusable leaf/company scope and path-cycle validation. WMS-specific zone/rack semantics remain Foundation.
- `W01-007 Stock Entry`: **Wired** canonical controller/ledger exists. WS04 wraps the complete manufacturing rollout chain so submitted stock movement cannot use missing/disabled/group/cross-company warehouses; cancel remains historical reversal without revalidating current masters.
- `W01-011 Stock Reconciliation`: **Wired**, submit is still the only posting path with four-eyes approval. WS04 fixes frozen book-state identity from child-row index to `(item_code,batch_no)`, freezes snapshot envelope, forbids deletion/duplicate identities and validates physical extras against scope.
- `W01-012 Stock Ledger`: **Wired/authoritative**. All new WMS primitives are planning/validation only and do not create competing stock state.
- `W01-013 FIFO` / `W01-014 Moving Average`: existing `clouderp-stock/valuation.ts` has explicit method normalization, fixed-point replay and batch-aware issue valuation. Existing `batch-valuation.test.mjs` is canonical evidence; do not call Hardened until repost/finance reconciliation closes.
- `W01-016 Batch` / `W01-017 Serial` / `W01-018 Expiry`: **Wired** tracked bundle path exists; outward expiry/availability already fail closed. WS04 adds submit-time Batch/Serial -> Item identity binding, including inward bundles while preserving new-serial auto-create behavior.
- `W01-019 Stock reservation`: **Wired in Alumdoor scope**. WS04 freezes reservation identity/source, prevents terminal-state creation and expired-reservation resurrection, validates active leaf warehouse and source-company scope, while partial quantity reduction still uses existing cumulative availability and writes no ledger. Automatic expiry mutation and evidence-backed `Đã dùng` transition remain open.
- `W01-020 ATP`: Alumdoor length-threshold availability is **Wired**; generic projected stock/ATP inputs are **Foundation** through `inventoryPosition` (on-hand + inbound - outbound - reserved), including signed on-hand when negative stock policy explicitly allows it.
- `W01-021 Landed cost`: **Foundation** exact stock-side proportional allocator added. Caller owns business basis (amount/qty/weight); allocation uses fixed-point integer basis, deterministic largest-remainder tie-break and exact total reconciliation. Source document/workflow remains WS03.
- `W01-022 Valuation adjustment`: existing Repost Item Valuation path is **Wired** for stock-side replay/adjustment; WS04 adds future-date and warehouse scope guards. Finance propagation still blocks Hardened.
- `W01-023 Backdated semantics` / `W01-024 Repost/replay`: **Foundation/Wired** replay primitives exist. WS04 now adds `auditOutgoingValuation()` to deterministically flag stale outgoing stock values after backdated receipts/adjustments without mutating Stock/GL. Affected-document orchestration + Stock/GL reconciliation still remain open; do not promote to Hardened.
- `W01-025 Returns`: **Wired** Stock Return exists; WS04 adds active leaf/company warehouse guard before submit plus targeted regression source.
- `W01-026 Aging`: **Foundation** pure fixed-point aging buckets added; policy bucket cutoffs are caller-defined.
- `W01-027 ABC`: **Foundation** deterministic cumulative value classifier added; A/B cutoffs are explicit policy inputs, zero-consumption items become C, dominant top item remains A.
- `W01-028 Slow/dead stock`: **Foundation** explicit slow/dead day thresholds added; no hidden constants.
- `W01-029 Reorder` / `W01-030 Safety stock` / `W01-031 Min/max`: **Foundation** projected-position + min/max replenishment planner added. Safety stock is diagnostic, not silently folded into trigger semantics.
- `W01-032 Inventory forecast`: **Missing in WS04 implementation**; semantic/planning forecast should coordinate with WS08 rather than invent a second forecasting layer here.
- Item/UOM conversion remains under audit; no new rounding contract is introduced without repo evidence.

### W02 WMS

Architecture decision from repo evidence: Warehouse tree remains physical location hierarchy and canonical stock movements stay Purchase Receipt / Stock Entry / Delivery Note. WMS layers plan/assign/validate; they do not own a second quantity ledger.

- `W02-001 Zone` / `W02-002 Bin/rack/location`: **Foundation** via existing Warehouse hierarchy plus `resolveWarehousePath`; path validates missing parent, cycle, disabled ancestor and company drift while preserving existing Alumdoor leaf-parent convention such as K36 -> K36-DT.
- `W02-003 Putaway rule`: **Foundation** `planPutaway` deterministically allocates to caller-approved leaf candidates by priority/capacity, ties by warehouse name for retry stability, rejects duplicate targets, and returns explicit unallocated quantity.
- `W02-004 Putaway task`: **Blocked on persistence/action contract**; generic proposal now exists at `docs/agents/workstreams/WS04-wms-task-contract.md` for WS09.
- `W02-005 Pick list`: **Foundation** `planPicking` allocates from already policy/permission-resolved candidates, never exceeds availability and reports shortage.
- `W02-006 Wave picking`: **Foundation** `buildPickWaves` partitions caller-grouped demand deterministically; route/zone/customer policy remains explicit upstream input.
- `W02-007 Packing`: **Foundation** `validatePacking` reconciles package contents against picked physical identities, allows split packages but forbids overpack/unpicked identities; serial remains exactly one unit.
- `W02-008 Replenishment`: **Foundation** min/max planner returns explicit suggested quantity without posting stock.
- `W02-009 Cycle count`: **Wired through Stock Reconciliation** rather than creating a second counting ledger/document.
- `W02-010 Barcode` / `W02-011 QR` / `W02-012 Mobile scanner`: **Foundation** `normalizeInventoryScan` canonicalizes scanner payload/symbology/timestamp and rejects control/oversized input. It deliberately does not guess entity type; permission-aware Item/Batch/Serial/Warehouse resolution remains server integration work. Existing `kho-vn` mobile/scan UX is secondary client evidence owned by WS14.
- `W02-013 Warehouse task assignment`: **Blocked on first-class persisted task/workflow**; WS04 task proposal defines the technical envelope without editing WS09 compiler/app registry.
- `W02-014 Inventory count freeze/snapshot`: **Wired in Stock Reconciliation** via immutable `snapshot_at` + frozen captured rows after WS04 integrity hardening.

## Implemented zones on branch

### Integrity / controller hardening

- `server/packages/clouderp-erpnext/src/stock-reconciliation-integrity.ts`
- `server/packages/clouderp-erpnext/src/stock-reservation-integrity.ts`
- `server/packages/clouderp-erpnext/src/stock-entry-integrity.ts`
- `server/packages/clouderp-erpnext/src/stock-return-integrity.ts`
- `server/packages/clouderp-erpnext/src/registry.ts`
- `server/packages/clouderp-stock/src/tracking-integrity.ts`
- `server/packages/clouderp-stock/src/repost-integrity.ts`
- `server/packages/clouderp-stock/src/warehouse-scope.ts`
- `server/packages/clouderp-stock/src/registry.ts`

### Inventory/WMS reusable primitives

- `server/packages/clouderp-stock/src/valuation-audit.ts`
- `server/packages/clouderp-stock/src/landed-cost.ts`
- `server/packages/clouderp-stock/src/warehouse-location.ts`
- `server/packages/clouderp-stock/src/inventory-policy.ts`
- `server/packages/clouderp-stock/src/inventory-analytics.ts`
- `server/packages/clouderp-stock/src/inventory-scan.ts`
- `server/packages/clouderp-stock/src/wms-putaway.ts`
- `server/packages/clouderp-stock/src/wms-picking.ts`
- `server/packages/clouderp-stock/src/wms-wave.ts`
- `server/packages/clouderp-stock/src/wms-packing.ts`
- `server/packages/clouderp-stock/src/index.ts`

### Contract proposal

- `docs/agents/workstreams/WS04-wms-task-contract.md` — generic WMS task persistence/action proposal for WS09; explicitly non-ledger.

### Regression source added

- `server/tests/stock-reconciliation-integrity.test.mjs`
- `server/tests/stock-reservation-integrity.test.mjs`
- `server/tests/stock-entry-warehouse-scope.test.mjs`
- `server/tests/stock-return-integrity.test.mjs`
- `server/tests/repost-item-valuation-integrity.test.mjs`
- `server/tests/tracked-stock-identity-integrity.test.mjs`
- `server/tests/valuation-audit.test.mjs`
- `server/tests/landed-cost-allocation.test.mjs`
- `server/tests/warehouse-location.test.mjs`
- `server/tests/inventory-planning.test.mjs`
- `server/tests/inventory-analytics.test.mjs`
- `server/tests/wms-packing.test.mjs`
- `server/tests/wms-wave-scan.test.mjs`

Two attempts to create a separate `wms-putaway.test.mjs` were blocked by tool safety classification; equivalent putaway tests were successfully added to `inventory-planning.test.mjs`.

## Validation status

Risk: **CRITICAL** for authoritative stock/controller changes; planning/analytics primitives are STANDARD but share the same PR.

- Initial reconciliation controller isolated shape/syntax check: **PASS** from earlier session slice.
- Initial reconciliation regression `node --check`: **PASS** from earlier slice.
- Full repository checkout attempt after later changes: **FAILED TO START / DNS** (`Could not resolve host: github.com`).
- Full TypeScript typecheck after all current changes: **NOT RUN**.
- Full server tests after all current changes: **NOT RUN**.
- Full build after all current changes: **NOT RUN**.
- New regression files after the initial slice are **SOURCE ADDED, NOT EXECUTED**.
- No migration added.
- No production mutation/deploy.

Do not convert NOT RUN into implied PASS.

## Legacy PR disposition

- `#267 Bulk Stock Reconciliation`: **CHERRY-PICK selectively**. Domain contract is useful; whole branch is not canonical because it changes WS00 `document-kernel` preview semantics and uses an Alumdoor-worker-specific handler. Current WS04 fixed the row-index integrity debt independently.
- `#295 Tiến Đạt FIFO delivery/payable`: **REUSE by WS03**, WS04 secondary review only; Purchase Allocation/Payment Ledger remain source of truth.
- `#278 VN Accounting integrity`: **REUSE by WS01**, WS04 dependency/review; consume finance settlement contract, do not fork it.
- `#208 Plastic ERP Production Run`: **REUSE by WS05**, secondary WS04 review; Production Run correctly writes no stock ledger.
- `#201 Actual manufacturing costing`: **REUSE by WS05/WS01 touchpoint**; material actuals consume Stock Ledger and valuation-delta posting remains intentionally open.

## Dependency requests

### DR-WS04-01 -> WS00 — side-effect-free kernel preview
- Need generic `DocumentKernel` plan/preview with execute-equivalent validation and zero mutation.
- Blocking: **yes** for canonical bulk Stock Reconciliation preview from #267.

### DR-WS04-02 -> WS09 — AppAction input-table/batch contract
- Need typed table rows, limits, preview/commit envelope, validation mapping and idempotent batch semantics.
- Blocking: **yes** before #267 becomes generic first-class bulk inventory UX.

### DR-WS04-03 -> WS01 — stock-to-GL repost/reconciliation contract
- Need authoritative account resolution + company/branch scope + immutable reversal/repost trace + propagation/reconciliation for affected Inventory/COGS/Stock Adjustment postings.
- Blocking: **yes** for `W01-024` Hardened.

### DR-WS04-04 -> WS09 (WS12 infra review if needed) — reservation expiry mutation
- Need audited scheduled domain action that transitions expired `Đang giữ` reservations through canonical mutation as system identity.
- Blocking: **yes** for `W01-019` Hardened, not current ATP correctness.

### DR-WS04-05 -> WS05/WS02 — evidence-backed reservation consumption
- Need Cut/Production/Sales fulfillment evidence to reduce/close matching reservation; `Đã dùng` must not be a free manual toggle.
- Blocking: **yes** for terminal reservation lifecycle Hardened.

### DR-WS04-06 -> WS02 — Delivery Note warehouse scope
- Consume `requireLeafWarehouse` before submitted outbound stock posting.
- Blocking: no for WS04; required cross-domain stock hardening.

### DR-WS04-07 -> WS03 — Purchase Receipt warehouse scope / putaway integration
- Consume WS04 warehouse scope helper; putaway must materialize as canonical Receipt/Stock Entry targets, not a WMS ledger.
- Landed-cost document/workflow should consume WS04 exact allocator while WS03 remains owner of business basis and source document.
- Blocking: no for planners/math; required inbound/landed-cost Wired state.

### DR-WS04-08 -> WS09 — first-class WMS task metadata/action persistence
- Need generic metadata contract for Putaway/Pick/Pack/Warehouse Task assignment and action state rather than a vertical generator.
- Proposal: `docs/agents/workstreams/WS04-wms-task-contract.md`.
- Blocking: **yes** for `W02-004` and `W02-013` Wired.

### DR-WS04-09 -> WS08 — inventory forecast semantic/planning integration
- Need permission-aware stock/demand semantic inputs and forecast evidence.
- Blocking: **yes** for `W01-032` beyond Missing/Foundation.

### DR-WS04-10 -> WS14 — mobile scanner UI integration
- Scanner UX passes normalized payload + actor context to permission-aware resolver/action; client is not authority.
- Blocking: no for stock package; required for `W02-012` Wired UX.

## Architecture decisions

1. **No second stock ledger.** WMS planning/task layers never own quantity/value authority.
2. **Warehouse hierarchy is reused.** Zone/rack/bin can be modeled through Warehouse path semantics before introducing another location store.
3. **Cycle Count reuses Stock Reconciliation.** No duplicate count document.
4. **Putaway/pick/pack/replenishment are plans.** Final movement remains canonical Receipt/Stock Entry/Delivery.
5. **Policy stays explicit.** FEFO/FIFO candidate order, wave group, aging buckets, ABC cutoffs, slow/dead thresholds, min/max and safety values are inputs/config, not hidden constants.
6. **Scanner is not authority.** Client scan normalization never bypasses server permission/master lookup.
7. **Landed-cost arithmetic is stock-owned; basis/workflow is procurement-owned.** Exact total reconciliation is reusable without WS04 owning the purchasing document.
8. **Backdate audit and repost mutation are separate.** WS04 can deterministically identify stale stock valuation lines; WS01 remains required for financial propagation/reconciliation.

## Next independent work

1. Complete Item/UOM master audit; do not invent new rounding semantics without evidence.
2. Audit remaining backdated replay orchestration seams that do not require WS01 mutation contract.
3. Recheck exact main/server overlap before final verification.
4. Once only shared dependencies remain, set status BLOCKED/REVIEW with precise unmet DoD evidence rather than pretending Hardened.

## Handoff

Workstream: **WS04**  
Status: **ACTIVE**  
PR: **#307 Draft checkpoint, not a stopping point**  
Migrations: **none**  
Full validation: **NOT RUN after current expansion due unavailable checkout/DNS**  
Production deploy: **none**  
Merge: **not authorized** for CRITICAL backend changes  
Current blockers are localized by DR; independent WS04 audit/implementation continues.
