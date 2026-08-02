# Alumdoor Reference Vertical Acceptance

Status: **WS17 source acceptance current; live production closure pending**  
Reference contract: `docs/ALUMDOOR-REFERENCE-VERTICAL-CONTRACT.md`  
Canonical workstream handoff: `docs/agents/workstreams/WS17-alumdoor-reference-vertical.md`

This ledger keeps three bars separate:

1. focused source/regression evidence;
2. wiring through canonical Forge documents/APIs/ledgers;
3. one authenticated live scenario proving the same business identity across the whole vertical.

A document existing somewhere is not evidence that stock, finance, fulfillment and warranty all moved correctly. Humans have already invented spreadsheets for that level of optimism.

## 1. App package lifecycle

| Concern | Evidence | Result | Remaining owner/gap |
|---|---|---|---|
| Source package identity | `readBriefSource(alumdoor-v2.json)` composes to `alumdoor@2.2.2` | PASS source contract | WS17 |
| Historical production identity | release evidence records production `alumdoor@2.2.1` | PASS historical | 2.2.2 is not deployed/claimed |
| Finance dependency ownership | integration sidecar requires `vn-accounting@1.1.0` | PASS | WS09 installer owns enforcement |
| Warehouse Cash ownership | Warehouse Cash DocTypes remain external `vn-accounting` types, never local Alumdoor schemas | PASS | WS01 owns finance implementation |
| Package dependency/external duplicate guard | `read-brief-integrations.test.mjs` + WS17 lifecycle regression | PASS source evidence | full current-head monorepo run NOT RUN |
| Production install/full-sync | exact historical release aligned tenant metadata + Tenant Worker + Alumdoor Worker + Gateway | PASS historical | WS12 release owner |
| Upgrade/rollback on 2.2.2 | no production action performed | NOT RUN | WS09/12/15 + merge/deploy approval |
| Runtime compatibility | shared UI still recognizes Alumdoor/Purchase literals | BLOCKED | DR-WS17-04/05 -> WS09/WS14 |

### Version conclusion

`2.2.1` is the historical production package. WS17 source changes are versioned as `2.2.2` through the existing sidecar composition path; source version change is not represented as a production deployment.

## 2. Supplier operations vertical slice

### Supplier delivery dashboard

Canonical authority:

- physical delivery obligation: Purchase Order + purchase allocation ledger/window;
- receipts: submitted Purchase Receipt;
- monetary AP: Payment Ledger / `Debt Summary`;
- Purchase Invoice outstanding: fallback only, explicitly non-authoritative.

WS17 app-worker behavior:

- 200 documents/page;
- hard ceiling 5,000 and fail closed;
- bounded detail reads;
- canonical allocation timeline preferred over display percentages;
- fallback does not infer settlement from receipt completeness;
- material + PO-line drilldown;
- cây / mét / kg barem ordered, received and remaining;
- actual kg + weight variance;
- receipt/price history;
- AP outstanding / due / overdue / advance / net exposure.

Executable and matching dashboard regression are exact blobs selectively ported from legacy #295. Those identical blobs inherit #295 historical exact-head validation evidence, but that run does not validate unrelated WS17 code.

### Bulk aluminium receipt

WS17 pins the exact #295 validated bulk executable + regression blob:

- multi-line FIFO preview;
- one Purchase Receipt Draft per trip;
- company/currency mixing fails closed;
- duplicate/conflict protection;
- user `posting_at` is normalized and included in the idempotency fingerprint;
- the same `posting_at` is carried into synthetic preview receipts and the created Purchase Receipt;
- stock/ledger movement still occurs only when the canonical Purchase Receipt lifecycle is used.

The `nhap-nhom-hang-loat` AppAction in `alumdoor@2.2.2` now exposes `posting_at:Datetime` so the executable contract is reachable from metadata rather than hidden behind API-only input.

### Supplier settlement / correction

`alumdoor.purchase.supplier_delivery_settlement` is app composition, not a new ledger:

