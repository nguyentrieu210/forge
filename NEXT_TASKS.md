# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## Hoàn tất — Forge branding và warehouse PWA

- PR `#142` merge SHA: `8e9882a6143f4cf669724f654ec1b59949b90138`.
- Exact validated head: `24621f221fad2de950d0f58cc39078e43c206f51`.
- Full CI, typecheck, build và browser QA desktop/tablet/mobile: PASS.
- Warehouse PWA QA: PASS trên Pixel 7 và viewport `390 × 844`.
- Alumdoor white-label landing/login QA: PASS.
- Không deploy Cloudflare, không sửa production secret/DNS và không mutate dữ liệu production.

## P0 — Release app kho, chỉ thực hiện khi có lệnh deploy riêng

1. Tạo branch release riêng từ default head mới.
2. Map output `client/apps/kho/dist-mobile` vào route `/mobile/warehouse/` của gateway/static host.
3. Bảo đảm SPA fallback, manifest, service worker và asset base path hoạt động cùng origin với API.
4. Chạy authenticated smoke với backend thật cho nhập kho, xuất kho, chuyển kho và kiểm kho.
5. Kiểm tra quyền Stock User/Stock Manager, CSRF, cookie session và logout/change-password.
6. Chụp evidence desktop landing, login mobile, home kho, form nghiệp vụ và account screen.
7. Chỉ deploy Cloudflare hoặc thay production route khi có yêu cầu rõ ràng.

### Done condition

- `/mobile/warehouse/` trả đúng bundle PWA, không rơi về desktop runtime.
- Manifest và service worker có scope `/mobile/warehouse/`.
- Phiếu kho tạo thành công bằng tài khoản có quyền và bị chặn đúng với tài khoản thiếu quyền.
- Không cache API/auth response.
- Rollback route/static asset được ghi rõ.

## P1 — Finance clean rebuild

- Due date và AR/AP aging theo ngày đến hạn.
- Payment Entry hỗ trợ partial payment và unallocated amount.
- Payment Allocation cùng company, party, account và currency.
- Party Statement có opening, invoice, payment, allocation và running balance.
- Debt Summary theo customer/supplier và aging bucket.
- Advance Balance theo party/currency/account.
- UI/report navigation, permission và export boundary.
- Migration append-only, dry-run, checksum và rollback.

Finance phải làm ở branch riêng, không trộn với release app kho.

## P2 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Lệnh cập nhật idempotent.
- Adjustment sau khóa phải có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P3 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo tài liệu `25.7 QUY TRÌNH.docx`.
- Bảo hành motor/bình lưu điện một năm từ ngày giao.
- Supplier provisional AP hold và offset có phê duyệt.
- Capacity theo department/workstation calendar, overtime và overload.

## P4 — End-to-end acceptance

Sales Order → production request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không deploy Cloudflare, sửa secret/DNS, bật rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
