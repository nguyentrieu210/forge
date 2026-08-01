# NEXT TASKS

Ngày cập nhật: **2026-08-02**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## DONE — MetaForge visual polish

- PR `#165` merge vào `main` tại `4afb422e8efb8bed624b96d7f3145ec3c5a6a8eb`; exact validated head `e3deef21f8db0c8506bd17088ec8a4cf5ca05d45`.
- Tabs nghiệp vụ chuyển sang segmented/pill rõ active state; màn Quy trình có header phân hệ, thống kê nhanh, flow card, step badge, connector, Danh mục nhanh và panel Báo cáo đồng nhất semantic theme tokens.
- Scope code chỉ `client/packages/shell/src/WorkspaceAppShell.tsx`; không đổi Meta contract, routing, dữ liệu hay permission.
- Exact-head CI PASS: CI `30710823875`, PR Validation `30710823870`, UI Pull Request Validation `30710823866`, Sales `30710823872`, Purchase `30710823871`, Inventory/Manufacturing `30710823869`. MetaForge workspace browser QA và Alumdoor browser QA đều PASS.
- Không deploy Cloudflare, không sửa production secret/DNS và không mutate production trong đợt này.

### Việc tiếp theo cho UI

- Chỉ mở thêm visual hotfix khi có lỗi cụ thể từ authenticated demo/production read-only smoke; không tiếp tục đổi layout chỉ để tăng độ trang trí.
- Production release của merge `4afb422e` là một việc riêng, phải có lệnh deploy rõ ràng và exact-head release evidence.

## DONE — Canonical DocType Meta

PR `#154` merge tại `6c89e1a9227e989fd8b08d6e55b35ce2e74d87c7`; protected release qua hotfix `#155` và run `30703115053` tại exact SHA `7f9c629b65b2f2550aec9426cf5e9115ee3db6d0`.

Đã hoàn thành trong code:

1. Hợp đồng DocType/field/view thống nhất cho transaction, master, child table, single, tree, virtual và system.
2. Quick form/expanded form/internal field sinh từ Meta; default và serialization vẫn dùng schema gốc.
3. External Link và child-table closure gate; provider riêng cho `User` theo tenant.
4. Field system/workflow/formula/hidden được server cưỡng chế, không chỉ khóa bằng giao diện.
5. Biểu đồ Tổng quan khai tường minh, chạy qua report/permission/tenant scope, có drill-down và empty fallback.
6. Alumdoor `2.1.0` có 3 biểu đồ thật và completeness gate cho 74 DocType hiện có; chuẩn nền tảng không giới hạn ở 74 DocType.
7. Canonical rules/validator/fixtures đã được ghi vào skill `app-factory` để app sinh sau dùng cùng chuẩn.

Gói Meta đã hoàn tất trên production. PR `#158`–`#160` đã merge; full release run
`30707135053` PASS tại exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`; protected installer run
`30707517624` PASS backup/checksum, hai restore drill, guarded cleanup và read-only conformance. Alumdoor Meta
`2.1.0` đang ở tenant `alu`; hai installer secret tạm đã xóa. GitHub `main` đã có commit G03
`19f949c6aba3541c7d3585ad42f8a8c42ebeea74` sau release này, CI PASS nhưng chưa có production-release evidence.

### Done condition

- Manifest thiếu field contract, Link target, child-table ownership hoặc chart source bị CI từ chối.
- Runtime không nhận giá trị giả cho field server-owned/hidden.
- Alumdoor `2.1.0` compile/install được, biểu đồ chỉ hiện theo quyền và report thật.
- Full test/typecheck/lint/build và protected release xanh trên cùng một SHA.

## NEXT P0 — authenticated stock lifecycle

1. Dùng tài khoản QA riêng, cookie + CSRF thật và dữ liệu thử có tiền tố nhận diện.
2. Chạy nhập kho → xuất kho → chuyển kho → kiểm kho trên desktop và mobile, kiểm Stock User/Stock Manager cùng failure path.
3. Đối chiếu ledger, số lượng, kg thực cân, giữ chỗ và QR trước/sau từng bước.
4. Cleanup toàn bộ chứng từ QA theo lineage; không dùng hoặc sửa dữ liệu khách hàng thật.
5. Không gộp deploy commit G03 `19f949c6` vào smoke này; phát hành G03 phải là một đợt có backup/migration/rollback/evidence riêng.

## DONE — Alumdoor PWA + official brand/media

PR `#150` đã merge; nội dung đang có trong production release SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.

Đã hoàn thành:

1. Stage `client/apps/kho/dist-mobile` vào Gateway tại `public/mobile/warehouse` cùng runtime desktop.
2. Kiểm bắt buộc mobile `index.html`, `manifest.webmanifest`, `warehouse-sw.js` trước deploy.
3. Đổi PWA thành `Alumdoor Kho`, theme cam, icon thường/maskable theo logo chính thức Alumdoor.
4. Shared shell/mobile trên host Alumdoor dùng logo chính thức từ `alumdoor.vn`, không dùng mark Forge tím-hồng.
5. Landing dùng logo chính thức, ảnh hero VIP-ST500 thật và media website Alumdoor cho card sản phẩm.
6. Landing có CTA `App kho điện thoại` → `/mobile/warehouse/`.
7. Playwright kiểm logo/media landing, manifest/icon PWA, navigation/nghiệp vụ và horizontal overflow.
8. Landing đã được chỉnh lần hai theo giao diện `alumdoor.vn` hiện hành: top bar cam, header logo trắng, navigation than đậm, hero video, nhóm dịch vụ, sản phẩm và footer.
9. Asset logo 2026 và media sản phẩm nổi bật được lưu cùng frontend; bỏ asset logo 2022 và placeholder CSS.
10. `Forge Kho` còn sót trong giao diện mobile đã đổi thành `Alumdoor Kho`; palette chính dùng `#f45b24`.
11. Local gates PASS: full test, client lint, client typecheck, client build và Playwright UI `17/17` trên desktop/tablet/mobile/PWA.

Production evidence: full release run `30707135053`, exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`, Gateway version `ef3b4a9a-38f2-4534-86b8-1e6bda2d3ea1`; HTTP và browser desktop/mobile smoke PASS.

### Done condition

- PWA nhìn thấy và mở trực tiếp từ landing production.
- Logo Alumdoor đúng trên landing, login/shell Alumdoor và PWA.
- Hero/card sản phẩm dùng asset thực từ website Alumdoor thay placeholder giả.
- `/mobile/warehouse/` được Gateway production phục vụ cùng origin API.
- Full exact-head CI + production deploy/smoke PASS.

## Sau P0 — authenticated stock lifecycle

- Chạy smoke có kiểm soát cho nhập kho, xuất kho, chuyển kho và kiểm kho bằng dữ liệu thử có cleanup rõ ràng.
- Kiểm Stock User/Stock Manager, CSRF, cookie session và failure path.
- Không mutate dữ liệu khách hàng thật chỉ để tạo evidence.

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
- User đã yêu cầu deploy epic hiện tại; production release chỉ chạy sau merge exact-head xanh qua workflow bảo vệ.
- Không sửa production secret/DNS, bật rollout dữ liệu không thể đảo ngược hoặc mutate dữ liệu khách hàng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.

## Cập nhật deploy local — 2026-08-01

- Đã hoàn thành exact-head CI `6/6`, build/stage/dry-run và deploy Gateway cho SHA `f2f277eb999d213521cd40a126a01a4350aeeca5`.
- Production Gateway version: `a995e0a0-d85b-4cf0-a7cc-16224871cca6`; landing, App kho, manifest, service worker, logo và auth-boundary smoke PASS.
- Việc còn lại để đóng epic: merge PR `#150` mà không thay exact validated head; sau merge xác nhận workflow production không rollback/ghi đè bản `a995e0a0-d85b-4cf0-a7cc-16224871cca6` bằng một SHA khác.

## P0 tiếp theo — Alumdoor Meta completeness

- Inventory toàn bộc nghiệp vụ/menu/action và Link field Alumdoor hiện còn nhập tay hoặc thiếu khai báo Meta.
- Bổ sung canonical DocType/action/report/workspace metadata từ manifest/brief; không hard-code form riêng khi Meta đã có thể sinh UI.
- Mọi Link field phải có target DocType, query/search, permission, tenant boundary và label formatter; app tự render LinkInput/autocomplete theo Meta.
- Thêm completeness gate liệt kê missing operations, unresolved link targets và manual-input fallback; CI fail nếu manifest Alumdoor chưa đủ.
- Tách thành branch/PR riêng sau khi merge hotfix UI; không deploy/mutate tenant production trong lúc khách đang demo.

## P0 hiện tại — hợp nhất giao diện và mẫu in

1. Hoàn tất shell sau đăng nhập: Tổng quan ở đầu sidebar; module chỉ có Quy trình và các tab nghiệp vụ; tách Báo cáo/Danh mục; thêm dải tổng đơn giản trên màn danh sách.
2. Visual QA desktop 1280/1440 và mobile 390/412, bao gồm logo ngang, theme Hồng cánh sen và app kho không tràn ngang.
3. Ghép `origin/feat/print-design-sales-documents-20260801`, giữ thay đổi giao diện hiện tại và chạy lại test mẫu in/QR/routing.
4. Chạy full typecheck, lint, test, build, stage check và Wrangler dry-run trên exact commit.
5. Push branch/PR rồi deploy Gateway trực tiếp từ máy local theo yêu cầu user; ghi exact SHA và Cloudflare Version ID.

### Gate mẫu in sau hợp nhất

- Chạy focused test cho Sales Order, Delivery Note, Production Request, Cut Order QR, Acceptance và sidecar loader.
- Chạy tenant facade integration để khóa danh sách mẫu, lựa chọn `?format=` và URL encoding.
- Giữ năm mẫu A4 trong vùng `194mm`, logo/company header tải đủ và vùng ký không tràn trang.
- Sau release kiểm tra đăng nhập hết hạn ở route in quay về trang chủ, không hiện JSON `AUTHENTICATION_REQUIRED`.

