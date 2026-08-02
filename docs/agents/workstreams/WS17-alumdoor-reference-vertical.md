# WS17 — Alumdoor Reference Vertical / Core Extraction Boundary

Status: **ACTIVE — vertical-owned slice near RC; shared extraction / live closure blocked**  
Owner: **GPT-5.6 Thinking / WS17**  
Branch: `agent/ent-17-alumdoor-reference-vertical`  
PR checkpoint: `#316`  
Product baseline: **Forge 0.2.0**

## Exact-state anchors

- Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`.
- Original stale WS17 head: `3cc7dc925da2f56700f1981ab4225b02a17c4082`.
- Initial exact-main audit: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`.
- Clean-transplant baseline after concurrent main advance: `31233237d9310e628174e06677eaef117242ee9a`.
- Latest audited main in this autonomous pass: `b63c9a7a07e63dd73f944f450618c0b92f10067c`.
- Concurrent main drift since clean transplant is WS14 PWA/mobile/frontend + status work and does not overlap WS17-owned server/brief/evidence files; PR remains mergeable. Exact-main sync is still mandatory at merge gate.

GitHub exact state wins this handoff if main advances again.

## Mission

Dùng Alumdoor làm reference vertical số 1 mà **không fork Forge**:

- giữ door/aluminium/supplier policy thực sự đặc thù trong app;
- consume Finance/Stock/Procurement/Manufacturing qua public/canonical contracts;
- phát hiện primitive tái sử dụng và giao đúng owner stream;
- cấm reverse leakage từ Alumdoor vào shared kernel/runtime;
- chứng minh app có thể install/version/operate như một package, không phải tenant fork.

## Ownership

WS17 owns:

- Alumdoor brief/sidecars/app-worker;
- door/slat/cutting/profile/barem/stamp policies;
- supplier-specific composition/read models;
- Alumdoor print/OCR mapping/warranty policy;
- vertical acceptance/evidence.

WS17 does **not** own:

- document kernel / D1 direct access;
- Stock Ledger / Payment Ledger / GL / purchase allocation tables;
- generic Procurement/WMS/MRP/Service controllers;
- shared React renderer / shell;
- app installer/release pipeline internals.

## Capability classification

| Seam | Class | Current maturity | Owner / action |
|---|---|---|---|
| Tiến Đạt policy/defaults/tolerance presentation | `VERTICAL` | Wired | WS17 |
| Supplier FIFO allocation quantity axis | `GENERIC-EXTRACT` | Wired with literal debt | WS03 + WS04, DR-WS17-01/02 |
| Catch-weight count/length/barem/actual kg | `GENERIC-EXTRACT` | Wired with literal debt | WS04, DR-WS17-02 |
| Supplier delivery dashboard composition | `VERTICAL` | **RC slice** | WS17 |
| Bulk aluminium receipt composition | `VERTICAL` consumer | **RC slice** | WS17, canonical Procurement/Receipt remains authority |
| Supplier settlement composition | `VERTICAL` consumer | **RC slice** | WS17, canonical Purchase Settlement remains authority |
| Warehouse Cash | already generic | RC consumer | WS01 owns `vn-accounting` |
| Door formula / leaf count / cut policy | `VERTICAL` | Wired | WS17 |
| Production Request / Work Order / BOM / capacity orchestration | `GENERIC-EXTRACT` | Wired | WS05, DR-WS17-06 |
| Warranty lifecycle | `GENERIC-EXTRACT` | Wired | WS07, DR-WS17-07 |
| OCR engine | `GENERIC-EXTRACT` | Wired | WS08, DR-WS17-08 |
| Rich AppAction/workspace/input tables | `GENERIC-EXTRACT` | WS09 server/tooling in progress; client debt | WS09 + WS14, DR-WS17-04/05 |
| App install/upgrade/version | `GENERIC-EXTRACT` platform capability | production install evidence exists | WS09/12/15; WS17 consumer acceptance |
| Golden Order cross-domain closure | vertical acceptance | verifier ready, live same-order evidence missing | WS17 coordinates owner streams |

