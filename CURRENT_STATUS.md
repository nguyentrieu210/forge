# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

- Alumdoor production đang chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`. Full production release run `30707135053` và protected metadata installer run `30707517624` đều PASS; Alumdoor Meta `2.1.0` đã cài và xác minh trên tenant `alu`.
- Executable code head mới nhất trên `main` sau đợt visual polish là merge `4afb422e8efb8bed624b96d7f3145ec3c5a6a8eb`; production chưa được deploy theo merge này.

## Đã merge — MetaForge visual polish

- PR `#165` merge tại `4afb422e8efb8bed624b96d7f3145ec3c5a6a8eb`; exact validated head `e3deef21f8db0c8506bd17088ec8a4cf5ca05d45`.
- File code thay đổi: `client/packages/shell/src/WorkspaceAppShell.tsx`.
- Tabs nghiệp vụ dùng segmented/pill hierarchy; màn Quy trình có header phân hệ, thống kê nhanh, flow card, step badge/connector, Danh mục nhanh và Báo cáo theo cùng semantic theme tokens để tự thích ứng toàn bộ brand variants.
- Không đổi Meta contract, routing, permission hoặc dữ liệu.
- CI exact-head PASS: CI `30710823875`, PR Validation `30710823870`, UI Pull Request Validation `30710823866`, Sales `30710823872`, Purchase `30710823871`, Inventory/Manufacturing `30710823869`. MetaForge workspace browser QA và Alumdoor browser QA đều PASS.
- Không deploy Cloudflare, không sửa production secrets/DNS và không mutate dữ liệu production trong đợt này.

## Đã merge — Canonical DocType Meta và Alumdoor completeness

- PR `#154` đã merge tại `6c89e1a9227e989fd8b08d6e55b35ce2e74d87c7`.
- PR giao diện/PWA `#150` đã merge đúng validated head `dbbca94802593f8e6541eff9390707eee7bc63dd`; merge commit `2a8b9efaa60f6faa43d978b3fefc0741f1ce5a2d`.
- Canonical Meta đã có `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced` và `dirtyGuard`; compiler tự sinh hợp đồng đầy đủ nhưng vẫn tương thích brief cũ.
- Form tạo nhanh chỉ render field `quick`; form đầy đủ render `expanded`; field `internal` vẫn được giữ trong schema gốc để server/default/link xử lý nhưng không lộ thành ô nhập.
- Field do hệ thống/workflow/công thức sở hữu bị khóa ở parser, manifest gate và runtime API; field ẩn không thể bị client tự đặt hoặc đổi bằng request trực tiếp.
- Link ra ngoài app phải khai `externalDocTypes`; `User` dùng provider danh bạ tenant, chỉ trả System User đang hoạt động. Table phải trỏ tới child DocType do app sở hữu.
- Biểu đồ Tổng quan chỉ xuất hiện khi Meta khai rõ và phải dựa trên report thật, quyền thật, route drill-down thật; không còn tự dựng biểu đồ từ workflow. Alumdoor khai 3 biểu đồ có fallback khi chưa có dữ liệu.
- Alumdoor package nâng lên `2.1.0`. Completeness gate hiện chốt 74 DocType, 969 field, 255 Link, 27 child table, 6 external DocType, 12 report, 3 chart; 74 hiện là lát cắt Alumdoor, không phải giới hạn của nền tảng ERPNext.
- Meta thiết kế ERP Wave 1 vừa merge cũng đã được chuẩn hóa cùng hợp đồng: 19 DocType, 157 field, 29 external DocType; không còn field thiếu `surface` hoặc `set_once` thiếu cờ Frappe tương ứng.
- Local gates PASS: full 772 server unit tests, toàn bộ SQL migration tests, server/client typecheck, client lint, 89 nhóm client selfcheck, toàn bộ brief dry-run và `ALUMDOOR_META_COMPLETENESS_PASS`.
- Package `2.1.0` đã cài vào tenant production bằng workflow bảo vệ; không đổi DNS và không dùng dữ liệu khách hàng để smoke.