1. resolve the material `queue_key` against canonical allocation timelines;
2. choose latest Open window for Close / `Đối soát`;
3. choose latest Settled window for Reverse / `Đảo đối soát`;
4. require a reason;
5. forward caller authorization/app/identity/signature;
6. create + submit `Purchase Settlement` through the platform document path.

Role, tolerance, OCC/version, Close/Reverse semantics and allocation mutation remain in the canonical Purchase Settlement controller. Regression covers Close, Reverse, missing reason, invalid state and identity forwarding.

Result for the WS17-owned supplier-operation slice: **RC-quality source slice**, not production Hardened.

## 3. Cross-domain capability matrix

| Segment | Canonical authority | Current level | Evidence / gap |
|---|---|---|---|
| Sales configuration / door formula | Sales Order + formula snapshot | Wired | formula/slat/sales-production regressions; vertical logic stays app-local |
| Sales -> Production Request -> Work Order | manufacturing documents | Wired | stable `request_line_key` + `sales_order_row_id`; generic orchestration extraction DR-WS17-06 |
| Purchase -> supplier FIFO | purchase allocation ledger | Wired / RC consumer | supplier operations above; generic allocation axis DR-WS17-01/02 |
| Receipt -> physical stock | Stock Ledger + measurement/bundle evidence | Wired | shared UOM vertical literals remain DR-WS17-02 |
| Reservation / cut / offcut | stock/bundle + manufacturing docs | Wired | generic reservation/manufacturing split belongs WS04/05 |
| Delivery | Delivery Note + Stock Ledger | Wired | live constituent evidence exists; same-order live closure pending |
| Customer invoice/payment | GL + Payment Ledger / AR | Wired | constituent authenticated verification exists; same-order live closure pending |
| Supplier payable | Payment Ledger / Debt Summary | RC read consumer | dashboard reads authoritative AP, stable published contract DR-WS17-09 desirable |
| Warranty | Warranty Claim + source Delivery Note | Wired | focused policy/correction tests; generic service lifecycle DR-WS17-07 |
| Warehouse Cash | `vn-accounting` GL-backed docs | RC consumer | external dependency pattern is correct |
| Print | platform renderer + Alumdoor templates | Wired | renderer remains shared owner |
| OCR | permission-aware extraction + app mapping | Wired vertical implementation | generic extraction DR-WS17-08 |
| Rich workspace/input tables | AppAction/App Factory metadata | Foundation/Wired migration | DR-WS17-04/05; shared UI still has compatibility literals |

## 4. Golden Order read-only acceptance

WS17 now ships a current read-only verifier:

- `server/scripts/lib/alumdoor-golden-order-readonly.mjs`;
- `server/scripts/verify-alumdoor-golden-order-readonly.mjs`;
- `server/tests/alumdoor-golden-order-readonly.test.mjs`.

Target authority chain:

```text
Sales Order
  -> Production Request
  -> Work Order
  -> sales_order_row_id lineage
  -> Delivery Note
  -> Stock Ledger
  -> Sales Invoice
  -> Payment Entry
  -> Accounts Receivable
  -> optional Warranty Claim
```

The evaluator does not accept document-name proximity as lineage. It requires:

- active Production Request for the exact Sales Order;
- Work Orders linked to that Production Request and not pointing at another Sales Order;
- production `sales_order_row_id` evidence;
- Delivery Note item `sales_order_row_id` evidence;
- every production row represented in delivered lineage;
- negative Stock Ledger movement from the exact Delivery Note(s);
- submitted Sales Invoice for the exact Sales Order;
- submitted Payment Entry allocating a positive amount to those invoices;
- Accounts Receivable rows for those invoices;
- Warranty Claim linkage when `--require-warranty` is requested.

The live script authenticates like the browser but, after login, only performs resource GETs and read-only `frappe.desk.query_report.run` calls. It contains no resource create/update/delete/submit path.

### Current isolated verification

