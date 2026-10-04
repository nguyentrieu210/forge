# R8-A — Finance / Close / Bank Exact-Current Remap

Status: Finance close and bank lanes classified PARTIAL  
Forge branch: `codex/r8-erpnext-business-depth`  
Pinned ERPNext: `v16.20.0` @ `ff46d20b259a2d65a7ded959df9f9a42991a3562`

## What Forge already does deeply

Forge's finance core is not a reporting-only approximation.

Current evidence proves:

- `gl_entries` is canonical and DB-immutable to UPDATE/DELETE;
- submit/cancel preserves voucher revisions and exact reverse GL rather than rewriting history;
- hard-locked periods reject posting, cancel and scope moves;
- soft-close adjustment authority is server/authenticated-role owned rather than client-asserted;
- GL insertion itself is a period/scope backstop;
- General Ledger, Trial Balance and Finance Daily Detailed Ledger derive from canonical GL;
- AR/AP reconciliation compares Payment Ledger against party-dimension GL;
- Finance Budget/Revision/Commitment uses fixed-point amounts, four-eyes approval, append-only revision and Reserve/Release controls;
- Bank Transaction is statement evidence, while Bank Reconciliation is append-only reversible control state over real bank-side GL movement;
- bank-match candidates are deterministic/read-only and require exact company, currency, bank account and amount before scoring.

These are strong business invariants.

## Where ERPNext is still deeper — financial close

Pinned ERPNext `Period Closing Voucher` is a first-class closing transaction.

Its source validates:

- fiscal-year period continuity;
- previous-year close;
- no later closing voucher conflict;
- closing account type and company currency.

On submit it creates/processes closing GL, including a background processing path for large ledgers. On cancel it blocks invalid future-close relationships and reverses closing entries/process documents.

Current Forge evidence explicitly says not to promote automated year-end close / retained earnings. The shared blocker is the missing fully canonical company/branch/account/date aggregate suitable for mutation-time close orchestration.

**R8-F04 therefore remains PARTIAL.**

## Exchange-rate revaluation

Pinned ERPNext `Exchange Rate Revaluation` computes account-level base-currency gain/loss as of a posting date and links the booked result to Journal Entry/GL.

Forge already handles transaction-time historical FX and realized exchange difference on payment. That is not the same as a full period-end unrealized revaluation lifecycle.

Current WS01 evidence explicitly marks full period-end FX revaluation blocked by the same canonical aggregate dependency.

## Budget

Forge has a meaningful budget engine:

- Company/Cost Center/Project/Branch scope;
- Stop/Warn/Ignore commitment policy;
- four-eyes approval;
- append-only revisions;
- Material Request / Purchase Order / Expense Claim commitments;
- reserve/release bounds.

But its own current evidence intentionally refuses to fabricate Budget-vs-Actual until an authoritative GL aggregate is available.

Pinned ERPNext Budget includes fiscal distribution and actual-expense checks plus per-context Stop/Warn/Ignore-style enforcement semantics. Exact behavior still needs differential testing.

## Bank / reconciliation

Forge and ERPNext use different authority shapes.

### Forge

- statement row = `Bank Transaction`, no GL mutation;
- authoritative cash/bank movement remains Payment Entry / Journal Entry GL;
- `Bank Reconciliation` ties statement evidence to submitted vouchers that actually moved the bank GL account;
- partial reconciliation is allowed;
- over-reconcile is rejected;
- cancellation appends negative reconciliation evidence;
- reconciled statement/voucher cancellation is guarded;
- cash/bank position is GL-derived;
- candidate matching is explainable and read-only.

### ERPNext v16.20

`Bank Transaction` itself contains payment-entry allocations, validates duplicate references/currency, allocates against remaining statement amount and derives reconciled status from unallocated amount.

The observable objective overlaps, but source-shape similarity is not the acceptance criterion. R8 still needs a pinned runtime matrix for:

- multiple vouchers per statement;
- one voucher across statement rows;
- partial allocation;
- bank fees/included/excluded fee;
- duplicate reference;
- cancel/unreconcile/relink;
- statement import external identity;
- currency and date edge cases.

**R8-F05 = PARTIAL**, not an architecture-difference shortcut.

## Finance blockers after this pass

1. automated year-end close / retained earnings;
2. full period-end FX revaluation;
3. exact Budget-vs-Actual;
4. multi-company consolidation/elimination;
5. pinned runtime bank-reconciliation differential.

No Accounting module row is promoted yet because artifact-level Accounting denominator resolution remains incomplete.
