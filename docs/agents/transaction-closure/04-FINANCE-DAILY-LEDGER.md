# AGENT 04 — FINANCE RECONCILIATION + DAILY DETAILED LEDGER

Status: PR-READY / SHARED DEPENDENCIES REMAIN  
Branch: `rc/transaction-closure-04-finance-daily-ledger`  
PR: `#506` — `feat(finance): close Daily Ledger and cross-ledger reconciliation`  
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`  
Merge-base with main: `a99af64b6509477238bc9dc848e226828531b599`  
Latest audited main: `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`  
Risk: **CRITICAL**

## Mission

Make Finance the authoritative reconciliation layer across transaction domains without creating a second business ledger.

Target accounting book flow:

`opening -> authoritative movements -> closing`

with reconciliation across GL, AR, AP, Cash/Bank and proven Stock valuation integration seams.

## Authority decision

Closure-04 preserves existing source-of-truth boundaries:

- `gl_entries` remains financial posting/book authority;
- `payment_ledger_entries` remains AR/AP settlement-allocation authority;
- Payment Entry / Payment Allocation remain settlement workflow authority;
- Bank Transaction remains statement/feed evidence only;
- `bank_reconciliation_entries` remains append-only reversible bank-control evidence;
- `stock_ledger_entries` remains stock quantity/value authority;
- Repost Item Valuation remains the current stock-to-finance valuation correction seam.

No mutable balance table, shadow GL, shadow AR/AP ledger, shadow bank balance or shadow stock valuation ledger is introduced.

All closure-04 additions are rebuildable read projections.

## Exact-state / drift audit

The worker was seeded from the transaction-closure program lineage. At final implementation audit, current main was five commits ahead of the merge-base. Those five commits were UI V3 / UI release-evidence changes only and did not touch closure-04 Finance/query/policy paths.

PR #506 is open against `main` and GitHub reports it mergeable. The branch is intentionally not history-rewritten merely to absorb unrelated UI drift.

No production mutation, deployment or migration has been performed.

## Canonical evidence audited

- Forge Enterprise Completion Skill;
- `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`, `AI_HANDOFF.md`;
- transaction-closure program artifacts;
- Enterprise North Star / capability evidence;
- RC-020 GL scope, accounting-period and reversal hardening;
- RC-021 AR reconciliation;
- RC-022 AP reconciliation;
- RC-023 Cash/Bank/Reconciliation;
- RC-024/025 stock reconciliation, backdate, repost and valuation authority;
- closure-03 Inventory/WMS completion record and `DR-C03-01`;
- exact Query Worker, policy, GL, Payment Ledger, Stock Ledger and bank-reconciliation schema/code.

## Historical Daily Detailed Ledger audit

### PR #146

Disposition: **REUSE CURRENT MAIN**.

Current main already contains the immutable multi-domain Daily Detailed Ledger snapshot/freeze/adjustment subsystem in:

- `server/packages/document-kernel/src/daily-detailed-ledger.ts`;
- `server/migrations/tenant/0033_daily_detailed_ledger.sql`;
- tenant-worker Daily Ledger API/runtime.

That subsystem is operational/audit snapshot evidence. It is not replaced or promoted into GL authority.

### PR #199

Disposition: **REUSE CURRENT MAIN**.

Stale-freeze/current-snapshot/authenticated lifecycle hardening remains canonical for the legacy snapshot subsystem.

### PR #197

Disposition: **SUPERSEDED by #199**. No stale cherry-pick.

## Report identity boundary

Self-review found that the legacy tenant-worker already owns the public identity:

`Daily Detailed Ledger`

for its snapshot/freeze/reconcile API.

Closure-04 therefore exposes the GL accounting-book projection through Query Worker as:

`Finance Daily Detailed Ledger`

This prevents two different report routes from returning different semantics under the same report name.

The public `FinanceReportCompiler` explicitly rejects `Daily Detailed Ledger` on the generic Query Worker and tells callers to use the tenant-worker snapshot API instead.

Legacy `Daily Detailed Ledger` report permissions remain unchanged. Closure-04 does not widen legacy snapshot/reconcile access while adding the new financial book report.

## Finance Daily Detailed Ledger

Implementation layers:

- internal GL projection: `server/packages/query/src/finance-closure.ts`;
- public report identity/router: `server/packages/query/src/finance-report-compiler.ts`;
- runtime: canonical Query Worker.

Required filters:

- `ledger_date`;
- `company`.

Optional exact filters:

- `branch`;
- `account`;
- `currency`.

Unknown filters fail closed.

### Opening

For each scoped `company + branch + account + currency + currency_scale`:

`opening_balance_minor = SUM(debit_minor - credit_minor)`

for authoritative GL postings before the requested ledger date.

### Movements

Each movement retains:

- `posting_at`;
- `voucher_type`;
- `voucher_no`;
- `voucher_revision`;
- immutable GL `line_key`;
- account;
- party type / party;
- currency / scale;
- debit / credit minor units;
- cost center.

Deterministic running order:

`posting_at -> voucher_type -> voucher_no -> voucher_revision -> line_key`.

This preserves correction/reversal/backdate traceability instead of collapsing history into a mutable balance row.

### Closing

`closing_balance_minor = opening_balance_minor + SUM(day debit_minor - credit_minor)`.

Minor-unit values remain exact. Display values use the canonical currency scale `0..6`; no hard-coded `/100` assumption is used.

### Branch scope

Branch resolution reuses the RC-020 General Ledger rule:

1. source document `payload_json.branch` when present;
2. otherwise `gl_entries.dimensions_json.branch`;
3. otherwise empty branch.

No second branch interpretation is introduced.

### GL / Trial Balance consistency

Finance Daily Detailed Ledger, General Ledger and Trial Balance derive from `gl_entries`. Closure-04 stores no competing book balance.

## Finance Reconciliation Diagnostics

Implementation: `server/packages/query/src/finance-closure.ts`.

Required filters:

- `as_of_date`;
- `company`.

Output filters are allow-listed and parameterized.

### AR control

Compares Payment Ledger base receivable balance with Customer-dimension GL net debit.

### AP control

Compares Payment Ledger base payable balance with Supplier-dimension GL net credit.

### Multi-currency/base currency

The Payment Ledger side follows the existing RC-022 fallback chain:

1. document company currency / scale;
2. Company master default currency;
3. Currency master scale;
4. Payment Ledger currency/scale only as final legacy fallback.

This avoids comparing transaction currency directly with company-base GL.

### GL integrity

Consumes RC-020 `finance_gl_reconciliation` and surfaces non-zero voucher-revision debit/credit differences.

### Cash/Bank integrity

Normal partial/full/unreconciled status remains owned by RC-023 Bank Reconciliation and its summary report.

Closure diagnostics only surfaces impossible historical control states:

- active reconciliation below zero;
- active reconciliation above the Bank Transaction statement amount.

A legitimate partial reconciliation is not mislabeled as an accounting mismatch.

## Stock Valuation Reconciliation

Implementation: `server/packages/query/src/finance-stock-control.ts`.

This closes the currently provable portion of closure-03 `DR-C03-01` without changing stock authority.

For each immutable `Repost Item Valuation` voucher revision it compares:

`SUM(stock_ledger_entries.stock_value_difference_minor)`

against:

`SUM(gl_entries.debit_minor - gl_entries.credit_minor)`

on the Repost document's canonical `stock_account`.

Scope includes:

- tenant;
- company;
- voucher revision;
- item;
- warehouse;
- stock account;
- currency / scale.

Original repost and reversal revisions remain independently traceable.

Closure-04 does not pretend that total balanced GL identifies stock valuation. It compares the exact stock-account leg declared by the existing Repost contract.

## Query Worker composition

`server/apps/query-worker/src/index.ts` now uses `FinanceReportCompiler` for both synchronous and prepared-report execution.

Composition preserves:

- existing base finance reports;
- RC-021 aging/AR paths;
- RC-022 AP/Supplier Reconciliation paths;
- Finance Daily Detailed Ledger;
- Finance Reconciliation Diagnostics;
- Stock Valuation Reconciliation.

Queued execution cannot silently fall back to an older compiler.

## Permissions

Server-side report policy remains the authority.

### Legacy Daily Detailed Ledger

Original permission contract preserved:

- General Accountant;
- Chief Accountant;
- Director;
- Vietnamese equivalents already present in repo.

### New finance closure reports

`Finance Daily Detailed Ledger`, `Finance Reconciliation Diagnostics`, and `Stock Valuation Reconciliation` are limited to accounting-control roles:

- System Manager;
- Accounts Manager;
- Accounts User;
- General Accountant;
- Chief Accountant;
- Vietnamese accounting equivalents.

Sales/Purchase/Stock operational roles do not gain finance diagnostics. Director-only roles do not gain diagnostic reports.

## Tenant / company / branch boundary

- tenant is always a bound server-controlled parameter;
- company is mandatory on closure-04 control reports;
- Finance Daily Detailed Ledger supports exact branch scope through canonical GL dimensions;
- Stock Valuation Reconciliation additionally scopes item/warehouse/stock-account evidence;
- user values are bound SQL parameters, not concatenated SQL values.

### AR/AP branch limitation

Canonical `payment_ledger_entries` has no branch/dimensions column.

Closure-04 therefore claims AR/AP subledger-to-GL reconciliation at **company scope only**. It does not compare a company-wide Payment Ledger total against one GL branch and manufacture a false mismatch.

Finance Daily Detailed Ledger itself remains branch-scoped through GL.

## Period / reversal / backdate behavior

Closure-04 adds no mutation path and cannot bypass RC-020/RC-023 accounting-period authority.

Correction/reversal remains append-only in authoritative ledgers. Financial reports expose voucher revision instead of rewriting history.

Backdated authoritative postings appear according to `posting_at` with deterministic voucher/revision/line ordering.

## Failure / discrepancy semantics

Source regressions cover fail-closed behavior for:

- missing company/date scope;
- invalid calendar date;
- unsupported filter names/operators;
- SQL-injection-shaped values remaining bound parameters;
- intentional AR/AP mismatch;
- intentional GL imbalance;
- impossible Bank Reconciliation over-allocation;
- Stock Ledger vs stock-account GL mismatch;
- accidental generic Query Worker reuse of legacy `Daily Detailed Ledger` identity.

No discrepancy report mutates source authority to make itself pass.

## Isolated execution evidence

The agent execution container has no Forge checkout/dependency tree and direct GitHub clone/raw access fails DNS, so full repository gates are not fabricated as PASS.

Exact SQL query shapes were executed independently against in-memory SQLite fixtures.

### Finance Daily Detailed Ledger SQL shape — PASS

Fixture result:

- opening `1000`;
- movement `+250` -> `1250`;
- movement `-100` -> `1150`;
- closing `1150`.

### AR/AP/GL/Bank diagnostics SQL shape — PASS

Fixture result:

- matching AR: `Reconciled`;
- AP `700` vs GL `650`: `Mismatch 50`;
- GL debit `100` vs credit `90`: `Mismatch 10`;
- bank active reconciliation `1200` vs statement capacity `1000`: `Mismatch 200`.

### Repost Stock -> GL SQL shape — PASS

Fixture result:

- revision 1: Stock `+300`, stock-account GL `+300` -> `Reconciled`;
- revision 2: Stock `-250`, stock-account GL `-300` -> `Mismatch 50`.

## Source regressions added

- `server/tests/finance-closure-query.test.mjs`;
- `server/tests/finance-closure-policy.test.mjs`;
- `server/tests/finance-stock-control-query.test.mjs`;
- `server/tests/finance-stock-control-policy.test.mjs`;
- `server/tests/finance-report-compiler.test.mjs`.

They cover query authority, ordering, scopes, fixed-point semantics, mismatch detection, parameterization, permission boundaries, compiler composition and legacy/new report-name separation.

## Validation truth

Risk lane: **CRITICAL**.

Executed in this worker session:

- exact GitHub branch/main/file-scope audit: **PASS**;
- SQLite execution of financial Daily Ledger query shape: **PASS**;
- SQLite execution of AR/AP/GL/Bank diagnostic query shape: **PASS**;
- SQLite execution of Repost Stock/GL query shape: **PASS**;
- PR mergeability check: **PASS** (`#506` mergeable).

