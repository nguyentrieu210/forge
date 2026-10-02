# R8-B Customer Credit and Settlement Authority Closure

## Disposition

**Customer credit-limit / hold, fully-paid return credit, cash refund, reusable credit, signed-source advance allocation and realized-FX settlement: closed for the declared R8-B transaction boundary.**

Forge does not maintain a mutable customer-credit wallet. Credit exposure, refundable credit,
reusable credit and advance settlement are represented by canonical Payment Ledger balances.
When source and target historical company-currency bases differ, Payment Allocation posts the
realized difference to canonical GL instead of mutating or homogenizing the Payment Ledger base.

Selling/O2C remains **PARTIAL** against ERPNext v16.20.0 because exact-current oracle replay
and other declared O2C differences remain open. This closure does not claim module-wide parity.

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
- `Payment Allocation` accepts exactly one signed source:
  - an existing Payment Entry advance; or
  - a submitted Customer Credit Note via `source_credit_note`.
- Source and target company/party/account/currency context must match.
- Source credit/advance and target invoice are bounded independently at commit time by the
  existing D1 signed-source and invoice-outstanding guards. If either side would cross zero,
  the whole mutation rolls back.
- A reference freezes two different historical company-currency amounts:
  - `source_base_allocated_amount_minor`: base consumed from the signed source;
  - `base_allocated_amount_minor`: base consumed from the target invoice.
- Same-base allocation produces Payment Ledger movement only; it does not invent bank or GL
  activity.
- Cross-rate allocation derives the Company's `exchange_gain_loss_account` server-side and
  posts the exact realized difference:
  - Customer/Receivable: source base above target base -> debit party / credit FX gain;
  - Supplier/Payable: source base above target base -> credit party / debit FX loss;
  - the opposite base direction reverses those signs.
- Customer Credit Note EUR 1.20 -> later Sales Invoice EUR 1.10 is proven as
  `Dr Debtors / Cr FX Gain-Loss` for the base difference while clearing each Payment Ledger
  side by its own historical base.
- Supplier Payment Entry advance EUR 1.20 -> Purchase Invoice EUR 1.10 is proven with the
  opposite Payable sign: `Cr Creditors / Dr FX Gain-Loss`.
- Company FX account, company currency, source identity, source base, target base and signed
  difference are frozen on the submitted allocation; cancellation reverses exact stored GL
  and Payment Ledger evidence without recalculation from current rates.
- While a submitted Payment Allocation consumes a Credit Note or advance, source cancellation
  cannot cross the signed-source balance; reverse the allocation first.
- Migration `0156_customer_credit_allocation.sql` exposes Credit Note source selection and
  read-only source-base / realized-FX evidence in metadata without creating a wallet or
  shadow balance.

## No shadow receivable/payable authority

No customer-balance, supplier-advance wallet or settlement snapshot table was added.

The authority remains:

`open order exposure + Payment Ledger AR/AP -> atomic settlement -> GL realized FX only for historical-base difference`

A reusable Credit Note or Payment Entry advance is a negative signed Payment Ledger source.
Payment Allocation moves that source toward zero while moving the target invoice toward zero;
the GL receives only the company-currency difference needed to keep AR/AP accounting aligned.

## Evidence

- `server/packages/clouderp-selling/src/credit-policy.ts`
- `server/packages/clouderp-selling/src/finance-controllers.ts`
- `server/packages/clouderp-selling/src/types.ts`
- `server/packages/clouderp-selling/src/safe-finance-payment-entry.ts`
- `server/packages/clouderp-erpnext/src/controllers.ts`
- `server/packages/document-kernel/src/finance-aware-in-memory-store.ts`
- `server/migrations/tenant/0031_finance_payment_allocations.sql`
- `server/migrations/tenant/0150_customer_credit_authority.sql`
- `server/migrations/tenant/0155_customer_credit_refund.sql`
- `server/migrations/tenant/0156_customer_credit_allocation.sql`
- `server/tests/customer-credit-authority.test.mjs`
- `server/scripts/test-customer-credit-authority-migration.py`
- `server/scripts/test-customer-credit-allocation-migration.py`
- R8-B workflow run **36993183653** on implementation commit
  `cca876632a340d5deb6de1c5c20d38f8a5281255`: all 25 R8-B gates passed,
  including server build, customer settlement controller regressions, SQLite source/target
  atomicity, Budget/Close/FX-revaluation regressions, benchmark invariant and matrix verifier.

## Executable proofs

The focused evidence proves:

1. a Customer limit is frozen in company-currency minor units;
2. Sales Order bypass and active hold semantics are preserved;
3. serialized submits cannot cross the same credit ceiling;
4. billing transfers exposure from open order to Receivable without double counting;
5. a fully paid return creates negative canonical Receivable against the Credit Note;
6. cash refund is bounded by that source credit and cancels exactly;
7. a later Sales Invoice can be settled from Credit Note credit through Payment Allocation;
8. source and target zero-crossing guards rollback atomically;
9. same-base allocation creates no fake GL;
10. cross-rate Customer credit clears source/target by distinct historical bases and posts
    balanced realized-FX GL;
11. cross-rate Supplier advance clears Payable with the opposite party-account GL sign;
12. the Company's FX account is server-derived and frozen;
13. active allocation blocks invalid source cancellation;
14. Payment Allocation cancellation restores source/target Payment Ledger balances and
    reverses its exact realized-FX GL.

## Remaining O2C boundary

The former reusable-credit and cross-rate settlement gaps are closed for the declared
Payment Allocation sources.

Remaining O2C depth includes exact-current replay of the pinned ERPNext fixture set, wider
tax/pricing combinations, current stock-policy differences and the broader lifecycle/race
questions already tracked by the R8 matrix.

Those boundaries keep Selling, P2P and O2C at `PARTIAL`; this closure does not claim
ERPNext module parity.
