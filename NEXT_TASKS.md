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

- Điểm review hiện tại: **7,3/10**. Chỉ bắt đầu implementation sau khi chốt các architecture gate dưới đây.
- Kịch bản nền: PO ngày 1 đặt AL71 7,2 m × 0,389 × 200 cây; PO ngày 2 đặt 100 cây; Receipt nhận 230 cây, barem 644,184 kg và cân thực 630 kg. Hệ thống phân bổ FIFO 200 cây vào PO ngày 1, 30 cây vào PO ngày 2 và báo tồn danh nghĩa 70 cây.
- Thực tế phải cover: một PO có thể mở cả tháng; cùng supplier/mã/quy cách có thể phát sinh 3–4 PO hoặc hơn trong tháng; một Receipt có nhiều dòng và mỗi dòng có thể chạm hàng chục PO line.
- Tách hai khái niệm: **obligation queue** chạy liên tục để FIFO; **settlement window** là kỳ đối soát hữu hạn để tính dung sai. Không lấy queue vô thời hạn làm mẫu số ±5%.
- Queue key do server tạo theo `tenant + company + supplier + material_match_key`. `material_match_key` là hash có `schema_version` từ snapshot chuẩn hoá, tối thiểu gồm `item_code + length_m + color + is_stamped + measurement_profile`; không tin chuỗi key do client gửi.
- Concurrency gate: Aggregate DO hiện khóa theo `tenant:doctype:name`, không khóa được hai Receipt khác nhau. Thiết kế phải dùng coordinator riêng theo `tenant + company + supplier` hoặc D1 stream revision/CAS + unique/commit guards; một Receipt không được giữ nhiều DO lock theo từng vật tư.
- Thuật toán Receipt submit: lấy mọi PO line còn nghĩa vụ đúng key, sắp `transaction_date → created_at → PO name → row idx`, phân bổ FIFO qua bao nhiêu PO cũng được, ghi allocation trong cùng D1 batch với document/stock/procurement và kiểm stream revision tại commit.
- Sổ allocation append-only cần chứa receipt, receipt item row, PO, PO item row, allocation sequence, qty cây, barem snapshot, posting_at và `allocate/reverse/reallocate/apply_unapplied`. Huỷ không delete.
- `actual_weight_kg` authoritative ở Receipt line. Kg quy cho từng PO chỉ là projection theo barem/tỷ lệ với quy tắc làm tròn và residual cố định; không tạo nguồn sổ cân thứ hai.
- Receipt vượt nominal chỉ được đưa vào `unapplied_receipt_qty` khi chính sách cho phép và chưa vượt trần settlement window. Không nhét phần dư vào PO cuối. Áp phần dư về PO mới phải tạo event mới.
- Settlement window được mở/đóng bằng event có quyền và lý do; tổng đặt của window không thay đổi ngược sau khi đóng. Action `Đối soát giao cuối / Đóng trong dung sai` kiểm min–max, số dư chưa áp và ghi `settlement_variance` bất biến.
- Chốt edge cases trước code: Receipt nhập lùi ngày; cancel Receipt khi có allocation mới hơn; reallocation sau reversal; PO cancel/amend sau khi đã nhận; reopen settlement; đổi supplier/item master; manual FIFO override có lý do và quyền.
- UI cần preview phân bổ trước submit. Override chỉ dành cho role được phép, phải nhập lý do, và kết quả vẫn ghi ledger đầy đủ.
- Migration/backfill: thêm `0027_*` append-only. Dữ liệu cũ chỉ có PO + item_code phải backfill khi xác định duy nhất; trường hợp mơ hồ ghi `legacy_unresolved` hoặc đưa vào hàng đợi đối chiếu thủ công, không đoán `row_id`.
- Projection `received_percentage`, tồn danh nghĩa và báo cáo nợ phải chuyển sang allocation ledger. Không duy trì progress ledger cũ và allocation ledger mới như hai nguồn sự thật; có thể giữ bảng cũ làm compatibility projection được sinh từ allocation.
- UI trên PO: số đặt, đã phân bổ, còn danh nghĩa, các Receipt đã bù, tuổi nợ và settlement variance. UI trên Receipt: mỗi dòng đã trừ PO nào, bao nhiêu cây, barem, cân thực và phần chưa áp. Báo cáo NCC: tổng đặt, tổng về, nợ danh nghĩa, dải giao cuối và PO cũ nhất.
- File dự kiến: `server/packages/contracts/src/index.ts`, `server/packages/clouderp-core/src/types.ts`, `server/packages/clouderp-core/src/controllers.ts`, tenant routing/coordinator, document kernel/D1 store, migration `server/migrations/tenant/0027_*.sql`, generator `server/scripts/build-alumdoor-v2-brief.mjs`, output brief, report metadata/UI và test.
- Test bắt buộc: 200+100/nhận 230; 4 PO trong một tháng; PO mở qua tháng; một Receipt bù nhiều PO; nhiều dòng Receipt; hàng trăm allocation rows; submit đồng thời; retry cùng command id; backdated Receipt; cancel/reallocate; PO amend/cancel; dư nominal/unapplied; settlement 55/85 pass và 54/86 fail; cùng mã khác quy cách không trộn; kg thực không đổi số cây còn nợ; backfill legacy rõ/mơ hồ.
- Hoàn thành khi: toàn bộ trạng thái dựng lại được từ ledger bất biến, không double allocation dưới concurrency, không đổi lịch sử khi cancel/backdated và dung sai chỉ áp trong settlement window đã chốt.
- Phụ thuộc: chốt coordinator/CAS, settlement window, cancel/reallocation, backfill legacy và quyền override; P0 production smoke hoàn tất trước deployment tiếp theo.

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
