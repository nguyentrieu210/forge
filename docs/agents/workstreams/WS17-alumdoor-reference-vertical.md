# WS17 — Alumdoor Reference Vertical / Core Extraction Boundary

Status: **INTEGRATION / MERGE GATE — independent WS17 source complete at RC-quality**  
Owner: **GPT-5.6 Thinking / WS17**  
Branch: `agent/ent-17-alumdoor-reference-vertical`  
PR: `#316`  
Product baseline: **Forge 0.2.0**

## Exact state

WS17 was clean-transplanted onto exact `main@91a9c3d00720a26fd542e7c98833bb1817597836` after auditing the concurrent main delta. The pre-transplant 109-commit and subsequent 61-commit main advances touched WS14/kernel/integration-hub/SRE/status surfaces, not the 20 WS17-owned files.

At the clean-transplant checkpoint the branch was `ahead 1 / behind 0`, with one net WS17 commit over exact main. GitHub reported PR #316 mergeable. Exact GitHub state still wins this file if main advances again before merge.

## Mission outcome

Alumdoor is treated as a **reference vertical on Forge**, not a fork:

- vertical door/aluminium/supplier policy stays in Alumdoor;
- Procurement/Stock/Finance/Manufacturing authorities stay in their canonical packages/ledgers;
- shared reverse leakage is documented and assigned to owner streams;
- app-worker import/D1/ledger boundaries are regression-locked;
- supplier operations now form a thin vertical slice with input, query, idempotency, correction/reversal and evidence;
- app package source is versioned separately from historical production state;
- a read-only Golden Order verifier exists for cross-domain live closure.

## Ownership boundary

WS17 owns:

- Alumdoor brief/sidecars/app-worker;
- door/slat/cutting/profile/barem/stamp policies;
- supplier-specific composition/read models;
- vertical print/OCR/warranty mapping;
- reference-vertical acceptance/evidence.

WS17 does not own:

- D1/document kernel internals;
- Stock Ledger, GL, Payment Ledger or purchase allocation tables;
- generic Procurement/WMS/MRP/Service implementation;
- shared React renderer/shell;
- installer/release/SRE internals.

## Implemented WS17-owned slice

### Supplier delivery dashboard

`server/apps-src/alumdoor-worker/src/purchase-supplier-dashboard.ts`

- exact validated vertical blob selectively ported from legacy #295;
- 200/page submitted-document pagination;
- 5,000-document hard cap, fail closed;
- bounded detail reads;
- canonical allocation timeline preference;
- fallback does not fake settlement;
- material + PO-line drilldown;
- cây / mét / kg barem ordered, received, remaining;
- actual kg + variance;
- receipt and price history;
- AP from Payment Ledger / `Debt Summary`;
- Purchase Invoice outstanding only as marked non-authoritative fallback.

Matching dashboard regression is the exact historically validated #295 blob.

### Bulk aluminium receipt

`server/apps-src/alumdoor-worker/src/bulk-purchase-fifo-receipt.ts`

- exact validated #295 executable blob + matching regression;
- multi-line FIFO preview;
- one Purchase Receipt Draft;
- company/currency mixing fails closed;
- duplicate/conflict protection;
- user `posting_at` participates in fingerprint/idempotency and created receipt;
- no stock posting until canonical Purchase Receipt lifecycle.

`alumdoor-v2.actions.json` exposes `posting_at:Datetime`.

### Supplier settlement / correction

`server/apps-src/alumdoor-worker/src/purchase-supplier-settlement.ts`

- localized `Đối soát` / `Đảo đối soát` mapped to canonical Close / Reverse;
- 200/page PO scan, 5,000 cap;
- latest Open/Settled allocation window resolution;
- reason required;
- caller authorization/app/identity/signature forwarded;
- creates and submits canonical `Purchase Settlement`;
- does not reimplement role, tolerance, OCC or allocation mutation.

Canonical Purchase Settlement controller remains authority. Targeted settlement regression covers Close/Reverse/error/identity paths.

### App package lifecycle

Canonical composed source package is **`alumdoor@2.2.2`**:

- actions sidecar: `2.2.2`;
- integrations sidecar: `2.2.2` and applied last;
- dependency: `vn-accounting@1.1.0`;
- Warehouse Cash remains external Finance schema.

Historical production remains **`alumdoor@2.2.1`** at release `69b94ac1fe29a2ab39175e5442975a9197a0d39e`. WS17 does not claim 2.2.2 deployed.

### Golden Order read-only verifier

Added:

- `server/scripts/lib/alumdoor-golden-order-readonly.mjs`;
- `server/scripts/verify-alumdoor-golden-order-readonly.mjs`;
- `server/tests/alumdoor-golden-order-readonly.test.mjs`.

Authority chain:

`Sales Order -> Production Request -> Work Order -> sales_order_row_id -> Delivery Note -> Stock Ledger -> Sales Invoice -> Payment Entry -> Accounts Receivable -> optional Warranty Claim`

The evaluator requires row lineage rather than accepting document-name proximity. The live verifier only reads resources and read-only reports after login.

Current exact-source isolated regression: **7/7 PASS**.

Live authenticated same-order run: **NOT RUN**. No production credential/data mutation was attempted.

## Boundary regression / shared reverse leakage

`server/tests/alumdoor-reference-boundary.test.mjs` requires the Alumdoor worker to stay behind the public callback/caller-identity boundary and forbids direct D1/shared-package imports.

Known shared `TEMP-COUPLING`, not edited by WS17:

