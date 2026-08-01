# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## In progress — Print design PR #141

Branch: `feat/print-design-sales-documents-20260801`  
PR: `#141`

### Đã làm

- Sidecar `<brief>.prints.json` nối thêm mẫu in trước schema validation/compile, không ghi đè mẫu gốc.
- `Đơn bán hàng ALUMDOOR` — Sales Order, 13 cột.
- `Phiếu giao hàng / lắp đặt ALUMDOOR` — Delivery Note, 11 cột, không in giá.
- `Phiếu yêu cầu sản xuất ALUMDOOR` — Production Request, 14 cột.
- `Phiếu cắt nhôm ALUMDOOR` — Cut Order, 13 cột, bundle lô mẹ + bundle đầu thừa, kerf, kg, đầu thừa/phế và QR chứng từ thật bằng filter `qrcode`.
- QR Cut Order mã hóa đúng số chứng từ nội bộ thành data URL, không nhúng token hoặc URL có quyền truy cập.
- `Biên bản bàn giao / nghiệm thu ALUMDOOR` — Delivery Note, mẫu phụ `default: false`, 11 cột, checklist/kết luận/chữ ký tại công trình.
- Regression renderer cho Sales Order, Delivery Note, Production Request, Cut Order, Acceptance và sidecar loader.
- Exact-head Acceptance `c7d93e77d4a062a095cccc916e50127fcc603595`: 6/6 workflow PASS.
- Acceptance run IDs: CI `30689143646`, PR Validation `30689143618`, UI `30689143691`, Purchase `30689143635`, Sales `30689143650`, Inventory/Manufacturing `30689143661`.
- Current default: `f916d066f9b45b1c3a5238259be9d6953d6cf0f3`; chênh lệch sau merge-base chỉ là release trigger.

### Tiếp theo trên cùng epic

1. Đưa staging QR Cut Order vào PR head một lần và khóa 6 workflow exact-head.
2. Review HTML preview/PDF năm mẫu bằng dữ liệu dài; sửa overflow nếu có.
3. Chuẩn hóa mẫu mặc định `Hoá đơn ALUMDOOR` hiện có; không tạo Sales Invoice default thứ hai và không thay hóa đơn điện tử pháp lý.
4. Sau đó làm `Payment Entry` phiếu thu/chi và chuẩn hóa `Purchase Receipt`.
5. Có thể dùng filter `qrcode` hiện có cho tem mặt hàng/lô/đầu thừa, nhưng chỉ mã hóa định danh nội bộ không nhạy cảm.

### Gate trước merge

- `npm run brief:check`: PASS trên exact head.
- Focused print/Sales tests: PASS, gồm QR thật trong `alumdoor-cut-order-print.test.mjs` và acceptance renderer.
- Full tests, typecheck và build: PASS.
- 6 workflow exact-head: PASS.
- Preview/PDF dữ liệu dài: PENDING visual review.
- PR mergeable với current default.
- Không deploy Cloudflare, đổi secrets/DNS hoặc mutate production.

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
