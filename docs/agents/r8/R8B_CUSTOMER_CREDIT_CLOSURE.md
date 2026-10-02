# R8-B Customer Credit Authority Closure

## Disposition

**Customer credit-limit / hold authority: closed for the declared R8-B transaction boundary.**

Forge no longer treats `Customer.credit_limit` as a report/UI-only field. Submitted sales
now freeze a server-owned credit policy and D1 enforces the resulting exposure ceiling
atomically.

This closure does **not** promote all Selling/O2C semantics to parity. Fully-paid
return/refund/customer-credit policy, exact-current ERPNext oracle replay and other
remaining O2C differences stay open.

## Closed in this lane

- Credit policy precedence is resolved server-side from:
  1. Customer company-specific/direct credit limit;
  2. Customer Group fallback;
  3. Company fallback.
- Zero/unset Customer limits fall through instead of silently overriding a configured
  group/company limit.
- Customer `on_hold` plus release date blocks submit while the hold is active.
- The resolved limit is frozen on submitted Sales Order / Sales Invoice in
  company-currency minor units.
- Sales Order `bypass_credit_limit_check` is preserved: the order does not reserve
  credit exposure, while later invoice AR can still be checked.
- The final credit ceiling is enforced **inside the D1 write transaction**, not by a
  race-prone read-then-write controller check.
- Exposure derives only from canonical authorities:
  - Customer Receivable `Payment Ledger` base amounts; plus
  - submitted Sales Order value that remains unbilled according to canonical
    source-line Billing fulfillment progress.
- When a Sales Invoice bills a Sales Order, billing progress is committed earlier in
  the same batch than the Receivable Payment Ledger row. The open-order reservation
  therefore falls before AR is added, so exposure transfers rather than double-counts.
- Concurrent/serialized submits cannot both cross the same credit ceiling.

## No shadow receivable authority

No customer-balance table was added.

The authority remains:

`Sales Order open exposure + Payment Ledger receivable -> atomic credit guard`

The SQL views are derived control projections only; they do not own or mutate balances.

## Evidence

- `server/packages/clouderp-selling/src/credit-policy.ts`
- `server/migrations/tenant/0150_customer_credit_authority.sql`
- `server/tests/customer-credit-authority.test.mjs`
- `server/scripts/test-customer-credit-authority-migration.py`
- `server/packages/core/src/errors.ts`
- R8-B exact-head workflow run **36968977842**:
  - server build PASS;
  - Subcontracting regression PASS;
  - Landed Cost authority regression PASS;
  - P2P row authority regression PASS;
  - Customer credit policy regression PASS;
  - Customer credit atomic migration regression PASS;
  - R8 benchmark invariant PASS;
  - R8 matrix regression PASS.

## Executable proofs

The focused evidence proves:

1. a USD 100 Customer limit freezes as 10,000 company-currency minor units;
2. Sales Order bypass is persisted and disables order-level reservation;
3. an active customer hold rejects submit;
4. two Sales Orders of 60 under a limit of 100 cannot both commit;
5. billing 50 from a 100 Sales Order releases 50 of order exposure before the
   corresponding 50 Receivable is inserted, preserving total exposure at 100;
6. any further positive Receivable then fails atomically at the same ceiling.

## Remaining O2C boundary

The next unresolved O2C policy is a different question: what a fully paid Sales Invoice
return becomes when there is no live invoice outstanding left to reduce.

Current Forge deliberately refuses to manufacture a negative invoice outstanding or a
shadow customer-credit wallet. A future closure must choose and prove an authoritative
Finance contract for reusable customer credit/advance and/or cash refund, including GL,
Payment Ledger linkage, cancellation and reconciliation.