## Public app boundary

Alumdoor Worker may:

- calculate vertical formula/policy;
- render/compose app metadata;
- call Forge callback APIs using caller identity;
- create/submit canonical documents through the platform API when that is the declared user action;
- read canonical reports/ledgers through public report/query contracts.

Alumdoor Worker must not:

- bind tenant D1 directly;
- mutate GL, Payment Ledger, Stock Ledger or purchase allocation tables directly;
- import shared server implementation packages;
- create a competing payable/stock/allocation source of truth;
- require shared runtime to know a new Alumdoor literal.

Regression: `server/tests/alumdoor-reference-boundary.test.mjs` recursively enforces the worker-side import/D1 boundary and locks ledger ownership in the reference contract.

## Shared reverse leakage found on main

Known `TEMP-COUPLING`, not edited by WS17:

1. `server/packages/clouderp-core/src/uom.ts`
   - `Nhôm cây/lá`, `qty_bar`, `Thành phẩm theo m2` literals in generic quantity resolution.
2. `server/packages/clouderp-erpnext/src/alumdoor-inventory.ts`
   - mixed vertical + generic stock/manufacturing implementation in shared ERPNext package.
3. `client/packages/views/src/action/FriendlyActionScreen.tsx`
   - recognizes Alumdoor action/method names directly.
4. `client/packages/views/src/form/ChildGrid.tsx`
   - Alumdoor/Purchase schema-specific field ordering.
5. `client/packages/views/src/form/ChildGridWithExtensions.tsx`
   - shared copy such as `Chi tiết đặt nhôm` / `Dòng đặt nhôm`.
6. `client/packages/shell/src/BrandLogo.tsx`
   - `alu.kairo.vn` / Alumdoor brand special case.

Rule: preserve production compatibility while owner streams extract; do not move the hard-code to a different shared file and call it generic.

## Implemented — supplier operations vertical slice

### 1. Supplier delivery dashboard

`server/apps-src/alumdoor-worker/src/purchase-supplier-dashboard.ts`

WS17 pins the exact validated vertical executable blob from legacy #295. It provides:

- PO/Receipt/Invoice pagination at 200/page;
- hard ceiling 5,000 and fail closed rather than silent truncation;
- bounded detail reads;
- canonical allocation timeline preference;
- fallback documents without fake settlement semantics;
- material + PO-line drilldown;
- ordered/received/remaining cây, mét, kg barem;
- actual kg + weight variance;
- receipt and price history;
- Payment Ledger / `Debt Summary` authoritative AP;
- explicit non-authoritative Purchase Invoice fallback.

Matching exact validated regression blob is also pinned from #295.

### 2. Bulk aluminium receipt

`server/apps-src/alumdoor-worker/src/bulk-purchase-fifo-receipt.ts`

WS17 pins the exact validated #295 executable blob:

- multi-line receipt preview;
- canonical FIFO preview per normalized line;
- one Purchase Receipt Draft per trip;
- duplicate/conflict protection by supplier invoice + fingerprint;
- user-selected `posting_at` normalized and included in fingerprint;
- same `posting_at` carried through synthetic preview receipts and created Purchase Receipt;
- company/currency split fails closed;
- no stock posting until canonical Purchase Receipt submit.

`server/briefs/alumdoor-v2.actions.json` exposes `posting_at:Datetime` so the source contract is actually usable from the action form.

Matching exact validated `tien-dat-purchase-bulk-fifo.test.mjs` blob is pinned from #295; `alumdoor-bulk-transaction-contract.test.mjs` also locks the canonical app package field.

### 3. Supplier settlement / correction

`server/apps-src/alumdoor-worker/src/purchase-supplier-settlement.ts`

