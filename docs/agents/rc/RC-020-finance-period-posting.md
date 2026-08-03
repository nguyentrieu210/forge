# RC-020 — Finance Posting / Period / Reversal

Status: **PR-ready implementation; RC promotion pending mandatory branch CI evidence**  
Risk: **CRITICAL**  
Branch: `rc/w2-finance-period-posting`  
Exact task base: `e18ffb1eb1d9a2d6146252a54094a87e6bf92e8b` (`main` at branch creation)

## Capability IDs

Primary RC-020 evidence applies to:

- `F01-003` Journal Entry;
- `F01-007` Accounting Period;
- `F01-008` Soft Close;
- `F01-009` Hard Lock;
- `F01-010` Adjustment Entries;
- `F01-014` Trial Balance;
- `F01-015` General Ledger report;
- `F01-019` Accounting Dimensions, specifically authoritative branch scope carried by the source document / GL dimensions;
- `F01-022` Branch accounting scope;
- `F01-024` Immutable Posting Trace;
- `F01-025` Reversal / Correction Semantics.

No claim is made here for year-end close orchestration (`F01-011..013`) or for all statutory reports.

## Before maturity

Exact-current `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` at task base records:

- `F01-003`, `F01-007..010`, `F01-014`, `F01-015`: **Wired**;
- `F01-019`, `F01-022`, `F01-024`, `F01-025`: **Foundation**.

The exact source already contained migration `0042_vn_accounting_period_hardening.sql`, despite older status/handoff text still describing it as work outside `main`.

## After maturity recommendation

**Do not promote from this document alone.**

Recommended state after the mandatory CRITICAL validation lane passes on the exact PR head:

- `F01-003`, `F01-007..010`, `F01-014`, `F01-015`, `F01-019`, `F01-022`, `F01-024`, `F01-025`: **RC** for the RC-020 posting/period/reversal slice.

Until branch build/typecheck/unit/integration evidence is green, retain the repository's current maturity labels. **Hardened is explicitly not recommended** because there is no production/failure/reconciliation release evidence for this change.

## Exact source of truth / authority

1. `gl_entries` remains the canonical accounting ledger. RC-020 creates no competing ledger table.
2. Canonical accounting controllers remain authoritative for GL construction. `JournalEntryController` builds fixed-point GL lines and calls `reverseGl(lines)` on cancel.
3. `DocumentKernel` remains the authoritative mutation path. It performs server permission checks, optimistic concurrency, GL balance validation and command receipt/idempotency handling.
4. `D1MutationStore` persists document state, `versions`, `gl_entries`, outbox effects and `mutation_receipts` in the same D1 batch.
5. Accounting-period enforcement is fail-closed at the tenant DB layer. The RC-020 migration keeps the existing hard-lock behavior and changes Soft Closed authority from a client-provided approver name to framework-owned `modified_by` plus tenant-scoped `user_roles`.
6. General Ledger / Trial Balance company and branch scope is derived directly from `gl_entries` plus the canonical source `documents` row. `LEFT JOIN` is deliberate so historical orphaned GL is not silently omitted; exceptions are exposed separately.

## Flow proved

`draft -> submit -> period validation -> authoritative GL posting -> report/query -> cancel/reversal/correction -> audit`

Covered invariants:

- Hard Locked rejects direct submitted posting;
- Hard Locked rejects draft -> submit;
- Hard Locked rejects cancel;
- backdated move into a locked period is rejected;
- moving a posted document out of a locked period is rejected;
- company move into/out of locked scope is rejected;
- branch move into/out of locked scope is rejected;
- tenant/company/branch isolation is preserved;
- Soft Closed rejects normal posting;
- Soft Closed rejects a forged `adjustment_approved_by` supplied by the client;
- Soft Closed requires `allow_approved_adjustments`, explicit adjustment intent, non-empty reason and current authenticated close authority (`Chief Accountant`, `Accounts Manager` or `System Manager`), while normal kernel permission remains independently authoritative;
- cancel of a Soft Closed adjustment requires current close authority;
- GL `UPDATE` and `DELETE` are rejected by DB triggers;
- cancel/reversal is represented as a new voucher revision with opposite GL lines rather than rewriting original rows;
- General Ledger and Trial Balance expose tenant/company/branch server-side filters;
- reconciliation groups the same authoritative GL rows by voucher revision and reports debit/credit difference;
- integrity exceptions surface missing source company scope and unbalanced voucher revisions instead of hiding ledger rows;
- command retry/idempotency remains bound to `(tenant_id, command_id)` receipts in the kernel/store path;
- audit lineage remains in append-style `versions` plus `mutation_receipts`, committed with the GL batch.

