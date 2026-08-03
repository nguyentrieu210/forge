# AGENT 03 — INVENTORY / WMS CLOSURE

Status: PR-READY / SHARED DEPENDENCIES REMAIN
Branch: `rc/transaction-closure-03-inventory-wms`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Worker seed merge-base: `main@a99af64b6509477238bc9dc848e226828531b599`
Latest audited current main: `bbf79b541ede38222544774ec8b5393f8e1bb1fe`
Risk: CRITICAL

## Mission

Close inventory operations on top of the existing authoritative stock ledger:

`reservation -> putaway/picking/packing/transfer -> batch/serial -> count freeze -> reconciliation -> valuation/backdate/repost -> correction`

Capability focus: `W01-001..W01-032`, `W02-001..W02-014`.

## Own

- inventory/WMS orchestration and stock-domain regressions;
- reservation, putaway, picking, packing, replenishment, cycle count and scanner seams;
- reconciliation/backdate/repost integration with current stock authority.

## Do not own

- GL/cross-ledger report authority: Agent 04;
- Sales/Manufacturing/Procurement lifecycle logic;
- duplicate stock balance or valuation ledgers;
- generic runtime/App Factory primitives.

## Required audit

- exact current stock ledger and valuation authority after RC-024/025;
- Stock Entry/Receipt/Issue/Transfer/Reconciliation;
- reservation/ATP;
- batch/serial/expiry;
- FIFO/moving-average/standard-cost support actually present;
- backdated stock ordering and repost/replay;
- zone/bin/putaway/pick/pack/replenishment/cycle count;
- count freeze/snapshot and correction/reversal;
- mobile/barcode/QR seams where backend contract exists;
- historical WMS/stock reconciliation PRs: classify before rewrite.

## Required evidence

- positive/negative/zero reconciliation variance;
- duplicate/retry idempotency;
- cancelled reconciliation and exact reversal;
- backdated transfer/receipt/issue with deterministic repost order;
- batch/serial integrity;
- reservation release/cancel behavior;
- cycle-count freeze consistency;
- stock valuation remains reconcilable to finance without changing GL authority;
- tenant/company/warehouse permissions.

## Dependency behavior

Finance/GL contract changes belong to Agent 04. Manufacturing/Sales/Procurement-specific lifecycle changes belong to their workers. Raise Dependency Request and continue generic stock/WMS work.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc handoff + program artifacts + Skill + exact branch/main + stock code/migrations/tests. Audit historical stock/WMS work trước khi viết mới. Một stock ledger duy nhất, không shadow stock/valuation. Tự xử lý kỹ thuật thông thường; dependency sang owner khác thì ghi request và tiếp tục. Verify CRITICAL gates, cập nhật Completion Record, dừng trước merge/deploy.

# Completion record

## 1. Exact-state / drift audit

Worker was seeded from the transaction-closure program lineage whose merge-base with `main` is `a99af64b6509477238bc9dc848e226828531b599`.

At final implementation audit, exact current `main` was `bbf79b541ede38222544774ec8b5393f8e1bb1fe`. The branch was behind only concurrent UI V3 / UI evidence changes after the merge-base. No current-main drift touched the stock/WMS server files changed by this worker, so a cosmetic rebase was not required to make an authority decision.

Repository truth consumed:

- Forge Enterprise Completion Skill;
- `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`;
- Enterprise North Star / Capability Map / Capability Status;
- current WS04 Inventory/WMS handoff and WMS task proposal;
- merged RC-024/025 inventory authority evidence;
- exact stock controllers, valuation/tracking/WMS primitives and focused regressions;
- substantive historical PRs in scope.

## 2. Authority decision

`stock_ledger_entries` remains the only authoritative quantity/value movement source. WMS planning is non-ledger orchestration only.

This worker did not add or change:

- a stock balance table;
- a valuation ledger;
- a reservation ledger;
- a WMS quantity ledger;
- GL authority;
- schema or migration;
- frontend-owned stock state.

