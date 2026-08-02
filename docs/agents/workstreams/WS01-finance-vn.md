# WS01 — Finance + Vietnam Compliance

Status: **REVIEW**  
Owner: **ChatGPT / WS01**  
Branch: `agent/ent-01-finance-vn`  
Draft PR: `#312`  
Product baseline: **Forge 0.2.0**  
Exact implementation base: `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Claimed on 2026-08-03 from prior branch head `4bf50d8ae42e152e0a1daa25b0d05fdb72fa571d`. Branch was synced through internal PR `#301` before business implementation.

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

## Phase A audit — current baseline

| Capability | Current maturity | Evidence / gap |
| --- | --- | --- |
| F01 GL & close | Partial/RC | `JournalEntryController` enforces fixed-point balance + exact reversal; merged `0042` guards hard/soft accounting periods, cancel and scope move. Missing authoritative year-end close/retained-earnings operation and controller-side GL balance aggregate. |
| F02 AR | RC subset | `FinancePaymentEntryController` supports partial allocation, advances/unallocated balance, historical outstanding, FX difference and cancellation. Aging/statement/write-off/credit-control depth still requires exact audit. |
| F03 AP | RC subset | Same canonical Payment Ledger path supports supplier allocation/advance; purchase payable touchpoint exists in PR `#295`. Full supplier aging/forecast/withholding remains incomplete. |
| F04 Cash/Bank/Treasury | Partial | Payment Entry, warehouse cash controls and bank reconciliation primitives exist. Auto-match, payment batches, treasury forecast/position need completion. |
| F05 Budget/management | Gap/Partial | Cost center/project dimensions exist; complete budget commitment/forecast/management accounting not evidenced. |
| F06 Multi-company/consolidation | Gap | Company masters exist; authoritative intercompany/elimination/consolidation close not evidenced. |
| F07 FX/revaluation | Partial | Payment path server-resolves FX and historical differences; full period-end revaluation/deferred-revenue lifecycle not evidenced. |
| V01 Accounting regime | Partial -> improved by PR #312 | Baseline had policy/legal-rule metadata but mutable legal evidence. PR #312 adds versioned immutable legal rules + TT99 account mapping/effective-date controls. Statutory voucher/book/BCTC templates remain future slices. |
| V02 Tax | Gap/Partial | Legal-rule metadata exists; deterministic VAT/CIT/PIT evaluator and filing evidence remain incomplete. |
| V03 Payroll statutory | Dependency WS06 | WS01 consumes accounting outputs; statutory payroll evaluator belongs WS06. |
| V04 E-invoice/e-sign | Partial | Existing e-invoice concepts/integration contracts need canonical audit; no competing e-invoice ledger should be introduced. |

### Key code evidence

- `server/packages/clouderp-core/src/controllers.ts`: balanced Journal Entry, fixed-point money, exact GL reversal.
- `server/packages/clouderp-selling/src/finance-controllers.ts`: AR/AP allocation, advance/unallocated amount, multi-currency/historical FX handling.
- `server/migrations/tenant/0042_vn_accounting_period_hardening.sql`: canonical VN period guard already merged through PR `#266`.
- `server/packages/document-kernel/src/store.ts`: no generic authoritative GL-balance-by-company/account/date reader yet; blocks safe automated year-end close in a domain controller.
- `server/packages/query/src/index.ts`: current report definitions require deeper company/branch scoping audit before finance can be called business-complete.

## Legacy PR disposition

