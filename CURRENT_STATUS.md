# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head: `8e9882a6143f4cf669724f654ec1b59949b90138`.
- GitHub là nguồn sự thật cho code, CI, PR và release evidence.

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
- Logo chuẩn tím → hồng, chữ A trắng và ba nét cánh ngang dùng chung cho landing, login, shell, favicon và PWA.
- Landing/login Forge dùng bố cục hai cột; mobile ưu tiên form đăng nhập.
- Alumdoor vẫn giữ white-label landing, palette cam-xám, title và browser contract riêng.
- Account menu sau login có avatar, đổi mật khẩu và đăng xuất các thiết bị khác.
- App kho điện thoại là bundle riêng tại base `/mobile/warehouse/`, không co giao diện desktop thành mobile.
- Top nav, bottom nav, nút nghiệp vụ lớn và form touch-first.
- Nghiệp vụ: nhập kho, xuất kho, chuyển kho, kiểm kho và tra tồn.
- PWA có manifest standalone, icon thường, icon maskable, shortcut, service worker và offline queue.
- Service worker không cache API/auth response.
- `apps/kho` build desktop và mobile thành hai output riêng; mobile output ở `client/apps/kho/dist-mobile`.

### Validation PR `#142`

- Frozen install: PASS.
- Frontend lint: PASS.
- Test, typecheck và full build: PASS.
- PR Validation, Sales, Purchase, Inventory và CI: PASS.
- MetaForge workspace browser QA: PASS.
- Alumdoor landing/login browser QA trên desktop, tablet và mobile: PASS.
- Warehouse PWA browser QA trên Pixel 7 và viewport `390 × 844`: PASS.

## Chưa release production

- Chưa map `client/apps/kho/dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa chạy authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên môi trường release.
- Chưa deploy Cloudflare và chưa sửa production secrets/DNS.

## Business backlog còn lại

1. Finance hoàn chỉnh: AR/AP aging, Payment Allocation, Party Statement, Debt Summary và Advance Balance.
2. Daily detailed ledger snapshot/freeze/adjustment.
3. Warranty, defects, supplier hold/offset và capacity/overtime.
4. End-to-end acceptance xuyên Sales, Production, Inventory, Delivery, Finance và Warranty.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
