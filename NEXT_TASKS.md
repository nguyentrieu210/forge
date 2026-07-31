# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt Inventory Slice B PR #49

1. Kiểm exact final head sau các commit tài liệu.
2. Kiểm mergeability và unresolved review threads.
3. Chờ đủ sáu workflow PASS trên exact final head:
   - PR Validation;
   - CI;
   - Inventory and Manufacturing CI;
   - Purchase Feature CI;
   - Sales Feature CI;
   - UI Pull Request Validation.
4. Cập nhật PR body với final SHA và run IDs.
5. Chuyển PR khỏi draft khi toàn bộ gate xanh.
6. Không merge nếu chưa có yêu cầu merge rõ ràng.

## P0 — audit và staging kho

- Chạy read-only catalog audit cho tenant `alu`; chỉ lưu evidence redacted ngoài repository.
- Lập remediation plan cho Item/UOM/Measurement Profile/Warehouse/BOM findings.
- Chạy staging journeys:
  - receipt vào kho nguyên liệu;
  - transfer giữa kho;
  - issue cho sản xuất;
  - quarantine và quality release;
  - scrap/offcut recovery;
  - cancel/reversal đúng lineage.
- Xác minh không có sai lệch quantity/value giữa physical identity snapshot và append-only stock ledger.

## P1 — Slice D physical-stock UI/report/read model

- Thiết kế read model cho tồn kho theo Item, warehouse, batch/serial và canonical physical identity.
- Bổ sung filters cho inventory mode/profile, màu, tình trạng, đời và kích thước.
- Hiển thị lineage tới voucher/revision/row và exact reversal.
- Không tạo parallel stock book; read model phải suy ra từ ledger authoritative.
- Thêm permission/data-scope và export contract trước khi làm UI.

## P1 — hiệu năng và vận hành

- Benchmark company-wide inventory Durable Object lock ở tải gần production.
- Thu contention, retry và latency percentiles.
- Xác định ngưỡng cảnh báo và rollback criteria trước deployment.

## Sau khi Slice B merge

1. Retarget/rebase PR #50 Slice C lên default mới.
2. Chạy lại CI exact-head cho Slice C.
3. Không để Slice C định nghĩa lại canonical physical identity của Slice B.

## Không được làm

- Không deploy Cloudflare nếu chưa được yêu cầu rõ.
- Không mutate production tenant hoặc chạy remediation tự động.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated reports.
- FIFO vẫn disabled cho tới approval activation riêng.