## Hoàn tất — protected installer Alumdoor Meta `2.1.0`

- PR `#157` đã merge tại `8786c5707ac4d225f7a63561219dd629d080584d`; workflow protected và hậu kiểm Quick/Full Form, User Link, chart/fallback/report đã ở `main`.
- Run đầu `30705986949` đã PASS backup/checksum, hai restore drill và cleanup nhưng dừng trước khi ghi Alumdoor vì tenant cũ thiếu standard DocType. Forward-fix PR `#158` thêm explicit System-Manager-only POST qua cookie + CSRF; PR `#159` sửa actionlint; PR `#160` đồng bộ release manifest.
- Full production release run `30707135053` khóa exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55` và PASS. Tenant run `30707301344` → Worker version `d7d5b998-6c64-414f-952e-5224fdab3908`; app run `30707359325` → version `0e11508a-713f-42a5-b8c3-a104f133c8fc`; gateway run `30707397711` → version `ef3b4a9a-38f2-4534-86b8-1e6bda2d3ea1`. Evidence tổng hợp artifact `8820777029`.
- Protected installer run `30707517624` PASS: backup artifact `8820790995`, SHA-256 `30c3f4b997de2e3fafbdd323eaa837c3c497b0b1b4919edca1d327f710b99bf4`; cùng backup khôi phục thành công hai lần vào D1 cô lập; guarded cleanup PASS; evidence artifact `8820857133`.
- Installer cấp 63 standard DocType, 4 print format và 18 role, sau đó nâng Alumdoor lên `2.1.0` với 74 DocType, 1 workflow, 57 fixture. Package completeness: 969 field, 255 Link, 12 report, 3 chart, 77 nav; read-only conformance Quick/Full Form, User Link, context dimension, health 200 và guest boot 403 đều PASS.
- Hai GitHub Environment secret dùng tạm cho installer đã xóa ngay sau run thành công; production environment chỉ còn `CLOUDFLARE_API_TOKEN`.

## Active — Organization, HRMS và VN Accounting

- Branch: `feat/company-branch-department-hrms-accounting-20260801` từ `main`.
- HRM `1.3.0`: Company route, Branch, Department, Employee mở rộng, hợp đồng, ca/phân ca, nghỉ phép, chấm công, tạm ứng và cấu trúc lương.
- VN Accounting `1.0.0`: chính sách kế toán, legal rule versioning, kỳ Open/Soft Closed/Hard Locked và hạch toán bảng lương có source/rule/approval trace.
- Migration `0035_organization_hrms_vn_accounting.sql` khóa trùng nhân viên/chấm công/hạch toán lương và cưỡng chế kỳ khóa tại D1.
- Chính sách pháp lý dùng TT99/TT133/TT58/TT132-legacy/TT200-legacy theo effective date; không đóng cứng thuế/PIT/XML.
- Tài liệu nghiệm thu: `docs/brd-v2/ORGANIZATION_HRMS_VN_ACCOUNTING.md`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Current executable code head sau MetaForge visual polish: `4afb422e8efb8bed624b96d7f3145ec3c5a6a8eb`.
- Production vẫn ở Alumdoor release SHA `b46d3228`; merge visual polish chưa có production-release evidence.
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

## Đã hoàn tất — Alumdoor PWA + official brand/media

PR `#150` đã merge; chức năng có trong exact production SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.

Đã có trên production:

