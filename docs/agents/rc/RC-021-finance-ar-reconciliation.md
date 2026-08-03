# RC-021 — Finance Accounts Receivable / Customer Reconciliation

**Risk:** CRITICAL  
**Branch:** `rc/w2-finance-ar-reconciliation`  
**Exact creation base:** `main@e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b`  
**PR:** #440 (Draft)  
**Merge/deploy:** NOT performed.  
**Recommendation:** settlement/reconciliation slice is **RC-candidate, gated**; F02 overall is not globally RC/Hardened.

## 1. Mandatory audit

Read before implementation:

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

Required `docs/FORGE_RC_HARDENING_PLAN_20260803.md` is absent on exact current-main history audited by RC-021. This is recorded as DR-RC021-02 rather than fabricated.

Historical accounting/AR work was audited as evidence only. No historical PR was reopened, cherry-picked, or used as the branch base:

- PR #15 — invoice due date / AR aging foundation;
- PR #139 — partial Payment Entry, customer advance, Payment Allocation, Party Statement, Debt Summary;
- PR #278 — accounting integrity evidence;
- PR #367 — Finance/VN exact-main convergence checkpoint.

## 2. Authority / source of truth

RC-021 preserves the canonical settlement path:

`Sales Invoice -> Payment Entry / Payment Allocation -> Payment Ledger + GL`

It does **not** introduce:

- a shadow receivable ledger;
- a mutable duplicate customer-balance table;
- frontend-only settlement state;
- an independent `paid_amount` authority competing with Payment Ledger / GL.

Existing authoritative evidence:

- `server/packages/clouderp-selling/src/finance-controllers.ts`
  - reads live transaction/base outstanding from the document reader;
  - bounds invoice allocations by live outstanding;
  - supports one Payment Entry referencing multiple invoices;
  - represents residual customer receipt as explicit Payment Ledger advance;
  - Payment Allocation redistributes Payment Ledger references and intentionally creates no duplicate cash/party GL;
  - cancellation emits reversal rows.
- `server/packages/clouderp-selling/src/safe-finance-payment-entry.ts`
  - unallocated customer receipt requires explicit `allow_unallocated` confirmation.
- `server/packages/document-kernel/src/d1-store.ts`
  - outstanding is tenant-bound `SUM` over immutable Payment Ledger rows;
  - mutation receipts provide command retry/idempotency identity.
- `server/packages/query/src/finance-aging.ts`
  - Accounts Receivable Aging, Party Statement, Debt Summary and Advance Balance derive from Payment Ledger.
- migrations `0030_finance_invoice_aging.sql` and `0031_finance_payment_allocations.sql`
  - preserve Payment Ledger as balance authority and fail closed on negative invoice outstanding / advance over-consumption.

Hydrated `outstanding_amount` remains a projection/status convenience. It is not settlement authority.

## 3. Capability coverage

Capability map F02 contains `F02-001..F02-018`.

| Capability | RC-021 evidence | Recommendation |
| --- | --- | --- |
| F02-001 Customer account | customer + receivable account server validation; Payment Ledger + GL party dimension | RC-candidate |
| F02-002 Sales Invoice posting | fixed-point Sales Invoice GL + Payment Ledger; runtime routed through hardened AR subclass | RC-candidate |
| F02-003 Customer advance | explicit unallocated-receipt semantics; negative Payment Ledger balance against Payment Entry | RC-candidate |
| F02-004 Payment schedule | due date/aging proven; installment schedule not proven | Wired |
| F02-005 Payment allocation | append-only source/target Payment Ledger redistribution, no duplicate GL | RC-candidate |
| F02-006 Partial payment | focused canonical-flow regression | RC-candidate |
| F02-007 Overpayment | over-allocation rejected; under-allocation becomes explicit advance | RC-candidate |
| F02-008 Credit note | RC-021 return/credit Sales Invoice against live authoritative outstanding | RC-candidate, gated |
| F02-009 Debit note | ordinary invoice can increase AR; first-class linked debit-note correction not proven | Wired / gap |
| F02-010 Write-off | no first-class RC write-off lifecycle added | Wired / gap |
| F02-011 Bad debt | no dedicated bad-debt lifecycle added | Wired / gap |
| F02-012 AR aging | Payment-Ledger-derived cutoff aging | RC-candidate |
| F02-013 Customer statement | Party Statement running balance from Payment Ledger | RC-candidate |
| F02-017 Customer reconciliation | `finance_ar_reconciliation` Payment Ledger base vs customer GL control | RC-candidate, gated |
| F02-018 Multi-currency receivable | historical/base outstanding + exchange-difference regressions | RC-candidate |

