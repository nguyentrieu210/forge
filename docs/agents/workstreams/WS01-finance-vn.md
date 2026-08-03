# WS01 — Finance + Vietnam Compliance

Status: **ACTIVE**  
Owner: **ChatGPT / WS01**  
Branch: `agent/ent-01-finance-vn`  
Draft PR: `#312`  
Product baseline: **Forge 0.2.0**  
Latest main incorporated: `main@b63c9a7a07e63dd73f944f450618c0b92f10067c` via internal sync PR `#334`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Claimed on 2026-08-03 from prior branch head `4bf50d8ae42e152e0a1daa25b0d05fdb72fa571d`. Current-main sync history: `#301`, `#323`, `#334`. These PRs only merge `main -> WS01 branch`; they do not merge WS01 business work into `main` and do not deploy production.

## Mission

Đưa Finance từ RC/subset lên business-complete: GL, AR/AP, cash/bank/treasury, period/closing, budget, multi-currency, consolidation và Vietnam statutory engine có nguồn/version/effective date.

## Capability families

`F01-F07`, `V01-V04` trong Enterprise Capability Map.

## Own

- accounting/finance domain packages/controllers
- `vn-accounting` app/domain + dedicated app worker
- financial reports/reconciliation
- statutory rule/e-invoice/tax evidence contracts thuộc finance
- accounting migrations/tests

## Critical invariants

Fixed-point money; debit=credit; immutable/traceable posting; cancel/reversal/correction; period guards; tenant/company/branch scope; multi-currency rounding; statutory source/version/effective-date evidence; deterministic legal-rule evaluation; no competing GL/payment/e-invoice source of truth.

## Capability audit — current WS01 state

| Capability | Current maturity | Evidence / gap |
| --- | --- | --- |
| F01 GL & close | RC core / close blocked | `JournalEntryController` enforces fixed-point balance + exact reversal; merged `0042` guards hard/soft periods, cancel and scope move. Legacy P&L/Balance Sheet views in `0008` aggregate whole tenant history and hard-code `/100.0`; no authoritative company/branch/account/date aggregate exists for safe automated year-end close/retained earnings. |
| F02 AR | RC | `FinancePaymentEntryController` supports partial allocation, unallocated customer advances, historical outstanding, FX difference and cancel reversal. `0030` + `finance-aging.ts` provide AR aging, Party Statement, Debt Summary and Advance Balance. Hard due-date cutover for new Sales Invoice still needs WS02 contract. |
| F03 AP | RC | Same Payment Ledger path supports supplier allocation/advances; AP aging, statements, debt and advances use the canonical query engine. Purchase Invoice hard due-date cutover needs WS03; withholding/payment forecast still incomplete. |
| F04 Cash/Bank/Treasury | RC subset + candidate matching on branch | Payment Entry, warehouse cash, Bank Transaction and reversible partial Bank Reconciliation exist. WS01 worker now has deterministic read-only bank-match candidates using exact company/currency/bank-account/minor-amount gates plus explained date/reference score. It never writes reconciliation. Payment batch and treasury cash position/forecast remain gaps. |
| F05 Budget/management | Wired/RC foundation on branch | New fixed-point `Finance Budget`, append-only `Finance Budget Revision`, and Reserve/Release `Finance Budget Commitment` controllers + D1 guards + metadata + tests. Stop/Warn/Ignore commitment control, source lineage and cross-company guards exist. Budget-vs-actual still needs authoritative GL aggregate DR-WS01-01. |
| F06 Multi-company/consolidation | Gap | Company masters exist; authoritative intercompany/elimination/consolidation close not evidenced and should wait for company-scoped ledger correctness. |
| F07 FX/revaluation | Partial/RC transaction | Payment path server-resolves FX and historical differences. Full period-end FX revaluation is blocked by DR-WS01-01; deferred-revenue lifecycle not yet evidenced. |
| V01 Accounting regime | RC foundation on branch | Versioned immutable legal rules + TT99 account map `0048`; TT99 voucher/book/BCTC registries + evidence guards `0049`. |
| V02 Tax | Wired/RC deterministic foundation on branch | `VN Tax Ruleset` is effective-dated/source-hashed/legal-rule-bound/test-vector-backed/immutable. Schema-v1 fixed-point app-worker evaluator validates all test vectors on submit and exposes read-only deterministic evaluation. Filing datasets remain later work. |
| V03 Payroll statutory | Dependency WS06 | WS01 consumes accounting outputs; statutory payroll evaluator belongs WS06. |
| V04 E-invoice/e-sign | Wired evidence boundary on branch | Canonical ERPNext `E-Invoice Submission` is surfaced, not forked. `0050` adds legal/ruleset/lineage/hash/provider evidence. Provider transport/signing/status synchronization remains WS10 dependency. |