- `stage-client-bundle.mjs` stage cả runtime và `client/apps/kho/dist-mobile` vào Gateway `public/mobile/warehouse`.
- `--check` bắt buộc có mobile `index.html`, manifest và service worker.
- PWA đổi title/manifest/theme sang `Alumdoor Kho`, palette cam Alumdoor.
- Icon thường và maskable cùng origin dùng logo chính thức được tham chiếu từ asset `alumdoor.vn`.
- Shared logo trên `alu.kairo.vn`, preview Alumdoor và `/mobile/warehouse/` dùng logo Alumdoor chính thức thay mark Forge tím-hồng.
- Landing dùng logo Alumdoor chính thức, hero dùng ảnh sản phẩm VIP-ST500 thật và card sản phẩm dùng media từ website Alumdoor thay placeholder đồ họa.
- Landing có nút `App kho điện thoại` dẫn thẳng `/mobile/warehouse/`.
- Playwright contract khóa logo/media chính thức, PWA manifest/icon, nghiệp vụ mobile và không tràn ngang.
- Đợt chỉnh giao diện hiện tại đã đối chiếu trực tiếp `alumdoor.vn`: top bar cam, header trắng, navigation than đậm, hero video, ba nhóm dịch vụ, bố cục sản phẩm và footer được đưa về cùng ngôn ngữ nhận diện.
- Logo hiện hành `Logo-Alumdoor.png` và media sản phẩm đang niêm yết được lưu cùng source frontend; landing/PWA không còn phụ thuộc asset logo 2022 hoặc placeholder CSS.
- Giá và link nổi bật đã đồng bộ theo website tại thời điểm 2026-08-01: VIP-ST700, VIP-ST500, ALVIP50, AL50 và Alumroll.
- App kho đổi toàn bộ nhãn `Forge Kho` còn sót sang `Alumdoor Kho`, dùng palette cam `#f45b24` và logo hiện hành.
- Local validation: full `pnpm test` PASS; client lint/typecheck/build PASS; Playwright UI desktop/tablet/mobile và warehouse Pixel 7/compact phone `17/17` PASS.
- Full production release run `30707135053` xác nhận Gateway/UI, HTTP smoke và browser desktop/mobile đều PASS.

## Chưa hoàn tất / cần evidence tiếp theo

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

## Production evidence — 2026-08-01

- Exact branch head: `f2f277eb999d213521cd40a126a01a4350aeeca5`; PR `#150`; GitHub required checks `6/6` PASS, merge state `CLEAN`.
- Theo yêu cầu deploy trực tiếp từ máy local đã đăng nhập Cloudflare: client build có embedded SHA, stage runtime + warehouse PWA, stage check và Wrangler dry-run đều PASS.
- Gateway production `cloudforge-gateway` đã deploy; Cloudflare Version ID: `a995e0a0-d85b-4cf0-a7cc-16224871cca6`.
- Smoke PASS: `https://alu.kairo.vn/` 200 và có exact SHA; `/mobile/warehouse/`, manifest, service worker và `/alumdoor/logo.png` đều 200; guest boot 403 đúng auth boundary.
- Không thay secrets/DNS, không migrate hay mutate dữ liệu tenant. PR `#150` chưa merge tại thời điểm ghi evidence này.

### UI hotfix sau khi duyệt demo

- Deployed code SHA: `3166a793550eda28d15280c33090856a3c08abb9`.
- Cloudflare Gateway Version ID: `8ad03b38-8052-4ce3-b445-714d0b4df090`.
- Landing không còn autofocus cuộn xuống login; production browser smoke xác nhận `scrollY=0`, hero hiển thị và 12 product images load thành công.
- Ba category card đầu trang đã thay asset đen bằng media sản phẩm Alumdoor; hero có local product poster/fallback khi video nguồn chậm.
- Favicon và PWA icon dùng mark A vuông 192/512, không nén nguyên wordmark vào icon nhỏ. Warehouse login đã bỏ logo lặp/cắt; header chỉ còn tên app và mô tả ngắn.
- Lint, typecheck và exact-SHA production build/stage/stage-check/Wrangler dry-run/deploy PASS. Targeted Playwright suite bị webServer startup timeout; production Chromium smoke thay thế đã PASS cho các lỗi user báo.