Not executed as full repository gates in this environment:

- server TypeScript build/typecheck: **NOT RUN**;
- Node unit suite including the new regressions: **NOT RUN**;
- full SQL regression suite: **NOT RUN**;
- worker/integration/E2E suites: **NOT RUN**.

GitHub workflow evidence on the PR head only showed the historical `RC-021 Critical Validation` workflow as **skipped**. No relevant CI PASS is inferred from that.

Combined commit status currently exposes no additional status contexts.

Migrations: **none**.

## Dependency Requests

### DR-C04-01 -> Agent 03 Inventory/WMS — remainder of DR-C03-01

Resolved here:

- exact Repost Item Valuation Stock Ledger value delta -> canonical stock-account GL delta reconciliation;
- revision/reversal traceability.

Still needed:

- canonical downstream financial restatement when a backdated stock mutation changes valuation of already-posted outgoing stock;
- exact affected COGS/expense vouchers/accounts/dimensions and repost/correction semantics.

Why not inferred here:

current stock authority proves valuation replay and Repost adjustment, but does not expose a universal mapping from every stale historical outgoing valuation to a specific historical finance correction.

Blocked claim:

- fully Hardened `W01-023/W01-024 -> Finance` historical COGS/expense restatement.

Independent closure work remains PR-ready.

