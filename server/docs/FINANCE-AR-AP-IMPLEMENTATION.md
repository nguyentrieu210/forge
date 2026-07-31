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

## Compatibility boundary

Migration `0030` does not hard-reject an omitted due date. This prevents existing API clients, fixtures and submitted-document paths from breaking before legacy data is reviewed.

Hard database presence enforcement requires a later append-only migration after:

1. fallback rows are inventoried;
2. unresolved count is zero;
3. checksum is reviewed;
4. staging migration and smoke pass.

## Branch reconciliation

- Finance branch was merged with the latest default branch without force-push.
- The temporary reconciliation workflow removed itself before the merge commit was pushed.
- The PR is mergeable and zero commits behind the default branch.
- The first exact-head PR Validation run after the bot-authored merge required a user-authored commit; this documentation commit intentionally triggers the real code gate.

## Independent evidence

- Compatibility migration fixture: PASS.
- TypeScript strict harness: PASS.
- Executed SQL cutoff fixture: PASS.
- `due_date_source` projection/filter fixture: PASS.

## Remaining gate

- Root `pnpm test`.
- Root `pnpm typecheck`.
- Root `pnpm build`.
- GitHub workflow `PR Validation`, job `Test, typecheck and build`, exact-head PASS.
- Worker-level D1 report integration if the root suite does not already cover compiler injection.

## Explicit non-actions

- No Cloudflare deploy.
- No production migration.
- No production secret changes.
- No FIFO rollout activation.
