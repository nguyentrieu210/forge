# CloudForge v0.4.0 — Advanced Tax, Currency and Outbox Contracts

This document describes the implementation contract added after the captured A–M ERPNext/Frappe oracle baseline. It does not change the immutable oracle evidence or claim new differential parity until the pinned Bench is rerun.

## 1. Domain outbox delivery

`cloudforge-jobs` consumes `DomainEvent` messages from `cloudforge-outbox`.

Production routing is server-owned:

1. Control Plane writes the public route record and a reverse KV key `__tenant__:<tenant_id>`.
2. Jobs Worker resolves that reverse key from `ROUTES`.
3. It selects the tenant user Worker through the `DISPATCHER` namespace binding.
4. It POSTs the event to `/internal/events` with the service bearer token and idempotency key.
5. It records `processed_events` only after the tenant returns success and the exact `x-cloudforge-event-committed` event ID.
6. Missing route, suspended tenant, callback failure, or missing commit confirmation causes Queue retry; the event is not acknowledged or marked processed.

`TENANT_CALLBACK` remains an optional local-test binding only.

## 2. Dispatch-namespaced encrypted secrets

Use `scripts/manage-dispatch-secrets.mjs`; it calls the Workers for Platforms dispatch-script secrets API and never prints the secret value.

```bash
export CLOUDFLARE_ACCOUNT_ID='<account-id>'
export CLOUDFLARE_API_TOKEN='<token-with-workers-write>'
export CLOUDFLARE_DISPATCH_NAMESPACE='cloudforge-production'
export TENANT_INTERNAL_AUTH_SECRET='<value>'

npm run dispatch-secret:put -- \
  --script cloudforge-tenant-demo \
  --name INTERNAL_AUTH_SECRET \
  --from-env TENANT_INTERNAL_AUTH_SECRET

npm run dispatch-secret:list -- --script cloudforge-tenant-demo
```

The tenant script also needs `INTERNAL_SERVICE_TOKEN`. Migrate secrets with current/previous key overlap before removing plaintext deployment variables. Do not rotate live identity keys without a rollback plan.

## 3. Master-data currency contract

Company master record data:

```json
{
  "default_currency": "USD",
  "currency_scale": 2
}
```

Foreign exchange-rate master names are resolved server-side in this order:

```text
<document-currency>:<company-currency>:<YYYY-MM-DD>
<document-currency>:<company-currency>
```

Example:

```text
EUR:USD:2026-07-23
```

Record data:

```json
{ "rate": "1.20" }
```

The client cannot authoritatively supply the exchange rate. Create/save/submit normalize from server master records. Missing or non-positive rates fail with a reference-validation error before posting.

## 4. Fixed-point tax contract

Supported charge types:

- `On Net Total`
- `On Previous Row Total`
- `Actual`
- `On Item Quantity`

Tax rows support:

- multiple rows;
- additive and deductive rows;
- additive included-in-print-rate rows on Net Total;
- deterministic fixed-point rounding;
- per-row running totals;
- tax-account GL posting;
- explicit round-off GL posting.

Document discount supports:

- percentage or fixed amount, never both;
- `Net Total` or `Grand Total` basis;
- no combination with included tax in v0.4.0.

The deliberate v0.4.0 limits are fail-closed:

- included tax supports additive `On Net Total` rows only;
- included tax plus document discount is rejected;
- negative rates and negative Actual tax are rejected;
- a non-zero invoice rounding adjustment requires `round_off_account`.

## 5. Multicurrency accounting contract

Sales Invoice stores transaction-currency totals and company-currency base totals.

GL is posted in company currency:

- receivable debit = converted base grand total;
- income credit = converted base net total;
- each tax row posts to its own account;
- conversion/rounding residual posts to `round_off_account`.

Payment Entry semantics:

- `paid_amount` and allocations are in transaction currency;
- `received_amount` is in company currency;
- `base_paid_amount` records the payment-day conversion for reference;
- allocated receivable is cleared at each invoice’s historical conversion rate; unallocated advance uses the payment-day rate;
- `difference_amount = historical_base_receivable - received_amount`;
- non-zero difference requires `exchange_gain_loss_account`;
- the exchange line balances company-currency GL without leaving a false receivable residual;
- Payment Ledger allocation stays in transaction currency so invoice outstanding closes correctly.

## 6. Release validation

Validated in the packaged source:

- 67 Node/domain tests;
- SQLite schema and trigger verification;
- 100-way and cross-aggregate race tests;
- strict Worker test typecheck;
- web TypeScript typecheck;
- repository and secret policy verifiers;
- source-parser regression.

The current sandbox could not reinstall Linux-native Rollup because DNS/package access was unavailable, so the new workerd test and Vite production bundle must be executed after a clean Linux `npm ci` before deployment.

## 7. Not implemented

- FIFO/moving-average valuation and delivery COGS;
- backdated stock repost;
- serial/batch bundle;
- amendments and complete returns;
- generic metadata platform or broad ERPNext parity.