Canonical final physical movement remains Purchase Receipt / Stock Entry / Delivery Note / Stock Reconciliation or another existing controller-backed stock document, according to the owning business flow.

## 3. Existing canonical foundations reused

### PR #307 — WS04 Inventory/WMS

Disposition: **REUSE CURRENT MAIN**.

Current main already contains:

- active leaf/company warehouse guards;
- frozen Stock Reconciliation snapshot identity by `(item_code,batch_no)`;
- reservation identity/lifecycle guards;
- tracked Batch/Serial identity guards;
- putaway, picking, wave and packing planners;
- replenishment/inventory-position primitives;
- barcode/QR/mobile scan normalization;
- valuation audit and WMS planning regressions.

No competing replacement was created.

### PR #441 — RC-024 / RC-025 Inventory Authority

Disposition: **REUSE CURRENT MAIN AS STOCK AUTHORITY**.

Current main already closes the stock-owned critical paths for:

- positive/negative/zero reconciliation posting;
- exact submitted-revision reconciliation reversal;
- Serial/Batch Bundle usage release on reversal;
- FIFO / Moving Average replay;
- backdated valuation audit;
- exact Repost Item Valuation Stock + GL reversal;
- balanced stock-owned valuation adjustment evidence.

Broader historical COGS/expense restatement remains Finance-owned and is not duplicated here.

### PR #267 — Bulk Stock Reconciliation

Disposition: **SELECTIVE CONTRACT REUSE; DO NOT CHERRY-PICK WHOLE PR**.

Useful semantics retained:

- one canonical Stock Reconciliation draft;
- frozen snapshot;
- `(item_code,batch_no)` row identity;
- full frozen-row coverage;
- OCC/idempotent commit intent;
- bulk editing never directly posts stock.

Current main now has the first-class AppAction repeatable `input_tables` server/tooling contract through WS09/#362, so that historical dependency is partly resolved. However, current main still has no canonical side-effect-free `DocumentKernel.preview()` equivalent for this transaction preview. The stale PR also carries worker/shared-kernel routing changes. Therefore it is not safe to merge wholesale.

## 4. Gap found and fixed in closure-03

### Serial picking atomicity

The existing `planPicking()` correctly required a serial candidate to expose exactly one stock unit, but it could still allocate `min(1 unit, requested)` when requested demand was fractional. That could turn one physical serial identity into a fractional pick plan even though canonical Serial/Batch Bundle posting requires one whole unit.

Fix in `server/packages/clouderp-stock/src/wms-picking.ts`:

- serial-tracked pick demand must be a whole number of stock units;
- a serial candidate remains exactly one unit;
- one pick plan cannot mix serial and non-serial physical candidate modes;
- deterministic sequence/tie behavior remains unchanged;
- planner still creates no stock ledger row and marks no reservation consumed.

This closes a real WMS integrity gap without changing stock authority.

## 5. Closure evidence added

### Reservation release/cancel behavior

Existing controller behavior is now explicitly regression-covered:

- release requires `released_reason`;
- released reservation becomes terminal;
- a released reservation cannot be silently resurrected to `Đang giữ`;
- partial active reservation reduction remains separate and non-ledger;
- expiry remains system-controlled under the existing contract.

Evidence: `server/tests/stock-reservation-integrity.test.mjs`.

### Backdated transfer replay

Existing valuation audit already covered backdated receipt, issue, reconciliation/return, FIFO, Moving Average, negative-valued stock and stream isolation. Closure-03 adds an explicit transfer-out ordering case proving a backdated outward transfer changes FIFO layers and causes a later stale issue to be detected deterministically.

Evidence: `server/tests/valuation-audit.test.mjs`.

### Serial pick planner

Added regression evidence for:

- fractional serial demand rejected;
- mixed serial/non-serial candidate mode rejected;
- two serial units allocated atomically in deterministic sequence.