### Key code evidence

- `server/packages/clouderp-core/src/controllers.ts`: balanced Journal Entry, fixed-point money, exact GL reversal.
- `server/packages/clouderp-selling/src/finance-controllers.ts`: AR/AP allocation, advances/unallocated, multi-currency/historical FX.
- `server/packages/query/src/finance-aging.ts`: AR/AP Aging, Party Statement, Debt Summary, Advance Balance with currency-scale aware formatting and as-of dates; query-worker uses this compiler.
- `server/migrations/tenant/0030_finance_invoice_aging.sql`: invoice due-date projection and explicit compatibility source flag.
- `server/migrations/tenant/0042_vn_accounting_period_hardening.sql`: canonical VN period integrity.
- `server/packages/clouderp-erpnext/src/enterprise-controllers.ts`: Bank Transaction, reversible Bank Reconciliation, canonical E-Invoice Submission.
- `server/apps-src/vn-accounting-worker/src/evaluator.ts`: bounded schema-v1 deterministic tax DSL using safe integer minor units + BigInt intermediates.
- `server/apps-src/vn-accounting-worker/src/bank-match.ts`: deterministic read-only bank matching candidates; exact amount/account/company/currency are mandatory.
- `server/packages/clouderp-erpnext/src/finance-budget.ts`: Budget/Revision/Commitment authoritative controller layer.
- `server/packages/document-kernel/src/store.ts`: no generic authoritative GL-balance-by-company/account/date reader yet.
- `server/migrations/tenant/0008_erpnext_breadth.sql`: legacy P&L/Balance Sheet/Cash Flow views are not safe sources for exact close because they are tenant-wide and assume two decimal places.

## Legacy PR disposition

- **#266 / r8 period integrity**: `MERGED / SUPERSEDED`. `0042` is canonical; stale r8 branch is history only.
- **#278 accounting 100 hardening**: `SELECTIVE REUSE`. Useful statutory/accounting ideas, but shared query/stock/selling/manufacturing edits and stale migration sequence must not be merged wholesale.
- **#286 TT99 localization**: `SELECTIVE REUSE / SUPERSEDED BY CANONICAL RECUT`. TT99 concepts were re-cut on current WS01; competing `E-Invoice Document` rejected in favor of canonical `E-Invoice Submission`.
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

### Slice B — V01 statutory registries

Capabilities: `V01-004`, `V01-005`, `V01-006`, `V01-007`.

- Added `TT99 Voucher Form`, `TT99 Book Form`, `TT99 Financial Statement Template`.
- All are effective-dated, test-evidence-bearing, four-eyes approved and immutable after submission.
- `0049_vn_accounting_statutory_registry_integrity.sql`: JSON/range/evidence/legal-binding/overlap/immutability guards.
- Navigation exposes TT99 registries plus canonical GL/Trial Balance/P&L/Balance Sheet/Cash Flow routes.

### Slice C — V02 deterministic tax rule boundary

Capabilities: foundation for `V02-001..014` deterministic legal-rule selection/calculation.

- App `vn-accounting` is now `1.5.0`, backed by worker `cloudforge-app-vn-accounting`.
- `VN Tax Ruleset` requires company/rule type/taxpayer segment, `schema_version=1`, effective date, legal rule, deterministic expression JSON, test vectors and SHA-256 source hash.
- `0049` enforces effective/evidence/legal-binding/overlap/immutability.
- `0051_vn_tax_ruleset_dsl_integrity.sql` freezes schema v1 so future evaluator versions cannot reinterpret approved historical rulesets.
- Worker validator executes every ruleset test vector on `submit`; mismatch returns 422 and prevents approval.
- Fixed-point evaluator uses safe integer minor units and BigInt intermediates; bounded depth/node/input/output/tier counts; supports input/const/add/sub/min/max/abs/floor-zero/basis-points/condition/progressive marginal tiers.
- `vn-accounting.tax.evaluate` is read-only: signed callback reads a submitted effective same-company ruleset, re-validates its vectors, evaluates inputs and returns outputs + legal/source/trace evidence. It never writes ledger or filing state.

