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

## Non-party account boundary (0162)

The Company revaluation now fails closed with
`FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED` when the canonical as-of GL has a
non-zero balance for a configured foreign non-party balance-sheet account. This
includes Bank/Cash account types and conservatively covers other Asset/Liability accounts except
Receivable/Payable. Both `account_currency` and the existing `currency` alias are
recognized. Domestic accounts and zero net balances do not block the existing
AR/AP path. Future movements, other companies and other tenants are excluded.
Disabling or cancelling an Account does not erase its historical currency metadata
or its outstanding GL balance; the commit guard still rejects those balances.
The broad Asset/Liability check is conservative: monetary versus nonmonetary
classification is not yet evidenced for every Account type, so it may refuse a
foreign nonmonetary account rather than silently claiming full coverage.

The controller uses `getGlAccountBalances` from the beginning of history through
the revaluation date. Migration
`0162_exchange_rate_revaluation_non_party_safety.sql` rechecks the same canonical
GL and current Account configuration in both INSERT and UPDATE submit paths.
The in-memory store rechecks under its mutation mutex. This prevents a backdated
bank posting or currency configuration change after planning from being silently
ignored by an otherwise valid AR/AP revaluation.

This is a safety boundary, **not bank/cash revaluation completion**. The precise
missing prerequisite is immutable foreign account units alongside company-currency
debit/credit in canonical GL, populated by every bank/cash/Journal Entry producer
and preserved in exact reversal. Evidence:

- `GeneralLedgerEntry` currently carries one `currency` and one pair of
  `debit_minor`/`credit_minor`, with no independent account-currency amounts.
- `FinancePaymentEntryController.normalize` requires `received_amount` equal to
  the company-currency conversion of `paid_amount`; its `BANK` GL row is in
  company currency. An invoice's or payment's transaction currency therefore
  does not prove the bank's foreign-unit balance.
- Bank Transaction statement evidence is not accounting authority and cannot
  supply the missing balance by replacing canonical GL.

Remaining work must add that canonical dual-currency contract before calculating
foreign non-party unrealized FX. Zero company-currency net balance does not prove
zero foreign units; this change only guards the evidenced non-zero GL case.
The capability remains PARTIAL and broader business closure remains false.

Validation adds controller and in-memory regressions for bank/cash/liability
rejection, domestic/AR/AP exclusions, backdated source drift, account config drift,
exact compensating rows, large-integer cancellation precision and date/tenant/company scope. The existing SQLite
migration regression now covers 0162 INSERT/UPDATE guards and the same scope cases.
