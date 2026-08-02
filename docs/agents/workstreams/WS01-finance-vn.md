# WS01 — Finance + Vietnam Compliance

Status: **ACTIVE**  
Owner: **ChatGPT / WS01**  
Branch: `agent/ent-01-finance-vn`  
Draft PR: `#312`  
Product baseline: **Forge 0.2.0**  
Latest main incorporated: `main@31233237d9310e628174e06677eaef117242ee9a` via internal sync PR `#323`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Claimed on 2026-08-03 from prior branch head `4bf50d8ae42e152e0a1daa25b0d05fdb72fa571d`. Initial current-main sync used internal PR `#301`; later WS14-only main drift was incorporated through internal PR `#323` before continuing implementation.

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
| F01 GL & close | RC core / close blocked | `JournalEntryController` enforces fixed-point balance + exact reversal; merged `0042` guards hard/soft periods, cancel and scope move. Current P&L/Balance Sheet views in `0008` aggregate whole tenant history and hard-code `/100.0`; no authoritative company/branch/account/date aggregate exists for safe automated year-end close/retained earnings. |
| F02 AR | RC | `FinancePaymentEntryController` supports partial allocation, unallocated customer advances, historical outstanding, FX difference and cancel reversal. `0030` + `finance-aging.ts` provide due-date projection, AR aging, Party Statement, Debt Summary and Advance Balance. New-invoice hard due-date cutover still needs WS02 controller contract. |
| F03 AP | RC | Same Payment Ledger path supports supplier partial allocation/advances; `finance-aging.ts` provides AP aging, statements, debt and advance views. Purchase Invoice hard due-date cutover needs WS03 controller contract; withholding/payment forecast still incomplete. |
| F04 Cash/Bank/Treasury | Wired/RC subset | Payment Entry, warehouse cash, Bank Transaction and reversible partial Bank Reconciliation exist. Auto-match, payment batch, treasury cash position/forecast still incomplete. |
| F05 Budget/management | Gap/Partial | Cost center/project dimensions exist; annual/department/cost-center/project budget, commitment/encumbrance and rolling forecast not yet evidenced. |
| F06 Multi-company/consolidation | Gap | Company masters exist; authoritative intercompany/elimination/consolidation close not evidenced. |
| F07 FX/revaluation | Partial/RC transaction | Payment path server-resolves FX and historical differences; full period-end FX revaluation and deferred-revenue lifecycle not evidenced. |
| V01 Accounting regime | RC foundation on branch | Versioned immutable legal rules + TT99 account map in `0048`; TT99 voucher/book/BCTC registries and evidence guards in `0049`. |
| V02 Tax | Wired foundation on branch | `VN Tax Ruleset` is effective-dated, source-hashed, legal-rule-bound, test-vector-backed and immutable after approval through `0049`. Deterministic evaluator/filing datasets remain later slices. |
| V03 Payroll statutory | Dependency WS06 | WS01 consumes accounting outputs; statutory payroll evaluator belongs WS06. |
| V04 E-invoice/e-sign | Wired evidence boundary on branch | Canonical ERPNext `E-Invoice Submission` is surfaced, not forked. `0050` adds legal/ruleset/lineage/hash/provider-evidence contract. Provider transport/signing/status synchronization remains WS10 dependency. |

### Key code evidence

- `server/packages/clouderp-core/src/controllers.ts`: balanced Journal Entry, fixed-point money, exact GL reversal.
- `server/packages/clouderp-selling/src/finance-controllers.ts`: AR/AP allocation, advances/unallocated, multi-currency/historical FX.
- `server/packages/query/src/finance-aging.ts`: AR/AP Aging, Party Statement, Debt Summary, Advance Balance with currency-scale aware formatting and as-of dates.
- `server/migrations/tenant/0030_finance_invoice_aging.sql`: invoice due-date projection and compatibility source flag.
- `server/migrations/tenant/0042_vn_accounting_period_hardening.sql`: canonical VN period integrity.
- `server/packages/clouderp-erpnext/src/enterprise-controllers.ts`: Bank Transaction, reversible Bank Reconciliation, canonical E-Invoice Submission.
- `server/packages/document-kernel/src/store.ts`: no generic authoritative GL-balance-by-company/account/date reader yet.
- `server/migrations/tenant/0008_erpnext_breadth.sql`: legacy P&L/Balance Sheet/Cash Flow views are not safe sources for exact close because they are tenant-wide and assume two decimal places.

