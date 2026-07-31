# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head trước docs handoff: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, CI, merge và release evidence.

## Sales-to-Production — MERGED

- PR #131 merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Exact PR head `c906db398ab562c64aed6f5409eb413f0f516f7a` đã qua CI, PR Validation, Sales, Purchase, Inventory và UI.
- Không deploy Cloudflare trong phiên merge đó.

## Tiến Đạt purchase FIFO — MERGED

- PR #134 merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Exact PR head: `39eb6f25b337dd3fc973bf2b7a9d6b0e7204a420`.
- CI `30666118057`: SUCCESS.
- PR Validation `30666118031`: SUCCESS.
- Purchase Feature CI `30666118118`: SUCCESS.
- UI Pull Request Validation `30666118096`: SUCCESS.
- Sales `30666118049` và Inventory `30666118064`: SUCCESS.

Yêu cầu đã giao:

- form đặt nhôm có STT, ngày, mã hàng, chiều dài, kg/m, số cây, kg barem, đơn giá, thành tiền, màu, dập/không dập;
- hàng nhận trừ đơn cũ nhất trước;
- theo dõi nợ nhà máy bằng số cây và mét theo đúng mã/quy cách;
- lưu lịch sử phiếu nhập và lịch sử phân bổ;
- Tiến Đạt có dung sai mặc định `±5%`, Supplier config được ưu tiên;
- ví dụ `200 + 100`, nhận `230` ra `200 + 30`, nợ danh nghĩa `70`, khoảng giao thêm `55–85`.

File chính:

- `server/apps-src/alumdoor-worker/src/purchase-fifo-receipt.ts`
- `server/apps-src/alumdoor-worker/src/entry.ts`
- `client/packages/views/src/form/ChildGridWithExtensions.tsx`
- `server/tests/tien-dat-purchase-fifo.test.mjs`

## Kiến trúc và ranh giới

- App entrypoint chỉ intercept `alumdoor.purchase.preview_fifo_receipt` và `alumdoor.purchase.fifo_receipt`; route khác delegate sang worker cũ.
- Generic append-only purchase allocation engine, timeline và báo cáo công nợ NCC vẫn tồn tại trong `server/packages/clouderp-core` và `server/packages/document-kernel`.
- `purchase_allocation_rollout_state` không bị thay đổi.
- Generic FIFO production vẫn disabled.
- Flow mới tạo Purchase Receipt nháp, đọc lịch sử từ Purchase Receipt đã ghi sổ và không mutate production trong CI.
- Không deploy Cloudflare trong đợt này.

## Việc tiếp theo

1. Bắt đầu Purchase authenticated QA clean rebuild từ exact default mới.
2. Không reopen PR #103; chỉ mang từng file QA đã review.
3. Bổ sung desktop + Pixel 7 lifecycle và authenticated Tiến Đạt FIFO journey.
4. Giữ QA local/ephemeral; không bật generic FIFO rollout.
5. Sau Purchase QA, tiếp tục Finance → Daily ledger → Warranty/Capacity → end-to-end acceptance.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- Không thay rollout state.
- Không mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
