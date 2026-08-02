# WS04 — Inventory + WMS

Status: **ACTIVE**  
Owner: **ChatGPT-WS04**  
Branch: `agent/ent-04-inventory-wms`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from branch head: `a936d8b1ca3846767be6e7cf0a0411cf9df7c257`  
Synced to main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Đưa stock RC lên inventory/WMS production-grade: valuation, backdate/repost, reservation, reconciliation, batch/serial và warehouse execution.

## Capability families

`W01-W02`.

## Own

stock domain/controllers/ledger projections, FIFO/Moving Average, stock correction/repost, reservation/ATP, batch/serial/expiry, reconciliation, warehouse hierarchy/bin/zone/putaway/pick/pack/replenishment/cycle count/barcode/QR/mobile contracts.

## Critical invariants

No negative/invalid movement theo policy; valuation deterministic; backdated correction không âm thầm sửa history; stock-finance reconciliation; tenant/warehouse permission; UOM precision; serial/batch uniqueness.

## Phase A audit — current evidence

### W01 Inventory Core

- `W01-011 Stock Reconciliation`: **Wired**, canonical controller already snapshots stock and only posts variance on submit with four-eyes approval. Audit found a CRITICAL integrity defect: captured book values were preserved by child-row index, so row reorder could associate another item's frozen book quantity/value. Current WS04 slice fixes this by matching frozen rows with `(item_code,batch_no)`, freezing snapshot envelope, forbidding deletion/duplicate identities and validating new physical rows against the frozen scope.
- `W01-012 Stock Ledger`: authoritative stock entries already live in the canonical mutation/ledger path; this stream must not create another ledger.
- `W01-013 FIFO` + `W01-014 Moving Average`: existing `clouderp-stock/valuation.ts` has explicit method normalization, fixed-point arithmetic, historical replay and batch-aware issue valuation. Existing `batch-valuation.test.mjs` covers batch-specific valuation and exact reversal of qty/weight/value.
- `W01-019 Stock reservation`: existing Alumdoor stock reservation controller is wired and explicitly writes no stock ledger; deeper generic ATP/reservation maturity still needs audit.
- `W01-023 Backdated stock semantics` + `W01-024 Repost/replay`: valuation replay exists and accepts posting cutoffs/adjustment rows, but production-grade repost orchestration, affected-document propagation and stock-finance reconciliation remain open. Do not call Hardened.
- Remaining W01 long-tail capabilities need per-ID audit before maturity promotion.

### W02 WMS

Repository search on Forge-owned code found no concrete implementation evidence for zone/bin/putaway/wave-pick/packing/replenishment/cycle-count/scanner task primitives; hits are predominantly vendored ERPNext benchmark code plus capability docs. Treat `W02-001..014` as **Missing/Foundation until exact Forge-owned evidence proves otherwise**.

## Current implementation slice

Files on WS04 branch:

- `server/packages/clouderp-erpnext/src/stock-reconciliation-integrity.ts`
  - preserves frozen snapshot row identity by `(item_code,batch_no)` instead of array index;
  - freezes `warehouse`, `scope`, `item_group`, `item_code`, `snapshot_at`, `counted_by` once a reconciliation snapshot exists;
  - rejects duplicate identity and aggregate+batch ambiguity;
  - prevents deletion of captured snapshot rows;
  - permits newly discovered physical rows only when they remain inside the frozen item/item-group scope;
  - delegates valuation/variance/posting to the existing canonical `StockReconciliationController`, so there is no second stock ledger.
- `server/packages/clouderp-erpnext/src/registry.ts`
  - registers the integrity-hardened reconciliation controller in place of the base controller.
- `server/tests/stock-reconciliation-integrity.test.mjs`
  - regression for row reorder/book-state identity;
  - frozen snapshot envelope;
  - row deletion/duplicate fail-closed;
  - extra physical row scope guard.

Risk: **CRITICAL** because stock reconciliation can alter authoritative inventory value/quantity.

Validation available in current environment:

- branch is exact-current-main based at audit start and currently ahead only with WS04 changes;
- isolated strict TypeScript shape/syntax check of the new controller against a stubbed base signature: PASS;
- `node --check` for the new regression test source: PASS;
- full repository build/typecheck/test was **not executed** because the available shell could not resolve GitHub to obtain the checkout/dependency tree. Do not treat isolated checks as full release evidence.