- **#266 / r8 period integrity**: `MERGED / SUPERSEDED`. `0042` and regression are already on current main; stale r8 branch must not be transplanted.
- **#278 accounting 100 hardening**: `SELECTIVE REUSE`. Valuable statutory/accounting ideas, but branch is heavily stale and edits shared query, stock, selling, manufacturing and migration range `0043-0047`; do not merge/cherry-pick wholesale.
- **#286 TT99 localization**: `SELECTIVE REUSE / SUPERSEDED BY CANONICAL RECUT`. Good TT99 concepts, but overlaps #278 and claims incompatible `0043-0044`; PR #312 re-cuts the first safe WS01-owned slice on current baseline.
- **#199 Daily Detailed Ledger**: `COORDINATE`. Cross-stream WS01/WS08/WS12; do not absorb wholesale into WS01.
- **#295 Tiến Đạt purchase/payable**: `DEPENDENCY / PRESERVE CONTRACT`. Primary ownership WS03/WS17; Finance must keep Payment Ledger as authoritative payable source.
- **#269 HRM statutory payroll**: `DEPENDENCY WS06`. No competing payroll evaluator in WS01. Its known `0043-0047` range is why WS01 reserves migration `0048`.
- **#201 manufacturing costing**: `DEPENDENCY / PRESERVE CONTRACT`. Keep Stock/GL as canonical accounting source; no separate costing ledger.

## Implemented slice — PR #312

Capabilities: `V01-001`, `V01-003`, foundation for `V01-009` and NS-01 legal version/source/effective-date invariant.

- `vn-accounting` -> `1.2.0`; navigation exposes `TT99 Account Map`.
- `VN Legal Rule` becomes submittable/versioned with explicit `rule_version`, mandatory official source hash, read-only approval display fields and workflow state.
- Roles added: `Tax Specialist`, `Internal Auditor`.
- Four-eyes workflows for `VN Legal Rule` and `TT99 Account Map`, with `allow_self_approval=false`.
- `TT99 Account Map` is company/effective-date scoped and must reference a submitted TT99 Accounting legal rule covering its full effective interval.
- `0048_vn_accounting_statutory_foundation.sql` enforces invalid-range rejection, required legal evidence, overlap rejection, immutable approved legal rules/mappings, target TT99 constraint and tenant isolation.
- Dedicated SQLite regression source plus updated first-party metadata regression.

## Migration reservation

Known active WS06 PR `#269` uses `0043-0047`. WS01 therefore uses `0048` for this slice. Before merge, re-check exact main and all active migration branches; renumber append-only if another authorized merge consumes `0048` first. Never rewrite an applied migration.

## Dependency request DR-WS01-01

- Target stream: **WS00**
- Need: authoritative ledger aggregate contract for company/branch/account/date range (balance + debit/credit), usable from domain controllers without direct SQL or document scans.
- Why generic: fiscal close, retained earnings, revaluation, reconciliation and other domains need one canonical ledger read primitive.
- Contract proposed: bounded `DomainReader` methods returning fixed-point company-currency aggregates with tenant/company/branch/account/date filters and deterministic ordering/source evidence.
- Blocking: **yes** for safe automated financial close/year-end retained earnings.
- Temporary workaround: **none**. Do not calculate year-end from UI or raw document scans.

## Verification evidence

- Branch synced to exact `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` before implementation.
- Final pre-PR compare: branch ahead, **0 behind** main.
- Targeted `0048` trigger SQL was syntax/behavior checked against an isolated SQLite `documents` schema during implementation: invalid range/evidence, overlap, tenant isolation, legal-rule reference and immutability paths passed.
- Regression source: `server/scripts/test-vn-accounting-statutory-foundation.py`.
- Metadata regression updated: `server/tests/organization-hrms-vn-accounting.test.mjs`.
- Exact repository build/unit/app-check/full migration replay has **not** been executed in this connector session. CRITICAL gate remains open; PR stays Draft.

## Release boundary

Backend/schema/business-rule change. No production migration, tenant mutation, merge or deploy without explicit user approval plus exact-head verification evidence.

## Next WS01 slices after this review

1. obtain WS00 ledger aggregate primitive, then implement exact financial close + retained earnings;
2. AR/AP aging/reconciliation/write-off/credit-control audit and closure;
3. treasury auto-match/payment batch/cash forecast;
4. deterministic VN tax/legal evaluator boundary;
5. budget/management accounting;
6. consolidation only after core correctness.