## Legacy PR disposition

- **#266 / r8 period integrity**: `MERGED / SUPERSEDED`. `0042` is canonical; stale r8 branch is history only.
- **#278 accounting 100 hardening**: `SELECTIVE REUSE`. Useful statutory/accounting ideas, but shared query/stock/selling/manufacturing edits and stale migration sequence must not be merged wholesale.
- **#286 TT99 localization**: `SELECTIVE REUSE / SUPERSEDED BY CANONICAL RECUT`. TT99 concepts were re-cut on WS01 current-main baseline; competing `E-Invoice Document` rejected in favor of canonical `E-Invoice Submission`.
- **#199 Daily Detailed Ledger**: `COORDINATE`. Cross-stream WS01/WS08/WS12.
- **#295 Tiến Đạt purchase/payable**: `DEPENDENCY / PRESERVE CONTRACT`. Primary WS03/WS17; Payment Ledger remains authoritative payable source.
- **#269 HRM statutory payroll**: `DEPENDENCY WS06`. No competing payroll evaluator; its known `0043-0047` range is preserved.
- **#201 manufacturing costing**: `DEPENDENCY / PRESERVE CONTRACT`. Stock/GL remain canonical; no separate costing ledger.

## Implemented slices on branch / PR #312

### Slice A — V01 statutory source/version foundation

Capabilities: `V01-001`, `V01-003`, foundation for `V01-009`.

- `VN Legal Rule`: submittable/versioned, mandatory official source hash, effective range, immutable after approval, read-only approval display fields.
- Roles: `Tax Specialist`, `Internal Auditor`.
- `TT99 Account Map`: company/effective-date scoped and legal-rule-bound.
- Four-eyes workflows with `allow_self_approval=false`.
- `0048_vn_accounting_statutory_foundation.sql`: range/evidence/overlap/immutability/TT99 target/tenant guards.

### Slice B — V01/V02 statutory registries

Capabilities: `V01-004`, `V01-005`, `V01-006`, `V01-007`, foundation for `V02-001..014` rule evaluation.

- App `vn-accounting` now `1.3.1`.
- Added `TT99 Voucher Form`, `TT99 Book Form`, `TT99 Financial Statement Template`, `VN Tax Ruleset`.
- All registries are effective-dated, evidence-bearing, four-eyes approved and immutable after submission.
- `VN Tax Ruleset` requires company/rule type/taxpayer segment, legal rule, deterministic expression JSON, test vectors and SHA-256 source hash.
- `0049_vn_accounting_statutory_registry_integrity.sql`: JSON/range/evidence/legal-binding/overlap/immutability guards.
- Navigation exposes TT99 registries plus canonical GL/Trial Balance/P&L/Balance Sheet/Cash Flow routes.

### Slice C — V04 e-invoice evidence boundary

Capabilities: foundation for `V04-001..010` without duplicating provider transport.

- Reuses ERPNext `E-Invoice Submission` as the only canonical submission document.
- App surfaces it as an external DocType; no competing `E-Invoice Document`.
- `0050_vn_einvoice_compliance_evidence.sql` adds operation type (`Original/Adjustment/Replacement/Cancellation`), prior-submission lineage, legal rule, VN tax ruleset, payload hash, signature/tax-authority references and provider evidence.
- Queue state may exist before provider evidence. Moving submitted documents to `Submitted/Accepted/Rejected/Cancelled` requires a 64-hex payload hash and non-empty provider/authority evidence.
- Non-original operations require a submitted prior e-invoice in the same tenant/company.
- E-invoice ruleset must be company/effective-date correct and link to the exact approved E-Invoice legal rule selected by the submission.
- Tax Specialist/Chief Accountant/Internal Auditor access is added to canonical e-invoice metadata.

