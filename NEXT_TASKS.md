# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## Hoàn tất — Forge branding và warehouse PWA

- PR `#142` merge SHA: `8e9882a6143f4cf669724f654ec1b59949b90138`.
- Exact validated head: `24621f221fad2de950d0f58cc39078e43c206f51`.
- Full CI, typecheck, build và browser QA desktop/tablet/mobile: PASS.
- Warehouse PWA QA: PASS trên Pixel 7 và viewport `390 × 844`.
- Không deploy Cloudflare, không sửa production secret/DNS và không mutate dữ liệu production.

## Hoàn tất — Finance receivables, payables và advances

- PR `#139` merge SHA: `e404e12ef22d5bc9f2a782820787b4f30d8dce8a`.
- Exact validated head: `0b5a629989dfa2b7972dafbda39134ad9b4bdda6`.
- Due date, AR/AP aging, partial/unallocated Payment Entry, Advance Balance, Payment Allocation, Party Statement và Debt Summary đã có trên default.
- Payment Ledger tiếp tục append-only; invoice outstanding không âm; advance chỉ được phân bổ về 0.
- Full tests, typecheck, build, PR Validation, Sales, Purchase, Inventory/Manufacturing và UI validation: PASS.

## Hoàn tất — Alumdoor public landing redesign

- PR `#145` merge SHA: `898b19d0c58c84a32f99d73dfe0bf33f9ec78dd6`.
- Exact validated head: `73dc960e3c9685708ac1b1e51c7eb5d2c1a71a9a`.
- Landing guest đã chuyển sang bố cục mới theo thương hiệu/sản phẩm công khai của Alumdoor, giữ login nội bộ.
- Có hero, navigation, 4 dịch vụ, giới thiệu, 4 nhóm danh mục sản phẩm, giá/link tham chiếu, liên hệ, khu vực hỗ trợ và footer.
- Browser QA PASS desktop/tablet/mobile, gồm dark/reduced-motion, login, no horizontal overflow và link VIP-ST500.
- Không deploy Cloudflare trong đợt này.

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

## P1 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Lệnh cập nhật idempotent, cùng input không sinh snapshot trùng.
- Freeze chặn direct edit sau khi khóa.
- Adjustment sau khóa phải có reason, actor, timestamp và audit trail.
- Chỉ General Accountant, Chief Accountant và Director được adjustment sau update/freeze theo quy trình nghiệp vụ.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance phải chỉ ra chênh lệch theo nguồn.
- Report/query và permission phải có tenant boundary.
- Migration append-only và regression tests phải chạy trong full CI.

### Done condition

- Có canonical daily snapshot và khóa theo ngày.
- Re-run cùng ngày/context idempotent.
- Direct mutation sau freeze bị chặn.
- Adjustment hợp lệ tạo audit record, không rewrite snapshot gốc.
- Reconciliation có evidence cho ít nhất Sales, Purchase, Inventory, Manufacturing và Finance.
- Full test, typecheck, build và exact-head CI xanh trước merge.

## P2 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo tài liệu `25.7 QUY TRÌNH.docx`.
- Bảo hành motor/bình lưu điện một năm từ ngày giao.
- Supplier provisional AP hold và offset có phê duyệt.
- Customer defect cost theo công đoạn và trách nhiệm.
- Capacity theo department/workstation calendar, chuẩn 8 giờ/ngày, overtime và overload.

## P3 — End-to-end acceptance

Sales Order → production request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

- Chạy authenticated lifecycle xuyên module.
- Có desktop/mobile evidence cho các điểm người dùng thao tác.
- Chốt permission, audit, reconciliation và failure-path evidence.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không deploy Cloudflare, sửa secret/DNS, bật rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
