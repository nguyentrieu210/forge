# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## Trạng thái hàng đợi

- Toàn bộ PR tồn đọng cũ đã đóng: `#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.
- Không reopen hoặc merge nguyên branch cũ.
- Branch cũ chỉ là nguồn tham khảo từng file.
- Mọi việc tiếp theo phải bắt đầu từ exact current default.

## P0 — Purchase authenticated QA clean rebuild

### Phạm vi

- Login và boot tenant local bằng cookie + CSRF thật.
- Cài app Alumdoor authoritative vào D1 local.
- Item/UOM dropdown search.
- Purchase Order create/save/submit và mở lại form thật.
- Purchase Receipt create/save/preview/submit/cancel và mở lại form thật.
- Desktop Chrome và Pixel 7.
- Tiến Đạt FIFO journey:
  - tạo hai đơn `200` và `100` cây cùng mã/quy cách, ngày khác nhau;
  - preview nhận `230` cây phải ra `200 + 30`;
  - draft receipt giữ đúng hai `purchase_order`;
  - sau submit, preview lần sau hiện lịch sử và nợ `70` cây / `504 m`;
  - khoảng giao thêm `55–85` cây;
  - `86` cây bị từ chối, `85` cây được phép.

### Nguồn tham khảo

- Closed PR `#103`, chỉ mang từng file đã review.
- Không mang workflow stale, handoff cũ hoặc generated evidence.

### Done condition

- Authenticated Purchase lifecycle PASS trên desktop và Pixel 7.
- Authenticated Tiến Đạt FIFO journey PASS.
- Full CI, Purchase gate và UI authenticated gate xanh trên exact head.
- Merge vào default, sau đó cập nhật handoff.

## P1 — Finance clean rebuild

### Phạm vi

- Due date và AR/AP aging.
- Payment Entry partial/unallocated.
- Payment Allocation cùng company/party/account/currency.
- Party Statement.
- Debt Summary.
- Advance Balance.
- UI/report navigation và permission.
- Migration append-only, dry-run, checksum, rollback và staging evidence.

### Nguồn tham khảo

- Closed PR `#15` và backup `#40`.
- Không merge nguyên branch vì đã diverged và thiếu exact-head verification.

## P2 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Lệnh cập nhật có idempotency.
- Chỉ kế toán tổng hợp, kế toán trưởng và giám đốc được tạo adjustment sau khi khóa.
- Không sửa trực tiếp số liệu snapshot; mọi thay đổi phải tạo adjustment có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P3 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo tài liệu `25.7 QUY TRÌNH.docx`.
- Bảo hành motor/bình lưu điện trong một năm tính từ ngày giao.
- Lỗi sản xuất có người chịu trách nhiệm và xác nhận kế toán tổng hợp.
- Lỗi nhà cung cấp dùng provisional AP hold, chỉ offset khi supplier acceptance hoặc policy được duyệt.
- Lỗi khách hàng ghi nhận chi phí theo công đoạn.
- Capacity theo department/workstation calendar `8 giờ/ngày`, tính overtime và overload.

## P4 — End-to-end acceptance

Sales Order → production request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

Bắt buộc có desktop và mobile authenticated journey trên một exact head SHA.

## UI backlog có thể dựng lại riêng

- MetaForge MISA-style workspace tabs từ closed PR `#81/#109`.
- Login/landing từ closed PR `#36`.
- Hai phần này là scope UI riêng, không được trộn vào Purchase hoặc Finance PR.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần, transport/sync workflow hoặc hidden trigger.
- Không deploy Cloudflare, sửa secret/DNS, bật generic FIFO rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
