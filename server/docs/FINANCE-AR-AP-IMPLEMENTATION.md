# Finance AR/AP implementation slice

Date: 2026-07-31  
Branch: `feat/finance-ar-ap-completion`  
PR: `#15`

## Implemented

- Invoice due-date D1 guards and legacy-compatible projection.
- Required Sales Invoice due-date metadata.
- Accounts Receivable Aging and Accounts Payable Aging compilers.
- Query Worker synchronous/prepared integration.
- Report permissions by accounting/sales/purchase domain.
- Safe validation mapping for due-date D1 guard errors.
- Migration, query, permission and error regression tests.

## Independent evidence

- Migration fixture: PASS.
- TypeScript strict harness: PASS.
- Executed SQL cutoff fixture: outstanding 700, overdue 21 days, bucket 1–30 days: PASS.

## Remaining gate

- Root `pnpm test`.
- Root `pnpm typecheck`.
- Root `pnpm build`.
- GitHub workflow `CI` exact-head PASS.

## Explicit non-actions

- No Cloudflare deploy.
- No production migration.
- No production secret changes.
- No FIFO rollout activation.
