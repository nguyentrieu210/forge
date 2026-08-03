# AGENT 04 — FINANCE RECONCILIATION + DAILY DETAILED LEDGER

Status: PR-READY / SHARED STOCK RESTATEMENT DEPENDENCY REMAINS
Branch: `rc/transaction-closure-04-finance-daily-ledger`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL

## Mission

Make Finance the authoritative reconciliation layer across transaction domains without becoming a second business ledger.

Core outcome:

`opening -> authoritative movements -> closing`

with reconciliation across AR, AP, Cash/Bank, Stock valuation and GL, including reversal/backdate/correction evidence.

Capability focus: `F01`, `F02`, `F03`, `F04`, relevant `F07`, `V01` accounting-book evidence.

## Own

- canonical GL/report/reconciliation/query implementation;
- Daily Detailed Ledger projection/report and tests;
- cross-ledger reconciliation evidence and discrepancy diagnostics;
- finance-side contracts consumed by other workers.

## Do not own

- Sales lifecycle semantics: Agent 01;
- stock ledger/valuation semantics: Agent 03;
- Manufacturing lifecycle/cost authority: Agent 02;
- Procurement lifecycle: Agent 05;
- Warranty/service lifecycle: Agent 06.

## Required audit

- current `gl_entries` authority and RC-020 posting/period/reversal behavior;
- RC-021 AR reconciliation and customer statement/aging;
- RC-022 AP reconciliation and supplier statement/aging;
- RC-023 cash/bank reconciliation;
- RC-024/025 stock valuation/repost evidence;
- branch/company/tenant dimensions and legal book requirements;
- query/report paths that could disagree with authoritative postings;
- historical Daily Ledger/accounting-book PRs: classify before rewrite.

## Daily Detailed Ledger contract

Must be a read/reconciliation projection, not a writable ledger.

At minimum prove:

- opening balance from authoritative pre-period postings;
- ordered movements with source document/type/id, posting timestamp/date, debit/credit or quantity/value semantics as applicable;
- closing = opening + movements under deterministic precision/rounding;
- tenant/company/branch/account scopes;
- correction/reversal pairs remain traceable;
- backdated/reposted movements appear in deterministic order;
- totals reconcile to General Ledger/Trial Balance in financial scope;
- customer/supplier detail reconciles to AR/AP controls;
- stock valuation summary reconciles to canonical stock valuation postings where integration exists.

## Required evidence

- balanced GL invariants;
- hard/soft period authority still enforced;
- AR/AP/cash-bank reconciliation before and after reversal;
- cross-ledger discrepancy tests that fail on intentional mismatch;
- multi-currency/base-currency handling using canonical semantics;
- immutable posting/audit trace;
- server-side tenant/company/branch isolation;
- migration replay if any schema/report projection tables are introduced.

## Dependency behavior

If reconciliation exposes a domain defect, do not patch that domain's authority in this branch. Raise a Dependency Request to the owning worker with exact mismatch evidence, then continue independent finance/report work.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc handoff + program artifacts + Forge Skill + exact branch/main + RC-020..025 evidence/code/tests. Daily Detailed Ledger chỉ là authoritative projection/reconciliation, tuyệt đối không thành shadow GL. Audit historical ledger/report PR trước khi code. Khi phát hiện mismatch do domain khác, ghi Dependency Request với chứng cứ cụ thể, không tự sửa authority của họ. Verify CRITICAL gates, cập nhật Completion Record, dừng trước merge/deploy.

# Completion record

## 1. Exact-state and drift audit

The worker seed merge-base with current `main` is `a99af64b6509477238bc9dc848e226828531b599`.

At the final implementation audit in this worker session, exact current `main` was `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`. The main commits after the merge-base were UI V3 / UI release-evidence changes only. They did not touch the finance/query/policy backend paths changed by this worker. Therefore the worker did not manufacture a cosmetic rebase merely to erase harmless parallel UI drift; mergeability is checked at PR time.