### UI/PWA hardening đang thực hiện

- Shell desktop Alumdoor dùng riêng logo ngang, bỏ chữ app ghép cạnh logo.
- Alumdoor mở bộ chọn đủ 13 bảng màu sáng/tối; màu mặc định vẫn là Đất nung và có theme gradient Hồng cánh sen tương phản cao.
- App kho điện thoại chặn tràn ngang, điện thoại dùng lưới nghiệp vụ một cột và tablet/desktop hẹp mới chuyển hai cột.
- Service worker kho chỉ cập nhật app shell từ phản hồi HTML thành công; JSON 401/403 không còn có thể ghi đè cache khởi động.
- Sau khi phiên hết hạn ở route `/print/*`, đăng nhập lại quay về trang chủ thay vì phục hồi màn in của phiên cũ.
- Runtime typecheck, build app kho desktop/mobile và 87 nhóm selfcheck PASS. Full monorepo build trước đó hoàn thành hầu hết app nhưng tiến trình Node Windows sập sau khi `kho-vn` đã build; build kho mục tiêu chạy lại riêng PASS.
- Nhánh sẽ ghép trước release hoàn chỉnh: `feat/print-design-sales-documents-20260801` (PR `#141`). Không ghép nhánh daily ledger vào hotfix giao diện/in.
- Shell sau đăng nhập đã tách Tổng quan, Báo cáo và Danh mục thành mục sidebar; nhóm nghiệp vụ chỉ còn tab Quy trình và các màn chứng từ.
- Màn Quy trình đổi sang sơ đồ bước + truy cập nhanh sinh từ Meta; màn Báo cáo/Danh mục là hub riêng sinh từ group metadata.
- Danh sách có dải tổng nhanh: tổng bản ghi, số dòng đang hiển thị và tối đa hai tổng số của trang hiện tại.
- MetaForge MISA-style E2E PASS `9/9` trên desktop, Pixel 7 và iPhone 13; warehouse authenticated UI PASS `2/2` ở Pixel 7 và 390x844, không tràn ngang.

### Đã hợp nhất Print design PR #141

- Nguồn: `feat/print-design-sales-documents-20260801`, head `76eb64285c6b91b7d27f7de11e4cda4eb50f91c1`.
- Sidecar `server/briefs/alumdoor-v2.prints.json` bổ sung năm mẫu: Đơn bán hàng, Phiếu giao hàng/lắp đặt, Phiếu yêu cầu sản xuất, Phiếu cắt nhôm có QR thật và Biên bản bàn giao/nghiệm thu.
- Các mẫu dùng chung logo/header Alumdoor, khổ A4 và regression dữ liệu dài; QR Cut Order là data URL từ định danh nội bộ, không chứa token hay URL nhạy cảm.
- Runtime `/print/:doctype/:name?format=...` tải danh sách mẫu theo quyền, cho đổi mẫu và giữ lựa chọn trên URL; DocType chưa có mẫu hiển thị empty-state thay vì lỗi đỏ.
- Nhánh in từng được release độc lập ở Gateway version `aff41705-29f2-443f-be5c-fee161061097`; bản đó chưa có UI/PWA mới. Release kế tiếp phải build exact merge head hiện tại để có cả hai phần.

### Production release hoàn chỉnh — 2026-08-01

