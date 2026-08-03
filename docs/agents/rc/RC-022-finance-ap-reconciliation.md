# RC-022 — Finance AP / Supplier Reconciliation

Risk: **CRITICAL**  
Branch: `rc/w2-finance-ap-reconciliation`  
Claim base: `main@e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b`  
Latest main observed before final validation: `e2d6ff28614873dccc65dc32d80e87f5d84bc9bf`  
Latest-main delta after claim: only RC-023 cash/bank files (`server/migrations/tenant/0110_rc023_cash_bank_reconciliation.sql` and `server/scripts/test-rc023-cash-bank.py`); no AP/query/policy overlap.  
Merge/deploy: **NOT PERFORMED**.

## Capability

RC-022 hardens the F03 AP settlement/control slice:

`Purchase Invoice -> Supplier Payment/Advance -> Partial Allocation -> Return/Adjustment -> AP Reconciliation -> Aging/Report`

Primary capability IDs:

- `F03-001` Supplier Account
- `F03-002` Purchase Invoice posting
- `F03-003` Supplier Advance
- `F03-006` Partial Supplier Payment
- `F03-007` Supplier Credit/Debit Adjustment
- `F03-008` AP Aging
- `F03-009` Supplier Statement
- `F03-010` Supplier Reconciliation
- supporting multi-currency evidence for `F03-013`, without claiming the whole capability RC

No maturity change is claimed for payment request/scheduling, withholding tax, payable forecast or the broader FX/revaluation lifecycle.

## Authority

Exact repo evidence preserves one settlement authority:

1. **Purchase Invoice** posts Supplier payable to both canonical GL and `payment_ledger_entries`.
2. **Payment Entry / Payment Allocation** is the canonical supplier settlement/advance path.
3. **Payment Ledger** is the append-only supplier outstanding/advance authority; no mutable `paid_amount` or shadow payable table was introduced.
4. **GL** remains the accounting control authority. AP reconciliation compares Payment Ledger base balance with Supplier-party GL control balance; it does not store reconciliation state.
5. **Debit Note** is the financial Purchase Invoice reduction/correction path.
6. **Stock Return** is the physical Purchase Receipt return path. It remains stock/return authority and does not become a payable ledger.
7. **Purchase Receipt** may post Stock / Stock Received But Not Billed GL when configured; that GRNI flow remains distinct from supplier settlement.

Historical procurement evidence agrees with this boundary. PR `#347` explicitly states Procurement must consume Finance AP/payment/GL and must not create a competing payable ledger. Legacy payable/procurement work is evidence only; no historical PR was reopened.

## Current implementation audited

### Purchase Invoice

`server/packages/clouderp-core/src/controllers.ts`

- validates Supplier/Company/Currency/payable account and fixed-point totals;
- period-lock and master checks on submit;
- validates Purchase Order billing context/remaining quantity when linked;
- posts Expense/Tax + Supplier `PAYABLE` GL control line;
- posts positive `Payable/Supplier` Payment Ledger line against its own Purchase Invoice;
- cancel emits exact GL/Payment Ledger reversals.

### Supplier Payment / partial payments / advance

`server/packages/clouderp-selling/src/finance-controllers.ts`

- `Pay` is Supplier + Purchase Invoice path;
- each reference checks submitted invoice, same tenant reader, Supplier, Company, Currency and party account;
- partial and repeated payments use current Payment Ledger outstanding, not document display fields;
- over-allocation is rejected before plan creation and again at SQL ledger boundary;
- explicit unallocated amount becomes a Supplier advance against the Payment Entry itself;
- `allow_unallocated` requires deliberate operator confirmation;
- supplier-side GL is Dr Payable / Cr Bank with historical/base FX handling and exact cancel reversal.

### Payment Allocation

- requires a submitted source Payment Entry;
- same Company / Supplier / payable account / Currency context is mandatory;
- source advance and target Purchase Invoice outstanding are read from canonical Payment Ledger;
- allocation emits a positive source line against the Payment Entry and a negative target line against the Purchase Invoice;
- **no GL entry is emitted**, because allocation only moves ownership inside the AP subledger and must not change total liability;
- cancel reverses those append-only Payment Ledger lines.

### SQL invariants

`server/migrations/tenant/0031_finance_payment_allocations.sql`