Evidence: `server/tests/inventory-planning.test.mjs`.

## 6. Required flow evidence disposition

| Requirement | Evidence / disposition |
|---|---|
| reservation | current `StockReservationIntegrityController`; release/terminal regression expanded here |
| putaway | `planPutaway()` deterministic capacity/priority plan, non-ledger |
| picking | `planPicking()` plus closure-03 serial atomicity fix |
| packing | `validatePacking()` reconciles picked physical identities; serial one-unit rule |
| transfer | canonical Stock Entry remains posting authority; backdated transfer valuation regression added |
| batch/serial/expiry | canonical tracking + bundle identity/availability/expiry guards; no WMS shadow identity |
| count freeze | Stock Reconciliation immutable snapshot envelope + `(item,batch)` identity |
| positive/negative/zero count variance | existing authoritative Stock Reconciliation regressions |
| reconciliation reversal | exact submitted revision reversal + bundle usage release + SoD/period guard |
| FIFO / Moving Average | current valuation authority; both replay methods have source regression |
| Standard Cost | **not a canonical valuation method in current Forge stock authority**; current code accepts FIFO or Moving Average only. No unsupported third method was invented. |
| backdate/repost | stock-side deterministic replay/audit + Repost Item Valuation correction from RC-025 |
| tenant/company/warehouse | tenant-scoped readers plus active leaf/company warehouse guards |
| retry/idempotency | canonical DocumentKernel mutation receipt + atomic mutation-store boundary reused; no second retry layer |
| Stock -> GL | stock-owned repost equality/balance exists; full historical downstream financial restatement remains Agent 04 dependency |

## 7. Dependency Requests

### DR-C03-01 -> Agent 04 Finance / Daily Ledger

**Need:** canonical historical finance propagation/reconciliation when a backdated stock mutation changes valuation of already-posted outgoing stock, including affected COGS/expense/accounting dimensions and Daily Detailed Ledger reconciliation.

**Why owner:** GL/reconciliation/report authority belongs to Agent 04.

**Blocked scope:** Hardened claim for `W01-023 Backdated stock semantics` / `W01-024 Repost/replay` across Stock -> Finance.

**Can continue independently:** yes; stock replay/audit/repost stays stock-owned and complete within its boundary.

### DR-C03-02 -> Agent 01 Sales/O2C + Agent 05 Procurement/P2P

**Need:** consume WMS plans through canonical business documents and fulfillment evidence:

- outbound pick consumption -> Delivery/Stock canonical movement;
- inbound putaway targets -> Purchase Receipt/Stock Entry canonical movement;
- reservation `Đã dùng` must be backed by actual fulfillment/consumption evidence rather than a free manual state toggle.

**Why owner:** Sales/Procurement lifecycle semantics and source-document completion are owned by those workers.

**Blocked scope:** full reservation -> picking/putaway -> business-transaction completion chain.

**Can continue independently:** yes; planners remain valid non-ledger primitives.

### DR-C03-03 -> DocumentKernel / shared platform owner

**Need:** canonical side-effect-free transaction preview/plan contract with execute-equivalent validation and zero mutation.

**Why owner:** shared DocumentKernel contract is outside Agent 03 ownership.

**Blocked scope:** production-grade generic Bulk Stock Reconciliation preview from historical PR #267.

**Resolved part:** AppAction repeatable `input_tables` server/tooling contract is now on main via WS09/#362.

**Can continue independently:** yes; standard Stock Reconciliation flow is authoritative without bulk preview.

### DR-C03-04 -> WS09 BPM / App Factory

**Need:** persisted generic Warehouse Task action/state contract plus generic scheduled action seam for audited reservation expiry.

**Why owner:** first-class metadata/action persistence and scheduler/BPM contracts are shared App Factory concerns.

**Blocked scope:** `W02-004 Putaway task`, `W02-013 Warehouse task assignment`, automated reservation-expiry mutation.