F02-014..016 are outside this settlement/reconciliation closure and are not promoted by RC-021.

## 4. Implementation

### 4.1 AR-hardened Sales Invoice controller

Added:

`server/packages/clouderp-selling/src/ar-sales-invoice-controller.ts`

and changed `server/packages/clouderp-selling/src/registry.ts` so Sales Invoice is handled by `ArSalesInvoiceController`.

Normal Sales Invoice behavior delegates to the existing canonical controller.

Credit/return behavior:

- uses `Sales Invoice` with `is_return=true`; no new AR ledger authority;
- requires `return_against`;
- rejects self-reference;
- source must be submitted and non-return;
- source is read in the current tenant;
- customer, company, currency, company currency and receivable account must match;
- amount must be positive;
- transaction/base credit cannot exceed live transaction/base source outstanding;
- credit note cannot advance Sales Order billing;
- normal canonical invoice GL is reused and reversed;
- one negative Payment Ledger correction is posted against the original Sales Invoice;
- credit note itself has zero standalone outstanding;
- cancel reads the exact historical credit-note GL revision and appends reversal GL + Payment Ledger rows;
- events distinguish credit submit/cancel from ordinary invoice progress.

This keeps original-invoice outstanding rebuildable exclusively from Payment Ledger.

### 4.2 D1 guard + reconciliation projection

Forward migration:

`server/migrations/tenant/0112_rc021_finance_ar_reconciliation.sql`

It adds:

1. fail-closed submitted credit-note source guards;
2. same-tenant/customer/company/currency/receivable-account checks;
3. metadata-driven Sales Invoice `is_return` and `return_against` fields;
4. read-only `finance_ar_reconciliation` projection.

The projection compares, by tenant/company/customer/account/company currency/scale:

- `SUM(payment_ledger_entries.base_amount_minor)` for Customer/Receivable;
- `SUM(gl_entries.debit_minor-credit_minor)` for customer-dimension AR control.

It returns `difference_minor` and `reconciled`. A mismatch is surfaced, never silently repaired.

Payment Allocation has no GL by design and its source/target Payment Ledger rows net to zero at control-account scope.

## 5. Required flow proof

Focused regression:

`server/tests/finance-ar-rc021.test.mjs`

Proven flow:

`Sales Invoice -> partial Payment -> second multi-invoice Payment -> customer advance -> Payment Allocation -> credit/return -> cancel/reissue correction -> final Payment -> cancel/replacement Payment -> reconciliation -> aging/report`

Covered states and failures:

- partial allocation;
- multiple invoices;
- one Payment Entry across multiple invoices;
- under-allocation as explicit customer advance;
- unallocated receipt without explicit confirmation rejected;
- advance subsequently allocated to invoices;
- over-allocation rejected by canonical controller/DB invariants;
- active settled invoice cancel rejected;
- credit larger than live outstanding rejected;
- credit reduces original invoice outstanding only;
- credit note has no competing standalone AR balance;
- credit cancel restores original outstanding using reversal rows;
- final payment retry with same command id returns the same receipt and does not duplicate ledger rows;
- Payment Entry cancel restores prior invoice balances;
- replacement final payment settles both invoices;
- customer Payment Ledger base balance equals customer GL control balance;
- aging SQL remains tenant-bound and Payment-Ledger authoritative.

Existing `server/tests/o2c.test.mjs` additionally proves:

- exact minor-unit O2C GL/payment settlement;
- payment allocation cannot exceed live outstanding;
- cross-aggregate payment race cannot make receivable outstanding negative;
- partial/final settlement status;
- multi-currency invoice/payment GL;
- exchange gain/loss;
- final partial FX allocation consumes exact base outstanding.

## 6. Customer ledger / reports

`server/tests/finance-report-suite.test.mjs` proves:

- Party Statement requires bounded party/account/currency/date context;
- opening + running customer balance comes from Payment Ledger;
- Debt Summary nets invoice balances with advances;
- Advance Balance derives from append-only Payment Ledger rows and recognizes Payment Allocation;
- report parameters are bound rather than interpolated.

`server/tests/finance-aging-query.test.mjs` proves AR Aging tenant/cutoff binding and expected aging columns.

`server/tests/finance-aging-policy.test.mjs` proves report permission boundaries.