### Slice D — V04 e-invoice evidence boundary

Capabilities: foundation for `V04-001..010` without duplicating provider transport.

- Reuses ERPNext `E-Invoice Submission` as the only canonical submission document.
- App surfaces it as an external DocType; no competing `E-Invoice Document`.
- `0050_vn_einvoice_compliance_evidence.sql` adds operation type (`Original/Adjustment/Replacement/Cancellation`), prior-submission lineage, legal rule, VN tax ruleset, payload hash, signature/tax-authority references and provider evidence.
- Queue state may exist before provider evidence. Provider-result states require 64-hex payload hash + non-empty provider/authority evidence.
- Non-original operations require a submitted prior e-invoice in same tenant/company.
- E-invoice ruleset must be same-company/effective and bind to the exact approved E-Invoice legal rule selected by the submission.
- Tax Specialist/Chief Accountant/Internal Auditor permissions are added to canonical e-invoice metadata.

### Slice E — F04 deterministic bank-match candidates

Capabilities: foundation for `F04-011` Auto Matching without unsafe auto-write.

- `vn-accounting.bank.match_candidates` reads one submitted Bank Transaction and a bounded Payment Entry window through signed platform callback.
- A candidate must match exact company, transaction direction, bank-side GL account, company currency and `received_amount_minor` before scoring.
- Same-day/date proximity, exact/contained bank reference and party token in bank description only increase an explainable score; they never bypass exact financial gates.
- Deterministic sort and bounded scan/limit; response exposes truncation evidence.
- Method is read-only. The authoritative write path remains submitted `Bank Reconciliation`, whose existing controller enforces reversible/partial reconciliation and over-reconcile guards.
- UI action with a proper external `Bank Transaction` Link is pending DR-WS01-05; backend candidate capability is independent and implemented.

### Slice F — F05 Budget / Commitment foundation

Capabilities: `F05-001`, `F05-003`, `F05-004`, `F05-005`, `F05-007`, `F05-008`, `F05-009`, foundation for `F05-010`.

- New `Finance Budget` supports Company/Cost Center/Project/Branch scope, exact company currency/scale, posting account, date interval and Stop/Warn/Ignore commitment control.
- Four-eyes budget approval is server-enforced; creator cannot approve their own budget. Submitted budget cannot silently change.
- `Finance Budget Revision` is append-only fixed-point delta + reason; revision cannot make effective budget negative or reduce below submitted commitments; cancel is also checked against remaining commitments.
- `Finance Budget Commitment` Reserve/Release is tied to submitted Material Request/Purchase Order/Expense Claim, same company and budget period.
- Release cannot exceed outstanding reserve for the exact source; cumulative commitments cannot go negative.
- Stop rejects over-budget commitments. Warn/Ignore do not silently claim compliance; the document snapshots exceeded state/amount and negative availability where applicable.
- No separate spending ledger and no fake Budget-vs-Actual. Actual spending remains dependent on canonical GL aggregate DR-WS01-01.
- `0052_finance_budget_commitment.sql`: metadata + primary D1 invariants.
- `0053_finance_budget_submission_closure.sql`: closes real draft→submit UPDATE path with period/source/company/release/cap guards.
- `0054_finance_budget_permission_alignment.sql`: keeps Purchase Manager submit capability but removes cancel metadata because cancellation remains an accounting-control role in controller enforcement.
- Generic metadata routes expose Budget/Revision/Commitment; no custom React renderer required.

## Migration reservation

- WS06 PR `#269` owns `0043-0047` on its branch.
- WS01 currently reserves `0048-0054`.
- Before any merge, re-check exact `main` and all active migration branches; renumber append-only if an authorized earlier merge consumes one of these numbers. Never rewrite an applied migration.

## Dependency requests

### Dependency request DR-WS01-01
- Target stream: **WS00**
- Need: authoritative ledger aggregate contract for company/branch/account/date range (balance + debit/credit), usable from domain controllers without direct SQL/document scans.
- Why generic: fiscal close, retained earnings, FX revaluation, budget-vs-actual and consolidation all need one canonical ledger read primitive.
- Contract proposed: fixed-point company-currency aggregates with tenant/company/branch/account/date filters and deterministic source evidence.
- Blocking: **yes** for automated financial close/year-end retained earnings, full FX revaluation and exact budget-vs-actual; **no** for other independent WS01 work.
- Temporary workaround: **none**. Do not close or calculate actuals from UI, raw document scans or tenant-wide legacy views.

