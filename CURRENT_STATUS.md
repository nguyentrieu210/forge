# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Latest runtime-changing default commit: `898b19d0c58c84a32f99d73dfe0bf33f9ec78dd6`.
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
- Landing Alumdoor guest đã được thiết kế lại hoàn toàn theo cấu trúc thương hiệu/sản phẩm công khai trên `alumdoor.vn`, giữ form đăng nhập nội bộ trong cùng trải nghiệm.
- Có hero `Cửa cuốn Alumdoor / Nâng tầm cửa Việt`, navigation, 4 nhóm dịch vụ, phần giới thiệu, liên hệ/khu vực hỗ trợ và footer.
- Danh mục hiển thị 4 nhóm: cửa cuốn Úc, cửa cuốn Đức, cửa cuốn lưới và phụ kiện; tên sản phẩm, giá tham chiếu và link dẫn về trang Alumdoor gốc.
- VIP-ST500 dẫn đúng trang chi tiết `https://alumdoor.vn/san-pham/cua-cuon-duc-vipst500/`.
- Nội dung mô tả được viết lại từ thông tin công khai; không chép nguyên văn dài hoặc commit ảnh website bên thứ ba vào repository.

### Validation Alumdoor PR `#145`

- Exact head `73dc960e3c9685708ac1b1e51c7eb5d2c1a71a9a`.
- CI `30687756129`: SUCCESS — tests, typecheck, build.
- PR Validation `30687756103`: SUCCESS.
- Sales Feature CI `30687756100`: SUCCESS.
- Purchase Feature CI `30687756117`: SUCCESS.
- Inventory and Manufacturing CI `30687756108`: SUCCESS.
- UI Pull Request Validation `30687756105`: SUCCESS.
- Alumdoor browser QA PASS trên desktop, tablet và mobile; kiểm hero, login, danh mục sản phẩm, link VIP-ST500, contact data, dark/reduced-motion contract và horizontal overflow.

## Chưa release production

- Chưa map `client/apps/kho/dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa chạy authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên môi trường release.
- Landing Alumdoor mới đã merge code nhưng chưa có lệnh release/deploy Cloudflare trong đợt này.
- Chưa sửa production secrets/DNS.

## Business backlog còn lại

1. Daily detailed ledger snapshot/freeze/adjustment.
2. Warranty, defects, supplier hold/offset và capacity/overtime.
3. End-to-end acceptance xuyên Sales, Production, Inventory, Delivery, Finance và Warranty.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
