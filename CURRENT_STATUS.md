# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head: `f6420c70823b969a28b43e3f93004ebd52546adc`.
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
- Exact-head CI, build/typecheck và Playwright desktop + Pixel 7 + iPhone-size viewport đã PASS trước merge.

## Forge branding + account + warehouse PWA — ACTIVE

- Branch: `feat/mobile-pwa-brand-account-warehouse`.
- PR: `#142`.
- Base: `f6420c70823b969a28b43e3f93004ebd52546adc`.
- Implementation head trước status docs: `21534cfc9bdb76fdd9c1dca105f6d478c8ac28dc`.

### Đã triển khai

- Logo chuẩn tím → hồng, chữ A trắng và ba nét cánh ngang dùng chung cho landing, login, shell, favicon và PWA.
- Landing/login bố cục hai cột cân đối; mobile ưu tiên form đăng nhập.
- Account menu sau login có avatar, đổi mật khẩu và đăng xuất các thiết bị khác.
- Bundle app kho điện thoại độc lập tại base `/mobile/warehouse/`; không co giao diện desktop thành mobile.
- Top nav, bottom nav, nút nghiệp vụ lớn và form touch-first.
- Nghiệp vụ: nhập kho, xuất kho, chuyển kho, kiểm kho và tra tồn.
- PWA manifest, icon thường, icon maskable, shortcut và service worker.
- Service worker không cache API/auth response.
- Offline queue cho thao tác kho khi mất mạng.
- `apps/kho` build desktop và mobile thành hai output riêng; mobile output ở `client/apps/kho/dist-mobile`.
- Playwright gate dùng bundle build thật và kiểm hai kích thước điện thoại.

### Validation hiện tại

- Frozen install: PASS trên các head trước.
- Frontend lint: PASS.
- TypeScript mobile: PASS.
- Vite mobile bundle: PASS trên head `c5c9714e039b6f8bbfd599b411fdb72b970be13c`.
- Full exact-head CI cho logo chuẩn và Playwright mobile mới: đang chạy sau status docs.

### Chưa hoàn tất

- Chưa merge PR `#142`.
- Chưa có authenticated backend lifecycle riêng cho bốn phiếu kho mobile.
- Chưa map/deploy `dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa deploy Cloudflare và chưa thay production secrets/DNS.

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
