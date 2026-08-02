# WS01 — Finance + Vietnam Compliance

Status: **READY**  
Owner: **—**  
Branch: `agent/ent-01-finance-vn`  
Base: `b15378be7c036204f92a6e4c289038aa84d6f286`  
Coordinator: `coord/enterprise-parallel-20260803`

## Mission

Đưa Finance từ RC/subset lên business-complete: GL, AR/AP, cash/bank/treasury, period/closing, budget, multi-currency, consolidation và Vietnam statutory engine có nguồn/version/effective date.

## Capability families

`F01-F07`, `V01-V04` trong Enterprise Capability Map.

## Own

- accounting/finance domain packages/controllers
- `vn-accounting` app/domain
- financial reports/reconciliation
- statutory rule/e-invoice/tax integration contracts thuộc finance
- accounting migrations/tests

## Critical invariants

Fixed-point money; debit=credit; immutable/traceable posting; cancel/reversal/correction; period guards; tenant/company/branch scope; multi-currency rounding; statutory version/source evidence.

## Phase A audit

Map từng capability -> maturity/evidence. Đặc biệt audit: fiscal close/year-end, AR/AP allocation & aging, bank auto-match, budget/commitment, FX/revaluation, intercompany/consolidation, VAT/CIT/PIT, e-invoice, statutory financial statements.

## Phase B priority slices

1. exact financial close + retained earnings;
2. AR/AP reconciliation/aging/advances;
3. cash/bank/treasury controls;
4. VN statutory deterministic evaluator boundary;
5. budget/management accounting;
6. consolidation only after core correctness.

## Dependencies

WS00 shared ledger/kernel contract; WS11 permission/SoD; WS06 payroll statutory inputs; WS03 purchase; WS04 stock/COGS.

Không tự sửa shared kernel/security hotspot. Ghi Dependency Request nếu cần.

## First commit

Đổi status thành CLAIMED, owner, head, audit plan. Không production migration/deploy.

## Handoff

Capability IDs, financial invariants, migration replay, reconciliation before/after, permission tests, legal sources nếu statutory, blockers/dependencies.