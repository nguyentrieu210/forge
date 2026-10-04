# R8-B Period Closing / Retained Earnings Closure

## Disposition

**Automated fiscal-period P&L close -> retained earnings: closed for the declared R8-B boundary.**

Forge now has a first-class Period Closing Voucher backed by a reusable canonical GL
aggregate. This removes the previous Finance dependency that forced year-end close,
Budget-vs-Actual and period-end revaluation consumers to invent their own GL scans.

The overall Accounting / GL Period Close flow remains **PARTIAL**. Budget commitment
actualization and historical revision checks now exist; foreign non-party FX revaluation,
consolidation/elimination and pinned runtime/large-ledger depth remain open.

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

## Chronological lifecycle — 2026-10-04

Migration 0164 and matching controller/memory checks reject a close when earlier P&L
remains nonzero. They also reject cancellation of an earlier close while a later active
close exists in the same company and overlapping branch scope. Later closes must be
reversed first. Tests cover sequential years, exact reversal, independent branches and
source changes between planning and commit. No automatic prior-year repair is invented.

Migration 0166 additionally enforces source lock/fingerprint on direct submitted
inserts and rejects malformed source dates. Memory uses active accounts for the source
fingerprint while preserving historical inactive-account/date/residual safety; historical
and source accumulations use exact integers. Matching memory and SQLite regressions
prove zero-net disabled history is accepted and nonzero disabled P&L is rejected.

## Historical account planning — 2026-10-04

The close planner now reads canonical historical account metadata through
`LedgerAggregateReader.listFinanceAccountMetadata`, including disabled and cancelled
accounts. D1 uses the existing historical/active account views; memory mirrors document
precedence. Inactive prior-year residuals and current-period residuals are rejected before
a submitted close reaches persistence. Zero-net inactive history remains acceptable and
is excluded from the active source fingerprint.

Migration `0170_period_close_account_tombstone.sql` corrects an older active-view fallback:
a cancelled Account document must shadow a same-name imported master. The memory commit
check applies the same rule and still rejects an account cancellation after planning.
No permission to post to inactive accounts or automatic historical repair is introduced.

Evidence: 21 focused Node tests across `period-closing-authority.test.mjs` and
`period-close-account-metadata.test.mjs`, including real SQLite view/reader comparison;
`test-period-close-account-tombstone.py` verifies atomic rejection of nonzero cancelled
history and acceptance of zero-net cancelled history. Existing source-insert/chronology
SQL regressions remain green. The wider Finance flow remains PARTIAL.

The active and historical views also normalize string checkbox values such as `" TRUE "`
for disabled/group flags, matching controller and memory classification. Real SQLite
regressions cover inactive string flags and document/master group flags; no string flag
can silently turn an inactive account into closing authority.