### Đã hoàn thành trong release `169f1853`

- [x] Hợp nhất UI/PWA mới với nhánh mẫu in PR #141.
- [x] Tổng quan/Báo cáo/Danh mục ở sidebar; Quy trình + nghiệp vụ ở tab phân hệ; dải tổng nhanh trên danh sách.
- [x] Logo ngang desktop, 13 theme có Hồng cánh sen tương phản cao, app kho không tràn ngang.
- [x] Full server/client gates, stage-check, Wrangler dry-run, deploy và production guest/browser smoke.
- [ ] Khi có tài khoản demo được phép dùng, chạy production authenticated smoke cho chuyển tab, mẫu in và hết phiên; không tạo/mutate chứng từ khách hàng chỉ để thử UI.

### Hotfix giao diện tiếp theo `20b3298d`

- [x] Phóng logo ngang Alumdoor khít vùng thương hiệu sidebar.
- [x] Đưa Báo cáo và Danh mục xuống dưới các phân hệ nghiệp vụ.
- [x] Đổi Báo cáo sang bố cục nhóm trái + hai cột báo cáo; Danh mục sang ba cột nhóm kiểu MISA.
- [x] Làm lại sơ đồ Quy trình bằng node, số bước và đường nối.
- [x] Lọc Experience thiếu renderer và chuyển URL cũ về Tổng quan.
- [x] Typecheck, selfcheck, build và Playwright responsive PASS.
- [x] Build/stage exact SHA `b44bdaa9`, Wrangler dry-run, deploy Gateway version `fe705d76-a561-4ec9-bc8a-976437d65657` và HTTP production smoke.
- [ ] Khi có phiên demo được phép dùng, smoke chỉ đọc sau đăng nhập cho thứ tự sidebar, Báo cáo/Danh mục/Quy trình và URL Experience cũ; không tạo hoặc sửa chứng từ khách hàng.

### Đã hoàn thành trong hotfix `d5bb9ac0`

- [x] Sơ đồ Quy trình đúng trục MISA với nghiệp vụ trên/dưới, Báo cáo bên phải và Danh mục nhanh phía dưới.
- [x] Xuất PDF ra ngoài menu ba chấm.
- [x] Kích hoạt và kiểm tra luồng chuyển màn app kho trên Pixel 7 và máy 390px.
- [x] Build/stage/dry-run/deploy Gateway version `46d87cda-27c2-4a17-8344-b042599fa995` và production guest/mobile smoke.
- [ ] Authenticated production smoke chỉ đọc vẫn cần một phiên demo hợp lệ; không tạo, gửi hoặc sửa chứng từ khách hàng để lấy evidence.
- [x] Follow-up `478ee789`: chọn nhóm Báo cáo không cuộn trang; `Vật tư hàng hóa` đứng đầu Danh mục; deploy Gateway version `08c08f49-ca55-4ff0-9c0b-7653b4b7bff5`.

### Đã hoàn thành trong release `2a36f797`

- [x] Bỏ landing marketing Alumdoor; guest mở thẳng form login trên desktop và điện thoại.
- [x] Dùng logo ngang chính thức cỡ lớn trong form login, autofocus tài khoản và không tràn ngang ở viewport 390px.
- [x] Đưa `Hỏi AI` lên topbar cạnh Thông báo, bỏ trigger nổi góc màn hình.
- [x] Đổi Tổng quan sang bố cục MISA có dải số liệu và lưới biểu đồ hai cột.
- [x] Typecheck/build, Playwright `8/8`, stage/dry-run/deploy và production browser smoke PASS; Gateway `79cf4d16-0bf5-4c18-bad8-99367dc382b5`.
- [ ] Rebase/merge target branch để giải quyết conflict của PR `#150`, sau đó chạy lại required checks trên exact head trước khi merge GitHub.
- [ ] Bổ sung khai báo biểu đồ theo Meta cho từng phân hệ; chỉ hiện tab `Biểu đồ` khi manifest của phân hệ có chart definition.
### Đã hoàn thành trong release `8d8353d2`

- [x] Giữ BottomNav mobile cố định, luôn hiện ở trang chủ và màn chi tiết nghiệp vụ.
- [x] Chặn vuốt Back thoát app ngay; Back ưu tiên quay lại tab/màn nội bộ.
- [x] Cho logo Alumdoor thích ứng theme tối, bỏ nền trắng cứng và tăng wordmark sidebar lên 40px.
- [x] Nhập thay đổi mới nhất từ nhánh GitHub, build đúng merge head, stage/dry-run/deploy Gateway và smoke production.
- [ ] Chạy authenticated production visual smoke cho sidebar sau khi có phiên đăng nhập demo đang mở; không tạo hoặc sửa chứng từ khách hàng chỉ để kiểm tra UI.