## Changed files

- `server/migrations/tenant/0110_rc020_finance_posting_period_integrity.sql`
- `server/migrations/tenant/0111_rc020_finance_gl_scope_reconciliation.sql`
- `server/packages/query/src/index.ts`
- `server/scripts/test-rc020-finance-period-posting.py`
- `server/tests/rc020-accounting-query-scope.test.mjs`
- `server/package.json`
- `docs/agents/rc/RC-020-finance-period-posting.md`

## Migrations

### `0110_rc020_finance_posting_period_integrity.sql`

- replaces the three posting-period document triggers introduced by `0042`;
- preserves Hard Locked old-scope/new-scope semantics;
- changes Soft Closed approval authority to authenticated/framework-owned `modified_by` plus tenant-scoped role membership;
- makes `gl_entries` DB-immutable to `UPDATE` and `DELETE`.

### `0111_rc020_finance_gl_scope_reconciliation.sql`

- requires every new GL line to resolve to a same-tenant source document with company scope;
- rejects source-document / GL-dimension branch mismatch when both branches are present;
- recreates `general_ledger_report` directly from authoritative GL with company/branch scope and currency-scale-safe conversion;
- recreates `trial_balance` directly from authoritative GL grouped by tenant/company/branch/account/currency/scale;
- creates `finance_gl_reconciliation` directly over `gl_entries`;
- creates `finance_gl_integrity_exceptions` for missing source scope and unbalanced voucher revisions;
- introduces no ledger/projection table and performs no production data rewrite.

## Tests / validation evidence

Committed targeted tests:

- `server/scripts/test-rc020-finance-period-posting.py`
  - migration replay of `0042 -> 0110 -> 0111` on an isolated SQLite fixture;
  - hard lock submit/cancel/backdate/company/branch failure paths;
  - Soft Closed permission/forged-approver/adjustment paths;
  - tenant/company/branch isolation;
  - GL source-scope failure paths;
  - GL immutable update/delete failure paths;
  - exact reversal/correction arithmetic;
  - General Ledger / Trial Balance scoped reconciliation;
  - audit/version/receipt source-contract checks;
  - kernel retry/idempotency and permission-path source checks.
- `server/tests/rc020-accounting-query-scope.test.mjs`
  - server-bound tenant/company/branch filters for General Ledger and Trial Balance;
  - query access to Finance GL Integrity Exceptions;
  - rejection of unapproved raw ledger fields.
- `server/package.json`
  - RC-020 SQL regression is part of `test:sql`; query regression is automatically covered by `tests/*.test.mjs` after build.

In-session SQL smoke against the final `0111` design passed for:

- company/branch GL report separation;
- balanced voucher reconciliation (`difference_minor = 0`);
- zero integrity exceptions for valid rows;
- `GL_COMPANY_SCOPE_REQUIRED` failure;
- `GL_BRANCH_SCOPE_MISMATCH` failure.

Branch CI/build/typecheck status must be recorded from the PR head before RC promotion. Missing CI does not justify fabricating evidence.

## Correction / reversal evidence

- `JournalEntryController`: cancel uses `reverseGl(lines)` instead of deleting/replacing prior GL.
- `gl_entries` primary identity includes `voucher_revision` and `line_key`, so submit/cancel histories coexist.
- RC-020 DB triggers reject raw GL `UPDATE` and `DELETE`.
- Targeted regression writes revision 1 and exact opposite revision 2, then proves per-account net zero while all four GL lines, two audit versions and two mutation receipts remain present.

