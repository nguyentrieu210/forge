# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Current default head trước khi đồng bộ epic: `9e0a9a5634afea5ee86fe71ec69e720a995c7a61`.
- Active epic branch: `feat/alumdoor-pwa-real-brand-assets` (PR `#150`).
- GitHub là nguồn sự thật cho current branch head, CI, PR và release evidence.

## In progress — Print design PR #141

- Branch: `feat/print-design-sales-documents-20260801`.
- Nhánh hoàn thiện local: `fix/print-router-missing-state`, dựng từ head print `53e664bcb376e9140de2cb70a619cc0c54c6c971`.
- PR: `#141` — `feat(print): add Alumdoor operational print formats`.
- Sidecar `server/briefs/alumdoor-v2.prints.json` nối với các mẫu in sẵn có trước schema validation/compile; không ghi đè mảng `prints` của brief gốc.
- Loader hỗ trợ filesystem path và `file:` URL, có regression riêng.
- `Đơn bán hàng ALUMDOOR` — Sales Order, A4 portrait, 13 cột = `100%`.
- `Phiếu giao hàng / lắp đặt ALUMDOOR` — Delivery Note, A4 portrait, 11 cột = `100%`, không in giá, có checklist và ba khu vực ký.
- `Phiếu yêu cầu sản xuất ALUMDOOR` — Production Request, A4 portrait, 14 cột = `100%`.
- `Phiếu cắt nhôm ALUMDOOR` — Cut Order, A4 portrait, 13 cột = `100%`; bundle lô mẹ + bundle đầu thừa giữ nguyên để truy vết, QR chứng từ dùng filter `qrcode` authoritative của renderer.
- QR Cut Order được regression qua renderer thật và phải ra `data:image/gif;base64,...`, không phải URL/token nhạy cảm.
- `Biên bản bàn giao / nghiệm thu ALUMDOOR` — Delivery Note, `default: false`, A4 portrait, 11 cột = `100%`; dùng dữ liệu giao/lắp thật và để vùng kết quả/checklist cho ký tay tại công trình.
- Cả năm mẫu dùng cùng brand system với Purchase Order mặc định `Đơn nhập hàng ALUMDOOR`: logo `/alumdoor-order-logo.png` giống từng byte với logo gốc nhúng, company header `/alumdoor-company-header.png`, letterhead `194mm × 17mm`, lề trên `23.7mm` và tiêu đề cam `#f15a24`.
- Regression renderer dùng dữ liệu dài cho Sales Order, Delivery Note, Production Request, Cut Order và Biên bản nghiệm thu.
- Runtime `/print/:doctype/:name?format=<tên mẫu>` tải danh sách mẫu theo đúng quyền trên chứng từ, cho chọn mẫu phụ và giữ lựa chọn trong URL.
- DocType chưa có mẫu in hiện trạng thái “Chưa có mẫu in” với đường quay lại chứng từ; không còn biến trường hợp này thành khối lỗi đỏ.
- Đã sửa false-negative làm CI PR đỏ: test QR kiểm nội dung text sau khi bỏ thẻ HTML thay vì đòi số chứng từ đứng sát nhãn `<b>` trong raw HTML.
- Verify local: typecheck toàn repo PASS; client selfcheck `88/88`; tenant facade `72/72`; server unit `746/746` + toàn bộ SQL migration PASS; full server/client build PASS.
- Exact-head Acceptance `c7d93e77d4a062a095cccc916e50127fcc603595`: 6/6 workflow SUCCESS.
- Run IDs Acceptance: CI `30689143646`, PR Validation `30689143618`, UI `30689143691`, Purchase `30689143635`, Sales `30689143650`, Inventory/Manufacturing `30689143661`.
- QR Cut Order đang ở staging và phải qua exact-head CI sau khi đưa vào PR branch.
- Visual QA A4 năm mẫu PASS: cả hai ảnh thương hiệu tải thành công, bảng nằm trong vùng in `194mm`, vùng chữ ký thấp nhất vẫn nằm trong trang A4 và không có tràn ngang.
- Production đã được phát hành trực tiếp theo chỉ đạo: Gateway version `aff41705-29f2-443f-be5c-fee161061097`, tenant Worker hiện hành và năm print format đã cài vào D1 sau backup; gate còn lại trước merge chỉ là exact-head CI và PR mergeable với current default.

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
- Landing Alumdoor guest đã được thiết kế lại theo cấu trúc thương hiệu/sản phẩm công khai trên `alumdoor.vn`, giữ form đăng nhập nội bộ trong cùng trải nghiệm.
- Browser QA PASS desktop/tablet/mobile, gồm dark/reduced-motion, login, no horizontal overflow và link VIP-ST500.

