# Finance AR/AP implementation slice

Date: 2026-07-31  
Branch: `feat/finance-ar-ap-completion`  
PR: `#15`

## Implemented

- Append-only migration `0030_finance_invoice_aging.sql`.
- Validation for explicit invoice due dates:
  - valid ISO date;
  - existing calendar date;
  - not before posting date.
- Required Due Date metadata for new Sales Invoice entry.
- Compatibility fallback for legacy/API invoices without due date.
- `finance_invoice_terms.due_date_source` values:
  - `explicit`;
  - `posting_date_fallback`.
- Accounts Receivable Aging and Accounts Payable Aging compilers.
- Query Worker synchronous/prepared integration.
- Report permissions by accounting/sales/purchase domain.
- Safe validation mapping for due-date D1 guard errors.
- Migration, query, permission and error regression tests.
- Root-test Worker route regression:
  - HTTP request parsing;
  - report permission;
  - `FinanceQueryCompiler` selection;
  - `D1ReportService` execution contract;
  - required `as_of_date` validation.

## Compatibility boundary

Migration `0030` does not hard-reject an omitted due date. This prevents existing API clients, fixtures and submitted-document paths from breaking before legacy data is reviewed.

Hard database presence enforcement requires a later append-only migration after:

1. fallback rows are inventoried;
2. unresolved count is zero;
3. checksum is reviewed;
4. staging migration and smoke pass.

## Branch reconciliation

- Finance branch was merged with the latest default branch without force-push.
- Backup branch: `backup/finance-ar-ap-pre-rebase-20260731`.
- The temporary reconciliation workflow removed itself before the merge commit was pushed.
- The PR is mergeable and zero commits behind the default branch.
- No temporary workflow remains in the PR diff.

## Evidence

### Targeted

- Compatibility migration fixture: PASS.
- TypeScript strict harness: PASS.
- Executed SQL cutoff fixture: PASS.
- `due_date_source` projection/filter fixture: PASS.

### Root PR Validation before Worker route regression

- Head: `2afc670f4ed755c897837fd0fddd3633f7d5628d`.
- Run: `30620083625`.
- Job: `91122345078`.
- Test, typecheck and build: PASS.

### Current exact-head blocker

After adding the Worker route regression, GitHub Actions jobs fail before the runner starts. Multiple jobs expose no steps, never reach checkout and provide no downloadable log. Rerunning the same SHA reproduces the pre-step failure.

Observed runs/jobs:

- `30620542741` / `91123803489`;
- `30620645454` / `91124137658`, rerun `91124386934`;
- `30620830770` / `91124730973`.

Classification: Actions infrastructure/repository billing-or-runner configuration, not a demonstrated code failure.

## Remaining gate

1. Inspect GitHub Actions UI for billing/spending-limit, approval, account or runner restriction.
2. Rerun `PR Validation` on exact current head.
3. Require actual execution and PASS of:
   - install;
   - root `pnpm test`, including `finance-aging-worker-route.test.mjs`;
   - root `pnpm typecheck`;
   - root `pnpm build`.
4. Keep PR draft until the exact-head job runs and passes.

## Explicit non-actions

- No Cloudflare deploy.
- No production migration.
- No production secret changes.
- No FIFO rollout activation.
- No PR merge.