## Reconciliation evidence

- `finance_gl_reconciliation` derives debit/credit/difference from `gl_entries` itself, grouped by tenant/company/branch/voucher revision/currency.
- `finance_gl_integrity_exceptions` is zero for valid fixture data and surfaces unbalanced revisions / missing source scope.
- General Ledger and Trial Balance are also derived directly from the same authoritative rows; no shadow accounting balance is introduced.
- Query compiler keeps tenant as bound parameter `?1` and allows company/branch only through an allowlisted server-side report definition.

## Permission path

- Kernel `PermissionService.assert(...)` remains mandatory before mutation planning.
- Soft Closed adds a second DB-layer authority check against `user_roles` for the current authenticated `modified_by`.
- Client `adjustment_approved_by` may remain descriptive metadata but is no longer authorization evidence.

## Retry / idempotency

- Kernel resolves an existing `(tenant_id, command_id)` receipt before planning/writing and returns it only when actor/payload hash matches.
- Store writes `mutation_receipts` in the same batch as document/audit/GL changes and re-reads a receipt after write conflict.
- RC-020 does not introduce a second retry key or alternate posting path.

## Dependency Requests

### DR-RC020-001 — missing canonical hardening plan

- **Owner:** RC coordination / documentation governance.
- **Needed contract:** restore or identify the canonical replacement for `docs/FORGE_RC_HARDENING_PLAN_20260803.md` referenced by the RC assignment.
- **Blocked part:** formal cross-agent traceability only. Exact source, Skill, North Star, capability map/status and validation gates were sufficient to continue implementation.
- **RC-020 action:** continued independently; no maturity claim is based on the missing file.

### DR-RC020-002 — Payment Allocation consumption of period authority

- **Owner:** RC-022 settlement / AR-AP workstream.
- **Needed contract:** Payment Allocation must consume RC-020 period authority using canonical company/posting scope and, if branch-specific close applies, a deterministic branch source from the settlement contract. It must not invent a separate close rule or trust client approval metadata.
- **Blocked part:** branch-aware closed-period enforcement for allocation-only payment-ledger mutations. `Payment Allocation` currently has company/posting scope but no canonical branch field in exact-current metadata.
- **RC-020 action:** primary GL posting-period contract is complete independently; no change was made to RC-022's settlement authority.

### DR-RC020-003 — local stock QA cleanup versus immutable GL

- **Owner:** RC-024 / RC-025 stock authority and stock QA tooling.
- **Needed contract:** replace direct `DELETE FROM gl_entries` in `server/scripts/cleanup-stock-qa-local.mjs` with a disposable/reset fixture strategy that does not create a reusable ledger-immutability bypass.
- **Blocked part:** that local-only stock cleanup utility will be incompatible with the RC-020 immutable-GL trigger after these migrations are applied.
- **RC-020 action:** did not weaken or add a bypass to the Finance ledger contract; all Finance work continues independently.

## Remaining gaps

- Mandatory exact-head branch CI/build/typecheck evidence must pass before changing the listed capabilities to **RC**.
- No production migration, deploy, production failure drill or production reconciliation was performed; therefore **Hardened is not eligible**.
- Payment Allocation branch-aware period consumption remains DR-RC020-002.
- The local stock QA cleanup incompatibility remains DR-RC020-003 and must be solved without weakening GL immutability.
- Full company/branch hardening for P&L, Balance Sheet and Cash Flow, and year-end close orchestration, remains outside this RC-020 slice.

## Historical references audited (not used as base)

- PR #266: merged historical period-hardening work; exact `main` source was audited instead of reopening it.
- PR #278: unmerged accounting-integrity proposal; used only as design evidence. RC-020 deliberately avoids its projection-table approach and derives report/reconciliation scope directly from canonical `gl_entries` plus source documents.

## Merge / deploy state

- **Not merged.**
- **Not deployed.**
- **No production migration executed.**
