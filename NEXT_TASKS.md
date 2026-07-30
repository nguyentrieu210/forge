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

## P1 — Implement hàng đợi nhập nhôm FIFO và nợ nhà máy

**Mục tiêu:** triển khai contract đã chốt tại `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md` để một Receipt có thể tự bù nhiều PO line, giữ lịch sử bất biến và đối soát dung sai chính xác.

- Điểm review thiết kế sau chốt: **9,2/10**. Trạng thái: **ready for implementation**, chưa ready for production.
- Kịch bản khóa: PO 200 + 100 cây, Receipt 230 cây/644,184 kg barem/630 kg thực => allocation 200 + 30, còn nợ danh nghĩa 70.
- Quyết định concurrency đã chốt: `PurchaseAllocationCoordinator` theo `tenant + company + supplier`, cộng D1 revision claim/trigger authoritative trong cùng batch. Không lock riêng từng vật tư.
- Quyết định lifecycle đã chốt: obligation queue chạy liên tục; settlement window hữu hạn và snapshot tolerance. Window chỉ close/reverse bằng action có quyền và lý do.
- Quyết định ordering đã chốt: FIFO tại thời điểm commit; backdated Receipt không viết lại allocation cũ; cancel Receipt chỉ reverse chính Receipt đó, không auto-rebalance Receipt mới hơn.
- Quyết định PO đã chốt: identity/qty bất biến sau submit; cancel chỉ khi net allocation bằng 0 và window chưa settled; amend qua successor `amended_from`.
- Quyết định material key đã chốt: canonical hash schema v1 gồm `item_code + length_m + theoretical_kg_per_m + color + is_stamped + measurement_profile + stock_uom`, do server tạo.
- Quyết định kg đã chốt: cân thực authoritative ở Receipt line; kg theo PO là projection versioned theo barem, residual dồn allocation cuối.
- Quyết định legacy đã chốt: backfill từ `versions.snapshot_json`; exact unique => resolved, mơ hồ => `legacy_unresolved`; không đoán PO row id.
- Quyết định cutover đã chốt: allocation ledger là nguồn sự thật; progress table cũ chỉ là compatibility projection sinh từ allocation plan.

### M1 — Schema và contract

- Thêm migration append-only `server/migrations/tenant/0027_purchase_receipt_allocation.sql`.
- Thêm tables cho queue, settlement window, obligations, allocations, unapplied, settlement events và revision claims.
- Thêm triggers/unique/check guards cho revision, sign, lifecycle, live row id và idempotency.
- Mở rộng `MutationPlan`, contracts và D1 store để ghi allocation cùng document/stock/procurement.
- Test SQL: revision mismatch abort toàn batch; live allocation thiếu PO row bị từ chối; reversal sign/lifecycle hợp lệ.

### M2 — Canonical material key

- Viết canonicalizer thuần hàm, fixed-point micros, canonical JSON và SHA-256.
- Snapshot hash + các field giải thích được trên PO/Receipt/allocation.
- Test khác chiều dài, barem, màu, dập hoặc profile không trộn; null/empty normalization ổn định.

### M3 — Coordinator và retry

- Thêm `PurchaseAllocationCoordinator` và route các mutation ảnh hưởng stream.
- Draft create/save giữ Aggregate Coordinator hiện tại.
- Retry revision conflict tối đa 3 lần với cùng command id; idempotency receipt vẫn authoritative.
- Test hai Receipt submit đồng thời, PO submit cạnh Receipt, retry sau conflict và không double allocation.

### M4 — Allocation planner

- Planner thuần hàm nhận obligations + Receipt line + window snapshot và trả allocation/unapplied/events.
- FIFO theo `transaction_date → created_at → PO name → idx → row_id`.
- Một Receipt line bù nhiều PO; một Receipt nhiều dòng; hàng trăm rows.
- Receipt vượt current maximum bị block; vượt nominal nhưng trong maximum ghi unapplied.
- PO mới trước settlement tự apply unapplied cũ bằng event mới.

### M5 — Lifecycle và edge cases

- Cancel Receipt ghi reverse, không rebalance lịch sử.
- Backdated Receipt dùng posting date cho sổ, stream sequence cho allocation.
- PO cancel/amend guards.
- Manual override cùng supplier/material/window, permission + reason bắt buộc.
- Settlement close/reverse rules, integer min/max, shortage/overage variance.

### M6 — Backfill và cutover

- Viết `server/scripts/backfill-purchase-receipt-allocations.mjs` với dry-run mặc định.
- Dùng voucher revision, line key và `versions.snapshot_json` để dựng source row.
- Xuất resolved/unresolved/checksum; không execute nếu PO-level quantity không khớp.
- Chuyển `received_percentage`, tồn danh nghĩa và báo cáo sang ledger mới.
- Compatibility progress rows được sinh từ allocation plan, không ghi độc lập.

### M7 — UI và báo cáo

- Preview allocation trước submit Receipt.
- Timeline PO/Receipt với drill-down.
- Hiển thị nominal remaining, actual received, unapplied, settlement range và variance.
- Manual override/settlement action có permission, reason và cảnh báo backdated.
- Báo cáo NCC: tổng đặt, tổng về, nợ danh nghĩa, window, dải giao cuối và PO cũ nhất.

### M8 — Gate và rollout

- Targeted unit/SQL/integration/concurrency/stress tests.
- Root `pnpm.cmd run test`, `pnpm.cmd run typecheck`, `pnpm.cmd run build`, frontend lint.
- Đo D1 batch size/latency với hàng trăm allocation rows và supplier contention.
- Dry-run backfill trên backup production, review unresolved và checksum.
- Staging migration/smoke trước; production chỉ sau backup mới và explicit deploy approval.

- File chính dự kiến: `server/packages/contracts/src/index.ts`, `server/packages/clouderp-core/src/types.ts`, `server/packages/clouderp-core/src/controllers.ts`, tenant routing/coordinator, document kernel/D1 store, migration `0027`, backfill script, Alumdoor generator/brief, report/UI và tests.
- Hoàn thành khi: trạng thái dựng lại hoàn toàn từ ledger bất biến; không double allocation; cancel/backdated không sửa lịch sử; settlement boundary đúng; legacy checksum khớp; browser workflow usable.
- Phụ thuộc: P0 production smoke nên hoàn tất trước deployment tiếp theo. Implementation local/staging có thể bắt đầu theo M1.

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