## Migration reservation

- WS06 PR `#269` owns `0043-0047` on its branch.
- WS01 currently reserves `0048`, `0049`, `0050`.
- Before any merge, re-check exact main and all active migration branches; renumber append-only if an authorized earlier merge consumes one of these numbers. Never rewrite an applied migration.

## Dependency requests

### Dependency request DR-WS01-01
- Target stream: **WS00**
- Need: authoritative ledger aggregate contract for company/branch/account/date range (balance + debit/credit), usable from domain controllers without direct SQL/document scans.
- Why generic: fiscal close, retained earnings, revaluation and reconciliation need one canonical ledger read primitive.
- Contract proposed: fixed-point company-currency aggregates with tenant/company/branch/account/date filters and deterministic source evidence.
- Blocking: **yes** for automated financial close/year-end retained earnings; **no** for remaining independent WS01 work.
- Temporary workaround: **none**. Do not close from UI, raw document scans or tenant-wide legacy report views.

### Dependency request DR-WS01-02
- Target stream: **WS02**
- Need: make Sales Invoice `due_date` first-class in controller/type validation before WS01 removes the 0030 compatibility fallback for new submissions.
- Why generic: due date is part of Sales Invoice commercial contract, while aging remains finance-owned.
- Blocking: **no**; current aging marks legacy/new omissions as `posting_date_fallback`.
- Temporary workaround: retain explicit fallback evidence, do not silently pretend fallback is contractual due date.

### Dependency request DR-WS01-03
- Target stream: **WS03**
- Need: confirm Purchase Invoice controller/type enforces first-class `due_date` before WS01 hard-cuts AP due-date presence for new submissions.
- Blocking: **no**.
- Temporary workaround: same explicit `posting_date_fallback` evidence from `0030`.

### Dependency request DR-WS01-04
- Target stream: **WS10**
- Need: provider adapter + digital-signature + retry/idempotent submission/status-sync implementation must populate the `0050` payload/signature/authority evidence fields on canonical `E-Invoice Submission`.
- Why generic: provider transport/secrets/retries belong Integration Hub, not accounting metadata.
- Blocking: **yes** for V04 Hardened/provider go-live; **no** for statutory evidence contract and other WS01 work.
- Temporary workaround: queue/evidence boundary only; no fake provider status.

## Verification evidence

- Latest main through `31233237d9310e628174e06677eaef117242ee9a` incorporated before continuing business implementation.
- Regression sources:
  - `server/scripts/test-vn-accounting-period-hardening.py`
  - `server/scripts/test-vn-accounting-statutory-foundation.py`
  - `server/scripts/test-vn-accounting-statutory-registry.py`
  - `server/scripts/test-vn-einvoice-compliance.py`
  - `server/tests/vn-accounting-statutory-pack.test.mjs`
  - existing `server/tests/organization-hrms-vn-accounting.test.mjs`
- `server/package.json test:sql` is wired for 0042/0048/0049; 0050 regression wiring is pending next branch commit.
- Exact repository build/unit/app-check/full migration replay: **NOT RUN** in this connector session. Do not infer PASS from committed test source.

## Release boundary

Backend/schema/business-rule change. No production migration, tenant mutation, merge or deploy without explicit user approval plus exact-head verification evidence.

## Autonomous next slices

1. wire 0050 regression into SQL gate and keep PR #312 as rolling checkpoint;
2. surface/audit AR/AP Aging, Party Statement, Debt Summary and Advance Balance as canonical finance operations; do not duplicate their query engine;
3. complete bank auto-match/payment batch/treasury controls in WS01-owned finance layer;
4. continue deterministic VAT/CIT evaluator/dataset boundary from `VN Tax Ruleset`;
5. add budget/commitment management accounting primitives;
6. once DR-WS01-01 lands, implement exact financial close + retained earnings + FX revaluation;
7. consolidation only after company-scoped ledger correctness is proven.