- Exact code SHA đã build/deploy: `169f18536533272d73b133083e01fb46c91d03b3`; mergeable PR `#150` trỏ đúng head này tại thời điểm release.
- Full server unit + toàn bộ SQL migration PASS; client typecheck/lint/selfcheck/full workspace build PASS; focused print/QR `15/15`, MISA UI `9/9`, warehouse authenticated responsive `2/2` PASS.
- Runtime + PWA được stage với hash `b297bd040b76d320`; stage-check và Wrangler dry-run 70 assets PASS.
- Cloudflare Gateway Version ID: `49093cf1-cc68-4358-9b48-bd29283c7d40`.
- Production HTTP smoke: landing, `/mobile/warehouse/`, manifest và service worker đều 200; HTML chứa full release SHA; service worker là cache v5 có chặn JSON auth ghi đè app shell.
- Production browser smoke: landing `scrollY=0`, overflow `0`, logo ngang rộng `350px`, 18 ảnh tải được; warehouse 390px overflow `0`, đúng một logo và quay về form đăng nhập khi chưa có phiên.
- Không đổi secrets/DNS, không migrate hoặc mutate dữ liệu tenant production trong release giao diện này.

### UI refinement sau phản hồi demo — 2026-08-01

- Commit code: `20b3298d`.
- Logo ngang Alumdoor trong sidebar dùng trọn chiều ngang và tăng chiều cao vùng thương hiệu; không còn logo nhỏ nằm giữa một khung rộng.
- Sidebar xếp Tổng quan trước, tiếp theo là các phân hệ nghiệp vụ; Báo cáo và Danh mục nằm phía dưới các phân hệ, trước nhóm Hệ thống.
- Báo cáo dùng cấu trúc MISA ba vùng: cột nhóm báo cáo bên trái và hai cột liên kết báo cáo bên phải. Danh mục dùng ba cột nhóm dữ liệu với liên kết gọn thay cho lưới thẻ lớn.
- Quy trình dùng node thao tác, số bước và đường nối trực quan, tận dụng toàn bộ chiều ngang nội dung.
- Runtime lọc mọi Experience không có renderer/action/screen tương ứng; URL Experience cũ không còn hiện màn “chưa được triển khai” mà quay về Tổng quan.
- Typecheck shell/runtime, 88 nhóm selfcheck, runtime production build và Playwright MISA UI `9/9` PASS.
- Exact release SHA: `b44bdaa9a9619943c13f4991ba3f0d5417a98a4c`; stage hash `c1df85a58884d6a5`; 70 asset và Wrangler dry-run PASS.
- Gateway production đã cập nhật lên Cloudflare Version ID `fe705d76-a561-4ec9-bc8a-976437d65657`.
- HTTP production smoke PASS: landing, App kho, manifest và service worker đều 200; landing HTML chứa đúng exact release SHA.
- Không đổi DNS/secrets, không migrate hoặc mutate dữ liệu tenant.

### MISA process + mobile/PDF hotfix — 2026-08-01

- Exact code/deploy SHA: `d5bb9ac0824f9100fc48eac21e8dd8765c4dec36`.
- Quy trình dùng đúng bố cục MISA: trục ngang giữa, node nghiệp vụ trên/dưới, cột Báo cáo bên phải và hàng Danh mục nhanh phía dưới; desktop giữ hai vùng và mobile tự xếp một cột không tràn ngang.
- Nút `Xuất PDF` hiển thị trực tiếp cạnh Lưu/Gửi; menu ba chấm chỉ giữ thao tác phụ/nguy hiểm.
- App kho: `Xem tất cả` mở đúng danh sách nghiệp vụ; thanh điều hướng cập nhật URL/tab; tra tồn chọn Kho bằng Link search; chuyển kho chặn kho nguồn = kho đích.
- Typecheck shell/views/kho/runtime, 88 nhóm selfcheck, Playwright MISA `9/9`, warehouse Pixel 7 + 390px `2/2`, runtime/kho/PWA build PASS.
- Stage hash `b8c72b454ff7587b`; 70 asset, stage-check và Wrangler dry-run PASS. Lần deploy đầu gặp Cloudflare OAuth code 10000, `wrangler whoami` làm mới phiên và lần retry thành công.
- Gateway production Version ID `46d87cda-27c2-4a17-8344-b042599fa995`; landing/PWA/manifest/service worker đều HTTP 200, landing chứa đúng exact release SHA; production mobile 390px title/logo đúng và overflow `0`.
- Không đổi DNS/secrets, không migrate hoặc mutate dữ liệu tenant.
- Báo cáo follow-up exact SHA `478ee7890f85851afd7f6a0421423852989b8e9d`: nhóm bên trái đổi thành bộ lọc trạng thái, không dùng anchor nên không còn nhảy xuống cuối trang; chỉ hiển thị nội dung nhóm đang chọn. Danh mục ưu tiên `Vật tư hàng hóa` ở cột đầu.
- Follow-up stage hash `c8d8ad65b0a09e99`, Gateway production Version ID `08c08f49-ca55-4ff0-9c0b-7653b4b7bff5`; HTTP 200 và landing chứa đúng exact SHA.