Canonical evidence consumed:

- `skills/forge-enterprise-completion/SKILL.md`;
- `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`, `AI_HANDOFF.md`;
- transaction-closure program artifacts;
- Enterprise North Star / capability evidence;
- RC-020 GL scope/period/reversal hardening;
- RC-021 AR reconciliation;
- RC-022 AP reconciliation;
- RC-023 Cash/Bank/Reconciliation;
- RC-024/025 stock reconciliation/backdate/repost/valuation authority;
- current closure-03 Inventory/WMS completion record and `DR-C03-01`;
- exact query worker, policy, GL, Payment Ledger, Stock Ledger and bank-reconciliation schema/code.

## 2. Authority decision

Closure-04 does not create a writable finance ledger.

Authority remains:

- `gl_entries`: financial posting / book authority;
- `payment_ledger_entries`: AR/AP settlement allocation authority, reconciled back to party-dimension GL;
- Payment Entry / Payment Allocation: settlement workflow authority;
- Bank Transaction: statement/feed evidence only;
- `bank_reconciliation_entries`: append-only bank control evidence only;
- `stock_ledger_entries`: stock quantity/value authority;
- Repost Item Valuation: existing stock-to-finance valuation correction seam.

All new closure-04 reports are rebuildable, parameterized read projections. No mutable balance table, shadow GL, shadow AR/AP ledger, shadow bank balance or shadow stock valuation table was introduced.

## 3. Historical Daily Detailed Ledger disposition

### PR #146 — Daily detailed ledger foundation

Disposition: **REUSE CURRENT MAIN**.

Current main already contains the immutable multi-domain snapshot/freeze/adjustment subsystem in:

- `server/packages/document-kernel/src/daily-detailed-ledger.ts`;
- `server/migrations/tenant/0033_daily_detailed_ledger.sql`;
- the existing runtime Daily Detailed Ledger experience.

That subsystem is useful operational/audit evidence. It intentionally snapshots multiple business domains and supports immutable freeze plus append-only adjustment. Closure-04 does not replace it or turn it into financial posting authority.

### PR #199 — stale-freeze/authenticated hardening

Disposition: **REUSE CURRENT MAIN**.

The stale-freeze/current-snapshot and authenticated lifecycle hardening remains canonical for the legacy operational snapshot workflow.

### PR #197

Disposition: **SUPERSEDED by #199**. No stale cherry-pick.

### Closure decision

The historical subsystem answers a different question from the legal/accounting book contract. Closure-04 therefore adds a finance-specific GL projection in the query layer while preserving the historical immutable snapshot system unchanged.

## 4. Daily Detailed Ledger financial projection

Implemented in `server/packages/query/src/finance-closure.ts` and exposed through the canonical Query Worker.

Required scope:

- `ledger_date`: exact required date;
- `company`: exact required company;
- optional exact `branch`;
- optional exact `account`;
- optional exact `currency`.

Unrecognized filters fail closed.

The query reads only `gl_entries` joined back to its authoritative source document.

### Opening

For each `company + branch + account + currency + currency_scale` scope:

`opening_balance_minor = SUM(debit_minor - credit_minor)` for authoritative postings before the requested ledger date.

### Movement

Movements on the requested day retain:

- posting timestamp;
- voucher type;
- voucher number;
- voucher revision;
- immutable GL line key;
- account;
- party type / party;
- currency / scale;
- debit minor / credit minor;
- cost center.

Running balance is deterministic by:

`posting_at -> voucher_type -> voucher_no -> voucher_revision -> line_key`.

The revision + line key ordering keeps correction/reversal/backdate evidence visible instead of collapsing it into one mutable row.

### Closing

`closing_balance_minor = opening_balance_minor + SUM(day debit_minor - credit_minor)`.

Exact minor-unit fields are returned alongside display amounts. Display conversion uses the canonical 0..6 currency scale contract and never hard-codes `/100`.

### Branch scope

Branch resolution follows the existing RC-020 General Ledger authority:

1. source document `payload_json.branch` when present;
2. otherwise GL `dimensions_json.branch`;
3. otherwise empty branch.

This prevents a second branch interpretation from appearing only in Daily Ledger.

### General Ledger / Trial Balance reconciliation

Daily Ledger, General Ledger and Trial Balance all derive from `gl_entries` under the same company/branch/account/currency financial scope. Daily Ledger does not store a competing total; opening, movement and closing are recomputed from the authoritative postings each run.

## 5. Cross-ledger finance diagnostics

`Finance Reconciliation Diagnostics` is implemented in `server/packages/query/src/finance-closure.ts`.

Required scope:

- `as_of_date`;
- `company`.

Optional output filters are parameterized and allow only explicit control columns.

### AR

Compares:

`Payment Ledger base receivable balance`

against:

`Customer-dimension GL net debit`.

### AP

Compares:

`Payment Ledger base payable balance`

against:

`Supplier-dimension GL net credit`.

### Multi-currency/base currency

Payment Ledger comparison uses the existing RC-022 canonical fallback chain:

1. document `company_currency` / `company_currency_scale`;
2. Company master default currency;
3. Currency master scale;
4. existing Payment Ledger currency/scale only as final legacy fallback.

This avoids comparing a foreign transaction amount directly with company-base GL.

### GL integrity

Consumes `finance_gl_reconciliation` from RC-020 and surfaces voucher-revision debit/credit differences as `Mismatch` evidence.

### Cash/Bank integrity

Normal partial/full/unreconciled business state remains owned by the RC-023 Bank Reconciliation flow and its summary report.

Closure diagnostics only treats impossible historical control states as mismatch:

- active reconciliation below zero;
- active reconciliation above the Bank Transaction statement amount.

This avoids mislabeling a legitimate partial/unreconciled statement as an accounting discrepancy while still catching corruption that should be impossible under the current RC-023 guards.

## 6. Stock valuation -> GL reconciliation

Closure-03 `DR-C03-01` asked Finance for historical stock-to-finance propagation/reconciliation evidence.

Closure-04 closes the currently proven integration seam without changing stock authority.

`Stock Valuation Reconciliation` is implemented in `server/packages/query/src/finance-stock-control.ts`.

For every immutable `Repost Item Valuation` voucher revision it compares:

`SUM(stock_ledger_entries.stock_value_difference_minor)`

against:

`SUM(gl_entries.debit_minor - gl_entries.credit_minor)` on the document's canonical `stock_account`.

The comparison is scoped by tenant, company, voucher revision, item, warehouse, stock account, currency and currency scale.

This works for the original repost and exact reversal revisions because both Stock Ledger and GL preserve voucher revision history.

No generic assumption is made that a balanced voucher's total GL can stand in for stock valuation. The report compares the exact stock-account leg declared by the existing Repost Item Valuation contract.

## 7. Query Worker and permissions

`server/apps/query-worker/src/index.ts` now uses `FinanceStockControlQueryCompiler`, which composes:

- existing Finance reports;
- existing RC-021/022 finance-aging/AP compilers;
- Daily Detailed Ledger;
- Finance Reconciliation Diagnostics;
- Stock Valuation Reconciliation.

The same compiler is used by synchronous and prepared-report execution paths so queued reports cannot silently fall back to a weaker compiler.

`server/packages/policy/src/index.ts` keeps report authorization server-side.

Daily Detailed Ledger retains legacy accounting/director roles and now also admits canonical `System Manager`, `Accounts Manager`, and `Accounts User` roles used by the existing GL/Trial Balance reports.

Finance Reconciliation Diagnostics and Stock Valuation Reconciliation are limited to accounting-control roles; Sales/Purchase/Stock operational roles and Director-only roles do not receive those diagnostic reports.

## 8. Period / correction / reversal interaction

Closure-04 introduces no mutation path and therefore cannot bypass accounting-period authority.

