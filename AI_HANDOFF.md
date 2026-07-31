# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Exact default/base head: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Current canonical branch: `feat/tien-dat-purchase-fifo-20260801`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, CI, merge và release evidence.

## Sales-to-Production — MERGED

- PR #131 merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Exact PR head `c906db398ab562c64aed6f5409eb413f0f516f7a` đã qua CI, PR Validation, Sales, Purchase, Inventory và UI.
- Không deploy Cloudflare trong phiên merge đó.

## Tiến Đạt purchase FIFO — IMPLEMENTED / CI PENDING

Yêu cầu hiện tại:

- form đặt nhôm có STT, ngày, mã hàng, chiều dài, kg/m, số cây, kg barem, đơn giá, thành tiền, màu, dập/không dập;
- hàng nhận trừ đơn cũ nhất trước;
- theo dõi nợ nhà máy bằng số cây và mét theo đúng mã/quy cách;
- lưu lịch sử phiếu nhập và lịch sử phân bổ;
- Tiến Đạt có dung sai mặc định `±5%`, Supplier config được ưu tiên;
- ví dụ `200 + 100`, nhận `230` phải ra `200 + 30`, nợ danh nghĩa `70`, khoảng giao thêm `55–85`.

Code đã thêm:

- `server/apps-src/alumdoor-worker/src/purchase-fifo-receipt.ts` — handler FIFO, debt summary, history, tolerance.
- `server/apps-src/alumdoor-worker/src/entry.ts` — intercept đúng hai method FIFO rồi delegate mọi route khác.
- `client/packages/views/src/form/ChildGridWithExtensions.tsx` — bảng Chi tiết đặt nhôm theo contract cột.
- `server/tests/tien-dat-purchase-fifo.test.mjs` — regression yêu cầu và preview end-to-end bằng platform fake.

Code head trước handoff docs: `13d49cf4587f30c77837cbed9ac8d58add9296f2`.
Final head phải lấy lại từ GitHub sau commit tài liệu.

## Kiến trúc liên quan

- Generic append-only purchase allocation engine, timeline và báo cáo công nợ NCC đã tồn tại trong `server/packages/clouderp-core` và `server/packages/document-kernel`.
- `purchase_allocation_rollout_state` không được thay đổi trong feature này.
- Generic FIFO production vẫn disabled.
- Alumdoor action `nhap-nhom-fifo` dùng handler app-level mới để preview và tạo Purchase Receipt nháp.

## Việc tiếp theo

1. Mở một PR canonical từ branch hiện tại.
2. Chạy exact-head CI, Purchase focused gate và UI gate.
3. Sửa direct cause trên cùng branch nếu có lỗi.
4. Merge bằng expected exact head khi mọi required check xanh.
5. Sau merge, bắt đầu Purchase authenticated QA clean rebuild.
6. Không deploy Cloudflare hoặc bật FIFO production nếu chưa có yêu cầu riêng.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- Không thay rollout state.
- Không mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
