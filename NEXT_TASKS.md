# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## ACTIVE P0 — Alumdoor PWA + official brand/media

Branch: `feat/alumdoor-pwa-real-brand-assets`.

Đã code trên branch:

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

Việc phải hoàn thành trước khi đóng epic:

1. Mở PR từ exact branch head và khóa head.
2. Chờ CI, typecheck, build, PR Validation, UI browser QA, Sales/Purchase/Inventory gates terminal xanh.
3. Merge đúng exact-head đã validate.
4. Để protected `Release Gateway Production` build → stage → Wrangler dry-run → deploy Cloudflare `cloudforge-gateway`.
5. Ghi run ID, exact target SHA và Cloudflare Gateway version ID.
6. Production smoke:
   - `https://alu.kairo.vn/` trả landing mới;
   - `/mobile/warehouse/` trả `Alumdoor Kho`, không rơi về desktop shell;
   - manifest scope/start URL đúng `/mobile/warehouse/`;
   - `alumdoor-mark.svg`, maskable icon và `warehouse-sw.js` trả 200;
   - guest boot vẫn bị chặn đúng và API/auth không bị service worker cache.
7. Sau deploy cập nhật `CURRENT_STATUS.md` và `NEXT_TASKS.md` bằng evidence thật.

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
