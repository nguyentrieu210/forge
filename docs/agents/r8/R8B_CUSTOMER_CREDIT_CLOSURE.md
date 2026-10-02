# R8-B Customer Credit Authority Closure

## Disposition

**Customer credit-limit / hold, fully-paid return credit, cash refund, and same-base credit reuse: closed for the declared R8-B transaction boundary.**

Forge does not maintain a mutable customer-credit wallet. Credit exposure, refundable credit
and reusable credit are all represented by canonical Payment Ledger balances.

Selling/O2C remains **PARTIAL** against ERPNext v16.20.0 because exact-current oracle replay
is still open and Payment Allocation deliberately fails closed when source credit and target
invoice carry different historical company-currency bases. That case needs first-class
realized-FX GL before it can be enabled safely.

## Closed in this lane

- Credit policy precedence is resolved server-side from Customer, Customer Group and Company.
- Customer hold/release date blocks submit while active.
- The resolved limit is frozen on submitted Sales Order / Sales Invoice in company-currency
  minor units.
- Sales Order bypass preserves the policy snapshot while disabling order-level reservation.
- D1 enforces the final credit ceiling atomically from canonical Receivable Payment Ledger
  plus still-unbilled submitted Sales Order exposure.
- Billing progress is committed before the invoice Receivable row, so exposure transfers
  from order reservation to AR without double counting.
- A Credit Note against a fully settled Sales Invoice leaves the invoice at zero and creates
  negative canonical Receivable against the Credit Note.
- Payment Entry `Pay + Customer` can refund only submitted Credit Note credit; over-refund
  and unallocated customer refund are rejected.
- Refund posts `Dr Debtors / Cr Bank`, clears the Credit Note source toward zero, and
  reverses exactly on cancellation.
- `Payment Allocation` now accepts exactly one signed source:
  - an existing Payment Entry advance; or
  - a submitted Customer Credit Note via `source_credit_note`.
- Credit Note reuse allocates append-only Payment Ledger rows:
  - positive source row against the Credit Note, consuming customer credit toward zero;
  - negative target row against the later Sales Invoice, consuming invoice outstanding
    toward zero.
- Source and target company/party/account/currency context must match.
- Source credit and target invoice are both bounded at commit time by existing D1 guards.
  If either side would cross zero, the whole mutation rolls back.
- While a submitted Payment Allocation consumes a Credit Note, cancelling that Credit Note
  is blocked by the same signed-source invariant. Reverse the allocation first.
- Cancelling Payment Allocation sign-reverses its exact source/target Payment Ledger rows and
  restores both source credit and target invoice outstanding.
- Migration `0156_customer_credit_allocation.sql` makes `source_payment_entry` optional
  in Payment Allocation metadata and exposes `source_credit_note` without changing the
  underlying authority model.
- If source and target historical company-currency base amounts differ for the requested
  allocation, submit fails closed with an explicit realized-FX requirement. Forge does not
  silently drift base Receivable balances.

## No shadow receivable authority

No customer-balance or credit-wallet table was added.

The authority remains:

`open Sales Order exposure + Payment Ledger Receivable -> atomic credit guard / settlement`

A reusable Credit Note is simply a negative Payment Ledger source balance. Payment Allocation
moves that source toward zero while moving a later invoice toward zero in the same transaction.

## Evidence

- `server/packages/clouderp-selling/src/credit-policy.ts`
- `server/packages/clouderp-selling/src/finance-controllers.ts`
- `server/packages/clouderp-erpnext/src/controllers.ts`
- `server/packages/document-kernel/src/finance-aware-in-memory-store.ts`
- `server/migrations/tenant/0031_finance_payment_allocations.sql`
- `server/migrations/tenant/0150_customer_credit_authority.sql`
- `server/migrations/tenant/0155_customer_credit_refund.sql`
- `server/migrations/tenant/0156_customer_credit_allocation.sql`
- `server/tests/customer-credit-authority.test.mjs`
- `server/scripts/test-customer-credit-authority-migration.py`
- `server/scripts/test-customer-credit-allocation-migration.py`
- R8-B workflow run **36991994526** on implementation commit
  `1e64317593948247c722a04963c18cf97e03b878`: server build, both customer-credit
  controller/migration regressions, all other R8-B regressions, benchmark invariant and
  matrix regression passed.

## Executable proofs

The focused evidence proves:

1. a Customer limit is frozen in company-currency minor units;
2. Sales Order bypass and active hold semantics are preserved;
3. serialized submits cannot cross the same credit ceiling;
4. billing transfers exposure from open order to Receivable without double counting;
5. a fully paid return creates negative canonical Receivable against the Credit Note;
6. cash refund is bounded by that source credit and cancels exactly;
7. a later Sales Invoice can be settled from Credit Note credit through Payment Allocation;
8. over-target allocation is rejected;
9. source credit decreases exactly while target outstanding decreases exactly;
10. Payment Allocation itself creates no fake bank/GL movement for a same-base offset;
11. Credit Note cancellation is blocked while its credit is actively allocated;
12. Payment Allocation cancellation restores both source and target balances exactly;
13. SQLite source and target guards rollback atomically when the second leg fails;
14. cross-rate source/target base mismatch fails closed with no ledger mutation.

## Remaining O2C boundary

The former **customer-credit reuse** gap is closed for allocations whose historical base
values net exactly.

Remaining customer-settlement depth includes first-class realized-FX GL for cross-rate
credit/advance allocation. Exact-current replay of the pinned ERPNext O2C fixtures and other
declared O2C semantic differences also remain open.

Those remaining boundaries keep Selling and O2C at `PARTIAL`; this closure does not claim
module-wide ERPNext parity.
