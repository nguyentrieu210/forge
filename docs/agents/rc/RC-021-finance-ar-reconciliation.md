# RC-021 — Finance Accounts Receivable / Customer Reconciliation

**Risk:** CRITICAL  
**Branch:** `rc/w2-finance-ar-reconciliation`  
**Exact base:** `main@e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b`  
**Status:** implementation complete on branch; **not merge-ready until RC-020 shared posting dependency is reconciled and exact-head CRITICAL execution evidence is green**.  
**Merge/deploy:** not performed.

## 1. Mandatory source audit

Read from exact branch/main evidence before changing code:

- `skills/forge-enterprise-completion/SKILL.md`
- `PROJECT_CONTEXT.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `AI_HANDOFF.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/VALIDATION_GATES.md`
- `docs/agents/workstreams/WS01-finance-vn.md`

Required `docs/FORGE_RC_HARDENING_PLAN_20260803.md` is absent on exact current main. See **DR-RC021-02**.

Historical accounting/AR implementation was audited as evidence only. No old PR was reopened or used as branch base:

- PR #15 — invoice due date / AR aging foundation;
- PR #139 — partial Payment Entry, advance, Payment Allocation, Party Statement, Debt Summary;
- PR #278 — accounting integrity proposal, selective evidence only;
- PR #367 — exact-main Finance/VN convergence checkpoint.

## 2. Capability scope

Capability map F02 contains `F02-001..F02-018`.

This RC lane directly hardens the canonical settlement/reconciliation slice:

| Capability | RC-021 evidence | Recommendation |
| --- | --- | --- |
| F02-001 Customer account | Customer + receivable account are validated server-side and carried on Payment Ledger + GL | RC-candidate |
| F02-002 Sales Invoice posting | Existing fixed-point Sales Invoice GL + Payment Ledger; RC-021 routes runtime through hardened AR subclass | RC-candidate |
| F02-003 Customer advance | Safe Payment Entry requires explicit `allow_unallocated`; advance is negative Payment Ledger balance against Payment Entry | RC-candidate |
| F02-004 Payment schedule | Explicit invoice due date/aging exists; installment schedule is not proven | Wired |
| F02-005 Payment allocation | Append-only Payment Allocation consumes advance and reduces invoice outstanding without duplicate GL | RC-candidate |
| F02-006 Partial payment | Existing controller + RC-021 regression | RC-candidate |
| F02-007 Overpayment | Over-allocation fails; under-allocation becomes explicit advance | RC-candidate |
| F02-008 Credit note | RC-021 adds return/credit Sales Invoice correction against live outstanding | RC-candidate after gates |
| F02-009 Debit note | Ordinary Sales Invoice can increase AR, but first-class debit-note correction linkage is not proven | Wired / gap |
| F02-010 Write-off | No RC-021 first-class AR write-off authority added | Wired / gap |
| F02-011 Bad debt | No RC-021 bad-debt lifecycle added | Wired / gap |
| F02-012 AR aging | `FinanceQueryCompiler` derives outstanding from Payment Ledger by cutoff | RC-candidate |
| F02-013 Customer statement | Party Statement from Payment Ledger | RC-candidate |
| F02-017 Customer reconciliation | New derived `finance_ar_reconciliation` compares Payment Ledger base balance to customer GL control | RC-candidate after gates |
| F02-018 Multi-currency receivable | Existing historical-rate/base-outstanding FX tests and GL exchange-difference path | RC-candidate |

F02-014..016 are outside the settlement/reconciliation closure in this lane and are not promoted by this document.

**Overall F02 recommendation:** do not promote the entire F02 family to RC yet. The settlement core is RC-candidate, but first-class debit-note/write-off/bad-debt and fully-paid-invoice refund policy remain open, and exact-head execution + production evidence are not present.

## 3. Source of truth / authority

The authoritative path remains:

`Sales Invoice -> Payment Entry / Payment Allocation -> Payment Ledger + GL`

No RC-021 change creates:

- a shadow receivable ledger;
- a mutable customer balance table;
- frontend settlement authority;
- an independent `paid_amount` balance source.

Specific evidence:

- `server/packages/clouderp-selling/src/finance-controllers.ts`
  - live outstanding is read through `getOutstandingMinor` / `getBaseOutstandingMinor`;
  - allocations are bounded by submitted invoice outstanding;
  - unallocated receipt is represented as a Payment Ledger advance;
  - Payment Allocation moves append-only Payment Ledger balances and intentionally posts no duplicate cash/party GL;
  - cancel emits reversal rows.
- `server/packages/clouderp-selling/src/safe-finance-payment-entry.ts`
  - customer/supplier advance requires explicit operator confirmation;
  - registry uses this safe controller.
- `server/packages/document-kernel/src/d1-store.ts`
  - production outstanding queries are tenant-bound and sum immutable Payment Ledger rows;
  - mutation receipts provide command idempotency/retry identity.
- `server/packages/query/src/finance-aging.ts`
  - AR Aging, Party Statement, Debt Summary and Advance Balance read Payment Ledger.
- `server/migrations/tenant/0030_finance_invoice_aging.sql`
  - explicitly retains Payment Ledger as outstanding authority.
- `server/migrations/tenant/0031_finance_payment_allocations.sql`
  - database guards prevent invoice outstanding below zero and prevent advance over-consumption.

## 4. RC-021 implementation

### 4.1 Credit / return correction

Added `server/packages/clouderp-selling/src/ar-sales-invoice-controller.ts` and routed Sales Invoice to it in `registry.ts`.

Credit/return behavior:

- remains a `Sales Invoice`, not a new AR ledger/doc authority;
- requires `is_return=true` + `return_against`;
- source invoice must be submitted, non-return, same tenant/customer/company/currency/receivable account;
- amount must be positive and cannot exceed live transaction/base outstanding;
- credit note must not advance Sales Order billing;
- normal Sales Invoice GL calculation is reused then reversed for the credit note;
- Payment Ledger receives one negative correction against the original Sales Invoice;
- the credit note itself has zero standalone outstanding;
- cancellation reverses the exact historical credit-note GL and reverses the Payment Ledger correction;
- event types distinguish credit-note submit/cancel from normal Sales Invoice progress.

This preserves the invariant that invoice outstanding is always rebuilt from Payment Ledger.

### 4.2 Database guards + reconciliation projection

Added forward-only migration:

`server/migrations/tenant/0111_finance_ar_reconciliation.sql`

It adds:

- submitted credit-note source guards at D1 level;
- same-tenant/customer/company/currency/debit-account validation;
- metadata-driven `is_return` / `return_against` fields without hard-coding frontend state;
- `finance_ar_reconciliation`, a derived read-only projection comparing:
  - `SUM(payment_ledger_entries.base_amount_minor)` for Customer/Receivable;
  - `SUM(gl_entries.debit_minor-credit_minor)` for customer-dimension AR control;
  - grouped by tenant/company/customer/account/company currency/scale.

`difference_minor != 0` is surfaced as unreconciled. The view never repairs or mutates ledger data.

## 5. Flow coverage

Required business flow is covered as follows:

`Sales Invoice -> partial Payment -> second Payment -> advance -> Payment Allocation -> credit/return correction -> cancel/reissue correction -> final Payment -> reconciliation -> aging`

Focused source: `server/tests/finance-ar-rc021.test.mjs`.

Coverage:

- partial allocation;
- second payment;
- one Payment Entry allocated to multiple invoices;
- under-allocation as explicit customer advance;
- unallocated receipt without explicit confirmation rejected;
- later Payment Allocation consumes advance;
- active paid invoice cancel rejected;
- over-credit/return beyond live outstanding rejected;
- credit note reduces only original authoritative outstanding;
- credit-note cancel restores original outstanding with reversal rows;
- final payment retry with the same command id is idempotent and does not duplicate ledger rows;
- cancelled final Payment Entry restores invoice outstanding;
- replacement final payment settles both invoices;
- Payment Ledger base balance equals customer GL control balance;
- AR aging compiler remains tenant-bound and Payment-Ledger authoritative.

Existing exact-main regressions retained and relevant:

- `server/tests/o2c.test.mjs`
  - exact minor-unit O2C GL/payment settlement;
  - payment allocation cannot exceed live outstanding;
  - cross-aggregate payment race cannot make receivable outstanding negative;
  - partial then final settlement status;
  - foreign-currency settlement and exchange difference;
  - final partial FX allocation consumes exact base outstanding.
- `server/tests/finance-aging-policy.test.mjs`
  - Accounts roles may run AR aging;
  - unrelated roles are denied.

## 6. Partial states and edge semantics

| State | Authority / behavior |
| --- | --- |
| Invoice unpaid | positive Payment Ledger balance against Sales Invoice |
| Partial payment | negative Payment Entry allocation reduces invoice Payment Ledger balance |
| Multiple invoices | one Payment Entry may carry multiple bounded references |
| Under-allocation | residual becomes explicit negative advance against Payment Entry |
| Advance allocation | Payment Allocation increases source advance toward zero and decreases invoice outstanding by equal amount |
| Over-allocation | controller + D1 guard fail closed before invoice balance becomes negative |
| Cancel payment | GL + Payment Ledger reversal rows restore prior state |
| Credit/return | reversed invoice GL + negative Payment Ledger correction against original invoice |
| Cancel credit | exact GL reversal + Payment Ledger reversal restores original outstanding |
| Aging | rebuilds invoice balance from Payment Ledger at report cutoff |
| Reconciliation | rebuilds both Payment Ledger base and customer GL control, surfaces difference only |

No mutable `outstanding` column is used as settlement authority. Hydrated `outstanding_amount` remains a projection for document/status presentation.

## 7. Tenant / company / permission / audit

### Tenant

- D1 `getDocument`, `getOutstandingMinor`, `getBaseOutstandingMinor`, voucher GL reads and report SQL bind `tenant_id`.
- migration guard source lookup requires `source.tenant_id=NEW.tenant_id`.
- migration regression contains same customer/invoice identifiers in two tenants and proves reconciliation does not mix them.

### Company/account/currency

Payment Entry, Payment Allocation and RC-021 credit note all fail closed on cross-company/party/account/currency context.

### Permission

- writes continue through the existing document kernel/API permission boundary; RC-021 does not introduce a side write API;
- existing Sales Invoice / Payment Entry DocPerm remains the permission authority;
- Payment Allocation metadata from migration 0031 allows Accounts Manager/System Manager submit/cancel and does not grant Accounts User submit/cancel;
- `finance-aging-policy.test.mjs` is focused report-permission evidence for AR aging.

### Audit / immutability

- correction and cancellation append reversal ledger rows;
- no ledger row is updated in place;
- command receipt idempotency prevents duplicate mutation effects on identical retry;
- reconciliation is derived and non-mutating.

## 8. Migration verification

Added:

- `server/scripts/test-finance-ar-reconciliation.py`
- `server/tests/finance-ar-migration-rc021.test.mjs` to invoke the semantic migration regression from the normal Node unit-test glob.

The migration regression covers:

- replay/idempotent migration execution;
- metadata field uniqueness;
- cross-tenant/company credit-note rejection;
- self-reference rejection;
- missing source rejection;
- tenant-separated reconciliation;
- Payment Allocation net-zero control effect;
- deliberate GL drift surfaced as `difference_minor != 0` / `reconciled=0`.

An isolated SQLite syntax/semantic smoke of the exact migration SQL was executed during implementation and passed. This is **not** a substitute for exact-head repository build/typecheck/full test execution.

## 9. Validation gates

CRITICAL required evidence from `docs/VALIDATION_GATES.md`:

| Gate | Evidence state |
| --- | --- |
| Targeted build / typecheck | PENDING exact-head CI/executable checkout |
| Focused unit/integration | Source added; exact-head execution PENDING |
| Permission | Existing focused AR aging policy regression; exact-head execution PENDING |
| Tenant isolation | New migration regression + production D1 tenant predicates; exact-head execution PENDING |
| Failure paths | New unsafe-advance/active-cancel/over-credit source + existing over-allocation/race regressions; execution PENDING |
| Correction/cancel | New credit cancel/reissue + existing Payment Entry cancel reversal; execution PENDING |
| Allocation edge cases | New partial/multiple/advance path + existing over-allocation/race; execution PENDING |
| Reconciliation | New Payment Ledger vs GL projection + drift regression; execution PENDING |
| GL consistency | New control-account equality assertion + existing O2C/FX tests; execution PENDING |
| Idempotency/retry | New same-command retry/no duplicate ledger assertion; execution PENDING |
| Migration replay | New 0111 semantic replay source; execution PENDING |
| Production evidence | NOT RUN / NOT CLAIMED |

Local checkout was unavailable because the execution shell could not resolve `github.com`; therefore no fake local PASS is claimed. GitHub PR CI must provide the exact-head execution evidence.

## 10. Dependency Requests

### DR-RC021-01 — RC-020 shared posting / period contract

**Owner:** RC-020 / Finance Posting & Period lane.  
**State:** OPEN.

RC-020 branch `rc/w2-finance-period-posting` is concurrently ahead of the same main base and currently owns migration `0110_rc020_finance_posting_period_integrity.sql`. Its shared posting/period contract is not yet on main/frozen.

RC-021 response:

- consumed exact current main only, per authority instruction;
- did not cherry-pick or couple to the RC-020 branch;
- moved RC-021 migration to `0111` to avoid a filename collision;
- continued all independent AR work.

**Before RC-021 merge:** rebase on the main that contains frozen RC-020, audit `0111` against any new authoritative accounting scope/branch/period columns, rerun CRITICAL gates, and change the reconciliation projection only if RC-020 establishes a different shared scope contract.

### DR-RC021-02 — required RC Hardening Plan missing

**Owner:** release-control/documentation lane.  
**State:** OPEN.

`docs/FORGE_RC_HARDENING_PLAN_20260803.md` is required by the task but returns Not Found on exact main. RC-021 used Capability Status, Validation Gates, North Star and WS01 evidence instead; absence is recorded rather than fabricated.

### DR-RC021-03 — fully-paid invoice refund / excess customer credit policy

**Owner:** Finance business/shared posting contract.  
**State:** OPEN.

Current authoritative Payment Ledger guards correctly prohibit a Sales Invoice balance below zero. RC-021 credit notes therefore apply only up to live outstanding. A return after the invoice is fully paid would require an explicit policy for customer refund versus reusable customer credit/advance and a canonical ledger representation for that liability/refund.

RC-021 does **not** invent a negative invoice balance or shadow credit ledger. This does not block partial-outstanding correction, advance allocation, cancellation, reconciliation or aging work completed here.

## 11. Remaining gaps

1. First-class debit-note correction linkage is not proven; normal Sales Invoice posting can increase AR but is not promoted as F02-009 RC evidence.
2. Dedicated write-off / bad-debt AR lifecycle is not completed by this lane.
3. Fully-paid invoice return/refund/excess credit is DR-RC021-03.
4. `finance_ar_reconciliation` is a backend/database control projection; a dedicated generic report/navigation surface is not added here. Existing AR Aging, Party Statement and Debt Summary remain report surfaces.
5. RC-020 must land/freeze before final merge audit because it owns shared period/posting scope and migration 0110.
6. Exact-head build/typecheck/unit/integration/migration execution is still required.
7. Production/staging migration, live tenant reconciliation and production evidence were not run; Hardened is impossible to claim.

## 12. Maturity recommendation

**RC-021 settlement/reconciliation slice:** **RC-candidate, gated**.  
**F02 overall:** **Wired with RC-candidate core**, not yet globally RC.  
**Hardened:** **No**.

Promotion requires:

1. RC-020 freeze/merge and exact-main reconciliation of shared accounting scope;
2. exact-head CRITICAL CI PASS for build/typecheck/unit/integration/migration/permission/tenant/failure/correction/reconciliation/idempotency;
3. explicit resolution of any capabilities being promoted beyond the settlement core;
4. staging/production evidence for any later Hardened claim.

No merge, deploy, production migration, secret/DNS change or customer-data mutation was performed by RC-021.
