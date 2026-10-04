# R8 Landed Cost chronological closure

Implemented and tested on 2026-10-04. This is a bounded terminal FIFO consumption capability, not full ERPNext valuation parity.

A backdated receipt-row charge now capitalizes its open FIFO share at the voucher date and derives each later terminal Material Issue or Delivery Note's incremental cost difference by replaying the exact earlier ledger prefix. Immutable zero-quantity stock corrections and balanced Stock/COGS GL pairs post at each affected issue timestamp. Earlier consumption continues to use the existing historical expense share.

Reserved `LCV-REPOST-*` stock rows point to the original issue voucher revision and row. They reconcile recorded ledger totals; FIFO replay skips them because replay already recalculates that issue's consumption. Valuation audit includes those corrections in the recorded issue value. Reversals preserve the target and use `REV-LCV-REPOST-*`.

The latest voucher can reverse its exact capitalization, historical expense, chronological stock corrections and GL while the external stock history is unchanged. Later stock mutations, including another voucher subsequently cancelled, cause cancellation to fail closed. Submit and chronological cancellation have matching in-memory and SQLite history fingerprint guards. The submit fingerprint covers all history, including later posting dates, to reject races after planning.

Supported boundary: ordinary unbatched, unserialized FIFO Purchase Receipt rows; submitted terminal Stock Entry Material Issues or Delivery Notes; and a one-hop future Material Transfer when its destination FIFO layer remains fully open. The transfer source correction is mirrored by a targeted destination-layer correction, so no COGS is invented for an internal move. Source and destination histories are fingerprinted. Moving Average, batch/serial propagation, transfers before the LCV timestamp, consumed transfer destinations, recursive transfer chains, manufacturing, returns and cancelled consumer chains are rejected when involved.

Clearing, historical difference and receipt stock accounts must be active posting accounts belonging to the source company when a company is specified. Canonical Account documents override legacy master records; cancelled, disabled and group accounts are rejected, including string flags. Missing company on synthetic masters remains supported. Rejection happens before ledger writes.

Further guards reject cumulative adjustments making FIFO layers negative and verify that the incremental immutable ledger change equals replayed current valuation change. Same-timestamp order is stable insertion order in memory and `(posting_at,rowid)` in D1.

Validation:

- `npm run build --prefix server` passes.
- Targeted landed allocation/procurement/authority and stock replay/audit/batch/catch-weight suites: 57 tests pass after audit target and Account authority hardening.
- `python3 server/scripts/test-landed-cost-repost-migration.py` passes, including a later-dated race beyond the voucher posting date.
- Authority regressions cover partial/full downstream consumption, terminal Delivery Note consumption before/after the LCV posting time, one-hop future Material Transfer value carry and exact cancellation, destination-history fail-closed behavior, zero residual stock, incremental second voucher, tied timestamp one-cent rounding, cumulative negative rejection, unsupported Moving Average and commit-time source/destination races.

Migration 0161 is source only; no production database deployment was performed.
