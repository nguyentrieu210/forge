# Atomic Write Protocol — D1 + Durable Objects

> Mục tiêu: một mutation hoặc commit toàn bộ parent/child/ledger/audit/outbox, hoặc không để lại gì; stale write không được tạo side effect.

## 1. Đường ghi bắt buộc

```text
HTTP/API
→ auth + tenant resolution
→ permission compiler
→ Aggregate Durable Object
→ load canonical snapshot
→ validate controller pipeline
→ build deterministic MutationPlan
→ D1 db.batch()
→ return D1 bookmark + result
→ asynchronous consumers read outbox
```

Không service nào được ghi thẳng D1 ngoài `MutationExecutor`.

## 2. Atom of coordination

| Loại | Durable Object key |
|---|---|
| Saved document | `tenant:doctype:name` |
| New document naming | `tenant:naming-series:prefix` |
| Stock reservation | `tenant:item:warehouse:inventory-dimension-key` |
| Period close | `tenant:company:fiscal-year` |
| Payroll run | `tenant:payroll-entry:name` |

Không dùng một DO global cho tenant hoặc toàn platform.

## 3. Idempotency

Mọi command có:

```json
{
  "command_id": "uuid",
  "tenant_id": "...",
  "actor": "...",
  "aggregate": "Sales Invoice/SINV-0001",
  "expected_version": 17,
  "payload_hash": "sha256"
}
```

- Cùng `command_id` + cùng `payload_hash`: trả lại stored result.
- Cùng `command_id` + khác hash: `IDEMPOTENCY_KEY_REUSED`.
- Receipt lưu canonical trong D1; cache chỉ tăng tốc.

## 4. Guard gây rollback thật

`UPDATE ... WHERE version = ?` trả `0 rows` không tự làm `db.batch()` lỗi. Vì vậy batch phải bắt đầu bằng guard có trigger:

```sql
CREATE TABLE mutation_guard (
  command_id TEXT PRIMARY KEY,
  doc_key TEXT NOT NULL,
  expected_version INTEGER,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER mutation_guard_check
BEFORE INSERT ON mutation_guard
WHEN NEW.expected_version IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT version FROM documents WHERE doc_key = NEW.doc_key) IS NULL
      THEN RAISE(ABORT, 'DOCUMENT_NOT_FOUND')
    WHEN (SELECT version FROM documents WHERE doc_key = NEW.doc_key) != NEW.expected_version
      THEN RAISE(ABORT, 'VERSION_CONFLICT')
  END;
END;
```

Nếu guard fail, một statement trong `db.batch()` lỗi và toàn batch rollback.

## 5. Batch order

1. Insert `mutation_guard`.
2. Update/insert parent với `version = version + 1`.
3. Apply child-row diff bằng stable row ID; không delete-all/insert-all mặc định.
4. Insert immutable GL/SLE/payment ledger rows với unique voucher revision key.
5. Insert `Version`/audit diff.
6. Insert outbox events.
7. Insert mutation result/receipt.

Tất cả statement dùng prepared parameters. Không side effect mạng, email, webhook hoặc queue publish nằm giữa transaction.

## 6. Ledger uniqueness

```text
UNIQUE(tenant, ledger_type, voucher_type, voucher_no, voucher_revision, line_key)
```

Retry không tạo dòng ledger thứ hai. Cancel/amend sinh revision hoặc reversal mới; không sửa ledger cũ.

## 7. New document

- Naming Series DO cấp tên và reservation token.
- Insert document + children + audit + outbox trong một batch.
- Nếu batch fail, token có thể bị bỏ trống nhưng không được cấp trùng; gap chấp nhận theo policy của series.

## 8. Error mapping

| Code | HTTP | Retry |
|---|---:|---|
| `VERSION_CONFLICT` | 409 | Client phải reload/merge; không auto retry mù. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Không retry. |
| `PERMISSION_DENIED` | 403 | Không retry. |
| `VALIDATION_ERROR` | 422 | Sửa payload. |
| `D1_OVERLOADED` | 503 | Exponential backoff + jitter; command ID giữ nguyên. |
| `LEDGER_INVARIANT_FAILED` | 422/500 theo nguồn | Chặn submit; incident nếu do code. |

## 9. Acceptance evidence

- 100 concurrent saves cùng expected version: đúng 1 success.
- Retry 10 lần cùng command: một receipt, một bộ ledger/outbox.
- Kill Worker sau commit trước response: retry trả result cũ.
- Consumer nhận outbox ít nhất hai lần: side effect chỉ xảy ra một lần.
- Batch fail ở từng statement N: không còn mutation một phần.