## Legacy PR disposition

- `#267 Bulk Stock Reconciliation`: **CHERRY-PICK selectively, not whole-branch reuse**. Domain flow is sound in principle: update the same canonical draft, preview before save, never submit/post from bulk, exact retry idempotency. The PR also identified the index-based snapshot defect now fixed in WS04. However it changes shared `server/packages/document-kernel/**` to add `DocumentKernel.preview()`, which belongs to WS00, and its handler is tied to the Alumdoor worker. Keep the stale PR unmerged; reuse domain tests/contract only after shared preview/input-table dependencies are owned correctly.
- `#295 Tiến Đạt FIFO delivery/payable`: **REUSE by primary WS03; WS04 secondary review only**. It keeps Purchase Allocation/Payment Ledger as source of truth and should not be transplanted into inventory ownership.
- `#278 VN Accounting integrity`: **REUSE by primary WS01; WS04 dependency/review only**. It proposes stock/COGS company-currency reconciliation and period/accounting policy changes; WS04 must consume the settled finance contract rather than fork it.
- `#208 Plastic ERP Production Run`: **REUSE by primary WS05; WS04 secondary review only**. Production Run explicitly writes no stock ledger and reconciles to canonical Work Order + Stock Entry Manufacture.
- `#201 Actual manufacturing costing`: **REUSE by primary WS05/WS01 touchpoint; WS04 secondary review only**. Material actuals consume Stock Ledger; valuation-delta posting is still deliberately unimplemented until an authoritative stock/GL mutation path exists.

## Dependency request DR-WS04-01

- Target stream: **WS00**
- Need: generic side-effect-free mutation planning/preview contract for `DocumentKernel`.
- Why generic: Stock Reconciliation bulk preview, AppAction/batch operations and future domain previews need the same permission + lifecycle + optimistic-version + controller validation without consuming idempotency state or writing document/ledger rows.
- Contract proposed: a kernel-owned `preview/plan` API returning the validated mutation plan/result while guaranteeing zero store mutation and zero ledger/outbox side effects; exact payload-hash and permission behavior must match execute path.
- Blocking: **yes** for canonicalizing the bulk reconciliation preview path from legacy PR `#267`.
- Temporary workaround: **none**. Do not copy a private preview implementation into WS04.

## Dependency request DR-WS04-02

- Target stream: **WS09**
- Need: first-class AppAction input-table/batch contract for pasted reconciliation rows.
- Why generic: the same table-input primitive is already needed for Stock/BOM and other bulk actions.
- Contract proposed: typed row schema, row limits, preview/commit semantics, validation error mapping and idempotent batch request envelope.
- Blocking: **no** for the current reconciliation integrity fix; **yes** before promoting a one-off Alumdoor bulk form into the generic WMS/App Factory contract.
- Temporary workaround: keep legacy `#267` handler as audit evidence only.

## Dependency request DR-WS04-03

- Target stream: **WS01**
- Need: settled stock-to-GL reconciliation and period/accounting-policy contract before WS04 implements valuation repost propagation.
- Why generic: inventory replay must reconcile to COGS/Inventory/Stock Adjustment without inventing a finance ledger inside stock.
- Contract proposed: authoritative account resolution + immutable reversal/repost trace + company/branch scope, consumed by stock-side replay.
- Blocking: **yes** for `W01-024 Repost/replay` Hardened target; not blocking the current reconciliation snapshot fix.
- Temporary workaround: none; valuation replay remains read/derive behavior only.

## Phase B priority

1. Finish Stock Reconciliation integrity review and exact full-checkout verification.
2. After DR-WS04-01, transplant only the valid bulk reconciliation domain slice from `#267`.
3. Backdated valuation replay + stock-finance reconciliation contract after WS01 contract settles.
4. Reservation/ATP hardening.
5. Cycle count/bin/location.
6. Putaway/picking/packing/replenishment.
7. Scanner/mobile integration contract with WS14.

## Handoff

Current status: **ACTIVE**.  
Current slice: reconciliation snapshot identity/integrity.  
Migrations: **none**.  
Production deploy: **none**.  
Merge: **not authorized** for this CRITICAL backend change.  
Next gate: exact repo typecheck/tests/build plus PR review; then continue bulk only after dependency contract ownership is respected.
