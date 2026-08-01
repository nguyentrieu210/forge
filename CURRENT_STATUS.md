# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head trước epic này: `f916d066f9b45b1c3a5238259be9d6953d6cf0f3`.
- Active epic branch: `feat/alumdoor-pwa-real-brand-assets`.
- GitHub là nguồn sự thật cho current branch head, CI, PR và release evidence.

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

### Forge branding, account và warehouse PWA source

- PR `#142` merge SHA: `8e9882a6143f4cf669724f654ec1b59949b90138`.
- Exact validated head: `24621f221fad2de950d0f58cc39078e43c206f51`.
- Account menu sau login có avatar, đổi mật khẩu và đăng xuất các thiết bị khác.
- App kho điện thoại là bundle riêng tại base `/mobile/warehouse/` với top nav, bottom nav, nhập/xuất/chuyển/kiểm kho, tra tồn và offline queue.
- Service worker không cache API/auth response.
- `apps/kho` build desktop và mobile; mobile output ở `client/apps/kho/dist-mobile`.
- Trước epic hiện tại, output mobile chưa được stage vào Gateway production assets nên `/mobile/warehouse/` chưa có trên production.

### Finance receivables, payables và advances

- PR `#139` merge SHA: `e404e12ef22d5bc9f2a782820787b4f30d8dce8a`.
- Exact validated head: `0b5a629989dfa2b7972dafbda39134ad9b4bdda6`.
- Due date, AR/AP aging, partial/unallocated Payment Entry, Advance Balance, Payment Allocation, Party Statement và Debt Summary đã có.

### Alumdoor public landing redesign

- PR `#145` merge SHA: `898b19d0c58c84a32f99d73dfe0bf33f9ec78dd6`.
- Exact validated head: `73dc960e3c9685708ac1b1e51c7eb5d2c1a71a9a`.
- Landing Alumdoor guest có hero, navigation, dịch vụ, danh mục sản phẩm, liên hệ và login nội bộ.
- PR `#148` merge SHA `d8997dc6ea2231c5d546b24cf89b9cc14b456ff5` đã kích hoạt luồng Gateway production cho landing.
- Ops snapshot PR `#149` merge SHA `f916d066f9b45b1c3a5238259be9d6953d6cf0f3`.

## Active — Alumdoor PWA + official brand/media

Branch: `feat/alumdoor-pwa-real-brand-assets`.

Đã triển khai trên branch, đang chờ exact-head CI/PR:

- `stage-client-bundle.mjs` stage cả runtime và `client/apps/kho/dist-mobile` vào Gateway `public/mobile/warehouse`.
- `--check` bắt buộc có mobile `index.html`, manifest và service worker.
- PWA đổi title/manifest/theme sang `Alumdoor Kho`, palette cam Alumdoor.
- Icon thường và maskable cùng origin dùng logo chính thức được tham chiếu từ asset `alumdoor.vn`.
- Shared logo trên `alu.kairo.vn`, preview Alumdoor và `/mobile/warehouse/` dùng logo Alumdoor chính thức thay mark Forge tím-hồng.
- Landing dùng logo Alumdoor chính thức, hero dùng ảnh sản phẩm VIP-ST500 thật và card sản phẩm dùng media từ website Alumdoor thay placeholder đồ họa.
- Landing có nút `App kho điện thoại` dẫn thẳng `/mobile/warehouse/`.
- Playwright contract khóa logo/media chính thức, PWA manifest/icon, nghiệp vụ mobile và không tràn ngang.
- Chưa merge và chưa deploy thay đổi của epic này tại thời điểm cập nhật file.

## Chưa hoàn tất / cần evidence

- Exact-head full CI của branch active.
- Merge PR feature.
- Gateway production deploy exact merge SHA và Cloudflare Worker version ID.
- Production smoke `alu.kairo.vn`, `/mobile/warehouse/`, manifest, icon và service worker.
- Authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên production vẫn chưa được chạy; không mutate dữ liệu khách hàng chỉ để smoke giao diện.

## Business backlog còn lại

1. Daily detailed ledger snapshot/freeze/adjustment.
2. Warranty, defects, supplier hold/offset và capacity/overtime.
3. End-to-end acceptance xuyên Sales, Production, Inventory, Delivery, Finance và Warranty.

## Release boundary

- User đã yêu cầu deploy epic giao diện/PWA hiện tại; dùng protected `Release Gateway Production` sau merge exact-head xanh.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production cho smoke UI/PWA.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
