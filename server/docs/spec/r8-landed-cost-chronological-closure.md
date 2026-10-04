# R8 Landed Cost chronological closure

Implemented and tested on 2026-10-04. This is a bounded terminal FIFO consumption capability, not full ERPNext valuation parity.

A backdated receipt-row charge now capitalizes its open FIFO share at the voucher date and derives each later terminal Material Issue or Delivery Note's incremental cost difference by replaying the exact earlier ledger prefix. Immutable zero-quantity stock corrections and balanced Stock/COGS GL pairs post at each affected issue timestamp. Earlier consumption continues to use the existing historical expense share.

Reserved `LCV-REPOST-*` stock rows point to the original issue voucher revision and row. They reconcile recorded ledger totals; FIFO replay skips them because replay already recalculates that issue's consumption. Valuation audit includes those corrections in the recorded issue value. Reversals preserve the target and use `REV-LCV-REPOST-*`.

The latest voucher can reverse its exact capitalization, historical expense, chronological stock corrections and GL while the external stock history is unchanged. Later stock mutations, including another voucher subsequently cancelled, cause cancellation to fail closed. Submit and chronological cancellation have matching in-memory and SQLite history fingerprint guards. The submit fingerprint covers all history, including later posting dates, to reject races after planning.

Supported boundary: ordinary unbatched, unserialized FIFO Purchase Receipt rows and submitted terminal Stock Entry Material Issues or Delivery Notes. A chronological voucher requires one source allocation per item/warehouse so independent allocation rounding cannot invent value. Moving Average, batch/serial propagation, transfers, manufacturing, returns and cancelled consumer chains are rejected when involved. Reposting arbitrary downstream chains, rewriting other documents, and rollback through later unrelated mutations remain outside this implementation.

Clearing, historical difference and receipt stock accounts must be active posting accounts belonging to the source company when a company is specified. Canonical Account documents override legacy master records; cancelled, disabled and group accounts are rejected, including string flags. Missing company on synthetic masters remains supported. Rejection happens before ledger writes.

Further guards reject cumulative adjustments making FIFO layers negative and verify that the incremental immutable ledger change equals replayed current valuation change. Same-timestamp order is stable insertion order in memory and `(posting_at,rowid)` in D1.

Validation:

- `npm run build --prefix server` passes.
- Targeted landed allocation/procurement/authority and stock replay/audit/batch/catch-weight suites: 57 tests pass after audit target and Account authority hardening.
- `python3 server/scripts/test-landed-cost-repost-migration.py` passes, including a later-dated race beyond the voucher posting date.
- Authority regressions cover partial/full downstream consumption, terminal Delivery Note consumption before/after the LCV posting time, zero residual stock, incremental second voucher, exact latest cancellation, tied timestamp one-cent rounding, cumulative negative rejection, unsupported Moving Average and commit-time later issue races.

Migration 0161 is source only; no production database deployment was performed.
