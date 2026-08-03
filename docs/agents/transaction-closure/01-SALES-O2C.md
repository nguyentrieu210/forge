# AGENT 01 — SALES / ORDER-TO-CASH CLOSURE

Status: SEEDED
Branch: `rc/transaction-closure-01-sales-o2c`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL

## Mission

Close the canonical customer transaction lifecycle:

`Quotation -> Sales Order -> partial/full Delivery -> partial/full Sales Invoice -> Payment/allocation -> Return/Credit -> Customer Reconciliation`

Capability focus: `C03-001..C03-024`, consume existing `F02` and relevant `L01` authority.

## Own

- exact Sales/O2C controllers/services/domain metadata;
- O2C-specific tests/fixtures;
- sales return/credit lifecycle owned by Sales domain;
- customer-side traceability needed to prove the flow.

## Do not own

- canonical GL/reconciliation report implementation: Agent 04;
- stock ledger/valuation/WMS authority: Agent 03;
- generic shared runtime/views/UI;
- procurement/AP;
- App Factory/compiler primitives.

## Required audit

- current Sales Order, Delivery Note, Sales Invoice and Payment Entry integration;
- partial delivery/invoice/payment;
- allocation and customer advance;
- credit/debit adjustment and return;
- cancellation/amendment/backdate behavior;
- credit limit/hold;
- tenant/company/branch permission boundaries;
- substantive historical Sales/O2C PRs: classify `reuse / cherry-pick / superseded / reject` before rewriting.

## Required evidence

- happy path end-to-end;
- multiple partial deliveries/invoices/payments;
- over/under allocation where supported;
- retry/idempotency;
- cancelled order/delivery/invoice/payment;
- sales return + credit note;
- backdated transaction through existing period/GL authority;
- stock and AR reconcile after reversal/correction;
- multi-currency behavior where current contracts support it;
- server-side permission isolation.

## Dependency behavior

If Sales requires a change to stock posting or finance settlement authority, write a Dependency Request to Agent 03 or 04. Do not duplicate that authority locally. Continue all independent lifecycle/test work.

## Merge boundary

PR-ready autonomously. Do not merge/deploy non-UI changes until explicit user approval.

## Startup prompt

Đọc file này, `PROGRAM_SPEC.md`, `NO_STOP_RULE.md`, Forge Enterprise Completion Skill, exact current branch/main, CURRENT_STATUS/NEXT_TASKS/North Star/Capability Map và code/tests/migrations liên quan. Audit historical Sales/O2C PR trước khi viết mới. Tự chọn giải pháp kỹ thuật theo repo evidence. Không tạo shadow AR/stock/GL. Gặp dependency thì ghi Dependency Request và tiếp tục phần độc lập. Verify CRITICAL gates, cập nhật Completion Record, dừng trước merge/deploy.

## Completion record

Pending worker execution.