Existing RC-020 / RC-023 hard/soft-close controls remain untouched.

Correction/reversal evidence remains append-only in authoritative ledgers. Daily Ledger and stock reconciliation expose voucher revision rather than rewriting historical rows.

Backdated postings naturally appear in the requested accounting date because the projection orders authoritative `posting_at` plus stable voucher/revision/line identity.

## 9. Company / branch / tenant boundary

- tenant is always the first bound query parameter and is never accepted from a free SQL identifier;
- company is mandatory for all closure-04 finance control reports;
- Daily Ledger supports exact branch scoping using the canonical RC-020 branch resolution;
- Stock Valuation Reconciliation additionally scopes exact item/warehouse/stock-account evidence;
- filters and user values are bound parameters, not concatenated SQL values.

### AR/AP branch boundary

Canonical `payment_ledger_entries` has no branch/dimensions column. Therefore closure-04 deliberately claims AR/AP cross-ledger reconciliation at company scope only. It does not invent branch attribution from unrelated fields or compare a company-wide Payment Ledger total to one GL branch and call the resulting false difference a defect.

Daily GL book branch isolation is proven independently through the authoritative GL dimensions.

## 10. Failure / discrepancy semantics

Targeted regressions cover fail-closed behavior for:

- missing required company/date scope;
- invalid calendar dates;
- unsupported filter names;
- unsupported operators;
- SQL-injection-shaped values remaining bound parameters;
- intentional AR/AP difference;
- intentional GL imbalance;
- impossible bank over-allocation state;
- Stock Ledger vs stock-account GL mismatch on a Repost revision.

No discrepancy report mutates the source ledger to "fix" itself.

## 11. Isolated execution evidence from this worker session

The execution environment did not contain a Forge checkout/dependency tree and direct GitHub clone access failed DNS resolution, so full repository commands are not fabricated as PASS.

The exact SQL query shapes implemented here were executed independently against in-memory SQLite fixtures:

### Daily Detailed Ledger fixture — PASS

Fixture result for account `1110-Cash`:

- opening: `1000` minor;
- movement 1: `+250` -> running `1250`;
- movement 2: `-100` -> running `1150`;
- closing: `1150`.

This proves the emitted opening/movement/running/closing SQL shape and deterministic polarity.

### Finance diagnostics fixture — PASS

Fixture intentionally contained:

- AR Payment Ledger = GL: reported `Reconciled`;
- AP Payment Ledger `700` vs GL `650`: reported `Mismatch 50`;
- GL voucher debit `100` vs credit `90`: reported `Mismatch 10`;
- bank active reconciliation `1200` vs statement capacity `1000`: reported `Mismatch 200`.

### Stock valuation fixture — PASS

Two Repost Item Valuation revisions were exercised:

- revision 1: Stock value `+300`, stock-account GL `+300` -> `Reconciled`;
- revision 2: Stock value `-250`, stock-account GL `-300` -> `Mismatch 50`.

## 12. Source regressions added

- `server/tests/finance-closure-query.test.mjs`
  - Daily Ledger scope/ordering/opening/closing/source authority;
  - fail-closed filters/dates;
  - AR/AP/GL/bank diagnostic source contracts;
  - parameterization;
  - preservation of RC-022 / existing Finance reports.
- `server/tests/finance-closure-policy.test.mjs`
  - Daily Ledger role contract;
  - restricted finance diagnostics.
- `server/tests/finance-stock-control-query.test.mjs`
  - Repost Stock Ledger -> exact stock-account GL voucher-revision reconciliation;
  - company/tenant scope and parameterization;
  - preservation of closure reports.
- `server/tests/finance-stock-control-policy.test.mjs`
  - accounting-control authorization;
  - unrelated operational-role denial.

## 13. Validation truth

Risk: **CRITICAL**.

Executed in this worker session:

- isolated SQLite execution of Daily Ledger query shape: **PASS**;
- isolated SQLite execution of AR/AP/GL/Bank diagnostic query shape: **PASS**;
- isolated SQLite execution of Repost Stock/GL reconciliation query shape: **PASS**;
- exact GitHub drift/file-scope audit: **PASS**.

