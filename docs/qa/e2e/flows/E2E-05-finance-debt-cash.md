# E2E-05 — Finance / Debt / Cash

## Persona
Accounts User / kế toán công nợ hoặc thu chi, non-admin.

## Business job
Inspect an authoritative customer/supplier debt position, record a supported collection/payment, and verify the resulting receivable/payable plus cash/bank/readback state.

## Preconditions
Company/currency, counterparty, authoritative open receivable/payable, cash/bank/account setup, posting date/period and payment mode/account mapping are `READY`.

## Operator steps
1. Complete E2E-00 as Accounts User.
2. Open `Công nợ`/Finance operational surface.
3. Locate the declared customer/supplier open balance.
4. Drill to the source transaction where supported.
5. Start the supported collection/payment action.
6. Enter amount/date/payment mode/account/reference through real controls.
7. Validate remaining/allocated balance before confirmation.
8. Confirm the authoritative payment/collection.
9. Reopen payment and debt read model.
10. Verify AR/AP outstanding changed by the expected amount.
11. Verify cash/bank/account readback where in scope.
12. Verify finance/history/report exposes the transaction.

## Required negative variants
- over-allocation/invalid amount must fail clearly without mutation;
- closed posting period/date must fail with business explanation;
- unauthorized persona must fail closed;
- retry/double submit must not duplicate payment authority.

## PASS
Payment/collection exists exactly once, debt/readback and cash/bank state reconcile for the fixture, source linkage remains intact, and no unexplained browser/network/red errors occur.

## FAIL examples
Debt dashboard shows a number but cannot drill/pay, payment succeeds visually but outstanding remains wrong, duplicated payment on retry, invalid rounding/currency, hidden account configuration after READY, raw ledger/backend exception.

## Exit condition
Operator can move from debt visibility to authoritative settlement and verify resulting balances through supported UI.