## Active — Alumdoor PWA + official brand/media

Branch: `feat/alumdoor-pwa-real-brand-assets`; PR `#150`.

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

## Hoàn thiện quy trình 25.7 trên `main`

### PR #146 — Sổ chi tiết hằng ngày (đang trên nhánh tính năng)

- Nhánh `feat/daily-detailed-ledger-20260801`, chưa merge và chưa deploy.
- Quyền truy cập/cập nhật/khóa/điều chỉnh chỉ dành cho ba nhóm nghiệp vụ: Kế toán tổng hợp, Kế toán trưởng và Giám đốc; `Administrator` giữ quyền cứu hộ nền tảng.
- Ảnh chụp hằng ngày bao phủ sáu miền: Bán hàng, Mua hàng, Kho, Sản xuất, Bảo hành/Lỗi và Tài chính.
- Runtime có màn “Sổ chi tiết hằng ngày” cho desktop và mobile, gồm Cập nhật, Đối chiếu, Khóa sổ và Điều chỉnh append-only.
- Brief Alumdoor `2.0.35` khai báo màn và một DocType quyền riêng để menu được lọc trước khi gửi xuống client.
- Sổ ngày nhận cả dòng `ordered` của Sales Order mới, không phụ thuộc đã có Delivery Note.

### Hoàn thiện quy trình 25.7 trên cùng nhánh (production 2.0.35 đã deploy 2026-08-01)

- Trung tâm vận hành hợp nhất đơn/ngày giao/khách/phụ trách/nhóm hàng/tiền thu/trạng thái giao-sản xuất-lỗi và ghi chú từ chứng từ gốc.
- Bảo hành/lỗi bắt buộc truy về Sales Order, Delivery Note đã ghi sổ, ngày giao và Item; motor/pin tính hạn 12 tháng; nguyên nhân chỉ nhận bốn nhóm chuẩn.
- Lỗi NCC ở trạng thái chờ đổi; Kế toán tổng hợp/Kế toán trưởng xác nhận mới tạo Giấy báo Nợ nháp gắn Purchase Invoice. Khóa idempotency ngăn tạo hai giấy cho một hồ sơ.
- Lỗi sản xuất bắt buộc người chịu trách nhiệm; lỗi do khách tính chi phí từ từng dòng công việc.
- Định mức sản xuất hỗ trợ `m2`, `set`, `operation`, `batch`; tải ca 8 giờ, số người/ca, hiệu suất, workstation, mẻ sơn theo màu và tăng ca.
- Giao hàng theo ngày có preview, kết quả từng đơn, khóa `ngày + Sales Order`, tạo Delivery Note nháp và trả danh sách chứng từ để in.
- Migration `0034_alumdoor_process_25_7.sql`, Golden Order contract và tài liệu `docs/brd-v2/PROCESS_25_7_COMPLETION.md` đã có.

- Chưa map `client/apps/kho/dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa chạy authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên môi trường release.
- Gateway, tenant Worker, app Worker, metadata 2.0.35 và hai migration 0033/0034 đã deploy trực tiếp từ local; production health/browser smoke đạt.
- Không sửa production secrets hoặc DNS.

## Business backlog còn lại

1. Hoàn tất PR `#150` trên nền `main` mới và phát hành PWA kho cùng Gateway.
2. Chạy authenticated Golden Order trên tenant staging/release với dữ liệu thử có cleanup và đối chiếu bản in theo máy in khách hàng.
3. Nâng màn Trung tâm vận hành từ input JSON kỹ thuật sang form nghiệp vụ cho năng lực/bảo hành.
4. Pilot end-to-end với dữ liệu thật xuyên Sales, Production, Inventory, Delivery, Finance và Warranty.

## Release boundary

- User đã yêu cầu deploy epic giao diện/PWA hiện tại; dùng protected `Release Gateway Production` sau merge exact-head xanh.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production cho smoke UI/PWA.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
