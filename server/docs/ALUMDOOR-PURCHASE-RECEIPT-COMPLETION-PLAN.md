# Alumdoor Purchase Order / Purchase Receipt completion plan

Status: approved for implementation on `feat/purchase-receipt-complete-20260731`.
Tracking issue: #13.
Authoritative business contract: `ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

## Outcome

Deliver an operator-ready Purchase Order and Purchase Receipt flow with FIFO allocation, settlement, audit history, backfill/cutover tooling, runtime UI, reports, browser evidence and a controlled release path.

Production activation is not part of implementation completion. Code and append-only migrations may be released only while `purchase_allocation_rollout_state.enabled` remains `0`. Activation requires a separate explicit approval after staging and backfill evidence.

## Invariants

1. Every write stays on DocumentKernel and supplier-level Durable Object coordination.
2. Allocation, reversal, settlement and unapplied movements remain append-only.
3. Server permission is authoritative; UI visibility is not a security boundary.
4. D1 revision claims and mutation receipts remain in the same batch as document, stock and procurement projections.
5. A cross-voucher event keeps the originating Purchase Receipt voucher identity even when a Purchase Order submission triggers it.
6. No migration edits after release; schema changes are new append-only migration files.
7. Backfill never guesses an ambiguous child row.

## Delivery slices

### Slice A: complete FIFO lifecycle

- Add explicit voucher identity to cross-voucher allocation/unapplied plan rows.
- Read open unapplied sources by queue/window in commit order.
- When a PO line joins an open window, apply available unapplied quantities before leaving new nominal debt.
- Write `apply_unapplied` allocation and matching negative `apply` movement in one D1 batch.
- Preserve barem and projected actual-weight attribution from the source Receipt row.
- Add tests for partial source consumption, multiple sources, multiple new PO rows, idempotency and revision conflict.

### Slice B: settlement and override

- Close-window action with server permission and required reason.
- Integer tolerance bounds, shortage/overage variance and immutable close event.
- Reverse settlement only when the next window has no activity.
- Manual allocation override restricted to the same tenant/company/supplier/material/window, with reason and audit event.
- Enforce PO/Receipt cancel/amend lifecycle against settled windows.

### Slice C: backfill and cutover

- Dry-run by default.
- Resolve legacy rows from version snapshots and child row IDs.
- Emit resolved/unresolved counts and PO-level checksum.
- Activation transaction rejects unresolved data or checksum mismatch.
- Store actor and activation timestamp.

### Slice D: runtime UI and reports

- Allocation preview before Receipt submit.
- Receipt allocation timeline and PO receipt timeline.
- Nominal remaining, actual received, unapplied, settlement bounds and variance.
- Settlement and override dialogs with confirmation, permission and mandatory reason.
- Backdated Receipt warning.
- Supplier debt report with ordered, received, nominal debt, active window and oldest PO age.
- Desktop/mobile layouts and accessible loading/error/empty states.

### Slice E: verification and release

- Targeted unit/integration/SQL/worker concurrency tests.
- Root install, lint, test, typecheck and build.
- Cloudflare preview QA at desktop 1440x1000 and mobile 390x844.
- Staging migration, backfill dry-run and PO -> Receipt -> cancel -> settlement -> report smoke.
- Review once against the rubric, fix all Critical/High findings, then rescore.
- Production deploy only for an exact CI-green SHA with backup and explicit approval.

## Review rubric

| Area | Points |
|---|---:|
| Business correctness and data integrity | 30 |
| Transaction, concurrency and idempotency | 20 |
| Permission and audit trail | 10 |
| Operator UI | 20 |
| Tests, migration and rollback | 15 |
| Performance and observability | 5 |

Release gate: at least 95/100, no Critical or High issue, exact-head CI green, staging and browser QA pass, rollout still disabled.

## Rollback and recovery

- Before activation: deploy an earlier Worker/Gateway version; append-only tables may remain unused while rollout is disabled.
- Migration failure: stop the release and forward-fix with a new migration; never edit an applied migration.
- Runtime smoke failure: keep staging failed and return to the feature branch.
- Activation failure: transaction must leave rollout disabled. Production activation requires a fresh backup and separately recorded approval.
