# AGENT 05 — PROCUREMENT / SOURCE-TO-PAY CLOSURE

Status: SEEDED
Branch: `rc/transaction-closure-05-procurement-p2p`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL

## Mission

Close the canonical supplier transaction lifecycle:

`Purchase Request/Material Request -> RFQ/Quotation -> approval/selection -> Purchase Order -> partial/full Purchase Receipt -> Purchase Invoice -> three-way match/variance -> Supplier Payment/Advance -> Return/Adjustment -> AP Reconciliation`

Capability focus: `P01-001..P01-020`, relevant `P02`, consume existing `F03` authority.

## Own

- procurement/P2P controllers/services/domain metadata;
- three-way matching, quantity/price variance orchestration owned by procurement;
- supplier purchasing lifecycle tests/fixtures;
- landed-cost integration seam where procurement owns orchestration.

## Do not own

- canonical AP/payment/GL authority: Agent 04 consumes current finance authority;
- stock receipt/valuation authority: Agent 03;
- generic App Factory input-table/batch primitive: canonical WS09 owner;
- shared UI/runtime.

## Required audit

- Purchase Request/Material Request/RFQ/Supplier Quotation/PO;
- partial receipt and partial invoice;
- Purchase Receipt linkage to stock authority;
- Purchase Invoice and Supplier Payment/Advance allocation;
- return to supplier and debit/credit adjustment;
- three-way match and quantity/price variance;
- landed cost and stock valuation interaction;
- cancellation/amendment/backdate;
- supplier/company/tenant permission boundaries;
- substantive historical procurement/accounting PRs: classify before rewriting.

## Required evidence

- full P2P happy path;
- multiple partial receipts/invoices/payments;
- supplier advance allocated later;
- receipt/invoice quantity and price mismatch;
- duplicate/retry/idempotency;
- cancelled PO/receipt/invoice/payment;
- supplier return + AP correction;
- landed cost does not create competing valuation authority;
- AP reconciliation remains consistent after reversal;
- tenant/company/warehouse permission isolation.

## Dependency behavior

Stock/valuation changes go to Agent 03. Finance/AP/GL/report changes go to Agent 04. Shared App Factory primitive needs a Dependency Request to the canonical WS09 owner. Continue independent procurement work instead of copying shared logic.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc handoff, program artifacts, Forge Skill, exact branch/main và Procurement/AP/Stock code/tests/migrations. Audit substantive procurement PR lịch sử trước khi viết mới. Giữ Purchase Receipt trên canonical stock path và Payment/AP trên canonical finance path. Dependency thuộc owner khác thì ghi request và tiếp tục phần độc lập. Verify CRITICAL gates, cập nhật Completion Record, dừng trước merge/deploy.

## Completion record

Pending worker execution.