### DR-C04-02 -> shared Finance dimension contract

If branch-level AR/AP reconciliation is required, define a canonical branch/accounting-dimension contract on Payment Ledger or an equivalent authoritative allocation dimension.

Current `payment_ledger_entries` has tenant, voucher, party, account, amount/currency/reference and posting time, but no branch/dimensions column.

Blocked claim:

- branch-level AR/AP subledger-to-GL reconciliation.

Company-level AR/AP reconciliation and branch-scoped GL Daily Ledger remain valid independently.

## Capability recommendation

Do not promote the entire Finance family to Hardened from closure-04 alone.

- F01 financial posting/legal-book projection: **RC candidate** after full CRITICAL execution gates;
- F02 AR: preserve RC-021 authority, now with cross-ledger diagnostics;
- F03 AP: preserve RC-022 authority, now with cross-ledger diagnostics;
- F04 Cash/Bank: preserve RC-023 authority, now with impossible-state diagnostics;
- Repost Stock -> Finance seam: **RC candidate** after full execution gates;
- historical COGS/expense restatement: dependency-bound by `DR-C04-01`;
- branch-level AR/AP control: dependency-bound by `DR-C04-02` if required.

## Worker delta

Closure-04-owned runtime/evidence paths:

- `server/packages/query/src/finance-closure.ts`;
- `server/packages/query/src/finance-stock-control.ts`;
- `server/packages/query/src/finance-report-compiler.ts`;
- `server/apps/query-worker/src/index.ts`;
- `server/packages/policy/src/index.ts`;
- five focused test files listed above;
- this completion record.

Program seed coordination docs remain branch lineage, not Finance runtime authority.

## Merge/deploy disposition

**PR-ready. Stop before merge/deploy.**

This is non-UI Finance/query/policy work under the CRITICAL lane. PR creation and evidence recording are autonomous. Merge to `main` and any production deployment require explicit user approval.
