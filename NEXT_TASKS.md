# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt Manufacturing Slice C PR #50

1. Kiểm exact final head sau commit tài liệu.
2. Chờ đủ required workflows PASS trên exact final head.
3. Kiểm mergeability và unresolved review threads.
4. Cập nhật PR body với final SHA và CI run IDs.
5. Chuyển PR #50 khỏi draft khi toàn bộ gate xanh.
6. Không merge PR #50 trước PR #49.
7. Sau khi PR #49 merge, retarget/rebase PR #50 lên default mới và chạy lại exact-head CI.

## P0 — Slice D physical-stock read model

- Tạo projection chỉ đọc từ authoritative append-only ledger, không tạo stock book thứ hai.
- Nhóm tồn theo Item, warehouse, batch/serial và canonical physical identity.
- Hỗ trợ inventory mode/profile, màu, tình trạng, đời, kích thước và physical count.
- Trả lineage tới voucher, revision, row và reversal source.
- Thêm permission/data-scope, deterministic pagination và export contract.
- Thêm focused tests cho quantity/value reconciliation, filters, reversal và tenant isolation.

## P0 — Slice D operator UI và reports

- Physical stock explorer với filters và lineage drill-down.
- Warehouse quarantine/release view.
- Work Order progress view theo snapshot và BOM row.
- Reports:
  - WIP;
  - material shortage;
  - planned vs actual variance;
  - scrap/offcut recovery;
  - stock ageing/condition;
  - lineage/reversal audit.
- Runtime browser harness và Playwright desktop/mobile cho các luồng chính.
- Không cho UI tự tính số dư authoritative ở client.

## P0 — audit và staging acceptance

- Chạy read-only Item/BOM/Warehouse audit trên staging hoặc production-shaped copy.
- Lập remediation plan; không auto-fix tenant thật.
- Chạy journeys:
  - receipt và transfer;
  - quarantine và quality release;
  - activate BOM revision;
  - release Work Order;
  - partial issue và manufacture;
  - scrap/offcut recovery;
  - cancel/reversal;
  - WIP/shortage/variance reports.
- Xác minh quantity/value reconciliation và exact lineage.

## P1 — hiệu năng và vận hành

- Benchmark company-wide inventory Durable Object lock.
- Thu contention, retry và latency percentiles.
- Xác định alert thresholds, rollback criteria và capacity boundary.
- Chuẩn bị backup, rollback plan và release evidence path trước deployment.

## Safety

- Không deploy Cloudflare nếu chưa có yêu cầu rõ.
- Không mutate production tenant hoặc chạy remediation tự động.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated reports.
- FIFO vẫn disabled cho tới approval activation riêng.
