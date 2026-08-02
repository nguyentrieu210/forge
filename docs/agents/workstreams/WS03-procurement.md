# WS03 — Procurement 360 / Source-to-Pay

Status: **REVIEW**  
Owner: **ChatGPT / WS03**  
Canonical branch: `agent/ent-03-procurement-r2`  
PR: **#342** — `feat(procurement): harden source-to-pay and supplier governance`  
Supersedes checkpoint PR: **#305** / `agent/ent-03-procurement`  
Product baseline: **Forge 0.2.0**  
Clean-base start: exact current `main` at branch creation; source-relevant main was re-audited after parallel-agent drift.  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Hoàn thiện Source-to-Pay từ nhu cầu mua tới supplier selection/contract/PO/receipt/invoice/payment, supplier governance và control evidence; giữ AP/stock/quality/workflow/security authority ở đúng workstream thay vì tạo ledger/contract cạnh tranh.

## Risk / release boundary

- Overall risk: **STANDARD**, với lát cắt purchase-allocation quantity mang blast radius stock/procurement debt nên review theo **CRITICAL invariants**.
- Không migration.
- Không production data mutation.
- Không secret/DNS.
- Không shared React/runtime edit.
- Không document-kernel edit.
- **Backend/business-rule change: chưa merge, chưa deploy.**

## Exact architecture findings

1. `clouderp-core` đã có Material Request, RFQ, Supplier Quotation, PO, Receipt, Purchase Invoice và purchase-allocation lifecycle; WS03 không viết lại các primitive đang chạy.
2. `FinancePaymentEntryController` đã sở hữu Supplier Payment/AP settlement: Pay -> Supplier -> Purchase Invoice, partial/unallocated, outstanding, FX và reversal. WS03 không duplicate AP ledger.
3. `clouderp-erpnext StockReturnController` đã có Purchase return dựa trên submitted Purchase Receipt, cumulative return guard và source valuation. WS03 không tạo return ledger khác.
4. App registry cho phép first-party metadata app + Custom Field overlay trên external DocType, nhưng workflow target phải là DocType owned bởi app. Vì `Purchase Order` là external, approval workflow phải được WS09 mở shared contract thay vì WS03 fork controller approval.
5. `stockQtyMicros()` hiện còn special-case `inventory_mode = Nhôm cây/lá` để trả `qty_bar`. Điều này trộn physical stock quantity với supplier-delivery allocation quantity. Compatibility fix trong WS03 giữ FIFO đúng theo số cây, nhưng generic architecture cần tách allocation axis khỏi stock axis.
6. Không tìm thấy Forge-native generic Landed Cost hoặc incoming Quality Inspection authority ngoài upstream ERPNext references.
7. Không tìm thấy Supplier Portal identity/API implementation trong Forge current source.

## Implementation slices

### A. RFQ -> quotation -> supplier selection

- `procurement-decisions.ts`
  - RFQ/quotation row matching có explicit `request_for_quotation_item` hoặc unique item+UOM fallback.
  - Không numeric-rank rate giữa hai currency khác nhau.
  - Complete quote ranking dùng company-currency base total.
  - Supplier-selection validator bắt đủ mọi RFQ row + lý do.
  - PO-vs-quotation structural check: context, validity date, unique quotation row, no double consume, qty <= quote qty, price variance fact.
  - Pure three-way-match evaluator dùng exact BPS/BigInt tolerance, chỉ sinh Match/Hold facts; không post accounting.
- `supplier-selection-controller.ts`
  - Persisted v1 award một complete Supplier Quotation cho toàn RFQ.
  - Purchase Manager/System Manager submit/cancel.
  - Quote phải submitted, complete, non-expired, đúng RFQ/company.
  - Stamps supplier/currency/approved_by/approved_on.
  - Không được cancel khi submitted PO đang tham chiếu.
- `ProcurementPurchaseOrderController`
  - PO có `supplier_selection` phải dùng đúng supplier + quotation đã duyệt.

### B. Supplier governance

First-party metadata app: `server/apps-src/procurement/`.

Owned DocTypes:
- `Supplier Qualification`.
- `Supplier Rating`.
- `Supplier Contract`.
- `Supplier Selection`.

Shared roles:
- Purchase User.
- Purchase Manager.

Supplier Qualification:
- submittable;
- manager approval;
- effective dates;
- approved categories;
- overlap guard per supplier/company;
- submitted qualification là authority;
- sau khi qualification lifecycle đã được dùng/cancel, không fallback ngược về permissive legacy Supplier master.

Supplier Rating:
- 4 dimensions: quality / delivery / commercial / service;
- exact basis-point weighted score;
- weights bắt buộc = 10000 bps;
- server computes score + grade A/B/C/D.

