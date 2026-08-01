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

### PR #146 — Sổ chi tiết hằng ngày (đang trên nhánh tính năng)

- Nhánh `feat/daily-detailed-ledger-20260801`, chưa merge và chưa deploy.
- Quyền truy cập/cập nhật/khóa/điều chỉnh chỉ dành cho ba nhóm nghiệp vụ: Kế toán tổng hợp, Kế toán trưởng và Giám đốc; `Administrator` giữ quyền cứu hộ nền tảng.
- Ảnh chụp hằng ngày bao phủ sáu miền: Bán hàng, Mua hàng, Kho, Sản xuất, Bảo hành/Lỗi và Tài chính.
- Runtime có màn “Sổ chi tiết hằng ngày” cho desktop và mobile, gồm Cập nhật, Đối chiếu, Khóa sổ và Điều chỉnh append-only.
- Brief Alumdoor `2.0.35` khai báo màn và một DocType quyền riêng để menu được lọc trước khi gửi xuống client.
- Sổ ngày nhận cả dòng `ordered` của Sales Order mới, không phụ thuộc đã có Delivery Note.

### Hoàn thiện quy trình 25.7 trên cùng nhánh (chưa merge/deploy)

- Trung tâm vận hành hợp nhất đơn/ngày giao/khách/phụ trách/nhóm hàng/tiền thu/trạng thái giao-sản xuất-lỗi và ghi chú từ chứng từ gốc.
- Bảo hành/lỗi bắt buộc truy về Sales Order, Delivery Note đã ghi sổ, ngày giao và Item; motor/pin tính hạn 12 tháng; nguyên nhân chỉ nhận bốn nhóm chuẩn.
- Lỗi NCC ở trạng thái chờ đổi; Kế toán tổng hợp/Kế toán trưởng xác nhận mới tạo Giấy báo Nợ nháp gắn Purchase Invoice. Khóa idempotency ngăn tạo hai giấy cho một hồ sơ.
- Lỗi sản xuất bắt buộc người chịu trách nhiệm; lỗi do khách tính chi phí từ từng dòng công việc.
- Định mức sản xuất hỗ trợ `m2`, `set`, `operation`, `batch`; tải ca 8 giờ, số người/ca, hiệu suất, workstation, mẻ sơn theo màu và tăng ca.
- Giao hàng theo ngày có preview, kết quả từng đơn, khóa `ngày + Sales Order`, tạo Delivery Note nháp và trả danh sách chứng từ để in.
- Migration `0034_alumdoor_process_25_7.sql`, Golden Order contract và tài liệu `docs/brd-v2/PROCESS_25_7_COMPLETION.md` đã có.

- Chưa map `client/apps/kho/dist-mobile` vào production route `/mobile/warehouse/`.
- Chưa chạy authenticated backend lifecycle riêng cho bốn phiếu kho mobile trên môi trường release.
- Landing Alumdoor mới đã merge code nhưng chưa có lệnh release/deploy Cloudflare trong đợt này.
- Chưa sửa production secrets/DNS.

## Business backlog còn lại

1. Chạy authenticated Golden Order trên tenant staging/release với dữ liệu thật và đối chiếu bản in theo máy in khách hàng.
2. Merge/release/migrate production chỉ sau khi PR/CI và chủ dự án phê duyệt.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
