# AGENT 04 — FINANCE RECONCILIATION + DAILY DETAILED LEDGER

Status: SEEDED
Branch: `rc/transaction-closure-04-finance-daily-ledger`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL

## Mission

Make Finance the authoritative reconciliation layer across transaction domains without becoming a second business ledger.

Core outcome:

`opening -> authoritative movements -> closing`

with reconciliation across AR, AP, Cash/Bank, Stock valuation and GL, including reversal/backdate/correction evidence.

Capability focus: `F01`, `F02`, `F03`, `F04`, relevant `F07`, `V01` accounting-book evidence.

## Own

- canonical GL/report/reconciliation/query implementation;
- Daily Detailed Ledger projection/report and tests;
- cross-ledger reconciliation evidence and discrepancy diagnostics;
- finance-side contracts consumed by other workers.

## Do not own

- Sales lifecycle semantics: Agent 01;
- stock ledger/valuation semantics: Agent 03;
- Manufacturing lifecycle/cost authority: Agent 02;
- Procurement lifecycle: Agent 05;
- Warranty/service lifecycle: Agent 06.

## Required audit

- current `gl_entries` authority and RC-020 posting/period/reversal behavior;
- RC-021 AR reconciliation and customer statement/aging;
- RC-022 AP reconciliation and supplier statement/aging;
- RC-023 cash/bank reconciliation;
- RC-024/025 stock valuation/repost evidence;
- branch/company/tenant dimensions and legal book requirements;
- query/report paths that could disagree with authoritative postings;
- historical Daily Ledger/accounting-book PRs: classify before rewrite.

## Daily Detailed Ledger contract

Must be a read/reconciliation projection, not a writable ledger.

At minimum prove:

- opening balance from authoritative pre-period postings;
- ordered movements with source document/type/id, posting timestamp/date, debit/credit or quantity/value semantics as applicable;
- closing = opening + movements under deterministic precision/rounding;
- tenant/company/branch/account scopes;
- correction/reversal pairs remain traceable;
- backdated/reposted movements appear in deterministic order;
- totals reconcile to General Ledger/Trial Balance in financial scope;
- customer/supplier detail reconciles to AR/AP controls;
- stock valuation summary reconciles to canonical stock valuation postings where integration exists.

## Required evidence

- balanced GL invariants;
- hard/soft period authority still enforced;
- AR/AP/cash-bank reconciliation before and after reversal;
- cross-ledger discrepancy tests that fail on intentional mismatch;
- multi-currency/base-currency handling using canonical semantics;
- immutable posting/audit trace;
- server-side tenant/company/branch isolation;
- migration replay if any schema/report projection tables are introduced.

## Dependency behavior

If reconciliation exposes a domain defect, do not patch that domain's authority in this branch. Raise a Dependency Request to the owning worker with exact mismatch evidence, then continue independent finance/report work.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc handoff + program artifacts + Forge Skill + exact branch/main + RC-020..025 evidence/code/tests. Daily Detailed Ledger chỉ là authoritative projection/reconciliation, tuyệt đối không thành shadow GL. Audit historical ledger/report PR trước khi code. Khi phát hiện mismatch do domain khác, ghi Dependency Request với chứng cứ cụ thể, không tự sửa authority của họ. Verify CRITICAL gates, cập nhật Completion Record, dừng trước merge/deploy.

## Completion record

Pending worker execution.
