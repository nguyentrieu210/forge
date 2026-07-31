# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## Hoàn tất — Purchase authenticated QA

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- Full CI, PR Validation, Purchase, Sales, Inventory và UI authenticated gates: SUCCESS.
- Desktop Chrome + Pixel 7 lifecycle PASS.
- Tiến Đạt FIFO authenticated journey PASS: `200 + 100`, nhận `230` → `200 + 30`, lịch sử và công nợ đúng; `85` được phép, `86` bị từ chối.
- Không deploy Cloudflare, không thay rollout state và không mutate dữ liệu production.

## P1 — Finance clean rebuild

### Nguồn

- Tạo branch mới từ exact current default sau docs merge.
- Closed PR `#15` và backup `#40` chỉ dùng tham khảo từng file.
- Không reopen hoặc merge nguyên branch cũ.

### Phạm vi bắt buộc

- Due date và AR/AP aging theo ngày đến hạn.
- Payment Entry hỗ trợ partial payment và unallocated amount.
- Payment Allocation ràng buộc cùng company, party, account và currency.
- Party Statement có opening, invoice, payment, allocation và running balance.
- Debt Summary theo customer/supplier, aging bucket và overdue.
- Advance Balance theo party/currency/account.
- UI/report navigation, permission và export boundary.
- Migration append-only, có dry-run, checksum, rollback và production-shaped evidence.
- Không dùng floating point cho bút toán tiền; tiếp tục dùng minor/micros theo kernel.

### Trình tự

1. Đọc exact default head và CI hiện tại từ GitHub.
2. Tạo một branch canonical từ default.
3. Review từng file từ PR `#15`; chỉ mang phần còn đúng với kiến trúc hiện tại.
4. Bổ sung phần còn thiếu thay vì chỉ merge AR/AP aging cũ.
5. Viết focused unit/integration tests và route/report tests.
6. Chạy migration dry-run/checksum/rollback trên local/ephemeral D1.
7. Mở một PR canonical và khóa exact head khi CI chạy.
8. Merge khi full CI và Finance-specific gate đều xanh.
9. Không deploy Cloudflare nếu chưa có yêu cầu rõ.

### Done condition

- AR/AP, allocations, statements, debt summary và advance balance PASS.
- Migration/backfill có bằng chứng dry-run, checksum và rollback.
- UI/report navigation và permission PASS.
- Exact merged SHA có CI xanh.

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

## UI backlog riêng

- MetaForge MISA-style workspace tabs từ closed PR `#81/#109`.
- Login/landing từ closed PR `#36`.
- Hai phần này không được trộn vào Finance hoặc nghiệp vụ ledger.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần, transport/sync workflow hoặc hidden trigger.
- Không deploy Cloudflare, sửa secret/DNS, bật generic FIFO rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
