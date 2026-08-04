# RC4-A9 — Architecture / Kernel

Status: **READY — PR #619 DRAFT / DO NOT MERGE**
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Branch: `agent/rc4-09-architecture-kernel`
Risk: **CRITICAL / non-UI**
PR: **#619**

## Mission

Own shared platform/kernel contracts needed by residual RC4 lanes. Focus on authoritative document/ledger read-write boundaries, tenant/OCC/idempotency invariants, shared ports and contract gaps explicitly requested by other lanes.

Do not absorb domain logic from Finance/Stock/Manufacturing/IAM/App Factory. Other lanes must send Dependency Requests for shared primitives. Prefer minimal generic ports over domain-specific shortcuts.

## Exact-state audit

Read/reconciled:

- enterprise completion Skill;
- exact current `main`, A9 branch and RC4 peer branches;
- `CURRENT_STATUS.md`, `NEXT_TASKS.md`, North Star and capability status;
- `docs/agents/workstreams/WS00-architecture-kernel.md`;
- RC4-A4 Finance/VN statutory residual handoff;
- current `FinanceClosureQueryCompiler`, document-kernel and canonical `gl_entries` authority.

WS00's earlier coordination/OCC/idempotency hardening is already merged/current authority and is not replayed. The current RC4 dependency owned by A9 is **DR-RC4-A4-001**: Finance needs a reusable authoritative ledger aggregate read boundary instead of controller-owned ad-hoc SQL/document scans.

## Delivered — authoritative General Ledger aggregate read boundary

New `server/packages/document-kernel/src/general-ledger-aggregate.ts` exports:

- `GeneralLedgerAggregateQuery`;
- `GeneralLedgerAggregateRow` + explicit source evidence;
- `GeneralLedgerAggregateReader` narrow port;
- `D1GeneralLedgerAggregateReader` canonical D1 implementation.

Contract:

1. required trusted scope: `tenant_id + company + from_posting_date + to_posting_date`;
2. optional `branch`, `accounts[]`, `currency` filters;
3. account fan-out is bounded to 64; a supplied empty account list is invalid rather than silently broadening the read;
4. account filters are trimmed, deduplicated and sorted for deterministic binding;
5. company/branch context comes from canonical voucher documents plus persisted accounting dimensions;
6. source authority is append-only `gl_entries`; no second ledger/projection/table is created;
7. debit/credit/net stay in integer minor units;
8. aggregate rows fail closed if D1 results cannot be represented exactly as JavaScript safe integers;
9. source evidence includes canonical source name, entry count, distinct voucher count and first/last posting timestamps;
10. D1 reads use `first-primary` session semantics when a database binding is supplied;
11. implementation is read-only and performs no document/GL/stock/payment mutation.

A4 remains owner of year-end close/revaluation/budget/statutory business behavior. A9 supplies the shared read contract only.

## Verification

Substantive candidate: `8018b2edefee8650263b32cea97f58487033769e`.

GitHub Actions workflow: **RC4 A9 Kernel Validation**

- run: `30870019683`;
- job: `91869925434`;
- conclusion: **SUCCESS**.

PASS:

- locked dependency install;
- TypeScript emit for the A9 kernel aggregate graph;
- focused `rc4-kernel-gl-aggregate.test.mjs` regressions;
- primary-session behavior;
- tenant/company/date/branch/currency/account scope binding;
- deterministic account dedupe/order;
- explicit empty-filter rejection;
- invalid/reversed date rejection;
- bounded account fan-out;
- unsafe fixed-point aggregate fail-closed behavior;
- read-only authority guard and package export guard.

No migration is added, so migration replay is **N/A**.

This handoff commit changes the PR head after the substantive candidate; the PR-local workflow must remain green on the final docs-only head before merge approval.

## Capability / maturity boundary

This slice strengthens shared Finance/kernel evidence and unblocks RC4-A4 consumption, but A9 does **not** promote Finance or platform capabilities merely from source presence. A4/coordinator must reassess maturity after the consuming Finance flow has its own permission/correction/reconciliation evidence.

## Remaining WS00 residual

Historical WS00 gap `delete/rename` maintenance-command semantics remains open: tombstone/name reuse, immutable audit, idempotency receipt, rename identity/reference refusal and outbox behavior need one explicit contract before implementation.

No current RC4 A1-A8 Dependency Request requires that larger maintenance-command change, so A9 does not mix it into the A4 GL-read unblock slice.

## Merge / deploy boundary

- PR `#619` is Draft;
- no schema migration;
- no customer-data mutation;
- no provider/DNS/secret change;
- no production deploy;
- **do not merge or deploy without explicit user approval** because this is non-UI CRITICAL work.
