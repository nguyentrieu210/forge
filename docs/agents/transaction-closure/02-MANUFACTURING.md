# AGENT 02 — MANUFACTURING CLOSURE

Status: IMPLEMENTED — CRITICAL VALIDATION PENDING
Branch: `rc/transaction-closure-02-manufacturing`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Exact current-main sync: `main@bbf79b541ede38222544774ec8b5393f8e1bb1fe` via internal worker sync PR `#494`
Risk: CRITICAL

## Mission

Close manufacturing as one auditable chain:

`BOM/version -> planning/MRP -> Work Order -> material issue/transfer -> Finished Goods -> scrap/rework -> actual cost/variance -> genealogy/correction`

Capability focus: `M01-001..M04-010`.

## Own

- manufacturing/BOM/MRP/shop-floor domain code and metadata;
- manufacturing cost integration seams owned by the manufacturing domain;
- manufacturing-specific regressions and traceability evidence.

## Do not own

- canonical stock ledger/valuation/repost authority: Agent 03;
- canonical GL/cross-ledger reporting: Agent 04;
- generic App Factory/compiler/shared runtime;
- Sales or Procurement lifecycle.

## Required audit

- BOM parent/children/version/effective-date behavior;
- routing/operation/workstation;
- Production Plan/MRP/material requirement;
- Work Order/Job Card and completion guards;
- issue/transfer for manufacture and FG receipt;
- scrap/rework/subcontracting if current code supports it;
- actual material/labor/machine/overhead cost path;
- valuation impact and manufacturing variance;
- lot genealogy raw -> FG -> customer seams;
- historical manufacturing/costing/Plastic ERP PRs: classify before reuse.

## Required evidence

- multi-level BOM + version selection;
- partial production and excess/short material scenarios;
- retry/idempotency and duplicate completion protection;
- cancellation/reversal/correction;
- backdated consumption/FG with canonical stock repost semantics;
- scrap/rework effects;
- stock balance/valuation reconciliation;
- finance impact consumes canonical GL contract;
- tenant/company/warehouse permission isolation.

## Dependency behavior

Any stock-ledger/valuation contract change belongs to Agent 03. Any GL/report/reconciliation contract change belongs to Agent 04. Raise Dependency Request; do not create a competing manufacturing ledger.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc file này, program artifacts, Forge Enterprise Completion Skill và exact repo state. Audit substantive manufacturing/costing PR lịch sử trước khi code. Giữ canonical stock/GL làm authority; manufacturing chỉ consume/integrate. Nếu dependency thuộc Agent 03/04 thì ghi Dependency Request và tiếp tục mọi phần độc lập. Chạy CRITICAL validation, cập nhật Completion Record, dừng trước merge/deploy.

# Completion record

## 1. Exact-state and historical audit

Worker branch was first converged to exact current `main@bbf79b541ede38222544774ec8b5393f8e1bb1fe` using PR `#494` with `main` as the PR head and this worker branch as the base. That operation changed the worker branch only; it did not mutate `main` or production.

Historical manufacturing work was classified before implementation:

- PR `#50` — **canonical merged ancestor / retain**. It established versioned/effective BOM, immutable Work Order snapshot, aggregate production guards, scrap/offcut value conservation, concurrency protection and exact reversal. No rewrite.
- PR `#404` — **canonical merged WS05 convergence / retain**. It established multi-level MRP, capacity planning, genealogy, bounded manufacturing cost evidence and Manufacturing/QMS APIs/tests on current main.
- PR `#201` — **selective concept reuse only / reject wholesale transplant**. The old Cost Sheet direction contained useful actual-cost concepts but also stale migration/UI assumptions and unfinished WIP/valuation posting semantics. Closure-02 does not revive a competing costing ledger.
- PR `#208` — **generic invariant extraction only**. Plastic-specific production concepts remain vertical; no Plastic ERP transaction model is imported into generic Manufacturing.

Current source confirms the canonical authority chain:

