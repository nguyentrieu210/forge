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


## Transactional Budget Stop/Warn/Ignore

R8-B now evaluates submitted GL against the same Finance Budget scope/date/account model
at commit time. D1 migration 0153 runs a `BEFORE INSERT` GL guard inside the mutation
batch, so a `Stop` budget cannot be crossed by two concurrent submits that both passed a
controller-side read. The in-memory store mirrors the same actual + submitted commitment
+ dated revision calculation under its database mutex.

The guard:
- uses company, Branch, Cost Center and Project scope matching consistent with the report;
- treats Income consumption as credit-minus-debit and other accounts as debit-minus-credit;
- excludes Period Closing Voucher GL from operating budget consumption;
- rejects mixed GL currency/scale instead of comparing heterogeneous minor units;
- clips revisions and commitments through the posting date;
- blocks only `Stop`; `Warn` and `Ignore` remain non-blocking and are visible through
  the canonical Budget-vs-Actual status projection.

This closes the race-prone actual-aware Stop boundary and the declared automatic
commitment-consumption boundary. Finance Budget Commitment remains immutable Reserve/Release
evidence; Forge now derives the outstanding commitment by grouping net commitment by canonical
source and subtracting only linked actual GL, capped at the source reservation.

Automatic actualization is source-specific:
- Purchase Order -> Purchase Invoice expense rows linked to the exact PO / child-row authority;
- Material Request -> Purchase Invoice expense rows whose Material Request lineage is frozen
  from the invoice input, exact PO item row, or PO header;
- Expense Claim -> the claim's own in-scope account GL.

A partial actual therefore replaces, rather than stacks on top of, the same committed amount.
Exact cancellation GL reversals remove the linked actual and automatically restore the
outstanding commitment without fabricating a Release document. Legacy source-less commitment
evidence remains fully outstanding instead of being silently consumed.

Migration 0157 evaluates this same source-linked outstanding commitment inside the GL INSERT
transaction and includes the NEW GL row, so two concurrent submits cannot exploit a
controller/read-model race. The in-memory store mirrors the same calculation under its mutex,
and Budget-vs-Actual uses the same source lineage in its executable SQL projection.

## Fiscal distribution core

R8-B now implements an opt-in fiscal-distribution authority aligned to the pinned ERPNext
v16.20.0 Budget distribution semantics without changing legacy annual-only budgets.

A submitted Finance Budget can freeze `Monthly`, `Quarterly`, `Half-Yearly` or `Yearly`
distribution. Equal distribution uses integer allocation weights rather than floating-point
percentages, so twelve equal periods close exactly to the annual minor-unit amount. Manual
distribution freezes basis-point percentages totaling exactly 100%. Each normalized row is
persisted both in the canonical payload and as a `Finance Budget Distribution` child row.

Budget enforcement uses two caps:
- annual effective budget = base budget + dated submitted revisions;
- accumulated budget through the posting date = the same annual effective amount multiplied
  by the frozen cumulative distribution weight using integer quotient/remainder arithmetic.

Budget-vs-Actual reports annual effective and accumulated budget separately. Available amount
and utilization are based on the accumulated cap, scoped actual GL and source-net outstanding
commitments. D1 migration 0158 validates submitted distribution evidence and applies the same
accumulated cap atomically to both GL inserts and commitment-only submits; the in-memory store
mirrors those guards.

This closes the **core equal/manual accumulated fiscal-distribution path**. It does not yet
close retroactive lifecycle safety for a negative Budget Revision backdated into an already
consumed distributed period. That revision needs period-by-period historical revalidation
before the broader fiscal-distribution boundary can be called complete.

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
- `server/migrations/tenant/0158_finance_budget_fiscal_distribution.sql`: submitted
  distribution backstops plus atomic accumulated Stop guards for GL and commitment-only writes.
- `server/tests/finance-budget.test.mjs`: exact equal/manual distribution normalization,
  canonical child-row persistence, accumulated commitment Stop and source-linked controller semantics.
- `server/migrations/tenant/0157_finance_budget_commitment_actualization.sql`: commit-time
  source-linked automatic commitment consumption for Purchase Order, Material Request and
  Expense Claim.
- `server/tests/finance-budget-transaction-control.test.mjs`: in-memory partial actualization,
  exact reversal restoration and Expense Claim source consumption.
- `server/tests/finance-budget-actual-sql.test.mjs`: executable source-specific PO/MR/Expense
  Claim report semantics, including exact-row Material Request isolation.
- `server/scripts/test-finance-budget-transaction-control.py`: D1 atomic NEW-row proof for
  automatic actualization and restoration.
- R8-B workflow run **36996734772** on implementation commit
  `17f6c7a9d5d74d541a1ef3f6f717bd9d5c12d397`: build, all Finance Budget read/transaction/D1
  regressions, all prior R8-B gates, benchmark invariant and matrix verifier passed.
- `.github/workflows/r8b-business-closure.yml`: all these checks plus prior R8-B closures.

## Still open

Core equal/manual accumulated fiscal distribution is implemented; retroactive negative-revision period revalidation and pinned ERPNext differential fixtures remain open. Automatic
commitment consumption for the declared Material Request / Purchase Order / Expense Claim
sources is now source-linked and commit-time guarded together with actual-aware Stop/Warn/Ignore.
Period close still needs previous-year/future-close lifecycle depth, historical-account
planner support, large-ledger processing and in-memory/D1 commit-guard parity.
FX revaluation, consolidation, downstream Landed Cost repost, broader subcontracting
and the remaining R8 module/flow depth remain PARTIAL. BUSINESS_CLOSED is still false.

No production migration, merge or deployment is performed by this closure.

### Latest fiscal-distribution evidence

- R8-B workflow run **36999390426** on implementation commit
  `7c7bfe1fe340302dcaf499b328842a043658552e` passed all 26 gates, including
  fiscal-distribution controller normalization, executable Budget-vs-Actual SQL, in-memory
  projected Stop, D1 migration regression, benchmark invariant and matrix verifier.