### Login-only + AI topbar + Tổng quan MISA — 2026-08-01

- Exact code/deploy SHA: `2a36f797ee4554f092cc336371b53654952097e0`; branch đã push lên GitHub.
- Guest tại `alu.kairo.vn` mở thẳng form đăng nhập Alumdoor, không render landing marketing; logo ngang chính thức rộng 300px và ô tài khoản được focus ngay.
- Nút `Hỏi AI` nằm trực tiếp trên topbar sát nút Thông báo; đã bỏ nút AI nổi ở góc, vẫn dùng nguyên panel và API trợ lý hiện có.
- Tổng quan đổi sang bố cục MISA: dải chỉ số lớn, lưới biểu đồ hai cột, tổng chuỗi hiển thị ngay trên từng biểu đồ và các khối công việc/hoạt động đồng bộ nền trắng.
- Typecheck shell/views/runtime, runtime + warehouse production build và Playwright login desktop/mobile `8/8` PASS.
- Stage hash `db4ff4290972e2c0`; 70 assets, stage-check và Wrangler dry-run PASS. Gateway production Version ID `79cf4d16-0bf5-4c18-bad8-99367dc382b5`.
- Production smoke PASS: root/PWA/manifest/logo HTTP 200; root chứa exact SHA; desktop 1440 và mobile 390 đều có login-only, logo 300px, autofocus đúng và overflow `0`.
- PR `#150` hiện `CONFLICTING` và chưa có check cho head mới; đây là việc GitHub còn lại, không ảnh hưởng bundle production vừa kiểm chứng. Không đổi DNS/secrets, không migrate hoặc mutate dữ liệu tenant.
### Mobile navigation + dark sidebar logo hotfix — 2026-08-01

- Exact code/deploy SHA: `8d8353d2b27d24d2e333efb9699ce5571f2887fd`; branch `feat/alumdoor-pwa-real-brand-assets` đã nhập commit mới từ GitHub rồi push lại, không force-push.
- App kho giữ BottomNav cố định và luôn hiển thị cả ở màn chi tiết nghiệp vụ; nội dung có safe-area padding nên không bị thanh điều hướng che.
- Điều hướng tab/chi tiết dùng lịch sử nội bộ; vuốt Back trên điện thoại quay lại màn trước trong app thay vì thoát PWA ngay.
- Logo Alumdoor dùng blend/filter theo theme; vùng logo sidebar đã bỏ nền trắng cứng nên nền tối không còn hiện ô trắng hoặc làm mất wordmark. Wordmark sidebar tăng từ 32px lên 40px trong vùng cao 48px.
- Shell/kho typecheck, runtime + kho desktop/mobile exact-SHA build PASS. Local Playwright trước deploy: login + warehouse responsive `8/8` PASS, gồm BottomNav và Back.
- Stage hash `fdeda6f72d763845`; stage-check, Wrangler dry-run 72 assets và deploy PASS. Gateway production Version ID `437867d0-3083-4e5f-ae33-7ae25872bc13`.
- Production smoke PASS: root và PWA 200; root chứa exact SHA; login title/logo đúng, không tràn ngang. Không đổi DNS/secrets và không mutate dữ liệu tenant.
