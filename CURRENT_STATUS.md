# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Exact default/base head: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Sales-to-Production PR #131 đã merge tại `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Canonical branch hiện tại: `feat/tien-dat-purchase-fifo-20260801`.
- Quy tắc giao hàng: `DELIVERY_POLICY.md`.

## Tiến Đạt purchase FIFO — IMPLEMENTED / CI PENDING

Phạm vi yêu cầu đã được nối vào Alumdoor app entrypoint:

- form chi tiết đặt nhôm hiển thị STT, ngày chứng từ, mã hàng, chiều dài, kg/m, số cây, kg barem, đơn giá, thành tiền, màu và dập/không dập;
- chỉ đọc các Purchase Order và Purchase Receipt đã ghi sổ của đúng nhà cung cấp;
- khớp theo mã hàng + chiều dài + màu + trạng thái dập;
- phân bổ số cây nhận vào đơn có ngày xa nhất trước;
- mỗi dòng phiếu nhập giữ liên kết `purchase_order` và diễn giải ngày đơn bị trừ;
- trả lịch sử phiếu nhập đã ghi sổ, số cây, số mét, kg barem và kg thực tế;
- trả công nợ danh nghĩa và khoảng giao thêm hợp lệ theo dung sai;
- Tiến Đạt mặc định dung sai `5%` khi Supplier chưa khai riêng; cấu hình trên Supplier luôn được ưu tiên;
- không cho nhận vượt tổng số đặt cộng dung sai;
- fail closed khi lịch sử cũ vượt năng lực các dòng đơn hoặc cùng quy cách có nhiều kg/m khác nhau.

### Ví dụ đã khóa bằng regression

- Ngày 1: `200` cây AL71, `7.2 m`, `0.389 kg/m` → `560.16 kg` barem.
- Ngày 2: `100` cây → `280.08 kg` barem.
- Nhận `230` cây → phân bổ `200` cây vào ngày 1 và `30` cây vào ngày 2.
- Nợ danh nghĩa còn `70` cây = `504 m`.
- Dung sai cộng dồn `±15` cây → khoảng giao thêm hợp lệ `55–85` cây.
- Barem lần nhận: `644.184 kg`.

### File chính

- `server/apps-src/alumdoor-worker/src/purchase-fifo-receipt.ts`
- `server/apps-src/alumdoor-worker/src/entry.ts`
- `client/packages/views/src/form/ChildGridWithExtensions.tsx`
- `server/tests/tien-dat-purchase-fifo.test.mjs`

### Trạng thái kiểm tra

- Code head trước cập nhật handoff: `13d49cf4587f30c77837cbed9ac8d58add9296f2`.
- Chưa mở PR tại thời điểm ghi file này.
- Full CI, Purchase focused gate và UI gate chưa chạy trên exact final head.
- Chưa merge feature này.
- Chưa deploy Cloudflare hoặc bật rollout FIFO production.

## Hàng đợi nghiệp vụ

1. Tiến Đạt purchase FIFO — `IMPLEMENTED / CI PENDING`.
2. Purchase authenticated QA — `QUEUED AFTER FIFO MERGE`.
3. Finance — `QUEUED / REBUILD`.
4. Daily ledger — `QUEUED`.
5. Warranty / Capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- Không thay đổi `purchase_allocation_rollout_state`; generic FIFO production vẫn disabled.
- Không deploy Cloudflare trong đợt này khi chưa có yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
