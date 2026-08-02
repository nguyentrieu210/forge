# WS01 — Finance + Vietnam Compliance

Status: **CLAIMED**  
Owner: **ChatGPT / WS01**  
Branch: `agent/ent-01-finance-vn`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Claimed on 2026-08-03 from prior branch head `4bf50d8ae42e152e0a1daa25b0d05fdb72fa571d`; exact current main at claim time is `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`.

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

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

Audit các accounting PR cũ còn mở và phân loại `reuse / cherry-pick / superseded / reject` trước khi viết lại.

### Audit plan

1. Sync branch with exact current `main` before implementation.
2. Read Enterprise Completion Skill, North Star, Capability Map, execution protocol, project/status/task docs.
3. Audit exact finance code, migrations and tests against `F01-F07`, `V01-V04`.
4. Audit substantive legacy finance PRs, at minimum `#286`, `#278`, `#199`, plus finance touchpoints from `#295`, `#269`, `#201`.
5. Reuse or transplant the active VN Accounting Period Integrity r8 only if its exact diff still matches current contracts and migration sequence.
6. Record evidence, gaps, dependency requests and a first vertical slice before any business implementation.

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

Capability IDs, financial invariants, migration replay, reconciliation before/after, permission tests, legal sources nếu statutory, legacy PR disposition, blockers/dependencies.
