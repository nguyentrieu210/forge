# R8-B Period Closing / Retained Earnings Closure

## Disposition

**Automated fiscal-period P&L close -> retained earnings: closed for the declared R8-B boundary.**

Forge now has a first-class Period Closing Voucher backed by a reusable canonical GL
aggregate. This removes the previous Finance dependency that forced year-end close,
Budget-vs-Actual and period-end revaluation consumers to invent their own GL scans.

The overall Accounting / GL Period Close flow remains **PARTIAL** because full period-end
FX revaluation, exact Budget-vs-Actual consumption and multi-company
consolidation/elimination remain open.

## Shared GL aggregate authority

Added a narrow `LedgerAggregateReader` port:

- tenant scoped;
- company scoped;
- inclusive from/through date scoped;
- optional branch scoped;
- optional account scoped;
- fixed-point debit/credit/balance minor units;
- immutable source row count fingerprint.

D1 implements this directly over canonical `gl_entries` joined to the voucher document
for legal-company / branch context. The in-memory adapter mirrors the same contract for
domain regression.

Consumers no longer need to compile private GL SQL or persist duplicate account balances.

## Period Closing Voucher

`server/packages/clouderp-core/src/period-closing-controller.ts`:

1. resolves the selected Fiscal Year server-side;
2. requires posting on the fiscal period end date;
3. requires the company accounting lock to cover the close date;
4. validates a leaf Equity/Liability closing account;
5. reads current company/branch P&L balances through `LedgerAggregateReader`;
6. creates exact reversing entries for non-zero Income/Expense balances;
7. posts the residual net profit/loss to the closing account;
8. snapshots company currency, source debit/credit, row count and close rows;
9. on cancel, reads the exact submitted voucher revision and appends exact reversal GL.

No P&L balance table or retained-earnings shadow ledger is added.

## Race protection

Controller-side locking alone is not treated as sufficient evidence.

Migration `0151_period_closing_voucher.sql` rechecks at **D1 commit time** that:

- the accounting lock still covers the period end;
- the current P&L GL row count matches the controller snapshot;
- current P&L debit total matches;
- current P&L credit total matches;
- only one active close exists for the same tenant/company/period/branch scope.

Because GL is append-only, any concurrent source posting/cancellation changes the
fingerprint and the close fails with `PERIOD_CLOSE_SOURCE_CHANGED` rather than committing
a stale retained-earnings transfer.

## Executable evidence

- `server/packages/document-kernel/src/store.ts`
- `server/packages/document-kernel/src/d1-store.ts`
- `server/packages/document-kernel/src/in-memory-store.ts`
- `server/packages/clouderp-core/src/period-closing-controller.ts`
- `server/migrations/tenant/0151_period_closing_voucher.sql`
- `server/tests/period-closing-authority.test.mjs`
- `server/scripts/test-period-closing-authority-migration.py`

Exact-head R8-B workflow run **36970012805** passes:

1. server build;
2. Subcontracting regression;
3. Landed Cost authority regression;
4. P2P row authority regression;
5. Customer credit policy + atomic migration regression;
6. Period Closing Voucher regression;
7. Period close atomic migration regression;
8. R8 benchmark invariant;
9. R8 matrix regression.

Focused functional proof uses USD 100 income and USD 60 expense:

- pre-close Sales balance = credit 100;
- pre-close Rent balance = debit 60;
- Period Closing Voucher closes both P&L balances to zero;
- Retained Earnings receives credit 40;
- cancel restores the exact original P&L balances and removes the retained-earnings effect.

The SQL proof separately demonstrates commit-time lock enforcement, stale-source rejection
after a late GL append and duplicate active-close rejection.

## Remaining boundary

This closure does not claim complete ERPNext Accounting parity. The next consumers of the
shared aggregate should be implemented independently and evidenced before their gap labels
move:

- period-end Exchange Rate Revaluation;
- Finance Budget vs Actual;
- multi-company consolidation/elimination.