### Dependency request DR-WS01-02
- Target stream: **WS02**
- Need: make Sales Invoice `due_date` first-class in controller/type validation before WS01 removes the `0030` compatibility fallback for new submissions.
- Why generic: due date is part of Sales Invoice commercial contract, while aging remains finance-owned.
- Blocking: **no**; current aging marks fallback explicitly as `posting_date_fallback`.
- Temporary workaround: preserve explicit fallback evidence.

### Dependency request DR-WS01-03
- Target stream: **WS03**
- Need: make Purchase Invoice `due_date` first-class before WS01 hard-cuts AP due-date presence for new submissions.
- Blocking: **no**.
- Temporary workaround: explicit `posting_date_fallback` evidence.

### Dependency request DR-WS01-04
- Target stream: **WS10**
- Need: provider adapter + digital signature + retry/idempotent submission/status-sync must populate the `0050` payload/signature/authority evidence fields on canonical `E-Invoice Submission`.
- Why generic: provider transport/secrets/retries belong Integration Hub, not accounting metadata.
- Blocking: **yes** for V04 Hardened/provider go-live; **no** for other WS01 work.
- Temporary workaround: queue/evidence boundary only; no fake provider status.

### Dependency request DR-WS01-05
- Target stream: **WS09**
- Need: App Action field compiler should allow a permission-checked Link to a declared `externalDocType`, not only doctypes owned by the same app.
- Why generic: many app actions need safe Link controls to platform/external doctypes; hard-coding a WS01 exception would violate App Factory ownership.
- Contract proposed: `parseAction` may resolve Link options against app-owned doctypes OR manifest-declared external doctypes, preserving permission_doctype enforcement.
- Blocking: **yes only for polished metadata Action UI for bank-match candidates**; backend bank candidate method is complete and read-only.
- Temporary workaround: invoke method through API/action plumbing only; do not replace the Link with an unvalidated Data field.

## Verification evidence

Regression sources now include:
- `server/scripts/test-vn-accounting-period-hardening.py`
- `server/scripts/test-vn-accounting-statutory-foundation.py`
- `server/scripts/test-vn-accounting-statutory-registry.py` (chains `0050/0051` e-invoice/tax DSL regression)
- `server/scripts/test-vn-einvoice-compliance.py`
- `server/scripts/test-finance-budget-migration.py`
- `server/tests/vn-accounting-statutory-pack.test.mjs`
- `server/tests/vn-tax-evaluator.test.mjs`
- `server/tests/vn-accounting-worker.test.mjs`
- `server/tests/vn-bank-match.test.mjs`
- `server/tests/finance-budget.test.mjs`
- existing `server/tests/organization-hrms-vn-accounting.test.mjs`

`server/package.json test:sql` is wired for finance aging/payment allocation, Finance Budget `0052-0054`, period `0042`, statutory `0048-0049`, and statutory registry regression chains e-invoice/tax DSL `0050-0051`. `test:unit` builds server then runs `tests/*.test.mjs`, so evaluator/worker/bank/budget tests are in the standard gate.

Latest product source baseline `main@b63c9a7a07e63dd73f944f450618c0b92f10067c` is incorporated through internal PR `#334` before continuing implementation. Intervening main source was WS14 frontend/mobile and did not overlap WS01 server zones.

Exact repository build/unit/app-check/full migration replay after latest WS01 additions: **NOT RUN yet**. Do not infer PASS from committed test source. GitHub validation will be used as the next evidence gate; missing CI evidence is not a reason to stop independent work.

## Release boundary

Backend/schema/business-rule work. No production migration, tenant mutation, merge to `main`, or deploy without explicit user approval plus exact-head verification evidence.

## Autonomous next slices

1. run exact-head validation and fix compile/SQL/app-check defects while continuing independent work;
2. audit/payment-batch and treasury controls; do not duplicate Payment Ledger or GL;
3. extend V02 from evaluator foundation toward VAT/CIT datasets where source data can be derived without shared-ledger bypass;
4. once DR-WS01-01 lands, implement exact financial close + retained earnings + FX revaluation + Budget vs Actual;
5. consolidation only after company-scoped ledger correctness is proven.