- `payment_invoice_outstanding_guard` and base equivalent prevent Purchase Invoice outstanding below zero;
- `payment_advance_outstanding_guard` prevents an advance source from being consumed past zero;
- advance context mismatch checks party/account/currency/account type;
- `finance_advance_balance` is a derived view, not a balance authority.

`server/migrations/tenant/0032_finance_explicit_advances.sql`

- explicit `allow_unallocated` operator confirmation for customer/supplier advances.

## Implementation in RC-022

### 1. Company-scoped Supplier Statement

Added `server/packages/query/src/ap-reconciliation.ts`.

`Supplier Statement` requires exact:

- tenant from authenticated request;
- Company;
- Supplier;
- payable Account;
- transaction Currency;
- from/to dates.

It reads `payment_ledger_entries` joined to the canonical voucher document for Company scope. AP polarity is explicit:

- positive payable movement -> Credit;
- negative settlement/adjustment -> Debit;
- positive running balance -> liability still owed.

It surfaces Purchase Invoice, Supplier Payment/Advance, Payment Allocation source/target and Debit Note entries without persisting a second statement ledger.

### 2. Supplier Reconciliation

`Supplier Reconciliation` requires tenant + Company + as-of date and may filter Supplier/Account/Company Currency/status.

It compares:

- `SUM(payment_ledger_entries.base_amount_minor)` for `Payable/Supplier`;
- `SUM(gl_entries.credit_minor - gl_entries.debit_minor)` for Supplier-party GL lines;
- grouped by Supplier + Company + payable Account + company Currency + company currency scale.

Result exposes both minor-unit balances, difference and `Reconciled` / `Mismatch` status.

The reconciliation is currency-scale aware and remains a read model over the two existing authorities. Current vouchers use the immutable Company currency/scale snapshot already carried by Finance documents. For historical vouchers that predate that snapshot, the compiler resolves `Company.default_currency` and the matching `Currency.currency_scale` from tenant-scoped `master_records`; transaction currency/scale is only the final compatibility fallback when both snapshot and master evidence are absent. This avoids false mismatches for legacy foreign-currency documents whose Payment Ledger `base_amount_minor` is already in company currency.

### 3. Worker + permission wiring

- query worker now uses `AccountsPayableQueryCompiler`, delegating every existing finance report unchanged to `FinanceQueryCompiler`;
- `Supplier Statement`: Accounts roles + Purchase Manager;
- `Supplier Reconciliation`: Accounts/System Manager only;
- no new write permission and no reconciliation mutation endpoint;
- mutation authority remains unchanged: Purchase Invoice submit/cancel, Payment Entry/Allocation submit/cancel and Debit Note submit/cancel remain Accounts Manager-controlled.

## Partial payment / correction behavior

| Scenario | Canonical behavior |
| --- | --- |
| Partial supplier payment | Negative Payment Ledger allocation against Purchase Invoice + Dr Payable GL |
| Multiple payments | Independent append-only Payment Entry revisions; outstanding is their aggregate |
| Supplier advance | Negative balance against source Payment Entry + Dr Payable GL |
| Allocate advance later | Positive source + negative invoice target in Payment Ledger; zero GL effect |
| Cancel normal payment | Exact Payment Ledger + GL reversal restores liability |
| Cancel invoice after settlement | SQL outstanding guard fails closed rather than creating negative outstanding |
| Cancel allocated advance | Advance guard fails closed until dependent allocation is reversed |
| Supplier debit adjustment | `Debit NoteController` reduces original Purchase Invoice outstanding and debits Supplier payable GL |
| Cancel debit adjustment | Exact GL / Payment Ledger / return-usage reversal |
| Physical Purchase Return | `Stock Return` / Purchase Receipt return authority; does not invent AP settlement |

## Reconciliation / GL evidence

The new reconciliation detects a key control failure class: a Supplier-party GL entry on the payable account that does not have the corresponding canonical Payment Ledger movement.

Expected invariant for one Company/Supplier/payable account/as-of date:

`Payment Ledger base payable balance == Supplier GL (credits - debits)`

Payment Allocation is intentionally GL-neutral, so a valid allocation cannot change the aggregate reconciliation result.

## Tests / audit matrix

New regression sources:

- `server/tests/finance-ap-reconciliation-query.test.mjs`
- `server/tests/finance-ap-reconciliation-policy.test.mjs`
- `server/scripts/test-finance-ap-reconciliation.py`