Source regressions are present but the following full-repository gates were **NOT RUN** in this environment:

- full server TypeScript build/typecheck;
- Node unit suite including the four new source regressions;
- full server SQL regression suite;
- worker/integration/E2E suite.

Reason: no repository checkout/dependency tree is available in the execution container and direct GitHub clone/raw access fails DNS. No unexecuted gate is promoted to PASS.

Migrations: **none**.

Production mutation/deploy: **none**.

## 14. Dependency Requests

### DR-C04-01 -> Agent 03 Inventory/WMS — remainder of DR-C03-01

**Resolved by closure-04:** exact `Repost Item Valuation` Stock Ledger value delta -> canonical stock-account GL delta reconciliation, including voucher revisions/reversals.

**Still needed:** canonical downstream financial restatement semantics when a backdated stock mutation changes valuation of already-posted outgoing stock, including which historical COGS/expense vouchers and dimensions must be corrected/reposted.

**Why not inferred here:** current stock authority proves valuation replay and Repost adjustment, but it does not expose a universal contract mapping every stale historical outgoing valuation to a specific finance voucher/account correction. Inventing that mapping in a report would create false accounting authority.

**Blocked claim:** Hardened end-to-end `W01-023/W01-024 -> Finance` historical COGS/expense restatement.

**Can continue independently:** yes; Daily Ledger, GL, AR/AP, Bank controls and existing Repost Stock/GL reconciliation are complete within their proven boundaries.

### DR-C04-02 -> shared Finance dimension contract

**Need:** if branch-level AR/AP control reconciliation becomes mandatory, define a canonical branch/accounting-dimension contract on Payment Ledger or an equivalent authoritative allocation dimension.

**Current evidence:** `payment_ledger_entries` has tenant, voucher, party, account, amount/currency/reference and posting time but no branch/dimensions column.

**Blocked claim:** branch-level AR/AP subledger-to-GL reconciliation.

**Can continue independently:** yes; company-level AR/AP reconciliation remains authoritative, and Daily Ledger itself is branch-scoped through GL.

## 15. Capability / maturity recommendation

Do not promote the whole Finance family to Hardened from closure-04 alone.

Recommended evidence status:

- F01 financial posting / legal-book projection: **RC candidate** after exact full CRITICAL execution gates;
- F02 AR reconciliation: preserve RC-021 authority; closure diagnostics adds cross-ledger evidence;
- F03 AP reconciliation: preserve RC-022 authority; closure diagnostics adds cross-ledger evidence;
- F04 Cash/Bank: preserve RC-023 authority; closure diagnostics adds impossible-state detection without redefining partial reconciliation;
- stock-to-finance Repost seam: **RC candidate** after full execution gates;
- historical backdated outgoing-stock COGS/expense restatement: dependency-bound by `DR-C04-01`;
- branch-level AR/AP cross-ledger control: dependency-bound by `DR-C04-02` if required.

## 16. Worker delta

Implementation/evidence delta owned by closure-04:

- `server/packages/query/src/finance-closure.ts`;
- `server/packages/query/src/finance-stock-control.ts`;
- `server/apps/query-worker/src/index.ts`;
- `server/packages/policy/src/index.ts`;
- `server/tests/finance-closure-query.test.mjs`;
- `server/tests/finance-closure-policy.test.mjs`;
- `server/tests/finance-stock-control-query.test.mjs`;
- `server/tests/finance-stock-control-policy.test.mjs`;
- this completion record.

Program seed docs remain part of the worker branch lineage but are not finance runtime authority.

## 17. Merge/deploy disposition

**PR-ready. Stop before merge/deploy.**

This is non-UI Finance/query/policy work under the CRITICAL lane. Opening the PR and recording exact evidence are autonomous. Merge into `main` and any production deployment require explicit user approval.
