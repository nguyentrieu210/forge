# Purchase Invoice — Business Rule Ledger

## 1. Scope

Contract bắt buộc cho CloudForge parity unit **Purchase Invoice**. Exact field/schema/source path được gắn bởi source manifest; ledger này khóa hành vi không được tự suy diễn lại.

## 2. Invariants

1. Payable, taxes, withholding, advances and currency conversion balance.
2. Submit creates GL; update-stock creates SLE when enabled.
3. Supplier invoice uniqueness policy enforced.
4. Return/debit note cannot exceed original eligible amount.

## 3. Lifecycle

- Draft → Submitted → Paid/Partly Paid/Overdue/Return/Cancelled.

## 4. Validation order

1. Authentication and tenant boundary.
2. Document/field/row permission.
3. Schema and required/type precision.
4. Link/master-data validity and effective dates.
5. Domain invariants above.
6. Downstream-link, period-lock and concurrency guard.
7. Build deterministic ledger/status/outbox plan.

## 5. Transaction boundary

- Parent, child diff, canonical ledger/state, audit, outbox and mutation receipt commit in one D1 batch.
- External email/webhook/payment/telephony runs after commit from outbox.
- Retry uses same command ID; cancellation creates reversal/compensation according to domain, never partial delete.

## 6. Permission

- Server is authority; UI hiding is convenience only.
- Effective permission combines role, field level, owner/user permission, workflow state, docstatus and share policy.
- Any export/report path applies the same row/field policy.

## 7. Error contract

| Error class | Required behavior |
|---|---|
| Validation | Return field/rule code; zero side effects. |
| Permission | 403; no sensitive value in message. |
| Version conflict | 409 with current version/merge hint; no automatic blind overwrite. |
| Downstream link/period lock | Explicit linked document or period evidence. |
| Infrastructure retry | Preserve command ID; no duplicate ledger/event. |

## 8. Events

- `gl.posted`
- `payable.updated`
- `payment_ledger.posted`

Each event includes tenant, aggregate key/version, actor, command ID, occurred-at, schema version and redacted payload.

## 9. Oracle fixtures

Minimum fixture matrix:

- happy path create/save/submit;
- partial/downstream path where applicable;
- cancel/return/amend/repost;
- multi-currency/precision/effective-date edge where applicable;
- low-permission direct API call;
- stale concurrent mutation;
- duplicate retry;
- source release regression fixture.

Pass criteria compare document state, derived status, ledger rows, outstanding/balance, emitted events and error codes against pinned upstream behavior.

## 10. Cloudflare optimization allowed

Caching, read replicas, denormalized indexes, async prepared work and edge rendering are allowed only when canonical outcome remains identical. Optimization must have invalidation/rebuild path and oracle evidence.
