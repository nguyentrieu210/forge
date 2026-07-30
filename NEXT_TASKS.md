# NEXT TASKS

## P0 — Khôi phục test gate Alumdoor

**Mục tiêu:** làm test phản ánh contract v2.0.34 hiện hành mà không quay lại layout/cột cũ.

- File dự kiến: `server/tests/alumdoor-item-model.test.mjs`, `server/scripts/build-alumdoor-v2-brief.mjs`, đối chiếu `server/briefs/alumdoor-v2.json`.
- Rủi ro: sửa test theo output sai sẽ hợp thức hóa regression; cần chốt print contract với BRD/mẫu đã duyệt.
- Hoàn thành khi: hai test hiện fail pass, root `pnpm.cmd run test` chạy tới cuối.
- Kiểm tra: test server, SQL tests, client selfcheck; render một Purchase Order thật ở preview và PDF.
- Phụ thuộc: không.

## P1 — Kiểm thử ổn định bản in Purchase Order Alumdoor

**Mục tiêu:** khóa các yêu cầu gần nhất: cột đúng thứ tự, Dập trước Ghi chú, không Số bó, căn giữa theo hàng, logo/header/tựa đề không dính và preview khớp PDF.

- File dự kiến: `server/scripts/build-alumdoor-v2-brief.mjs`, `server/tests/alumdoor-item-model.test.mjs`, có thể thêm fixture/snapshot trong `server/tests/`.
- Rủi ro: browser preview và html2canvas/jsPDF có metric font khác nhau; ảnh header/data URI làm test text cũ không phù hợp.
- Hoàn thành khi: fixture có dữ liệu nhôm và hàng thường render đúng ở preview + PDF; test kiểm tra cấu trúc thay vì chuỗi HTML mong manh.
- Kiểm tra: build brief, cài vào tenant thử nghiệm, tải PDF thật, so visual ở A4 portrait.
- Phụ thuộc: P0.

## P1 — Xử lý 26 lỗi lint có kiểm soát

**Mục tiêu:** đưa `pnpm.cmd --filter metaforge run lint` về xanh mà không đổi UI/behavior.

- File dự kiến: 9 file liệt kê trong `CURRENT_STATUS.md`, và chỉ sửa `client/scripts/check-native-ui.mjs` nếu chứng minh false positive.
- Rủi ro: thay native element bằng shared component có thể đổi event, accessibility hoặc layout.
- Hoàn thành khi: lint pass và các màn liên quan không regression.
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