- accepts `Đối soát` / `Close` and `Đảo đối soát` / `Reverse`;
- paginates submitted PO lookup, hard ceiling 5,000;
- resolves latest Open window for Close, latest Settled window for Reverse;
- forwards caller authorization + app + identity + signature;
- creates and submits canonical `Purchase Settlement`;
- requires reason;
- never implements tolerance/role/OCC/allocation mutation itself.

Canonical `PurchaseSettlementController` remains authority for role, tolerance, stale-version protection, Close/Reverse and ledger mutation.

`server/briefs/alumdoor-v2.actions.json` exposes generic scalar action `doi-soat-giao-hang-ncc` with `Purchase Order` permission boundary. No new shared React special case was added.

Regression: `server/tests/purchase-supplier-settlement.test.mjs`.

## App package lifecycle

Canonical merged brief via `readBriefSource()` is now **`alumdoor@2.2.2`**:

- actions sidecar: 2.2.2;
- integrations sidecar: 2.2.2 and applied last;
- dependency remains `vn-accounting@1.1.0`;
- Warehouse Cash DocTypes remain external and are not redefined locally.

Base `alumdoor-v2.json` remains 2.2.1 because its schema/fixtures were not changed; sidecar versioning is the repository's existing package-composition mechanism. Final canonical package version is locked by `alumdoor-reference-lifecycle.test.mjs` and `alumdoor-bulk-transaction-contract.test.mjs`.

Production is **not** claimed upgraded. Historical production evidence remains `alumdoor@2.2.1` at release `69b94ac1fe29a2ab39175e5442975a9197a0d39e` until an explicitly approved non-UI release.

## Golden Order read-only closure tool

Added:

- `server/scripts/lib/alumdoor-golden-order-readonly.mjs`;
- `server/scripts/verify-alumdoor-golden-order-readonly.mjs`;
- `server/tests/alumdoor-golden-order-readonly.test.mjs`.

The verifier accepts an existing Sales Order and only performs authenticated reads after login:

`Sales Order -> Production Request -> Work Order -> Delivery Note -> Stock Ledger -> Sales Invoice -> Payment Entry -> Accounts Receivable -> optional Warranty Claim`

It fails when any canonical authority link is absent. It does not create/update/submit/cancel/delete documents. `--require-warranty` raises the acceptance bar when the chosen Golden Order is meant to prove post-delivery service.

Live authenticated run on current production: **NOT RUN** in this session because the execution environment has no usable production credential/network path. The missing live proof remains evidence debt, not an implementation blocker for independent source work.

## Legacy PR #295

Whole PR disposition: **REJECT-AS-WHOLE / SELECTIVE-PORT ONLY**.

Every changed file is now classified in:

`docs/agents/workstreams/WS17-legacy-295-disposition.md`

Result:

- vertical dashboard/bulk blobs: exact selective port;
- settlement/entry: selective current-main-safe reimplementation;
- shared Procurement/Kernel/UI patches: rejected from WS17 and assigned to owner dependencies;
- no #295 file remains unclassified.

Historical exact-head validation reported by #295:

- build PASS;
- typecheck PASS;
- focused Tiến Đạt regressions PASS;
- server suite: 1,586 tests / 1,542 pass / 44 skipped / 0 fail;
- client suite: 149 files / 932 tests / 0 fail.

WS17 cites that run only for identical executable/test blobs, never as blanket current-head validation.

## Dependency Requests

### DR-WS17-01 -> WS03 Procurement — BLOCKING clean boundary
Generic allocation quantity axis independent from commercial/stock quantity. Shared Procurement must not stabilize `Nhôm cây/lá` / `qty_bar` literals as universal semantics. Review recorded on PR #305.

### DR-WS17-02 -> WS04 Inventory/WMS — BLOCKING clean boundary
Declarative Measurement Profile roles for primary stock quantity + count/length/weight/barem/actual evidence and reservation identity. Review recorded on PR #307.

### DR-WS17-03 -> WS00 Architecture/Kernel — BLOCKING legacy debt projection extraction
Generic supplier delivery/material-measure projection. Do not merge Aluminium-specific report columns into kernel.

