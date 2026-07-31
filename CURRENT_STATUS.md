# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head đã đồng bộ vào nhánh Sales-to-Production: `a8846dc7ca522c5c47d0a8a1dfbe95657c0a7b24`.
- Canonical queue: `EPIC_STATUS.md`.
- Quy tắc giao hàng: `DELIVERY_POLICY.md`.

## Sales-to-Production clean rebuild

PR canonical: **#131 — `feat(sales): rebuild order to production flow`**.

- Branch: `feat/sales-order-production-flow-clean-20260801`.
- Exact synchronized feature head đã kiểm: `732180b180d248595e54ee37b06b665f72e1d948`.
- So với default tại thời điểm kiểm: `behind_by=0`.
- PR vẫn là **draft**; chưa merge và chưa release production.
- Final diff gồm 19 file source/test/brief; không có workflow dùng một lần, transport/sync workflow, hidden trigger hoặc generated artifact.

### Phạm vi đã triển khai

- Sales Order Item giữ luồng compact và có bảng nghiệp vụ mở rộng.
- Field mở rộng `in_list_view` giữ `depends_on`, read-only, mask và cập nhật dòng.
- Door policy có phiên bản, hỗ trợ Cửa tấm liền Úc và snapshot cơ cấu lá AL70.
- Production Request tách theo từng bộ/loại cửa.
- Work Order draft idempotent.
- Cut/Paint theo Batch thực tế, có trạng thái `THÔ`.
- Delivery truy vết bằng `sales_order_row_id`, có fallback dữ liệu cũ có kiểm soát.
- Unicode Item Price normalization được giữ trong cùng luồng.
- Thiếu policy/BOM bị chặn, không đoán dữ liệu.
- Duplicate-list probe của Production Request, Work Order và Paint Job fail-closed trước mọi write.

### Exact-head evidence trên `732180b1...`

- CI run `30661155948`: **SUCCESS** — full tests, typecheck và build PASS.
- PR Validation run `30661155848`: **SUCCESS**.
- Sales Feature CI run `30661155940`: **SUCCESS**.
- Purchase Feature CI run `30661155820`: **SUCCESS**.
- Inventory and Manufacturing CI run `30661154919`: **SUCCESS**.
- UI Pull Request Validation run `30661154877`: **SUCCESS** — frontend lint, browser build và Alumdoor browser QA PASS.

Regression mới xác nhận lỗi `503` ở duplicate-list probe dừng trước mọi write.

## Trạng thái đã merge/release trước PR #131

- Inventory Slice D: PR #82, merge `a7e6ef65b2352f596e285ea34d8e6438dff11a95`.
- Production workflow fix: PR #130, merge `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Alumdoor app Worker, Gateway và alu Tenant Worker đã có release thành công trước PR #131.
- PR #131 chưa thay đổi production vì chưa merge/release.

## CI architecture

- `CI` chạy full test + typecheck + build.
- `PR Validation` chạy policy/changed-file gate.
- Sales/Purchase/Inventory/UI chạy focused gate theo phạm vi.
- Release chỉ chạy từ merged SHA qua dedicated production workflow.

## Trạng thái nghiệp vụ

1. Sales-to-Production — `DRAFT PR #131 / EXACT-HEAD CI PASS / NOT MERGED`.
2. Purchase authenticated QA — `QUEUED AFTER SALES MERGE`.
3. Finance — `QUEUED / REBUILD`.
4. Daily ledger — `QUEUED`.
5. Warranty / Capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.

Toàn hệ thống chưa đạt end-to-end acceptance. Sales-to-Production còn final review, merge, authenticated operator journey và release evidence nếu production được yêu cầu.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- FIFO vẫn **disabled**.
- Không deploy PR #131 khi chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
