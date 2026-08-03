# WS03 — Procurement 360 / Source-to-Pay

Status: **REVIEW**  
Owner: **ChatGPT / WS03**  
Branch: `agent/ent-03-procurement`  
PR: `#305` — `fix(procurement): separate delivery allocation quantity from commercial kg`  
Product baseline: **Forge 0.2.0**  
Claimed from exact `main`: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Implementation checkpoint before this handoff: `a0fd161122f81a3d97bf0b8c37ad8086bfbe2709`

## Mission

Hoàn thiện Source-to-Pay từ yêu cầu mua tới thanh toán, supplier lifecycle và kiểm soát PO/Receipt/Invoice, giữ compatibility với Tiến Đạt FIFO nhưng không hard-code nhà cung cấp vào generic procurement.

## Capability families

`P01-P02`, liên kết `F03`, `W01`.

## Phase A audit result

Exact source audit cho thấy Procurement không bắt đầu từ số 0. `clouderp-core` đã có controller/type thật cho Material Request, Request for Quotation, Supplier Quotation, Purchase Order, Purchase Receipt và Purchase Invoice; receipt/invoice có partial-progress guards và PO context; Purchase Invoice ghi AP/GL qua canonical ledger path; Purchase Receipt hỗ trợ nhiều PO theo từng dòng và optional SRBNB GL posting.

Maturity dưới đây là đánh giá làm việc của WS03, chưa phải tuyên bố product-wide canonical cho tới khi PR/handoff được review:

| Capability | Maturity | Evidence / gap chính |
|---|---|---|
| P01-001 Purchase Request | Foundation | Forge dùng `Material Request` làm primitive nhu cầu; chưa thấy lớp Purchase Request riêng cần thiết |
| P01-002 Material Request | Wired | controller, UOM/qty validation, submit/reference |
| P01-003 RFQ | Wired | multi-supplier RFQ, duplicate supplier guard, MR reference |
| P01-004 Supplier Quotation | Wired | commercial totals, invited-supplier validation |
| P01-005 Quotation Comparison | Missing | chưa có generic comparison read model/UI evidence |
| P01-006 Supplier Selection | Missing | chưa có selection decision record/evidence |
| P01-007 Purchase Approval | Foundation | workflow engine tồn tại ở platform nhưng chưa có procurement approval contract được audit ở WS03 |
| P01-008 Purchase Order | Wired | pricing, MR/SQ references, cancellation guard |
| P01-009 Delivery Schedule | Foundation | `schedule_date` có ở PO/item, chưa có schedule lifecycle/read model |
| P01-010 Purchase Receipt | RC candidate | stock path, multi-PO rows, partial receipt, cancel reversal; vẫn phụ thuộc WS04 cho WMS/QC/landed-cost depth |
| P01-011 Purchase Invoice | Wired | GL + AP Payment Ledger, PO billing guard |
| P01-012 Supplier Payment | External dependency | WS01 owns Payment Entry/AP truth |
| P01-013 Partial Receipt | Wired | cumulative procurement/allocation path |
| P01-014 Partial Invoice | Wired | cumulative Billing guard |
| P01-015 Return to Supplier | Foundation | stock-return primitive có nhưng chưa chứng minh generic procurement E2E trong audit này |
| P01-016 Landed Cost | Missing/WS04 dependency | chưa có WS03-owned landed-cost orchestration evidence |
| P01-017 Three-way Match | Foundation | PO caps Receipt và Invoice riêng; chưa có Invoice-vs-Receipt match/tolerance/hold contract |
| P01-018 Quantity Variance | Foundation | over-receipt/tolerance primitives có; chưa có generic variance decision/read model |
| P01-019 Price Variance | Missing | chưa có PO-vs-Invoice price variance contract |
| P01-020 Purchase Analytics | Foundation | vertical supplier dashboard có evidence lịch sử; generic analytics chưa đóng |
| P02-001 Supplier Onboarding | Foundation | Supplier master có, lifecycle onboarding chưa đóng |
| P02-002 Approved Supplier List | Missing | chưa thấy generic approved-list enforcement |
| P02-003 Supplier Category | Foundation | `supplier_group` có ở commercial path |
| P02-004 Supplier Rating | Missing | chưa có rating lifecycle |
| P02-005 Supplier Quality Score | Missing | phụ thuộc QMS/WS05 |
| P02-006 Supplier Price History | Foundation | pricing history primitives/vertical evidence, chưa genericized thành procurement capability |
| P02-007 Supplier Contract | Missing | chưa có contract lifecycle |
| P02-008 Blanket Order | Missing | chưa có blanket release/consumption semantics |
| P02-009 Supplier Portal | Missing | chưa có portal capability trong WS03 audit |
| P02-010 Supplier Debt / provisional AP | Wired foundation | Purchase Allocation + AP ledger exist; generic supplier debt read model crosses WS00/WS01 ownership |

## Implementation slice in PR #305

Problem: commercial/accounting/stock quantity của nhôm có thể là **kg**, còn nghĩa vụ nhà máy giao và FIFO phải theo **số cây/lá**. Nếu canonical Purchase Allocation dùng `stock_qty`, receipt 230 cây AL71 bị hiểu thành 644.184 allocation units khi stock UOM là Kg.

