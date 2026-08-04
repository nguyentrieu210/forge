# R5-02 — Finance / HCM Reconciliation

Date: **2026-08-04**
Branch: `agent/r5-02-finance-hcm-reconciliation`
Draft PR: **#632**
Risk: **CRITICAL**
Baseline after worker-only sync: current `main@8316d2a5f24863d3347cf9f92ec5987145b8dc9e`

## Verdict

R5-02 closes one concrete Finance/HCM residual left explicit by RC4: Employee Loan disbursement/repayment could reference canonical `Payment Entry`, but the cross-domain correction contract was incomplete.

The implementation preserves the existing authorities:

- `Payment Entry` owns cash/GL movement;
- Employee Loan documents own HRM loan state/evidence;
- `gl_entries` remains the single financial book authority;
- no employee-loan ledger or second Payment Ledger is introduced;
- cancellation uses exact GL reversal rather than historical mutation.

## Exact-state findings

Current main already contains:

- canonical Salary Slip -> GL + Employee Payment Ledger posting and exact cancel reversal;
- Payroll Entry reconciliation to submitted Salary Slip net pay;
- canonical GL aggregate read contract;
- RC4 read-only cross-ledger auditor;
- PIT 2026 source-locked regression evidence;
- Employee Loan, Loan Disbursement and Loan Repayment domain documents.

The remaining gap was narrower:

1. canonical Employee `Payment Entry` supported `Pay`, but not the symmetric `Receive` path required to represent loan repayment cash collection;
2. Employee Loan Repayment checked employee/company evidence but did not freeze payment direction, exact amount or loan-receivable account;
3. Employee Loan Disbursement did not prove the Payment Entry debit account was the exact loan-receivable account;
4. one submitted Payment Entry could be reused as loan evidence more than once;
5. Payment Entry cancellation did not fail closed while submitted loan evidence still referenced it.

## Implemented slice

### A. Employee Receive Payment Entry

`server/packages/clouderp-selling/src/r5-finance-hcm-payment-entry.ts`

Adds the bounded employee-receipt path to canonical Payment Entry:

- `party_type = Employee`;
- `payment_type = Receive`;
- company-currency only;
- fixed-point `currency_scale` semantics;
- exact `paid_amount == received_amount`;
- submitted accounting-period guard;
- authorized finance role required;
- no supplier/customer invoice allocations;
- GL posting is exactly:
  - debit bank/cash (`paid_to`);
  - credit employee receivable (`paid_from`);
- no Payment Ledger row is emitted because Employee Loan is not AR/AP supplier/customer settlement.

Cancel returns exact `reverseGl(...)` rows.

### B. Employee Loan Disbursement reconciliation

`ReconciledEmployeeLoanDisbursementController` preserves the existing HRM controller and adds only Finance evidence checks:

- referenced Payment Entry must be submitted;
- direction must be `Pay`;
- existing exact principal/employee/company/currency checks remain active;
- `paid_to` must equal the exact account mapped by the loan's Salary Component;
- the same submitted Payment Entry cannot be consumed by another submitted Loan Disbursement/Repayment evidence document.

### C. Employee Loan Repayment reconciliation

`ReconciledEmployeeLoanRepaymentController` preserves existing loan-outstanding logic and adds:

- referenced Payment Entry must be submitted;
- direction must be `Receive`;
- exact currency;
- exact payment amount equals repayment amount;
- `paid_from` must equal the exact Employee Loan receivable account;
- one Payment Entry is single-use across submitted loan evidence.

### D. Correction / cancellation ordering

`R5FinanceHcmPaymentEntryController.buildPlan(...)` fails closed on Payment Entry cancel while any submitted:

- `Employee Loan Disbursement`, or
- `Employee Loan Repayment`

still references that Payment Entry.

Required correction order:

`cancel loan evidence -> cancel Payment Entry -> exact GL reversal -> correct/reissue -> resubmit evidence`

This prevents the Finance authority from disappearing underneath an active HRM evidence record.

## Registry wiring

- O2C/Finance registry now registers `R5FinanceHcmPaymentEntryController` in place of the previous safe Finance wrapper.
- ERPNext core registry now registers reconciled Loan Disbursement/Repayment controllers.
- No shared kernel/controller-registry primitive was changed.

## Regression evidence

New focused regression:

- `server/tests/r5-finance-hcm-loan-reconciliation.test.mjs`

Covers:

- Employee Receive fixed-point GL posting;
- exact cancel reversal;
- no shadow Payment Ledger;
- disbursement direction/account reconciliation;
- repayment direction/amount/account reconciliation;
- duplicate Payment Entry evidence rejection;
- Payment Entry cancellation dependency ordering.

R5-02 CI also replays:

- `hrm-loan-disbursement.test.mjs`;
- `hrm-workforce-finance.test.mjs`;
- `hrm-payroll-correction-reconciliation.test.mjs`;
- PIT/statutory payroll source regressions;
- canonical GL aggregate regression;
- RC4 cross-ledger auditor self-test.

## Explicit non-claims / remaining dependencies

### DR-R5-02-LEGAL — BHXH/BHYT/BHTN numeric automation

R5-00 requires the insurance automation to remain fail-closed without clause-level official-source evidence for exact rates, contribution bases, ceiling/floor, worker categories and transition dates.

R5-02 does **not** invent or seed those values. This blocks only statutory automation claims requiring those numbers.

### DR-R5-02-LANDED-COST — R5-03 reconciliation seam

Receipt-targeted landed-cost valuation identity and historical COGS/Stock->GL propagation remain a joint R5-03/R5-02 boundary. R5-02 does not create a shadow valuation or GL authority to close it unilaterally.

## Schema / migration / provider boundary

- migrations added: **none**;
- schema tables added: **none**;
- provider state changed: **none**;
- production/customer data mutated: **none**;
- capability maturity promotion: **none from source presence alone**.

## Validation gate

Branch workflow: `.github/workflows/r5-02-finance-hcm-reconciliation.yml`.

It requires:

- exact PR-head checkout and current-main ancestry;
- locked dependency install;
- emitted server artifacts;
- zero TypeScript errors in changed authoritative R5-02 source;
- focused Finance/HCM regressions;
- statutory fail-closed evidence;
- canonical GL aggregate + cross-ledger checks;
- strict authority-diff boundary;
- no migration delta.

## Merge / deploy boundary

R5-02 is non-UI CRITICAL.

- branch implementation: allowed;
- draft PR + validation: allowed;
- merge to `main`: **STOP until explicit user approval**;
- production deploy/migration/data mutation: **STOP until explicit user approval**.
