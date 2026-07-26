# Large Tenant Archive & Sharding

## 1. Capacity policy

D1 Paid có giới hạn 10 GB mỗi database. CloudForge dùng ngưỡng vận hành:

| Mức | Hành động |
|---:|---|
| 60% | Cảnh báo, forecast 90 ngày, kiểm index/retention. |
| 75% | Bắt buộc tạo archive plan và rehearsal restore. |
| 85% | Bắt đầu chuyển immutable history sang archive shard; chặn export tốn kém giờ cao điểm. |
| 90% | Không cho tăng dữ liệu không thiết yếu nếu chưa hoàn thành split. |
| 95% | Emergency read-mostly mode; chỉ critical financial/stock writes theo runbook. |

## 2. Physical model

- `PRIMARY_DB`: meta, master data, current operational documents, audit gần.
- `LEDGER_DB_FY_<year>`: GL/SLE/payment ledger theo fiscal year cho tenant lớn.
- `ARCHIVE_DB_<period>`: submitted/cancelled history đã đóng và communication/audit cũ.
- R2: export snapshot, file, immutable evidence bundle.

Tenant nhỏ vẫn dùng một D1; logical schema không đổi.

## 3. Routing

- Mỗi row có `company`, `posting_date`, `fiscal_year` và stable document key.
- Current open fiscal year route đến current ledger DB.
- Closed year immutable; correction tạo adjustment ở kỳ mở theo accounting policy, hoặc controlled reopen workflow.
- Cross-year reports fan-out có bounded parallelism rồi merge/sort/aggregate ở report service hoặc Container.

## 4. Referential integrity

D1 không có cross-database FK. CloudForge dùng:

- immutable IDs;
- reference ledger/index trong PRIMARY_DB;
- write-time validator;
- reconciliation job;
- archive manifest SHA-256;
- no cascade delete across shards.

## 5. Restore

- Restore archive vào clone trước.
- Verify row counts, hashes, trial balance, stock balance và document links.
- Route switch dùng generation number; old generation giữ read-only cho rollback window.

## 6. Query UX

Người dùng không biết shard. API cursor chứa encrypted shard cursor. Report trả provenance (`served_shards`, `as_of`, `bookmark/generation`).
