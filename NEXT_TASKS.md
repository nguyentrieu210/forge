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

## P1 — Sổ phân bổ nhập nhôm FIFO và nợ nhà máy

**Mục tiêu:** một lần hàng về có thể tự trừ nhiều dòng đơn mua cũ trước, giữ lịch sử bất biến và tính đúng số cây còn nợ cùng dải dung sai gộp.

- Kịch bản khóa: PO ngày 1 đặt AL71 7,2 m × 0,389 × 200 cây; PO ngày 2 đặt 100 cây; Receipt ngày 3 nhận 230 cây, barem 644,184 kg và cân thực 630 kg. Hệ thống phải phân bổ FIFO 200 cây vào PO ngày 1, 30 cây vào PO ngày 2 và báo tồn danh nghĩa 70 cây trên PO ngày 2.
- Luật dung sai khách yêu cầu là **pool gộp có chủ đích**: tổng 300 cây, ±5% ⇒ chấp nhận tổng 285–315 cây; sau khi đã nhận 230 thì lần giao cuối hợp lệ 55–85 cây. Không tự gộp mọi PO cùng mã vô thời hạn; cần `delivery_pool`/`supplier_contract` hoặc khoá nhóm tương đương.
- Thiết kế dữ liệu: thêm migration append-only `0027_*`; sổ allocation phải chứa receipt, receipt item row, PO, PO item row, thứ tự phân bổ, qty cây, kg barem snapshot, kg thực tế/phân bổ, ngày và loại `allocate/reverse`.
- Không chỉ dùng `item_code`: khoá đối chiếu phải bám `purchase_order_item.row_id` và snapshot quy cách tối thiểu `item_code + length_m + color + is_stamped/measurement profile`, để AL71 khác khổ không trừ nhầm nhau.
- Thuật toán submit Receipt: lấy các PO line mở đúng supplier/pool/quy cách, sắp `transaction_date → created_at → PO name → row idx`, phân bổ FIFO, kiểm trần dung sai pool, rồi ghi allocation trong cùng mutation với stock/procurement ledger. Huỷ Receipt ghi dòng đảo, không delete.
- Trạng thái cần có: `Partially Received`, `Nominally Complete`, `Within Tolerance — Awaiting Close`, `Closed Within Tolerance`; không tự đóng thiếu chỉ vì đã chạm ngưỡng tối thiểu, cần hành động xác nhận “giao cuối/đóng trong dung sai”.
- UI/báo cáo: timeline trên PO và Receipt phải diễn giải “PR-X nhận 230 cây/630 kg; trừ PO1 200, PO2 30; còn PO2 70; dải giao cuối 55–85”, cùng drill-down về chứng từ gốc.
- File dự kiến: `server/packages/contracts/src/index.ts`, `server/packages/clouderp-core/src/types.ts`, `server/packages/clouderp-core/src/controllers.ts`, D1 store/document kernel persistence, `server/migrations/tenant/0027_*.sql`, generator `server/scripts/build-alumdoor-v2-brief.mjs`, output `server/briefs/alumdoor-v2.json`, report/UI metadata và test.
- Test bắt buộc: đúng kịch bản 200+100/nhận 230; nhận cuối 55 và 85 pass; 54 và 86 fail; nhiều receipt liên tiếp; cancel/reversal; cùng mã khác khổ không trộn; manual override có kiểm soát; hai receipt đồng thời không phân bổ trùng; kg thực không làm thay đổi số cây còn nợ.
- Rủi ro: code hiện tại kiểm dung sai theo từng PO và cộng tiến độ theo `item_code`; sửa nửa vời sẽ tạo hai nguồn sự thật giữa progress ledger và allocation ledger.
- Hoàn thành khi: tồn danh nghĩa, dải dung sai, lịch sử phân bổ và báo cáo đều được tính lại từ sổ allocation; không có cột tổng hợp nhập tay làm nguồn authoritative.
- Phụ thuộc: chốt pool key và hành vi “đóng trong dung sai”; P0 production smoke nên hoàn tất trước deployment tiếp theo.

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
