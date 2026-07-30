# NEXT TASKS

## Hoàn thành — Khôi phục test gate Alumdoor

**Mục tiêu:** làm test phản ánh contract v2.0.34 hiện hành mà không quay lại layout/cột cũ.

- File dự kiến: `server/tests/alumdoor-item-model.test.mjs`, `server/scripts/build-alumdoor-v2-brief.mjs`, đối chiếu `server/briefs/alumdoor-v2.json`.
- Rủi ro: sửa test theo output sai sẽ hợp thức hóa regression; cần chốt print contract với BRD/mẫu đã duyệt.
- Trạng thái: hoàn thành; root `pnpm.cmd run test` đã chạy tới cuối và pass.
- Kiểm tra: test server, SQL tests, client selfcheck; render một Purchase Order thật ở preview và PDF.
- Phụ thuộc: không.

## P0 — Xác minh production tenant `alu` sau deploy

**Mục tiêu:** chứng minh deployment live hoạt động đúng, thay vì coi exit code là một nghi lễ ban phước.

- Trạng thái: người vận hành xác nhận ngày 2026-07-30 đã backup remote D1 ra `C:\ForgeBackups\alu`, chạy tenant preflight và live deploy với `--execute --confirm alu` thành công.
- Còn lại: xác nhận Gateway version đang nhận production traffic; smoke test `alu.kairo.vn` cho login, list, mở form, create/update/delete chứng từ thử, Purchase Order print preview và tải PDF.
- Ghi nhận sau kiểm tra: deployment/version ID và thời điểm; kết quả từng smoke step; backup manifest/checksum và nơi lưu trữ mã hóa ngoài repository. Không ghi secret hoặc nội dung dữ liệu khách hàng.
- Rollback trigger: login/API 5xx, sai tenant routing/database, CRUD mất dữ liệu, print/PDF lỗi nghiêm trọng hoặc permission regression.
- Hoàn thành khi: Gateway và tenant đều đúng version dự kiến, smoke test xanh, không có lỗi production mới và backup đã được chuyển khỏi nơi lưu plaintext thông thường.
- Phụ thuộc: tenant live deploy đã operator-confirmed; Gateway production traffic chưa được xác nhận độc lập.

## P1 — Hàng đợi nhập nhôm FIFO liên tục và nợ nhà máy

**Mục tiêu:** quản lý một chuỗi PO kéo dài nhiều tuần, nhiều PO cùng vật tư trong tháng và một xe nhập có thể tự bù rất nhiều PO, không bắt người dùng tự gom nhóm.