### DR-WS17-04 -> WS09 App Factory — BLOCKING rich workspace extraction
First-class AppAction/input-table/workspace presentation metadata. PR #319 is the correct server/tooling direction; WS17 recorded review there.

### DR-WS17-05 -> WS14 Frontend Runtime — BLOCKING clean UI boundary
Consume WS09 metadata and remove Alumdoor action/schema/brand literals from shared views/shell. Compatibility debt was recorded on merged #328; current `NEXT_TASKS.md` also recognizes domain-specific child-grid metadata extraction.

### DR-WS17-06 -> WS05 Manufacturing/QMS — long-term BLOCKING vertical purity
Generic Production Request -> Work Order -> BOM/effective-date/capacity/idempotency orchestration. Review recorded on PR #327 without expanding that PR's bulk-BOM scope.

### DR-WS17-07 -> WS07 Service
Generic warranty lifecycle/correction; Alumdoor retains only policy/cause mapping.

### DR-WS17-08 -> WS08 AI
Generic permission-aware OCR/extraction; Alumdoor retains row mapping/prompt.

### DR-WS17-09 -> WS01 Finance
Stable published AP drilldown contract. Current WS17 read model already consumes `Debt Summary` and does not fabricate AP.

### DR-WS17-10 -> WS02 Revenue
Generic delivery readiness/idempotent batch contract; Alumdoor retains vertical presentation.

## Validation state

Current-session evidence:

- container GitHub checkout: **NOT RUN / BLOCKED** because `github.com` DNS cannot resolve;
- current-head GitHub combined development status: no checks published, consistent with build/deploy-only Actions policy;
- action sidecar JSON parse: PASS;
- earlier isolated dashboard TypeScript + focused behavior recreation: PASS;
- earlier Golden Order evaluator/verifier regression recreation: 5/5 PASS;
- earlier settlement focused recreation: 3/3 PASS;
- boundary/lifecycle source syntax checks: PASS in earlier slice;
- exact #295 dashboard/bulk executable + matching regression blobs inherit the historical validation listed above.

Full monorepo build/typecheck/test for the **current WS17 head** is not claimed.

## Skill / Definition of Done assessment

### WS17-owned supplier-operation slice

- usable input/query/correction flow: **yes**;
- server-side permission: **yes**, through app action permission + canonical document/controller checks;
- validation/invariants: **yes**;
- failure/idempotency: **yes**;
- correction/reversal: **yes**, canonical Purchase Settlement;
- audit/history: **yes**, canonical documents/allocation windows;
- report/query: **yes**, supplier dashboard + authoritative AP;
- no duplicate source of truth: **yes**;
- targeted regression: **yes**;
- current exact-head full suite: **NOT RUN**;
- production promotion: **not attempted**.

Result: **RC-quality source slice, not production Hardened**.

### WS17 reference-vertical boundary as a whole

Not complete/Hardened yet because:

1. DR-WS17-01..05 still leave vertical literals in shared core/runtime;
2. generic manufacturing extraction DR-WS17-06 is still outstanding;
3. one authenticated same-order Golden Order has not yet proven the full cross-domain chain on a current release;
4. current exact-head full repository validation is unavailable in this environment;
5. `alumdoor@2.2.2` has not been approved/merged/deployed.

Independent WS17 work should continue only where it does not require one of those owner contracts. When no independent source/evidence work remains, WS17 is legitimately blocked at cross-stream integration / merge gate rather than at a PR checkpoint.

## Merge / production boundary

PR #316 contains backend/read-model/business behavior. It is **not UI-only**.

Before merge:

1. sync/rebase exact current main;
2. re-check conflicts and owner-stream contracts;
3. run full relevant validation when an executable checkout exists, or preserve explicit NOT RUN evidence;
4. obtain explicit user approval for non-UI merge/deploy.

No production migration, customer-data mutation, DNS or secret change belongs in WS17.
