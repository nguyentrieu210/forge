# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## P0 — Hoàn tất PR Forge mobile/PWA `#142`

### Branch và phạm vi

- Branch: `feat/mobile-pwa-brand-account-warehouse`.
- Base: `hotfix/alumdoor-print-list-delete` tại `f6420c70823b969a28b43e3f93004ebd52546adc`.
- Implementation head trước docs: `21534cfc9bdb76fdd9c1dca105f6d478c8ac28dc`.
- Phạm vi gồm branding, landing/login, account menu, PWA kho và browser QA mobile.

### Việc tiếp theo bắt buộc

1. Khóa exact PR head sau hai commit status docs; không push thêm khi CI đang chạy.
2. Chờ full CI, PR Validation, Sales, Purchase, Inventory và UI Pull Request Validation.
3. Xác nhận Playwright mới PASS ở `warehouse-pixel-7` và `warehouse-compact-phone`.
4. Kiểm tra artifact ảnh `warehouse-mobile.png`, manifest, logo, bottom nav, form nhập kho và account menu.
5. Sửa theo log thật nếu gate đỏ; không bỏ test hoặc nới assertion để che lỗi.
6. Merge PR `#142` chỉ khi exact-head checks đều xanh.
7. Sau merge, xác nhận default head mới và cập nhật handoff nếu có thay đổi nội dung.

### Done condition

- Logo chuẩn tím-hồng, chữ A trắng, ba nét cánh xuất hiện đồng nhất ở landing, login, shell, favicon và PWA.
- Landing/login không lệch khung trên desktop và mobile.
- Avatar, đổi mật khẩu và đăng xuất thiết bị khác hoạt động qua adapter.
- App kho chỉ có UI touch-first, top nav, bottom nav, nút nghiệp vụ và form mobile.
- Nhập/xuất/chuyển/kiểm kho và tra tồn có contract adapter rõ ràng.
- Manifest standalone, icon maskable và service worker không cache API/auth.
- Full build/typecheck và Playwright hai viewport điện thoại PASS.
- PR `#142` merge vào default.

## P0.1 — Release app kho, chỉ thực hiện khi có lệnh deploy riêng

- Map output `client/apps/kho/dist-mobile` vào route `/mobile/warehouse/` của gateway/static host.
- Bảo đảm SPA fallback, manifest, service worker và asset base path hoạt động cùng origin với API.
- Chạy authenticated smoke với backend thật cho bốn nghiệp vụ kho.
- Kiểm tra quyền Stock User/Stock Manager và CSRF/cookie session.
- Không deploy Cloudflare, sửa DNS hoặc production secrets trong PR `#142`.

## P1 — Finance clean rebuild

- Due date và AR/AP aging theo ngày đến hạn.
- Payment Entry hỗ trợ partial payment và unallocated amount.
- Payment Allocation cùng company, party, account và currency.
- Party Statement có opening, invoice, payment, allocation và running balance.
- Debt Summary theo customer/supplier và aging bucket.
- Advance Balance theo party/currency/account.
- UI/report navigation, permission và export boundary.
- Migration append-only, dry-run, checksum và rollback.

Finance phải làm ở branch riêng sau khi PR mobile hoàn tất.

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