- Kịch bản nền: PO ngày 1 đặt AL71 7,2 m × 0,389 × 200 cây; PO ngày 2 đặt 100 cây; Receipt nhận 230 cây, barem 644,184 kg và cân thực 630 kg. Hệ thống phân bổ FIFO 200 cây vào PO ngày 1, 30 cây vào PO ngày 2 và báo tồn danh nghĩa 70 cây.
- Thực tế phải cover: một PO có thể mở cả tháng; cùng supplier/mã/quy cách có thể phát sinh 3–4 PO hoặc hơn trong tháng; một Receipt có nhiều dòng và mỗi dòng có thể chạm hàng chục PO line.
- Không dùng field `delivery_pool` bắt nhập trên từng chứng từ. Nền tảng tự tạo và duy trì **obligation stream đang mở** theo `tenant + company + supplier + material_match_key`; PO line mới đúng khóa tự gia nhập stream hiện hành.
- `material_match_key` tối thiểu gồm `item_code + length_m + color + is_stamped + measurement_profile` và phải snapshot trên PO/Receipt/allocation. Không dùng mỗi `item_code`, vì cùng AL71 khác khổ hoặc trạng thái dập không được bù lẫn.
- Stream bắt đầu khi có PO line mở đầu tiên. Stream không đóng theo tháng hay theo chuyến xe; nó chỉ đóng khi người có quyền xác nhận “nhà máy giao cuối/đối soát xong”. PO line phát sinh sau khi stream đã đóng mở stream kế tiếp.
- Thuật toán Receipt submit: khóa stream trong Aggregate Durable Object; lấy mọi PO line còn nghĩa vụ đúng khóa; sắp `transaction_date → created_at → PO name → row idx`; phân bổ FIFO qua bao nhiêu PO cũng được; ghi allocation cùng mutation với stock/procurement ledger.
- Sổ allocation append-only cần chứa receipt, receipt item row, PO, PO item row, allocation sequence, qty cây, barem kg snapshot, kg thực tế/phân bổ, posting_at và `allocate/reverse/apply_unapplied`.
- Nếu Receipt vượt tổng nominal đang mở nhưng vẫn trong trần dung sai, phần dư đi vào `unapplied_receipt_qty` của stream, không nhét bừa vào PO cuối. PO mới gia nhập trước lúc stream đóng có thể được số dư này bù bằng allocation event mới, giữ nguyên lịch sử cũ.
- Dung sai ±5% áp trên tổng obligation của stream. Với tổng đặt 300, tổng hợp lệ là 285–315; đã nhận 230 thì dải giao cuối là 55–85. FIFO danh nghĩa vẫn ghi PO1 nhận 200 và PO2 nhận 30; phần thiếu/dư khi đóng là `settlement_variance` của stream.
- Không tự đóng khi đạt mức tối thiểu. Cần action quyền cao `Đối soát giao cuối / Đóng trong dung sai`; action kiểm tổng nhận nằm trong min–max, không còn Receipt đang xử lý và ghi settlement event bất biến.
- Trạng thái cần có: `Open`, `Partially Received`, `Nominally Fulfilled`, `Within Tolerance — Awaiting Settlement`, `Settled Within Tolerance`, `Over Tolerance Blocked`.
- UI trên PO: số đặt, đã phân bổ, còn danh nghĩa, stream đang mở, các Receipt đã bù và variance khi đối soát. UI trên Receipt: mỗi dòng đã trừ PO nào, bao nhiêu cây/kg, phần chưa áp còn lại. Báo cáo NCC: tổng đặt, tổng về, nợ danh nghĩa, dải giao cuối và tuổi nợ theo PO cũ nhất.
- File dự kiến: `server/packages/contracts/src/index.ts`, `server/packages/clouderp-core/src/types.ts`, `server/packages/clouderp-core/src/controllers.ts`, document kernel/D1 store persistence, migration append-only `server/migrations/tenant/0027_*.sql`, generator `server/scripts/build-alumdoor-v2-brief.mjs`, output brief, report metadata/UI và test.
- Test bắt buộc: 200+100/nhận 230; 4 PO trong một tháng; một Receipt bù ít nhất 10 PO lines; PO mở qua tháng; PO mới gia nhập stream; dư nominal tạo unapplied rồi bù PO mới; giao cuối 55/85 pass và 54/86 fail; cancel/reversal; cùng mã khác khổ không trộn; hai Receipt đồng thời không phân bổ trùng; kg thực không đổi số cây còn nợ.
- Rủi ro: code hiện tại kiểm dung sai theo từng PO và progress theo `item_code`. Không được duy trì song song progress ledger cũ và allocation ledger mới như hai nguồn sự thật; các projection tiến độ phải chuyển sang tính từ allocation/stream ledger.
- Hoàn thành khi: bất kể một đơn giao một tháng hay một xe bù hàng chục đơn, hệ thống dựng lại chính xác toàn bộ lịch sử, nghĩa vụ còn lại, số dư chưa áp và dải dung sai chỉ từ ledger bất biến.
- Phụ thuộc: chốt quyền/action đóng stream và quy tắc xử lý PO bị huỷ khi đã có allocation; P0 production smoke nên hoàn tất trước deployment tiếp theo.

## P1 — Kiểm thử ổn định bản in Purchase Order Alumdoor

**Mục tiêu:** khóa các yêu cầu gần nhất: cột đúng thứ tự, Dập trước Ghi chú, không Số bó, căn giữa theo hàng, logo/header/tựa đề không dính và preview khớp PDF.

- File: `server/scripts/build-alumdoor-v2-brief.mjs`, `server/tests/alumdoor-item-model.test.mjs`, `server/tests/alumdoor-purchase-order-print.test.mjs`, có thể thêm fixture/snapshot browser trong `server/tests/` hoặc client test.
- Trạng thái: **đang làm**. Commit `f5186c4ef6fb54d819bad95ee4eb17f2fd1a18e1` đã thêm fixture chạy qua renderer production với một dòng nhôm và một dòng hàng thường; tenant `alu` đã được operator xác nhận deploy.
- Đã khóa tự động: A4 portrait, 13 cột và tổng width 100%, thứ tự `Dập` trước `Ghi chú`, không `Số bó`, căn giữa, logo/header, render theo `idx`, format số Việt Nam, không còn placeholder và hàng thường không bị điền giả dữ liệu nhôm.
- Còn lại: xác nhận CI/gate theo HEAD hiện tại; thực hiện production browser smoke và tải PDF thật để kiểm tra lệch font, tràn nội dung và trang trắng; sau đó cân nhắc browser visual/integration automation.
- Rủi ro: browser preview và html2canvas/jsPDF có metric font khác nhau; ảnh header/data URI làm test text cũ không phù hợp.
- Hoàn thành khi: fixture có dữ liệu nhôm và hàng thường render đúng ở preview + PDF; test kiểm tra cấu trúc thay vì chuỗi HTML mong manh; có bằng chứng browser/PDF thực tế.
- Kiểm tra: `pnpm.cmd run test`, `pnpm.cmd run typecheck`, `pnpm.cmd run build`, build brief, production smoke ở `alu.kairo.vn`, tải PDF thật và so visual A4 portrait.
- Phụ thuộc: P0 production verification.

