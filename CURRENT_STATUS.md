# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head khi đồng bộ print epic: `f1e70cfbece9b162082974b2bdc8a4feb4ddf5b8`.
- Latest runtime-changing default commit: `e404e12ef22d5bc9f2a782820787b4f30d8dce8a`.
- GitHub là nguồn sự thật cho current branch head, CI, PR và release evidence.

## In progress — Print design PR #141

- Branch: `feat/print-design-sales-documents-20260801`.
- PR: `#141` — `feat(print): add Alumdoor sales order print workspace`.
- Đã đồng bộ lại trên current default `f1e70cfbece9b162082974b2bdc8a4feb4ddf5b8`; không bỏ các thay đổi Warehouse PWA và Finance đã merge.
- Sidecar `server/briefs/alumdoor-v2.prints.json` được ghép trước schema validation và compile; loader hỗ trợ đường dẫn chuỗi và `file:` URL.
- `Đơn bán hàng ALUMDOOR` cho Sales Order: A4 portrait, 13 cột, kích thước/số bộ/số lượng/đơn giá/mô tơ-phụ kiện/ghi chú lắp đặt.
- `Phiếu giao hàng / lắp đặt ALUMDOOR` cho Delivery Note: A4 portrait, 11 cột, không in giá, có đơn nguồn, địa chỉ/ngày/đội lắp, lái xe, biển số, kho xuất, khối lượng, checklist và chữ ký.
- Đã sửa regression Delivery Note chờ sai `Xường` → `Xưởng`, sửa `overflow-wrap:anywhere`, tagline `ĐỨC` và alt ảnh bị lỗi mã hóa.
- Exact-head CI phải chạy lại sau merge-base sync trước khi gọi đợt Delivery Note hoàn tất.
- Review trực quan HTML preview/PDF bằng dữ liệu dài vẫn là gate trước merge.

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

### Finance receivables, payables và advances

- PR `#139` merge SHA: `e404e12ef22d5bc9f2a782820787b4f30d8dce8a`.
- Exact validated head: `0b5a629989dfa2b7972dafbda39134ad9b4bdda6`.
- Due date và AR/AP aging đã có.
- Payment Entry hỗ trợ partial payment, explicit unallocated amount và advance.
- Payment Allocation dùng append-only Payment Ledger, giữ company/party/account/currency context và không tạo lại cash GL.
- Advance Balance, Party Statement và Debt Summary đã có query/report path.
- Migration `0030`, `0031`, `0032`, metadata, permission, worker wiring và regression tests đã có.
- Guard advance transaction-currency và base-currency đã tách điều kiện để mã integrity không phụ thuộc thứ tự trigger SQLite.

### Validation Finance PR #139

- Exact-head full tests: PASS.
- Typecheck: PASS.
- Build: PASS.
- PR Validation: PASS.
- Sales Feature CI: PASS.
- Purchase Feature CI: PASS.
- Inventory and Manufacturing CI: PASS.
- UI Pull Request Validation: PASS.

## Chưa release production

- Chưa map `client/apps/kho/dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa chạy authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên môi trường release.
- Chưa deploy Cloudflare và chưa sửa production secrets/DNS.

## Business backlog còn lại

1. Hoàn tất print design PR `#141`: exact-head CI, preview/PDF dữ liệu dài, Production Request và Aluminum Cut Sheet.
2. Daily detailed ledger snapshot/freeze/adjustment.
3. Warranty, defects, supplier hold/offset và capacity/overtime.
4. End-to-end acceptance xuyên Sales, Production, Inventory, Delivery, Finance và Warranty.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