## 7. Permission evidence

Write authority remains the existing server permission layer. RC-021 adds no side write endpoint.

`server/packages/policy/src/index.ts` currently requires:

- Sales Invoice create/save: allowed user roles including Accounts User;
- Sales Invoice submit/cancel: Accounts Manager / System Manager authority;
- Payment Entry and Payment Allocation submit/cancel: Accounts Manager / System Manager authority.

RC-021 regression explicitly proves:

- Accounts User may create a credit-note draft;
- Accounts User cannot submit it (`PERMISSION_DENIED`);
- Accounts Manager can submit it;
- successful authorized submit changes authoritative source outstanding.

## 8. Tenant / company scope

Tenant evidence:

- D1 document/outstanding/GL readers bind `tenant_id`;
- report SQL binds tenant as a parameter;
- credit source D1 guard requires `source.tenant_id=NEW.tenant_id`;
- migration semantic regression seeds identical invoice/customer identifiers in two tenants and proves reconciliation remains separated.

Legal/accounting context evidence:

- Payment Entry, Payment Allocation and credit-note correction fail closed on company/party/account/currency mismatch;
- reconciliation groups by tenant/company/customer/receivable account/company currency/scale.

RC-020 shared posting/branch/period scope is a merge-time dependency; see DR-RC021-01.

## 9. Audit / correction / immutability / retry

- ledger corrections and cancels append reversal rows;
- RC-021 never updates GL/Payment Ledger rows in place;
- credit cancel reads exact historical GL before reversing;
- mutation receipt identity prevents duplicate effects for same-command retries;
- focused retry regression asserts ledger-row count is unchanged on identical submit retry;
- reconciliation is derived and non-mutating.

## 10. Migration semantic regression

Added:

- `server/scripts/test-finance-ar-reconciliation.py`
- `server/tests/finance-ar-migration-rc021.test.mjs`

It verifies:

- migration replay/idempotency;
- metadata field uniqueness;
- missing source rejection;
- self-reference rejection;
- cross-tenant/company invalid-source rejection;
- tenant-separated Payment Ledger/GL reconciliation;
- Payment Allocation net-zero control effect;
- deliberate GL drift appears as nonzero `difference_minor` / `reconciled=0`.

Success marker:

`FINANCE_AR_RECONCILIATION_0112_PASS`

## 11. Validation evidence

Dedicated non-deploy workflow:

`.github/workflows/rc021-validation.yml`

It checks out the exact PR head and runs:

- locked dependency install;
- full-server build baseline for inherited-debt visibility;
- emitted AR artifact verification;
- focused RC-021 TypeScript check;
- focused RC-021 build to `.rc021-dist`;
- full worker typecheck baseline for inherited-debt visibility;
- focused AR/O2C/report/permission/failure/idempotency tests;
- repository SQL verification;
- RC-021 migration/tenant/reconciliation semantics.

A completed earlier exact-PR-head focused run (`15998291c83cd4666a0aef03e44f4e3557de7442`, Actions run `30835877786`) produced:

- focused RC-021 TypeScript: PASS;
- focused tests: **36/36 PASS**;
- repository SQL verification: PASS;
- `FINANCE_AR_RECONCILIATION_0111_PASS` at the then-current migration number;
- no RC-021 TypeScript errors in the full-server baseline output.

After that run, RC-021 added an explicit credit-note write-permission regression, customer-ledger report suite coverage, a focused build step, and proactively renumbered its unchanged reconciliation migration to `0112` because RC-020 reserved 0110-0111. The PR workflow is configured to rerun on the final exact head; the PR check result is the authoritative execution status for those final edits.

### Inherited whole-repository build/typecheck debt

The full-server build and full-worker typecheck baseline currently report pre-existing errors in unrelated MRP/QMS/CRM/App Registry/Frappe-model/quotation files. The RC-021 workflow deliberately keeps those baselines visible with `continue-on-error` so inherited debt does not suppress focused CRITICAL AR evidence.

No RC-021 changed file was identified in those baseline errors. RC-021 does **not** claim the whole repository build/typecheck is green.

### Gate matrix