## Hoàn thành — Xử lý 26 lỗi lint có kiểm soát

**Mục tiêu:** đưa `pnpm.cmd --filter metaforge run lint` về xanh mà không đổi UI/behavior.

- File dự kiến: 9 file liệt kê trong `CURRENT_STATUS.md`, và chỉ sửa `client/scripts/check-native-ui.mjs` nếu chứng minh false positive.
- Rủi ro: thay native element bằng shared component có thể đổi event, accessibility hoặc layout.
- Trạng thái: hoàn thành; lint, typecheck, test và build đều pass local.
- Kiểm tra: lint, typecheck, build, visual smoke ở Storefront, DocTypeBuilder, AppShell, ChildGrid, ActionScreen.
- Phụ thuộc: không.

## P1 — Bổ sung test lưu partial Frappe document

**Mục tiêu:** khóa bug đã sửa gần đây: PUT partial vào submitted document phải merge với stored document trước controller normalization.

- File dự kiến: `server/packages/frappe-api/src/router.ts`, test facade/integration trong `server/apps/tenant-worker/test/` hoặc `server/tests/`.
- Rủi ro: merge sai có thể cho phép field bị bỏ qua hoặc làm mất child rows.
- Hoàn thành khi: test cover normal doc, submitted doc, child table và concurrency/timestamp.
- Kiểm tra: targeted integration test + root test.
- Phụ thuộc: P0 để root gate chạy trọn.

## P2 — Hoàn thiện page/dashboard/process renderers

**Mục tiêu:** thay fallback có chủ đích bằng renderer/API contract đầy đủ.

- File dự kiến: `client/apps/runtime/src/main.tsx`, `client/packages/views/src/process/`, `client/packages/adapter-frappe/src/frappe-adapter.ts`, `server/packages/frappe-api/src/router.ts`.
- Rủi ro: mở rộng API có ảnh hưởng permission/manifest compatibility.
- Hoàn thành khi: route có metadata hợp lệ render được; route không hỗ trợ trả lỗi rõ ràng; permission được test.
- Kiểm tra: integration + browser route smoke.
- Phụ thuộc: P0.

## P2 — Hoàn thiện collaboration UI

**Mục tiêu:** assign picker, upload/delete attachment và add/remove tag từ form context.

- File dự kiến: `client/packages/views/src/`, `client/packages/adapter-frappe/src/frappe-adapter.ts`.
- Rủi ro: optimistic update, file permission và stale timeline.
- Hoàn thành khi: thao tác thật round-trip qua facade, refetch chính xác và có trạng thái lỗi.
- Kiểm tra: integration trên user có/không có quyền.
- Phụ thuộc: lint P1 nên xử lý trước để tránh tăng nợ UI.

## P2 — Đồng bộ tài liệu trạng thái

**Mục tiêu:** loại bỏ mâu thuẫn giữa `server/STATUS.md`, traceability cũ và code/migration hiện tại.

- File dự kiến: `server/STATUS.md`, `client/docs/KNOWN_GAPS.md`, `client/docs/implementation-traceability.md`.
- Rủi ro: vô tình tuyên bố production state chưa xác minh.
- Hoàn thành khi: mỗi tuyên bố có lệnh/commit/file chứng minh và ngày kiểm tra.
- Kiểm tra: review chéo với migration, manifest, package scripts và CI.
- Phụ thuộc: P0 để có trạng thái test chuẩn.

## P3 — Tối ưu bundle frontend

**Mục tiêu:** giảm warning chunk lớn và tải ban đầu.

- File dự kiến: `client/apps/*/vite.config.*`, route imports trong `client/apps/runtime/src/main.tsx`, export graph của `client/packages/views/`.
- Rủi ro: split sai gây duplicate dependency hoặc lỗi runtime lazy loading.
- Hoàn thành khi: chunk chính giảm có đo lường, không tăng tổng payload đáng kể.
- Kiểm tra: build stats, browser smoke, Core Web Vitals.
- Phụ thuộc: test/lint xanh.

## P3 — Chuẩn hóa local onboarding

**Mục tiêu:** có một đường chạy local rõ cho Gateway + Tenant + D1 mà không phụ thuộc thông tin truyền miệng.

- File dự kiến: `README.md`, `server/README.md`, script local seed/migrate hiện có.
- Rủi ro: tài liệu hóa nhầm secret/resource ID.
- Hoàn thành khi: máy sạch có thể chạy từ `.env.example`/`.dev.vars.example` bằng giá trị giả và tài nguyên local.
- Kiểm tra: clean-room setup.
- Phụ thuộc: không.