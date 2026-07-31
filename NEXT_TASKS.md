# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt Slice D read model checkpoint

1. Lấy exact final head sau handoff/status/tasks commits.
2. Kiểm PR #82 mergeability và unresolved review threads.
3. Chạy exact-head CI:
   - PR Validation;
   - CI;
   - Inventory and Manufacturing CI;
   - UI Pull Request Validation.
4. Sửa typecheck/build/test failures, đặc biệt Worker-runtime compatibility.
5. Bổ sung review scorecard sau khi checkpoint xanh.

## P0 — tenant/report adapter

- Đọc ledger theo tenant/company và permission scope.
- Không nhận `tenant_id` từ client nếu khác authenticated tenant.
- Map ledger rows sang physical identity snapshot của Slice B.
- Trả deterministic page, totals và lineage.
- Thêm export contract, maximum row limit và redaction rules.
- Thêm regression cho tenant isolation, permission denial và malformed ledger rows.

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
- Quantity/value reconciliation và exact lineage.
- Benchmark company-wide inventory lock: contention, retry, latency percentiles.
- Xác định alert thresholds, rollback criteria và capacity boundary.

## Safety

- Không deploy Cloudflare nếu chưa có yêu cầu rõ.
- Không mutate production tenant hoặc chạy remediation tự động.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp`, `.env`, backup hoặc generated reports.
- FIFO vẫn disabled cho tới approval activation riêng.