Change in WS03-owned `clouderp-core`:

- `inventory_mode = Nhôm cây/lá` dùng `qty_bar` làm allocation quantity;
- `qty_bar` bắt buộc và phải dương cho mode này;
- commercial/accounting/stock `qty` vẫn giữ kg;
- inventory mode khác giữ nguyên `stockQtyMicros` behavior;
- barem weight tính từ allocation quantity khi không có `theoretical_kg` explicit;
- focused regression khóa PO 200 + 100 cây, Receipt 230 cây = FIFO 200 + 30, trong khi voucher qty vẫn là 644.184 kg.

Changed runtime zone: `server/packages/clouderp-core/src/purchase-allocation-controllers.ts`.  
Regression: `server/tests/purchase-receipt-submit-preview.test.mjs`.

## Legacy PR disposition

- **#295 — selective reuse / do not whole-cherry-pick.** Current `main` đã đi xa 61 commit so với branch đó. Hai file WS03 dùng ở slice này có blob trên current main trùng đúng blob tại merge-base của #295, nên delta runtime+test được transplant nguyên vẹn và có provenance rõ. Shared UI, `document-kernel` và Alumdoor-worker delta bị loại khỏi WS03.
- **#276 — reuse as vertical evidence, no cherry-pick.** Supplier delivery workspace thuộc Alumdoor/shared UI boundary.
- **#209 — merged baseline evidence.** Purchase Receipt Bulk Transaction đã nằm trên main.
- **#134 — merged vertical evidence.** Tiến Đạt FIFO requirement/history đã được chứng minh, không nhập lại branch.
- **#14/#63/#137 — historical QA/architecture evidence only.** Không kéo nguyên branch cũ.

## Dependency requests

### Dependency request DR-WS03-01
- Target stream: WS00
- Need: review/genericize supplier-debt read model currently living in `document-kernel`, including any reusable portion from legacy #295.
- Why generic: debt/procurement projection crosses document-kernel ownership and must not be duplicated in WS03.
- Contract proposed: permission-safe read model sourced from Purchase Allocation, with explicit quantity basis and no competing ledger.
- Blocking: no for PR #305; yes for generic P02-010 hardening.
- Temporary workaround: keep existing canonical allocation/ledger readers.

### Dependency request DR-WS03-02
- Target stream: WS01
- Need: AP/payment truth and future three-way-match financial hold/variance posting contract.
- Why generic: supplier payment/outstanding is Finance authority, not Procurement ledger ownership.
- Contract proposed: Procurement emits/matches commercial variance facts; WS01 remains authority for payable settlement and accounting consequences.
- Blocking: no for PR #305; yes for P01-017/P01-019 completion.
- Temporary workaround: none for claiming 3-way match complete.

### Dependency request DR-WS03-03
- Target stream: WS04
- Need: landed cost, receipt QC/WMS handoff and stock valuation adjustment boundary.
- Why generic: receiving/valuation must stay on canonical stock path.
- Contract proposed: procurement references receipt/landed-cost result; WS04 owns stock valuation/repost semantics.
- Blocking: no for PR #305; yes for P01-016 and receipt hardening.
- Temporary workaround: none.

### Dependency request DR-WS03-04
- Target stream: WS14 / WS17
- Need: keep Supplier Delivery workspace/shared action rendering and Tiến Đạt-specific bulk/settlement UX outside WS03 shared-runtime edits.
- Why generic: WS14 owns shared React views; WS17 owns Alumdoor vertical policy.
- Contract proposed: WS03 exposes generic data/state contract only; UI/vertical consume it.
- Blocking: no.
- Temporary workaround: existing vertical screens remain consumers.

## Verification evidence

- Before PR creation branch was exact `main` + 3 commits, **behind 0**.
- Runtime/test file blobs selected from #295 were unchanged on current main since #295 merge-base, avoiding stale-history import.
- The same runtime + focused regression blobs were included in #295's recorded successful validation run; this is **reuse evidence**, not exact-head CI evidence for #305.
- GitHub currently reports no PR-triggered workflow runs or combined statuses for `a0fd161122f81a3d97bf0b8c37ad8086bfbe2709`, consistent with repository policy that development CI was removed in favor of local blast-radius validation/build-deploy release workflow.
- This session has no executable repository checkout/dependency runner, so no false claim of exact-head local test PASS is made.

## Risk / merge boundary

Risk: **STANDARD with business-rule impact**. No schema/migration, no new ledger, no shared UI, no production mutation. Because behavior changes canonical purchase allocation quantity, PR #305 must **not merge or deploy without explicit user approval**.

## Next WS03 slices after #305

1. Generic quotation comparison + supplier selection evidence (`P01-005/006`).
2. Three-way match contract PO vs Receipt vs Invoice, quantity/price tolerance and hold behavior coordinated with WS01 (`P01-017/018/019`).
3. Supplier approved list/onboarding/rating/contract/blanket order (`P02-001/002/004/007/008`).
4. Generic procurement analytics/read models after authoritative contracts are stable (`P01-020`, `P02-006/010`).