- `manufacturing-lifecycle.ts` owns BOM revision/effective selection and immutable Work Order BOM checksum/snapshot;
- `manufacturing-stock-guard.ts` owns aggregate BOM-row execution guards and scrap/offcut finished-value rebalancing while posting only through canonical Stock Entry/Stock Ledger;
- `manufacturing-work-order-guard.ts` keeps stock-UOM/fixed-point Work Order scaling;
- `manufacturing-rollout.ts` keeps legacy Work Orders executable without pretending historical snapshots existed;
- `manufacturing-genealogy.ts` is a read-only `WORK_ORDER_GROUP` projection over canonical Stock Entries and Stock Ledger;
- RC-024/025 Inventory keeps canonical stock valuation/repost authority, including exact reversal and backdated valuation audit;
- `gl_entries` remains Finance authority.

No shadow stock, WIP, manufacturing cost or GL ledger was introduced.

## 2. Closure implementation

### 2.1 Recovery-aware actual cost / variance reconciliation

A real reconciliation defect existed in `manufacturing-costing-read.ts`.

Manufacturing stock execution already removes positive scrap/offcut/recovery value from the finished-good value. The previous read model nevertheless calculated implied operation cost as:

`finished value - gross consumption value`

That double-penalized recovered material value in the cost decomposition. Closure-02 now reconciles the complete canonical stock-value equation:

`net material = gross consumption - recovery credit`

`accounted outputs = finished goods + recovery`

`implied operation = accounted outputs - gross consumption`

Then:

`material variance = net material - standard material`

`operation variance = implied operation - standard operation`

and the controller fails closed unless:

`material variance + operation variance == finished-good total variance`

This remains read-only evidence with `posting_status = NOT_POSTED`. No GL posting, Cost Sheet table or competing valuation authority was added.

New additive evidence fields:

- `actual_net_material_cost_minor`;
- `actual_accounted_output_value_minor`;
- `material_variance_minor`;
- `operation_variance_minor`.

The existing response contract remains backward compatible; no schema migration is required.

### 2.2 Transaction-closure regression

New focused regression: `server/tests/manufacturing-transaction-closure.test.mjs`.

It exercises one authoritative manufacturing chain rather than isolated utility functions:

1. versioned submitted BOM;
2. submitted Work Order snapshot;
3. raw-material receipt;
4. partial manufacture;
5. exact same submit-command retry;
6. second partial manufacture with short consumption;
7. excess material attempt rejected by the aggregate Work Order BOM guard;
8. cancellation of the second partial posting;
9. corrected replacement manufacture using the remaining material quantity;
10. canonical Stock Ledger and manufacturing-progress balances verified after every correction.

The retry uses the same `command_id`, actor and payload and asserts the same mutation receipt is returned with no duplicate stock or manufacturing progress.

A separate backdate scenario proves:

1. manufacture consumes a current FIFO layer;
2. a raw-material receipt is later entered with an earlier `posting_at`;
3. canonical `auditOutgoingValuation()` detects the now-stale manufacturing issue value;
4. Manufacturing does not invent its own repost path;
5. cancelling the Manufacture reverses exact Stock Ledger and manufacturing progress back to authoritative quantities.

Actual repost/revaluation remains Agent 03 authority.

## 3. Existing evidence retained

The closure regression composes with already-merged focused evidence instead of cloning it:

- `alumdoor-manufacturing-lifecycle.test.mjs`: effective BOM selection, immutable revision snapshot, split-line aggregate guard, Material Transfer reversal, scrap/offcut value conservation, concurrent Manufacture protection;
- `manufacturing-issue-line-key.test.mjs`: stable append-only issue progress identity + cancel;
- `manufacturing-output-uom.test.mjs`: stock-UOM quantity and operating-cost scaling;
- `manufacturing-mrp*.test.mjs`: multi-level planning/material requirement behavior;
- `manufacturing-capacity*.test.mjs`: routing/calendar/downtime capacity planning;
- `manufacturing-genealogy*.test.mjs`: canonical Stock Ledger genealogy and actor-visible scope;
- `manufacturing-costing-read.test.mjs`: exact BOM checksum + recovery-aware variance decomposition;
- `manufacturing-costing-api.test.mjs`: permission/tenant fail-closed API with recovery-aware evidence;
- RC-024/025 `valuation-audit.test.mjs`: FIFO/Moving Average/backdate/replay/batch semantics owned by Inventory.