Existing evidence retained:

- `server/scripts/test-finance-payment-allocation-migration.py`
- `server/tests/finance-aging-query.test.mjs`
- `server/tests/finance-aging-policy.test.mjs`
- document-kernel mutation receipt / append-only ledger constraints
- ERPNext-core Debit Note / Stock Return controller and registration/source evidence

RC-022 targeted regression covers or audits:

- partial supplier payment;
- multiple payments;
- supplier advance;
- later allocation;
- cancelled payment;
- cancelled invoice fail-closed after settlement;
- supplier Debit Note adjustment + correction reversal;
- Purchase Return authority separation;
- invoice over-allocation guard;
- advance over-consumption guard;
- AP aging preservation;
- company-scoped Supplier Statement;
- Supplier reconciliation to GL;
- tenant/company isolation;
- report permission separation;
- AP mutation permission boundaries;
- retry/idempotency via tenant-scoped mutation receipt and duplicate ledger-key rejection;
- company-currency-scale-safe GL control reconciliation;
- historical voucher fallback to Company/Currency masters before transaction-currency fallback.

The generated Supplier Statement and Supplier Reconciliation SQL shapes were exercised against an equivalent local SQLite fixture. Smoke evidence includes VND scale `0`, mixed transaction currencies rolling into one company-currency base balance, and a legacy USD transaction with no voucher company-currency snapshot resolving to a VND Company master and reconciling `25,000,000` base minor units against VND GL. Repository build/unit/targeted commands remain the authoritative gate evidence and must be taken from exact PR-head CI or an exact checkout.

Recommended exact commands from `server/`:

```bash
npm run build
node --test tests/finance-ap-reconciliation-query.test.mjs tests/finance-ap-reconciliation-policy.test.mjs tests/finance-aging-query.test.mjs tests/finance-aging-policy.test.mjs
python3 scripts/test-finance-ap-reconciliation.py
python3 scripts/test-finance-payment-allocation-migration.py
```

For CRITICAL promotion, also apply the RC validation profile policy: typecheck/build, unit, targeted integration, permission, tenant isolation, failure/retry/idempotency, correction/reversal and reconciliation must all be green. GitHub exposed no PR-triggered workflow run or commit status context during this work, so absence of a red check is **not** recorded as a green CI gate. No production proof is inferred from local/CI evidence.

## Dependency Requests

### DR-RC022-001 — missing canonical RC hardening plan

- Target: RC control/documentation owner.
- Need: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`, referenced by the task, is absent on the exact claim base.
- Evidence: RC-03 validation-gate handoff reports the same missing source.
- Blocking: **No** for this independent AP hardening; Skill/North Star/Capability Map/Status/Validation Gates provide sufficient authority.
- Rule: do not invent contents or claim compliance with a missing document.

### DR-RC022-002 — Purchase Invoice due-date hard cutover for RC-031

- Target: **RC-031 Procurement / F08-F10 lane**.
- Need: keep Purchase Invoice `due_date` first-class through type/controller validation and coordinate legacy backfill before Finance removes the compatibility fallback.
- Current compatibility: `0030_finance_invoice_aging.sql` explicitly marks missing due date as `posting_date_fallback`.
- Contract to consume: Purchase Invoice + Payment Entry/Allocation + Payment Ledger + GL remains Finance authority; Procurement must not create payable settlement state.
- Blocking: **No** for RC-022 settlement/reconciliation; **Yes** for a future hard guarantee that every newly submitted Purchase Invoice has explicit due date after cutover.

## Maturity recommendation

After exact PR-head CRITICAL gates pass:

- recommend **RC** for the scoped settlement/control capabilities `F03-003`, `F03-006`, `F03-007`, `F03-008`, `F03-009`, `F03-010`;
- `F03-001` / `F03-002` are supporting canonical foundations with strong posting evidence but should follow the capability-status owner's evidence policy for promotion;
- keep `F03-004`, `F03-005`, `F03-011`, `F03-012` unchanged;
- do **not** promote the whole `F03` family or `F03-013` to Hardened/Deployed from this work;
- **Hardened is not recommended** without production evidence, due-date cutover completion and the remaining AP capability breadth.

RC-031 Procurement must consume this AP contract as-is unless a later shared-contract change is explicitly coordinated.