Supplier Contract / Blanket release:
- submittable + manager approval;
- supplier/company/currency/effective dates;
- fixed-point quantity/value ceilings;
- quantity ceiling bắt buộc UOM;
- PO Custom Field `supplier_contract`;
- PO submit cộng dồn submitted prior POs cùng contract;
- cancelled PO không ăn ceiling;
- fail trước kernel write khi vượt cumulative qty/value ceiling;
- mixed/wrong UOM bị từ chối.

Legacy Supplier-master `procurement_status` vẫn là compatibility fallback chỉ khi tenant chưa hề adopt qualification document lifecycle.

### C. PO delivery schedule

- Header `schedule_date` vẫn được giữ.
- `resolvePurchaseDeliverySchedule()` hỗ trợ dynamic line `schedule_date` nếu metadata/vertical khai field.
- Line override header.
- Header/line date không được trước `transaction_date`.
- Không đoán/sửa external child DocType metadata khi exact owner contract chưa rõ.

### D. Procurement analytics foundations

- Supplier price history đọc **submitted Purchase Order**, không lấy unselected quotation làm giá mua thực tế.
- Giữ transaction-currency rate + company-currency base rate.
- Series partition theo company/supplier/item/UOM/company currency/scale.
- FX-normalized latest/previous variance; baseline 0 => variance undefined (`null`), không bịa 100%.
- Supplier spend summary chỉ cộng submitted PO theo company currency.

### E. Purchase allocation compatibility

Reused exact reviewed slice from legacy PR #295 only where current-main blob had not changed:
- aluminium commercial/accounting quantity vẫn là kg;
- supplier-delivery obligation/FIFO dùng `qty_bar` cho `inventory_mode = Nhôm cây/lá`;
- barem weight derives from allocation quantity when needed;
- regression locks PO 200 + 100 bars, receipt 230 bars / 644.184kg -> FIFO 200 + 30.

Đây là compatibility slice, **không phải generic end state**. Generic allocation axis nằm ở Dependency Request DR-WS03-05.

## Capability audit

### P01 Procurement Core

| Capability | Maturity | Evidence / verdict |
|---|---|---|
| P01-001 Purchase Request | Foundation/Wired alias | Repo không có business contract riêng khác Material Request. Hiện map nhu cầu mua vào `Material Request` type `Purchase`; không tạo duplicate source of truth. |
| P01-002 Material Request | Wired | Existing controller + request remaining guard. |
| P01-003 RFQ | Wired | Existing RFQ + WS03 approved-supplier submit gate. |
| P01-004 Supplier Quotation | Wired | Existing totals/lifecycle + WS03 RFQ line integrity. |
| P01-005 Quotation comparison | Foundation | Deterministic comparison engine + currency-safe ranking; chưa có permission-aware report/action UI. |
| P01-006 Supplier selection | Wired v1 | Persisted manager-approved complete-quote selection + PO enforcement + correction guard. Split-line selection vẫn pure-engine only. |
| P01-007 Purchase approval | BLOCKED | Workflow overlay on external PO không được app-registry contract hiện tại cho phép. DR-WS03-01 -> WS09. |
| P01-008 Purchase Order | Wired | Existing lifecycle/pricing/request guard + qualification/selection/contract/schedule checks. |
| P01-009 Delivery schedule | Foundation/Wired | Header existing; WS03 server resolves line override when provided. Exact external child metadata owner still separate. |
| P01-010 Purchase Receipt | Wired | Existing canonical stock/procurement path. |
| P01-011 Purchase Invoice | Wired | Existing AP/GL path. |
| P01-012 Supplier Payment | Wired dependency | FinancePaymentEntryController, WS01 authority. |
| P01-013 Partial receipt | Wired | Existing cumulative purchase-allocation/remaining guard. |
| P01-014 Partial invoice | Wired | Existing Billing remaining guard. |
| P01-015 Return to supplier | Wired dependency | Existing `StockReturnController` Purchase path, no rewrite. |
| P01-016 Landed cost | Missing/Blocked | No Forge-native implementation found; stock valuation owner WS04. DR-WS03-02. |
| P01-017 Three-way match | Foundation | Deterministic evaluator exists; authoritative invoice/AP hold wiring blocked by quantity-axis + WS01 hold semantics. DR-WS03-05/06. |
| P01-018 Quantity variance | Foundation | Three-way evaluator facts/tolerances. |
| P01-019 Price variance | Foundation | PO-vs-quotation + three-way evaluator facts. |
| P01-020 Purchase analytics | Foundation | Supplier price history + spend read models; report/query surface dependency remains. DR-WS03-07. |