## 4. Dependency Requests

### DR-CLOSURE02-01 — Agent 03 Inventory: execute canonical valuation repost after backdated manufacturing movement

Closure-02 proves Manufacturing Stock Entries participate in canonical stock history and that `auditOutgoingValuation()` detects a stale manufacturing issue after a backdated receipt. It intentionally does **not** add a manufacturing repost engine.

Needed from Agent 03 convergence:

- execute/reconcile the canonical repost when a backdated manufacturing movement changes downstream valuation;
- preserve exact voucher-revision reversal;
- expose reconciliation evidence that post-repost stock valuation remains authoritative.

Independent Manufacturing work is complete without duplicating this authority.

### DR-CLOSURE02-02 — Agent 04 Finance: posted actual operation cost / manufacturing variance / period accounting

Current actual material/FG evidence is authoritative because it is Stock Ledger derived. Actual labor/machine/overhead remains unposted evidence unless a canonical Finance contract supplies rates/posting semantics.

Needed from Agent 04:

- accounting-period behavior for manufacturing variance;
- canonical GL posting/reversal for labor/machine/overhead and variance where product policy requires it;
- Stock valuation ↔ GL reconciliation after repost/correction.

Closure-02 remains `NOT_POSTED` rather than inventing Finance policy.

### DR-CLOSURE02-03 — Business decision: rework operating model

Repository evidence still does not establish whether rework:

- consumes rejected finished goods as an input;
- references the original Work Order;
- requires a dedicated rework BOM/routing;
- or records only incremental materials/operations.

This is a genuine business decision and cannot be safely inferred. Closure-02 therefore retains the existing explicit `M03-009` gap rather than creating a fake universal rework flow.

### DR-CLOSURE02-04 — Procurement / Agent 05: subcontract manufacturing

Subcontracting requires supplier/procurement, material-send/return and valuation contracts. Manufacturing will consume those contracts when authoritative; it does not create a second procurement or stock path.

### DR-CLOSURE02-05 — Sales / trace boundary: finished good -> customer genealogy

Raw material -> finished-good genealogy is already canonical at `WORK_ORDER_GROUP` scope. Finished good -> customer requires the selling/delivery identity/permission boundary and should be joined there rather than by weakening Manufacturing permissions.

## 5. Migrations / authority blast radius

- SQL/D1 migration: **none**.
- New table/ledger: **none**.
- Stock authority change: **none**.
- GL authority change: **none**.
- Permission model widening: **none**.
- API change: additive read-only cost evidence fields only.

Risk remains **CRITICAL** because the changed read model reconciles stock value / manufacturing cost evidence and the regression covers backdate/correction semantics.

## 6. Validation gate

Required before PR is considered ready:

- server TypeScript build;
- focused Manufacturing transaction-closure regression;
- costing read/API regression;
- existing lifecycle/genealogy/MRP regressions;
- worker typecheck because the bounded API consumes the additive evidence contract;
- no migration replay required because there is no schema/migration delta;
- final exact diff audit must show no Stock/GL/shared-authority implementation change.

Validation execution evidence is recorded only after an exact-head GitHub run succeeds. No PASS is inferred from source existence.

## 7. Maturity statement

Do not promote all `M01..M04` to Hardened from this closure alone.

Eligible after validation:

- BOM version / Work Order snapshot / guarded production/correction: retain RC-candidate evidence;
- MRP/capacity/genealogy: retain their existing Wired/RC-by-path evidence;
- actual cost/variance: stronger **Wired read-only** reconciliation evidence;
- rework, subcontract, posted operation cost and FG->customer remain explicit dependencies.

## 8. Merge/deploy state

No merge to `main`, production deploy, migration, secret/DNS change or customer-data mutation is authorized by this worker. After CRITICAL validation this branch will stop at a PR for explicit non-UI merge approval.