1. `server/packages/clouderp-core/src/uom.ts` — `Nhôm cây/lá`, `qty_bar`, `Thành phẩm theo m2` literals.
2. `server/packages/clouderp-erpnext/src/alumdoor-inventory.ts` — mixed generic/vertical stock-manufacturing code.
3. `client/packages/views/src/action/FriendlyActionScreen.tsx` — Alumdoor action/method recognition.
4. `client/packages/views/src/form/ChildGrid.tsx` — Alumdoor/Purchase schema ordering.
5. `client/packages/views/src/form/ChildGridWithExtensions.tsx` — `Chi tiết đặt nhôm` / `Dòng đặt nhôm` copy.
6. `client/packages/shell/src/BrandLogo.tsx` — Alumdoor hostname/brand special case.

Do not solve these by moving literals between shared files.

## Capability maturity

| Seam | Class | WS17 maturity | Remaining owner |
|---|---|---|---|
| Supplier delivery dashboard | vertical composition | **RC source** | WS17 |
| Bulk aluminium receipt | vertical consumer | **RC source** | WS17 + canonical Procurement |
| Supplier settlement/correction | vertical consumer | **RC source** | WS17 + canonical Procurement |
| Warehouse Cash consumption | generic external dependency | RC consumer | WS01 |
| Door formula/cut policy | vertical | Wired | WS17 |
| Procurement allocation axis | generic extract | compatibility debt | WS03/04 |
| Catch-weight/multi-measure | generic extract | compatibility debt | WS04 |
| Manufacturing orchestration | generic extract | Wired but mixed in app | WS05 |
| Warranty lifecycle | generic extract | Wired | WS07 |
| OCR extraction | generic extract | Wired vertical implementation | WS08 |
| Rich AppAction/workspace UI | generic extract | migration in progress | WS09/14 |
| Whole Golden Order | integration acceptance | verifier ready | live evidence + owner streams |

## Legacy #295

Whole PR disposition: **REJECT-AS-WHOLE / SELECTIVE-PORT ONLY**.

Canonical file-by-file disposition:

`docs/agents/workstreams/WS17-legacy-295-disposition.md`

No file remains unclassified.

Historical #295 exact-head evidence may only be cited for byte-identical blobs ported into WS17:

- build PASS;
- typecheck PASS;
- focused Tiến Đạt regressions PASS;
- server 1,586 tests / 1,542 pass / 44 skipped / 0 fail;
- client 149 files / 932 tests / 0 fail.

It is not blanket validation for current WS17 head.

## Dependency Requests

### Blocking clean reference boundary

- **DR-WS17-01 -> WS03**: generic allocation quantity axis, not `Nhôm cây/lá` / `qty_bar` core semantics. Review recorded on #305.
- **DR-WS17-02 -> WS04**: declarative Measurement Profile/catch-weight measure roles. Review recorded on #307.
- **DR-WS17-03 -> WS00**: generic supplier delivery/material-measure projection.
- **DR-WS17-04 -> WS09**: first-class AppAction/workspace/input-table metadata. Review recorded on #319.
- **DR-WS17-05 -> WS14**: metadata-driven shared renderer/child-grid/branding; compatibility debt recorded on #328.
- **DR-WS17-06 -> WS05**: generic Production Request/BOM/capacity/idempotency orchestration. Review recorded on #327.

### Additional whole-chain dependencies

- DR-WS17-07 -> WS07 generic warranty lifecycle.
- DR-WS17-08 -> WS08 generic OCR/extraction.
- DR-WS17-09 -> WS01 stable published AP read contract.
- DR-WS17-10 -> WS02 fulfillment/readiness contract.
- WS12/15 own release/rollback/live evidence infrastructure.

## Verification state

Current WS17 evidence:

- exact #295 dashboard/bulk executable + matching test blobs: historical full validation applies;
- Golden Order current isolated exact-source regression: **7/7 PASS**;
- action sidecar JSON parse: PASS;
- earlier focused settlement recreation: PASS;
- boundary/lifecycle source checks: PASS in WS17 session;
- current full monorepo build/typecheck/test: **NOT RUN** because the available execution environment cannot obtain a full Forge checkout/dependency tree through `github.com` DNS;
- current branch GitHub development CI is not assumed under the repository's build/deploy-only Actions policy;
- no production migration, DNS, secret or customer-data mutation.

## Definition of Done assessment

### Independent WS17-owned source

Complete to **RC-quality**:

- usable input/query flow;
- canonical permission boundary;
- validation/fail-closed behavior;
- idempotency;
- authoritative report/query sources;
- correction/reversal;
- audit/history through canonical documents;
- targeted regression;
- no competing stock/payment/allocation ledger;
- explicit source package version.

No further independent WS17 implementation remains that can be done without crossing into another workstream's shared contract or live production evidence.

### Whole WS17 workstream

Not `Hardened` because completion now requires:

1. shared owner contracts DR-WS17-01..06;
2. authenticated live same-order Golden Order evidence;
3. non-UI merge/release of `alumdoor@2.2.2`;
4. production release evidence before claiming upgrade.

This is now a legitimate integration/merge gate, not a PR checkpoint or local blocker.

## Merge / production gate

PR #316 is backend/read-model/business behavior, **not UI-only**.

Do not merge or deploy until explicit user approval. At approval time, re-read exact `main`; if it advanced, re-audit overlap and resync before merge. Production release must preserve the distinction between source `2.2.2` and historical production `2.2.1` until release evidence proves otherwise.
