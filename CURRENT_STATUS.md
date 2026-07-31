# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head hiện tại: `5252b196b8cef5b1710c69d8bde04136741d0cc9`.
- Canonical queue: `EPIC_STATUS.md`.
- Quy tắc giao hàng: `DELIVERY_POLICY.md`.

## Sales-to-Production clean rebuild

PR canonical: **#131 — `feat(sales): rebuild order to production flow`**.

- Branch: `feat/sales-order-production-flow-clean-20260801`.
- Exact code head sau review: `4d60d26e8791c87cd9fa359d0310ef026f428c59`.
- PR mergeable; nhánh đang sau default 19 commit chỉ thuộc workflow/release/package và không chồng lên 19 file source/test nghiệp vụ.
- PR vẫn là **draft**; chưa merge và chưa release production.
- Final diff không có workflow dùng một lần, transport/sync workflow, hidden trigger hoặc generated artifact.

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
- Lỗi duplicate-list phát sinh sau preflight cũng được ghi nhớ và chặn write kế tiếp.

### Finding đã sửa trong review 2026-08-01

Paint Job trước đây dừng đồng bộ khi thấy bất kỳ job cũ nào của phiếu cắt. Nếu lần chạy trước tạo được một lô rồi lỗi ở lô sau, retry sẽ bỏ sót lô còn lại; cùng một batch xuất hiện nhiều entry cũng có thể sinh trùng job.

Đã sửa tại exact code head `4d60d26e...`:

- đối chiếu idempotency theo `batch_no`, không theo toàn bộ phiếu cắt;
- retry giữ job đã có và chỉ tạo batch `THÔ` còn thiếu;
- cộng gộp số lượng nếu cùng batch xuất hiện nhiều entry;
- cache đọc Batch trong một lần đồng bộ;
- fail closed khi Paint Job cũ thiếu `batch_no` hoặc có nhiều job active cho cùng batch;
- thêm regression cho partial retry và batch aggregation.

### CI evidence

Exact head trước finding, `f8bd58178eed491f1edbb50d69bfeb4441002178`, đã PASS:

- CI `30662282319`;
- PR Validation `30662282855`;
- Sales Feature CI `30662282651`;
- Purchase Feature CI `30662282843`;
- Inventory and Manufacturing CI `30662282438`;
- UI Pull Request Validation `30662283106`.

Exact head mới sau finding đang chờ GitHub Actions chạy lại. Không dùng evidence của `f8bd5817...` để merge head mới.

## Đối chiếu yêu cầu 25.7

Tài liệu 25.7 được chia thành queue hiện hành:

1. Sales-to-Production — PR #131 đang hoàn tất.
2. Purchase authenticated QA — kiểm luồng nhập hàng và chứng từ mua.
3. Finance — thu/chi, công nợ chi tiết, phân bổ thanh toán và báo cáo công nợ.
4. Daily ledger — sổ chi tiết theo ngày, khóa sửa, adjustment và reconciliation.
5. Warranty / Capacity — bốn nguyên nhân lỗi, đổi trả/NCC/KH và tổng phút sản xuất, tăng ca.
6. End-to-end acceptance — đơn hàng → sản xuất → tồn kho → giao hàng → công nợ → sổ ngày → điều chỉnh → bảo hành.

Inventory physical-stock Slice D foundation đã merge ở PR #82. Toàn bộ yêu cầu chưa hoàn tất cho tới khi sáu epic trên đều DONE và authenticated end-to-end PASS.

## Trạng thái nghiệp vụ

1. Sales-to-Production — `DRAFT PR #131 / NEW HEAD CI PENDING / NOT MERGED`.
2. Purchase authenticated QA — `QUEUED AFTER SALES MERGE`.
3. Finance — `QUEUED / REBUILD`.
4. Daily ledger — `QUEUED`.
5. Warranty / Capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- FIFO vẫn **disabled**.
- Chưa deploy PR #131.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
