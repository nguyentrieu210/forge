# R8-B — Budget-vs-Actual read authority and period-close safety

This closure extends PR #996 from `54ba4c93c0245b337ec32a128523e2f19cc21a58`.
R8-A benchmark evidence is unchanged. All 29 module/flow dispositions remain PARTIAL;
this is an implemented and regression-tested Finance slice, not ERPNext parity certification.

## Budget-vs-Actual

`Finance Budget vs Actual` uses submitted canonical Finance Budget, Revision and
Commitment documents plus immutable `gl_entries`. The report clips actuals, revisions
and reserve/release commitments to the budget period and requested as-of date.
Company, Branch, Cost Center and Project isolate actuals; Income uses credit-minus-debit.
Period Closing Voucher GL is excluded so year-end zeroing does not erase activity.
Cancellation remains visible through exact original/reversal GL rows.

The effective-budget calculation has its own CTE before calculating available amount,
fixing the failing R8-B query regression without relaxing its assertion.
Currency and scale must match the budget. A mismatched in-scope GL slice produces
`Invalid GL Currency / Scale`, an explicit entry count and NULL actual/available/utilization;
it is neither converted implicitly nor silently omitted from a supposedly valid balance.
Zero budget with consumption has undefined utilization rather than a misleading 0%.

`finance_historical_accounts` retains historical account classification after disabling
an account. Disabled Income balances therefore keep their credit sign in this report.
The SQL report is a read-only canonical GL projection. It does not yet consume the kernel
aggregate port, whose current contract lacks Project/Cost Center/closing-voucher exclusions.
No balance snapshot, shadow actual ledger or additional accounting write authority is added.

## Period-close safety

The controller validates complete UTC posting timestamps, including valid calendar dates.
Migration 0152 adds commit-time date, overlapping period/scope and inactive P&L backstops
for submitted inserts and updates. A company scope overlaps every branch; equal branches
overlap, while separate branches can close independently. Cancelled closes do not block replacement.

Inactive historical Income/Expense accounts with non-zero balances block close. This is
a fail-closed boundary, not automatic support for closing disabled accounts. A controlled
planner that consumes historical account metadata remains future work.

## Executable evidence

- `server/tests/finance-budget-actual-sql.test.mjs`: production compiler SQL executed in
  SQLite, including tenant/company/date/dimension isolation, revisions, reserve/release,
  exact cancellation reversal, Income sign, disabled historical Income, period-close exclusion,
  mixed currency/scale diagnostics, zero budget and parameterized filters.
- `server/tests/finance-closure-query.test.mjs`: compiler contracts and legacy report delegation.
- `server/tests/finance-closure-policy.test.mjs`: accounting-only report and close authority.
- `server/tests/period-close-timestamp.test.mjs`: malformed/overflow UTC dates and valid UTC preservation.
- `server/scripts/test-period-closing-authority-migration.py`: original source/lock guards
  plus timestamp, inactive historical account, overlapping scope and replacement regressions.
- `.github/workflows/r8b-business-closure.yml`: all these checks plus prior R8-B closures;
  trigger coverage now includes P2P tests and the R8 verifier.

## Still open

Budget actual-aware transactional Stop/Warn/Ignore enforcement, fiscal distribution,
automatic commitment consumption and pinned ERPNext differential fixtures remain open.
Period close still needs previous-year/future-close lifecycle depth, historical-account
planner support, large-ledger processing and in-memory/D1 commit-guard parity.
FX revaluation, consolidation, downstream Landed Cost repost, broader subcontracting
and the remaining R8 module/flow depth remain PARTIAL. BUSINESS_CLOSED is still false.

No production migration, merge or deployment is performed by this closure.
