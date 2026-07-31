# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt Slice D D1/report checkpoint

1. Lấy exact final head sau các commit handoff/status/tasks.
2. Kiểm PR #82 mergeability và unresolved review threads.
3. Chạy exact-head CI:
   - PR Validation;
   - CI;
   - Inventory and Manufacturing CI;
   - UI Pull Request Validation.
4. Sửa mọi test/typecheck/build failure trên exact head.
5. Bổ sung review scorecard khi checkpoint xanh.

## P0 — tenant report endpoint

- Gắn `D1PhysicalStockLedgerReader` vào `PhysicalStockReportService`.
- Lấy tenant từ authenticated request context, không nhận tenant tùy ý từ client.
- Áp dụng report permission và User Permission cho Company/Warehouse.
- Tách quyền xem lineage và export.
- Parse/filter inputs theo budget; chặn malformed cursor và unbounded source scans.
- Trả deterministic page, totals, lineage-redaction metadata và CSV response.
- Regression cho unauthorized role, tenant isolation, company/warehouse scope và export denial.

## P0 — operator UI

- Physical stock explorer với filters:
  - Item;
  - warehouse/warehouse role;
  - inventory mode/profile;
  - màu;
  - tình trạng;
  - đời;
  - batch/serial;
  - kích thước.
- Lineage drill-down tới voucher/revision/row/reversal.
- Quarantine và quality-release view.
- Work Order progress theo immutable snapshot và BOM row.
- UI chỉ hiển thị server-authoritative balances; không tự cộng trừ tồn.

## P0 — reports

- WIP.
- Material shortage.
- Planned vs actual variance.
- Scrap/offcut recovery.
- Stock ageing và condition.
- Lineage/reversal audit.
- CSV/XLSX export theo permission/data scope.

## P0 — browser QA

- Runtime harness dùng actual components.
- Playwright desktop/mobile cho filters, pagination, lineage, quarantine, Work Order progress và export.
- Cookie-auth smoke giữ tenant isolation.

## P0 — stack completion

- PR #49 phải merge trước PR #50.
- PR #50 phải được retarget/rebase lên default và CI lại trước merge.
- PR #82 phải được retarget/rebase sau Slice C.
- Không merge stacked PR vượt dependency.

## P1 — acceptance và vận hành

- Read-only Item/BOM/Warehouse audit trên staging hoặc production-shaped copy.
- Receipt/transfer/quarantine/release/manufacture/cancel journey.
- Quantity/value/physical-count reconciliation và exact lineage.
- Benchmark company-wide inventory lock: contention, retry, latency percentiles.
- Xác định alert thresholds, rollback criteria và capacity boundary.

## Safety

- Không deploy Cloudflare nếu chưa có yêu cầu rõ.
- Không mutate production tenant hoặc chạy remediation tự động.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp`, `.env`, backup hoặc generated reports.
- FIFO vẫn disabled cho tới approval activation riêng.