### P02 Supplier Management

| Capability | Maturity | Evidence / verdict |
|---|---|---|
| P02-001 Supplier onboarding | Wired foundation | Supplier Qualification lifecycle; full self-service portal onboarding not included. |
| P02-002 Approved supplier list | Wired | Effective submitted qualification authority + legacy adoption boundary. |
| P02-003 Supplier category | Foundation | Qualification approved categories + existing supplier_group. |
| P02-004 Supplier rating | Wired | Submittable rating, server-weighted exact BPS score/grade. |
| P02-005 Supplier quality score | Foundation | Quality dimension exists; incoming QC operational feed blocked by WS05/WS04. DR-WS03-03. |
| P02-006 Supplier price history | Foundation | Submitted PO, UOM/currency-safe history read model. |
| P02-007 Supplier contract | Wired | Submittable contract + server validity/UOM/ceiling enforcement. |
| P02-008 Blanket order | Wired semantics | Contract cumulative PO release semantics; no duplicate standalone Blanket Order doctype. |
| P02-009 Supplier portal | Missing/Blocked | No Forge supplier external identity/API portal found. DR-WS03-04. |
| P02-010 Supplier debt / provisional AP | Wired dependency / Foundation | Purchase Allocation delivery debt + WS01 Payment Ledger/AP authority; Tiến Đạt vertical evidence reused, not copied into generic core. |

## Dependency requests

### Dependency request DR-WS03-01
- Target stream: **WS09 BPM / App Factory**
- Need: approval/workflow overlay contract for a DocType owned externally/shared, specifically `Purchase Order`.
- Why generic: multiple apps need to attach approval policy to platform-standard transactions without claiming DocType ownership.
- Contract proposed: app manifest declares workflow overlay target + dependency/owner; installer validates target is platform/external and prevents ambiguous active workflows.
- Blocking: **yes for P01-007**, no for completed independent slices.
- Temporary workaround: none; do not fork PO approval in WS03 controller.

### Dependency request DR-WS03-02
- Target stream: **WS04 Inventory / WMS**
- Need: canonical Landed Cost allocation + stock valuation adjustment/repost integration.
- Why generic: landed cost changes authoritative inventory valuation and must reconcile to stock/finance.
- Contract proposed: landed-cost document/service allocates fixed-point costs to canonical receipt/stock valuation entries with correction/reversal.
- Blocking: **yes for P01-016**.
- Temporary workaround: none; WS03 must not write valuation directly.

### Dependency request DR-WS03-03
- Target stream: **WS05 Manufacturing/QMS + WS04 Inventory**
- Need: incoming Quality Inspection / QC gate for Purchase Receipt and supplier-quality evidence feed.
- Why generic: quality inspection is cross-domain QMS/stock acceptance, not procurement-only metadata.
- Contract proposed: submitted incoming inspection references Receipt/line/batch; acceptance/rejection facts permission-enforced; Supplier Rating consumes immutable quality facts.
- Blocking: **yes for full P02-005 / North Star Receipt -> QC**.
- Temporary workaround: manual quality dimension in Supplier Rating.

### Dependency request DR-WS03-04
- Target stream: **WS10 Integration Hub + WS11 Security/IAM/SaaS**
- Need: Supplier Portal external identity/session/permission/API boundary.
- Why generic: external business-party portals share identity, invitation, scoped document/API access and audit requirements.
- Contract proposed: external-party principal mapped to Supplier + tenant, explicit allowlisted resources/actions, revocation/audit, no generic Guest DocType access.
- Blocking: **yes for P02-009**.
- Temporary workaround: internal Purchase User operation only.

### Dependency request DR-WS03-05
- Target stream: **WS04 Inventory + WS17 Alumdoor reference vertical; WS00 if shared document contract is required**
- Need: split physical stock quantity from supplier-delivery allocation quantity.
- Why generic: current `stockQtyMicros()` special-cases `Nhôm cây/lá -> qty_bar`, conflating stock/accounting UOM with delivery obligation unit.
- Contract proposed: explicit generic `allocation_qty/allocation_uom` (or equivalent typed axis) on procurement line; vertical maps `qty_bar -> allocation_qty`, while `stock_qty` remains physical inventory authority.
- Blocking: **yes for generic hardening of allocation and authoritative P01-017 invoice matching**.
- Temporary workaround: current reviewed `qty_bar` compatibility path remains isolated and regression-locked.

