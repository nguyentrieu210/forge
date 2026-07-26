# Gate 3 Implementation Invariants

## 1. Trusted identity

External command payload không chứa actor. Gateway xác thực token, khóa tenant và ký trusted identity. Tenant Worker chỉ dùng actor trong trusted identity hoặc actor development được bật rõ bằng environment.

Receipt idempotency được bind theo actor. Cùng `command_id` và payload nhưng actor khác vẫn bị từ chối.

## 2. Aggregate lifecycle

| Action | Existing state | Result |
|---|---|---|
| create | nonexistent | draft |
| save | draft | draft, version + 1 |
| submit | draft | submitted, version + 1 |
| cancel | submitted | cancelled, version + 1 |

Mọi transition khác bị chặn ở kernel và D1 trigger.

## 3. Mutation atomicity

Một commit batch gồm:

1. mutation guard;
2. conditional document insert/update;
3. stable child upsert/delete;
4. immutable version snapshot;
5. GL/SLE/PLE/fulfillment entries;
6. outbox events;
7. actor-bound mutation receipt;
8. guard cleanup.

Nếu bất kỳ trigger/constraint nào lỗi, toàn bộ batch rollback.

## 4. Cross-aggregate race guards

| Invariant | Early check | Commit guard |
|---|---|---|
| Delivery/Billing ≤ Sales Order qty | Controller primary read | `fulfillment_reference_guard` |
| Outstanding ≥ 0 | Payment controller | `receivable_outstanding_guard` |
| Stock balance ≥ 0 | Delivery controller | `stock_balance_guard` |
| Sales Order cancel only when unused | Controller | `sales_order_cancel_reference_guard` |
| Sales Invoice cancel only when unallocated | Controller | `sales_invoice_cancel_payment_guard` |

Durable Object per document không đủ để bảo vệ các invariant này vì hai chứng từ khác nhau nằm ở hai aggregate. D1 trigger là hàng rào cuối.

## 5. Canonical numeric model

- currency: integer minor units plus explicit scale;
- quantity: integer micros, scale 6;
- no `REAL` in canonical ledger columns;
- UI/report decimal values are projections only;
- GL balance uses integer/BigInt equality.

## 6. Read consistency

Command-side D1 store mở `first-primary` session một lần và dùng cùng bookmark chain cho document, reference, stock, outstanding và receipt reads. Report service tách riêng để có thể dùng read path khác.

## 7. Event delivery

- transaction writes outbox event atomically;
- publisher leases event before Queue send;
- Queue is treated as retryable delivery;
- callback includes event ID;
- tenant inbox commits `event_id` idempotently;
- jobs database records completion only after tenant confirms commit.

## 8. Evidence

- Node/domain tests: lifecycle, auth, idempotency, fixed-point, O2C and four race classes.
- SQLite schema tests: lifecycle, fixed-point columns and reference guards.
- SQLite concurrency tests: 100-way same-aggregate race plus fulfillment, outstanding and stock cross-aggregate races.
- workerd integration: HTTP → Durable Object → D1 race + query-worker prepared-report pipeline; executes and passes (tenant 4/4 + query 3/3), not just typecheck.
- live Cloudflare execution: 5 workers deployed to a real account with an end-to-end smoke test — see `DEPLOY_EVIDENCE.md`.