**Can continue independently:** yes; putaway/pick/pack/replenishment planning primitives are already isolated and non-ledger.

### DR-C03-05 -> WS08 BI/Semantic

**Need:** permission-aware demand/supply semantic inputs and forecast evidence.

**Blocked scope:** `W01-032 Inventory forecast` beyond Missing/Foundation.

**Can continue independently:** yes; not required to preserve stock authority.

### DR-C03-06 -> WS14 Frontend/Mobile

**Need:** mobile scanner UX integration that sends normalized scan payload to a permission-aware server resolver/action.

**Blocked scope:** full `W02-012 Mobile scanner` end-to-end UX evidence.

**Can continue independently:** yes; server scan normalization remains non-authoritative and usable.

## 8. Validation truth

Risk: **CRITICAL** because this worker touches stock/WMS integrity behavior, even though the implementation delta is small.

Executed in this agent environment:

- isolated strict TypeScript compile of the changed `wms-picking` logic: **PASS**;
- isolated runtime assertions for serial fractional-demand rejection, mixed identity rejection and deterministic atomic allocation: **PASS**.

Audited source regressions on current main / worker branch:

- Stock Reconciliation freeze/variance/reversal/permission/period coverage: present;
- Stock Reservation lifecycle/warehouse coverage: present, closure release coverage added;
- Batch/Serial identity coverage: present;
- putaway/picking/replenishment coverage: present, serial-pick coverage expanded;
- packing/wave/scan coverage: present;
- FIFO / Moving Average / backdate/repost audit coverage: present, transfer case expanded;
- Stock -> GL exact Repost adjustment/reversal source coverage: present from RC-025.

Not executed as a full repository gate in this environment:

- full server TypeScript build: **NOT RUN**;
- full `npm run test:unit`: **NOT RUN**;
- full SQL suite: **NOT RUN**;
- full worker/integration/E2E suites: **NOT RUN**.

Reason: the execution container has no Forge checkout/dependency tree and direct GitHub clone access fails DNS resolution. No PASS is inferred from source files.

Migrations: **none** in closure-03.

Production mutation/deploy: **none**.

## 9. Capability/maturity recommendation

Do not promote the Inventory/WMS family to Hardened from this worker.

- `W01-011 Stock Reconciliation`: remains an **RC candidate** after exact full CRITICAL execution evidence;
- `W01-013 FIFO`, `W01-014 Moving Average`, `W01-022 Valuation adjustment`: remain **RC candidates** after exact full execution evidence;
- `W01-023/024`: remain dependency-blocked for a Hardened cross-ledger claim by DR-C03-01;
- `W01-019 Reservation`: current path is Wired in its implemented scope; automatic expiry and evidence-backed consumption remain dependencies;
- `W02-003/005/006/007/008`: planning primitives remain Foundation because completion persistence/business posting belongs to surrounding contracts;
- `W02-004` / `W02-013`: remain Missing until persisted Warehouse Task/action state exists;
- `W02-009` / `W02-014`: continue to reuse Stock Reconciliation instead of introducing a duplicate cycle-count ledger;
- `W01-032`: remains dependency-bound to semantic/forecast ownership.

## 10. Worker delta

Closure-03 implementation/evidence delta is intentionally narrow:

- `server/packages/clouderp-stock/src/wms-picking.ts`
- `server/tests/inventory-planning.test.mjs`
- `server/tests/stock-reservation-integrity.test.mjs`
- `server/tests/valuation-audit.test.mjs`
- this completion record.

No schema, migration, GL, business-source lifecycle, shared App Factory or UI runtime change belongs in this worker.

## 11. Merge/deploy disposition

**PR-ready. Stop before merge/deploy.**

This is non-UI / stock-domain work under the CRITICAL lane. Per Forge policy, opening the PR and recording evidence are autonomous; merge into `main` and any production deployment require explicit user approval.
