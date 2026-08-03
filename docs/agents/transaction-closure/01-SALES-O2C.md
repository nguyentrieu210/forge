# AGENT 01 — SALES / ORDER-TO-CASH CLOSURE

Status: REVIEW / PR-READY, CRITICAL verification evidence pending
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

### Exact-state audit

- Worker branch was seeded from the transaction-closure control baseline and currently differs from exact `main` only by this program's control docs plus Sales/O2C-owned source/tests.
- Main drift since the worker merge-base is UI-only (`V3-03`, business data surfaces, Builder Studio); no `server/packages/clouderp-selling/**` overlap was found during implementation.
- Canonical mutation authority remains Document Kernel -> D1/ledger/outbox. No direct document/ledger write path was introduced.

### Existing authority reused

- `SalesOrderController` remains authoritative for server pricing, UOM normalization, totals, master validation and delivery/billing cancellation guards.
- `DeliveryNoteController` remains authoritative for Sales Order fulfilment, negative-stock checks, valuation inputs, stock posting, fulfillment posting and exact reversal.
- `ArSalesInvoiceController` from merged RC-021 remains the canonical Sales Invoice/credit-return AR path; no shadow receivable balance or competing credit ledger was added.
- `SafeFinancePaymentEntryController` + `PaymentAllocationController` remain canonical for partial payment, advance/allocation, Payment Ledger and GL settlement.
- `StockReturnIntegrityController` remains the physical Sales Return authority in the ERPNext core registry; Sales closure does not duplicate stock-return posting.
- Framework `amended_from` remains the single amendment-chain authority; Sales adds only domain revision metadata and commercial-source preservation.

### Historical PR classification

| Source | Classification | Decision |
|---|---|---|
| PR #321 CRM / Revenue 360 | `reuse` | Merged CRM + canonical Quotation work is current; existing O2C authority is preserved rather than rewritten. |
| PR #440 RC-021 AR reconciliation | `reuse` | Merged Sales Invoice credit/return, Payment Entry/allocation, Payment Ledger/GL and reconciliation evidence are consumed as Finance authority. |
| Gate 2E O2C source-exact oracle | `reuse as benchmark` | Pinned ERPNext/Frappe evidence remains useful, but stale gap labels are re-audited against current code before acting. |
| stale whole-branch O2C history | `reject whole-branch replay` | No stale branch was cherry-picked over current main. Only current merged contracts were used. |

### New Sales-owned closure

Implemented `SalesOrderClosureController` as a narrow subclass of the canonical Sales Order controller:

1. `against_quotation` must reference a submitted Quotation in the same tenant/customer/company/currency context.
2. Every mapped Sales Order line must preserve the exact `quotation_item` child identity.
3. Item code and canonical conversion factor must match the quoted source line; later Item/UOM master drift cannot silently reinterpret the quote.
4. One order cannot exceed its quoted line quantity.
5. Multiple submitted Sales Orders cannot cumulatively exceed the same quoted source line.
6. `against_quotation` is immutable after Sales Order creation.
7. `quotation_revision_no` is captured server-side from the referenced Quotation; client-supplied revision claims are discarded.
8. `revision_no` is server-owned: original Sales Order = 1; an amendment derives `source.revision_no + 1` from framework `amended_from`.
9. Sales Order amendments preserve customer/company/currency and Quotation source while the kernel/storage layer continues to enforce cancelled-source, one-successor and idempotency invariants.

No new migration, schema table, GL entry, stock ledger, Payment Ledger or reconciliation projection was introduced.

### Targeted regression added

`server/tests/transaction-closure-sales-o2c.test.mjs` covers:

- Quotation -> Sales Order source and revision trace;
- client revision spoof rejection by server overwrite;
- missing/foreign Quotation child identity rejection;
- cumulative multi-order over-quotation rejection with failed submit leaving Draft intact;
- Sales Order cancel -> amend revision increment + Quotation-source preservation;
- revised Quotation -> Sales Order revision trace;
- conversion-factor drift between quote time and order time rejection.

Existing current-main regressions already cover the rest of the critical path, including partial/multiple Delivery Note, Sales Invoice and Payment Entry flows, cumulative over-fulfillment/over-billing/over-allocation, cross-aggregate races, cancel guards/reversals, idempotency, multi-currency/FX, credit notes and AR reconciliation.

### Dependency Requests

#### DR-TC01-01 — Finance / Agent 04: fully-paid return/refund policy

Current RC-021 credit note correctly refuses credit above **live outstanding**. A Sales Invoice already fully settled therefore has no repo-defined authoritative rule for refund, unapplied customer credit or negative receivable. Sales must not invent a customer-credit wallet or negative AR balance. Finance owner must freeze the policy/contract before this scenario can be called closed.

Blocking: only fully-paid return/refund closure. Not blocking Quotation/Order/partial settlement work.

#### DR-TC01-02 — Finance / Agent 04: credit-limit / hold authority

The Sales Order rule ledger requires credit-limit and party-status gates "where enabled", but current canonical CloudForge code does not expose a frozen customer credit-limit/hold aggregate or Finance-owned exposure calculation contract. Sales will not derive exposure from ad-hoc document scans and create a second AR authority.

Blocking: `C03-020 Credit limit/hold` RC claim. Not blocking the rest of O2C closure.

#### DR-TC01-03 — Inventory / Agent 03: stock-return valuation/reconciliation evidence

Physical Sales Return already uses `StockReturnIntegrityController`, return entries and canonical stock ledger authority. Final transaction-closure evidence must consume Agent 03's frozen valuation/repost/reconciliation contract rather than adding Sales-local valuation logic.

Blocking: stock/valuation reconciliation promotion. Not blocking source traceability or AR credit flow.

#### DR-TC01-04 — Control/Validation: executable CRITICAL lane

The repository currently documents development GitHub Actions as disabled and the available root validation workflow is branch-gated to RC-021. This worker environment has no checkout/dependencies and cannot resolve `github.com`, so the new targeted TypeScript/test source cannot be executed here without crossing the shared workflow hotspot.

Required before merge: exact-head focused TypeScript/build plus `transaction-closure-sales-o2c.test.mjs`, existing `o2c.test.mjs`, amendment-chain regressions and RC-021 AR regressions.

### Maturity / claim boundary

- Quotation revision + Quotation -> Sales Order traceability: implementation candidate for `RC`, pending executable exact-head gates.
- Existing core Order -> Delivery -> Invoice -> Payment partial/cancel/reversal flow: strong Wired/RC-candidate evidence reused from current main; no blanket Hardened claim.
- `C03-020` credit limit/hold remains gated by DR-TC01-02.
- Fully-paid refund/credit scenario remains gated by DR-TC01-01.
- Stock-return valuation reconciliation remains gated by DR-TC01-03.
- No capability is promoted to Hardened merely because code or tests exist.

### Merge/deploy

Non-UI / CRITICAL. Branch may open a PR for review and validation. **Do not merge, deploy or run production migration/data mutation without explicit user approval.**