| Gate | RC-021 evidence |
| --- | --- |
| Focused build | dedicated RC-021 compile/build workflow step |
| Focused typecheck | dedicated RC-021 TypeScript step |
| Unit/integration | canonical flow + O2C/report suites |
| Permission | write permission regression + aging report policy |
| Tenant | D1 predicates + tenant-separated migration regression |
| Failure | unsafe advance, over-allocation/credit, active cancel, race guards |
| Correction/cancel | credit cancel/reissue + Payment Entry cancel/replacement |
| Allocation edges | partial, multiple invoices, one-payment-many, advance allocation, over-allocation rejection |
| Reconciliation | Payment Ledger base vs customer GL control + deliberate drift detection |
| GL consistency | control-account equality + existing exact O2C/FX assertions |
| Customer ledger | Party Statement / Debt Summary / Advance Balance from Payment Ledger |
| Audit | append-only reversal behavior |
| Idempotency/retry | same-command retry/no duplicate ledger rows |
| Migration replay | 0112 semantic replay regression |
| Production evidence | NOT RUN / NOT CLAIMED |

## 12. Concurrent main drift audit

Branch creation was correctly pinned to `main@e18ffb1e...`.

During implementation, main advanced through RC-023 cash/bank commits and then explicit revert commits. Latest audited main was `7819ade8cdb1213d9f99ae92f144ae8aee82b054`.

Comparison from RC-021 exact creation base to that main reports four history commits but **no net changed files** after the RC-023 reverts. Therefore RC-021 has no semantic current-main tree delta to consume from those four commits. The branch remains historically diverged, which will still be reconciled before any eventual merge.

## 13. Dependency Requests

### DR-RC021-01 — RC-020 shared posting / period contract

**Owner:** RC-020 Finance Posting/Period lane  
**State:** OPEN

Latest audited `rc/w2-finance-period-posting` is not frozen/on main and currently owns:

- `0110_rc020_finance_posting_period_integrity.sql`;
- `0111_rc020_finance_gl_scope_reconciliation.sql`;
- finance query-scope changes and RC-020 reconciliation tests.

RC-021 response:

- consumed exact current main only;
- did not cherry-pick RC-020;
- continued all independent AR work;
- moved its migration to `0112_rc021_finance_ar_reconciliation.sql` to avoid the expected migration namespace collision.

**Before merge:** consume the main containing frozen RC-020, audit branch/period/legal-entity shared scope against `finance_ar_reconciliation`, resolve any genuine contract delta, then rerun CRITICAL gates on the new exact head.

### DR-RC021-02 — required RC Hardening Plan absent

**Owner:** release-control/documentation lane  
**State:** OPEN

`docs/FORGE_RC_HARDENING_PLAN_20260803.md` required by the task was not found on the audited exact main. RC-021 used North Star, Capability Map/Status, Validation Gates and WS01 evidence and records the absence explicitly.

### DR-RC021-03 — fully-paid invoice refund / excess credit policy

**Owner:** Finance business/shared posting contract  
**State:** OPEN

Current authoritative invariants prohibit a Sales Invoice outstanding balance below zero. RC-021 therefore applies credit/return correction only up to live invoice outstanding.

A return after an invoice is fully paid requires a non-inferable canonical policy for:

- customer cash refund versus reusable customer credit/advance;
- liability/receivable representation;
- linkage and GL treatment.

RC-021 intentionally does not invent a negative invoice balance, shadow credit ledger, or competing customer-balance source.

This DR does not block partial-outstanding correction, customer advance, Payment Allocation, cancellation, reconciliation, customer ledger or aging already completed here.

## 14. Remaining gaps

1. First-class linked debit-note correction is not proven.
2. Dedicated write-off / bad-debt lifecycle is not completed by this lane.
3. Fully-paid invoice return/refund/excess credit remains DR-RC021-03.
4. `finance_ar_reconciliation` is a backend/database control projection; no dedicated navigation/report UI is added in this backend RC lane.
5. RC-020 must freeze/land and be consumed before merge.
6. Whole-repository TypeScript baseline has inherited unrelated failures; focused RC-021 gates are isolated and must remain green.
7. No staging/production migration, live-tenant reconciliation, or production evidence was run.

## 15. Maturity recommendation

**RC-021 settlement/reconciliation slice:** **RC-candidate, gated**.  
**F02 overall:** **Wired with an RC-candidate settlement core**, not globally RC.  
**Hardened:** **No**.

Promotion beyond this recommendation requires:

1. RC-020 shared posting/period contract frozen on main and consumed;
2. exact-head focused CRITICAL checks green after that integration;
3. explicit resolution/evidence for any additional F02 capabilities being promoted;
4. production/staging evidence before any Hardened claim.

No merge, deploy, production migration, secret/DNS change, or customer-data mutation was performed by RC-021.
