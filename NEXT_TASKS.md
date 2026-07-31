# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — merge Inventory Slice B PR #49

1. Dùng exact head sau commit handoff/status/tasks.
2. Chờ required workflows PASS:
   - PR Validation;
   - CI;
   - Inventory and Manufacturing CI;
   - Purchase Feature CI;
   - Sales Feature CI;
   - UI Pull Request Validation.
3. Kiểm `behind_by=0`, mergeability và unresolved review threads.
4. Cập nhật PR body với exact SHA và run IDs.
5. Merge #49 theo approval hiện tại; không deploy.

## P0 — retarget và merge Manufacturing Slice C PR #50

1. Sau khi #49 merge, retarget #50 từ branch Slice B sang `hotfix/alumdoor-print-list-delete`.
2. Xác nhận diff chỉ còn phần Manufacturing Slice C.
3. Chạy lại exact-head CI trên base mới.
4. Sửa conflict/failure nếu có; giữ canonical physical identity của Slice B làm nguồn duy nhất.
5. Kiểm review threads và mergeability rồi merge khi toàn bộ gate sạch.

## P0 — retarget Inventory Slice D PR #82

1. Sau khi #50 merge, retarget #82 lên current default.
2. Chạy exact-head CI lại.
3. Tiếp tục tenant report endpoint:
   - `D1PhysicalStockLedgerReader`;
   - `PhysicalStockReportService`;
   - tenant/company/warehouse permission scope;
   - lineage redaction và export permission.
4. Làm physical-stock explorer, lineage drill-down, quarantine/release và Work Order progress.
5. Thêm WIP, shortage, variance, scrap/offcut, ageing và condition reports.
6. Thêm runtime harness và Playwright desktop/mobile.

## P1 — acceptance và vận hành

- Read-only Item/BOM/Warehouse audit trên staging hoặc production-shaped copy.
- Receipt/transfer/quarantine/release/manufacture/cancel journey.
- Quantity/value/physical-count reconciliation và exact lineage.
- Benchmark company-wide inventory lock: contention, retry và latency percentiles.
- Xác định alert thresholds, rollback criteria và capacity boundary.

## Safety

- Không deploy Cloudflare nếu chưa có yêu cầu release riêng.
- Không mutate production tenant hoặc chạy remediation tự động.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `server/work/`, `tmp`, `.env`, backup hoặc generated reports.
