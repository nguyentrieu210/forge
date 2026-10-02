# R8-B Exchange Rate Revaluation Closure

## Boundary closed

Forge now has a first-class **Exchange Rate Revaluation** authority for open foreign-currency
AR/AP. The source is the immutable Payment Ledger, aggregated **as of the revaluation date**;
the controller does not use today's outstanding for a historical close and does not infer
foreign balances from company-currency GL.

On submit the controller:

- resolves Company default currency and the configured `exchange_gain_loss_account` server-side;
- snapshots every open foreign Sales Invoice / Purchase Invoice balance with transaction and
  company-currency outstanding, party/account identity and source row count;
- resolves the dated Exchange Rate master (with the existing currency-pair fallback);
- posts unrealized gain/loss in company currency against the exact receivable/payable account;
- posts an automatic next-day reversal so later realized Payment Entry FX continues to clear
  against Payment Ledger historical base amounts rather than a stranded revaluation balance;
- preserves exact cancellation by reversing the originally committed GL rows.

## Race and history safety

Migration `0154_exchange_rate_revaluation.sql` rechecks the snapshot inside the D1 commit.
It rejects:

- a backdated allocation or other Payment Ledger change between planning and commit;
- a changed closing exchange rate;
- Company currency / gain-loss-account configuration drift;
- duplicate submitted revaluation for the same Company and business date;
- invalid/missing next-day reversal and incomplete source snapshots.

The in-memory adapter mirrors source/rate/date/duplicate checks under its mutation mutex.
Its Payment Ledger outstanding lookup is also now tenant-scoped, closing the historical
test-adapter parity defect where equal voucher names in different tenants could cross-count.

## Proven regressions

- `server/tests/exchange-rate-revaluation.test.mjs`
  - AR gain and AP loss signs;
  - server-owned rates/account;
  - as-of-date source query;
  - zero-delta source snapshot completeness;
  - next-day reversal;
  - duplicate/missing-rate failures;
  - exact cancellation.
- `server/scripts/test-exchange-rate-revaluation-migration.py`
  - future payments excluded from a historical snapshot;
  - backdated allocation drift rejected;
  - closing-rate drift rejected;
  - same-day duplicate rejected;
  - standard DocType metadata installed.
- R8-B GitHub Actions run #80 passed the full build and all existing R8-B regressions on
  commit `81216ebca3e833d063befcb766af38de9a9484b9`.

## Still open

This slice closes **foreign AR/AP period-end revaluation**, not every ERPNext monetary-account
case. Foreign bank/cash and other non-party balance-sheet accounts, ERPNext-exact runtime
differential fixtures, and broader multi-company consolidation/elimination remain open.