### Dependency request DR-WS03-06
- Target stream: **WS01 Finance / VN Accounting**
- Need: AP hold/release semantics for three-way-match exceptions before Purchase Invoice/payment eligibility is blocked.
- Why generic: invoice posting/payment authority belongs to AP/finance, and hold/correction affects financial truth.
- Contract proposed: persisted match/hold fact references PO/Receipt/Invoice lines; AP defines whether hold blocks submit, payment, or approval and how override/release is audited.
- Blocking: **yes for authoritative P01-017**.
- Temporary workaround: pure evaluator only; no accounting side effect.

### Dependency request DR-WS03-07
- Target stream: **WS08 BI/Semantic + WS09 App Factory/report surface**
- Need: permission-aware query/report exposure for quote comparison, supplier price history and procurement spend.
- Why generic: shared analytics/report runtime should own filtering, large-data behavior and export.
- Contract proposed: deterministic WS03 read models exposed through canonical report/query registry with company/supplier permissions.
- Blocking: **no for business-rule slices; yes for RC/Hardened analytics UX**.
- Temporary workaround: pure read-model functions and targeted tests.

## Legacy PR disposition

- **#295** `feat(purchase): complete Tiến Đạt FIFO delivery and payable operations`: **selective reuse only**. Exact allocation + preview-regression blobs reused because those source files were unchanged against the PR merge base. Shared UI/document-kernel/Alumdoor-worker changes rejected from WS03 scope and left to WS14/WS00/WS17.
- **#276** supplier delivery workspace: **reuse as vertical evidence**, not generic transplant.
- **#209** Purchase Receipt Bulk Transaction: **reuse merged baseline**.
- **#134** Tiến Đạt FIFO: **reuse merged vertical compatibility evidence**.
- **#14 / #63** purchase-allocation lifecycle: **reuse current-main canonical foundations**, not stale branch history.
- **#137** authenticated purchase QA: **reuse evidence pattern**, no cherry-pick.
- **#179** FIFO UI: **WS14/WS17 ownership**, no transplant.

## Changed zones on canonical r2

- `server/apps-src/procurement/**`
- `server/packages/clouderp-core/src/procurement-*.ts`
- `server/packages/clouderp-core/src/supplier-*.ts`
- `server/packages/clouderp-core/src/index.ts`
- `server/packages/clouderp-core/src/registry.ts`
- `server/packages/clouderp-core/src/purchase-allocation-controllers.ts` compatibility slice
- `server/tests/ws03-*.test.mjs`

No changes to:
- `server/packages/document-kernel/**`
- finance/payment controllers
- stock/WMS controllers
- shared React runtime/views/shell
- migrations
- deploy/release scripts
- production data/config.

## Verification

### Source / contract audit — DONE

- Exact Skill / North Star / Capability Map / protocol read.
- Exact main vs original branch and clean r2 source-relevant diff audited.
- App-registry parser constraints audited:
  - allowed brands/dimensions/home;
  - external DocType references;
  - custom-field overlay;
  - workflow-owned-doctype restriction;
  - shared role behavior.
- Finance Payment Entry and Stock Return existing authorities audited before deciding not to duplicate them.
- Legacy procurement PRs classified before reuse.
- Regression source committed for core decisions/policy/analytics/schedule, supplier lifecycle, app parser and aluminium allocation quantity.

### Runtime verification — NOT RUN

- Full test: **NOT RUN**.
- Typecheck: **NOT RUN**.
- Build: **NOT RUN**.
- Browser/E2E: **NOT RUN** (no WS03-specific custom UI; generic metadata renderer only).

Reason: this execution environment has no repository checkout/dependency workspace and public GitHub DNS from shell is unavailable. Per project execution policy, missing checkout/CI is recorded rather than used as a stopping point. GitHub Actions is release-oriented in current repo policy, not the development validation source.

## Known gaps / merge gate

Independent WS03 work is exhausted without crossing shared ownership. Remaining gaps are the Dependency Requests above.

Before merge:
1. re-check exact current `main` for source-relevant overlap because parallel agents continue to advance main;
2. run targeted server build/tests/typecheck from a real checkout/validation environment if available;
3. app-source canonical parser test must pass;
4. procurement lifecycle + allocation regressions must pass;
5. no migration expected;
6. because this PR changes backend/business rules, **merge/deploy requires explicit user approval**.

## Handoff

Workstream: WS03  
Branch: `agent/ent-03-procurement-r2`  
PR: `#342`  
Status: **REVIEW**  
Capabilities: `P01-*`, `P02-*` as matrix above  
Migration: none  
Tests: source committed; runtime **NOT RUN**  
Dependency requests: DR-WS03-01..07  
Recommended merge order: after source-relevant dependency owners do not conflict; no need to wait for non-blocking analytics/UI dependencies to review the independent WS03 slice.  
Production: untouched.