Recreated from the exact current evaluator/test/verifier source under Node:

- business authority + row-lineage happy path: PASS;
- missing production row identity: PASS fail-closed;
- missing delivered production row: PASS fail-closed;
- Delivery Note without Stock Ledger movement: PASS fail-closed;
- invoice without allocated Payment Entry: PASS fail-closed;
- optional/required warranty behavior: PASS;
- live verifier read-only source guard + syntax: PASS.

Result: **7/7 PASS**.

### Live authenticated status

Current production same-order Golden Order: **NOT RUN** in this WS17 session. No credential/customer-data mutation was attempted. The verifier is ready for a read-only run once an approved authenticated execution surface exists.

Therefore the whole reference vertical is **not Hardened**.

## 5. Legacy PR #295 disposition

Whole PR: **REJECT-AS-WHOLE / SELECTIVE-PORT ONLY**.

Canonical file-by-file audit:

`docs/agents/workstreams/WS17-legacy-295-disposition.md`

No #295 file remains unclassified.

Selective ports completed:

- exact dashboard executable + matching regression;
- exact bulk FIFO executable + matching regression;
- current-main-safe settlement composition;
- current-main-safe entry routing.

Rejected from WS17:

- shared Procurement literal-driven allocation semantics;
- shared document-kernel Aluminium projection;
- shared React Tiến Đạt/Alumdoor special cases.

Historical #295 exact-head evidence may be reused only for byte-identical blobs:

- build PASS;
- typecheck PASS;
- focused Tiến Đạt regressions PASS;
- server: 1,586 tests / 1,542 pass / 44 skipped / 0 fail;
- client: 149 files / 932 tests / 0 fail.

## 6. Blocking dependency closure

The remaining blockers are genuinely cross-stream, not excuses to stop vertical work early:

1. **DR-WS17-01 -> WS03**: declarative procurement allocation quantity axis.
2. **DR-WS17-02 -> WS04**: declarative catch-weight/multi-measure Measurement Profile roles.
3. **DR-WS17-03 -> WS00**: generic supplier delivery/material-measure projection.
4. **DR-WS17-04 -> WS09**: first-class AppAction/workspace/input-table metadata.
5. **DR-WS17-05 -> WS14**: metadata-driven shared renderer/child-grid/branding.
6. **DR-WS17-06 -> WS05**: generic production/BOM/capacity/idempotency orchestration.

Additional owner dependencies for complete live chain: WS01 Finance read contract, WS02 fulfillment, WS07 warranty, WS08 OCR, WS12/15 release/rollback evidence.

## 7. Current validation boundary

- exact #295 dashboard/bulk blobs: historical full validation applies as documented;
- Golden Order current isolated regression: **7/7 PASS**;
- current full WS17 monorepo build/typecheck/test: **NOT RUN**, because this execution environment still cannot obtain a full checkout/dependency tree through `github.com` DNS;
- GitHub development checks on the current branch are not assumed to exist under the repo's build/deploy-only Actions policy;
- production 2.2.2 install/upgrade/Golden Order: **NOT RUN**;
- no migration, secret, DNS or customer-data mutation performed.

## 8. Exit assessment

### Independent WS17 source work

Within WS17-owned files, the supplier operations slice now has:

- usable input and query paths;
- server-authoritative permission/callback path;
- validation and fail-closed errors;
- idempotency;
- canonical report/query authorities;
- correction/reversal;
- canonical audit/history documents;
- targeted tests;
- no competing ledger/source of truth;
- explicit package versioning.

Independent implementation is locally saturated at **RC-quality source**.

### Whole WS17 workstream

Still not complete/Hardened because the remaining work requires one or more of:

- shared contracts owned by WS00/03/04/05/09/14;
- authenticated live integration evidence;
- merge/deploy of the non-UI `alumdoor@2.2.2` source.

Those are legitimate cross-stream/production/merge gates. WS17 must not solve them by copying generic logic into the vertical or by claiming historical production evidence for new source.
