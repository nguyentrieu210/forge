# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head khi tiếp tục Print Design: `f916d066f9b45b1c3a5238259be9d6953d6cf0f3`.
- Latest runtime-changing default commit: `898b19d0c58c84a32f99d73dfe0bf33f9ec78dd6`.
- Bốn commit default mới nhất từ merge-base chỉ đổi `.github/release/gateway-production.trigger` và `.github/release/production-status.trigger`; không đụng server/schema/print.
- GitHub là nguồn sự thật cho current branch head, CI, PR và release evidence.

## In progress — Print design PR #141

- Branch: `feat/print-design-sales-documents-20260801`.
- PR: `#141` — `feat(print): add Alumdoor operational print formats`.
- Sidecar `server/briefs/alumdoor-v2.prints.json` nối với các mẫu in sẵn có trước schema validation/compile; không ghi đè mảng `prints` của brief gốc.
- Loader hỗ trợ filesystem path và `file:` URL, có regression riêng.
- `Đơn bán hàng ALUMDOOR` — Sales Order, A4 portrait, 13 cột = `100%`.
- `Phiếu giao hàng / lắp đặt ALUMDOOR` — Delivery Note, A4 portrait, 11 cột = `100%`, không in giá, có checklist và ba khu vực ký.
- `Phiếu yêu cầu sản xuất ALUMDOOR` — Production Request, A4 portrait, 14 cột = `100%`.
- `Phiếu cắt nhôm ALUMDOOR` — Cut Order, A4 portrait, 13 cột = `100%`, dùng bundle lô mẹ + bundle đầu thừa để truy vết thật; không tạo QR giả.
- `Biên bản bàn giao / nghiệm thu ALUMDOOR` — Delivery Note, `default: false`, A4 portrait, 11 cột = `100%`; dùng dữ liệu giao/lắp thật và để vùng kết quả/checklist cho ký tay tại công trình.
- Regression renderer dùng dữ liệu dài cho Sales Order, Delivery Note, Production Request, Cut Order và Biên bản nghiệm thu.
- Exact-head Cut Order `a291f5870b3820f2b50d7b80e3e2820183ad177d`: 6/6 workflow SUCCESS.
- Run IDs Cut Order: CI `30688745607`, PR Validation `30688745586`, UI `30688745573`, Purchase `30688745587`, Inventory/Manufacturing `30688745588`, Sales `30688745593`.
- Acceptance đang ở staging và phải qua exact-head CI sau khi đưa vào PR branch.
- Gate còn lại trước merge: exact-head CI với Acceptance, review trực quan HTML preview/PDF dữ liệu dài và PR mergeable với current default.

## Đã hoàn tất trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Sales Order → Production Request → Work Order → Paint Job → Delivery lineage đã có trên default.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Form đặt nhôm, FIFO theo ngày đơn, lịch sử nhận, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có.

### Purchase authenticated QA

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Full CI và authenticated lifecycle desktop/mobile đã PASS.

### MetaForge MISA-style workspace

- PR `#140` merge SHA: `f6420c70823b969a28b43e3f93004ebd52546adc`.
- Sidebar phân hệ, tab nghiệp vụ, Danh mục tập trung, Meta workspace, report builder và 13 bảng màu đã có trên default.

### Forge branding, account và warehouse PWA

- PR `#142` merge SHA: `8e9882a6143f4cf669724f654ec1b59949b90138`.
- Exact validated head: `24621f221fad2de950d0f58cc39078e43c206f51`.
- Logo Forge hiện tại dùng chung cho landing, login, shell, favicon và PWA.
- Landing/login Forge dùng bố cục hai cột; mobile ưu tiên form đăng nhập.
- Account menu sau login có avatar, đổi mật khẩu và đăng xuất các thiết bị khác.
- App kho điện thoại là bundle riêng tại base `/mobile/warehouse/`, không co giao diện desktop thành mobile.
- Top nav, bottom nav, nút nghiệp vụ lớn và form touch-first.
- Nghiệp vụ: nhập kho, xuất kho, chuyển kho, kiểm kho và tra tồn.
- PWA có manifest standalone, icon thường, icon maskable, shortcut, service worker và offline queue.
- Service worker không cache API/auth response.
- `apps/kho` build desktop và mobile thành hai output riêng; mobile output ở `client/apps/kho/dist-mobile`.

### Finance receivables, payables và advances

- PR `#139` merge SHA: `e404e12ef22d5bc9f2a782820787b4f30d8dce8a`.
- Exact validated head: `0b5a629989dfa2b7972dafbda39134ad9b4bdda6`.
- Due date và AR/AP aging đã có.
- Payment Entry hỗ trợ partial payment, explicit unallocated amount và advance.
- Payment Allocation dùng append-only Payment Ledger, giữ company/party/account/currency context và không tạo lại cash GL.
- Advance Balance, Party Statement và Debt Summary đã có query/report path.
- Migration `0030`, `0031`, `0032`, metadata, permission, worker wiring và regression tests đã có.
- Guard advance transaction-currency và base-currency đã tách điều kiện để mã integrity không phụ thuộc thứ tự trigger SQLite.

### Alumdoor public landing redesign

- PR `#145` merge SHA: `898b19d0c58c84a32f99d73dfe0bf33f9ec78dd6`.
- Exact validated head: `73dc960e3c9685708ac1b1e51c7eb5d2c1a71a9a`.
- Landing Alumdoor guest đã được thiết kế lại theo cấu trúc thương hiệu/sản phẩm công khai trên `alumdoor.vn`, giữ form đăng nhập nội bộ trong cùng trải nghiệm.
- Browser QA PASS desktop/tablet/mobile, gồm dark/reduced-motion, login, no horizontal overflow và link VIP-ST500.

## Chưa release production

- Chưa map `client/apps/kho/dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa chạy authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên môi trường release.
- Landing Alumdoor mới đã merge code nhưng chưa có lệnh release/deploy Cloudflare trong đợt này.
- Chưa deploy Cloudflare và chưa sửa production secrets/DNS.

## Business backlog còn lại

1. Hoàn tất print design PR `#141`: exact-head CI với Acceptance và visual review năm mẫu.
2. Print P1 tiếp: Sales Invoice, Payment Entry, Purchase Receipt.
3. Daily detailed ledger snapshot/freeze/adjustment.
4. Warranty, defects, supplier hold/offset và capacity/overtime.
5. End-to-end acceptance xuyên Sales, Production, Inventory, Delivery, Finance và Warranty.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
