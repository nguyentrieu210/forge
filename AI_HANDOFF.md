# AI HANDOFF

## Dự án này là gì

Forge là monorepo ERP đa tenant trên Cloudflare. Backend CloudForge cung cấp API tương thích hình dạng Frappe; frontend MetaForge là React Desk dùng chung, render list/form/navigation từ metadata. Ứng dụng ngành dọc được đóng gói thành manifest/brief và app Worker thay vì fork runtime.

Repo gốc là `C:\Forge`. Package manager là pnpm 9, Node yêu cầu từ 22.

## Hiện trạng

- Branch: `hotfix/alumdoor-print-list-delete`.
- Baseline chức năng Alumdoor đã kéo: `7bbf20f test(alumdoor): align v2.0.34 contract`.
- Purchase Order print fixture: `f5186c4 test(alumdoor): add purchase order print fixture`.
- Contract phân bổ Purchase Receipt vào nhiều PO line đã chốt tại `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`; điểm review thiết kế 9,2/10, chưa implementation.
- Typecheck/build/lint/test/frozen install đã pass ở đợt audit trước; chưa chạy lại cho các commit tài liệu mới.
- GitHub connector chưa trả check-run cho HEAD tài liệu hiện tại.
- `server/work/` và `tmp/` là untracked generated/work directories có sẵn, không xóa hoặc commit.

## Kiến trúc cốt lõi

Browser vào Gateway Worker (`server/apps/gateway-worker/src/index.ts`). Gateway phân giải tenant bằng KV, phục vụ SPA qua Workers Assets, bỏ identity header không tin cậy, ký trusted identity và dispatch tenant Worker.

Tenant Worker (`server/apps/tenant-worker/src/index.ts`) mount native API và Frappe facade. Generic Frappe router là `server/packages/frappe-api/src/router.ts`. Read dùng D1/metadata stores; write phải qua document kernel và Aggregate Durable Object để serialize, tạo mutation receipt, ledger/outbox. Không bypass đường write này.

Frontend entry là `client/apps/runtime/src/main.tsx`. API boundary là `client/packages/adapter-frappe/src/frappe-adapter.ts`. `MetaForgeProvider`, metadata resolver và form/list containers nằm trong `client/packages/views/` và `client/packages/core/src/meta/resolver.ts`.

Auth cookie/session nằm trong `server/packages/frappe-api/src/session.ts` và `auth-routes.ts`. Permission thực thi thật ở `server/packages/frappe-model/src/permission.ts`; việc UI ẩn nút không phải security boundary.

Migration tenant hiện đi từ `server/migrations/tenant/0001_core.sql` tới `0026_supplier_receipt_tolerance.sql`. Không sửa migration đã chạy; implementation allocation phải thêm `0027_purchase_receipt_allocation.sql`.

## Việc gần nhất

Alumdoor v2.0.34 là app được chỉnh gần nhất. Nguồn generator là `server/scripts/build-alumdoor-v2-brief.mjs`, output là `server/briefs/alumdoor-v2.json`.

Purchase Order print đã có fixture cấu trúc A4/13 cột qua renderer production. Tenant `alu` đã được operator xác nhận backup/preflight/live deploy, nhưng Gateway production traffic và production smoke login/CRUD/print/PDF chưa được xác minh độc lập.

Yêu cầu tiếp theo đã được phân tích và chốt contract: một Receipt có thể bù nhiều PO line theo FIFO, PO kéo dài nhiều tuần, dung sai ±5% theo settlement window, lịch sử allocation bất biến, cancel/backdated không viết lại lịch sử và legacy backfill không đoán row id.

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

## Nên làm tiếp

1. Hoàn tất P0 production smoke và xác nhận Gateway version/traffic cho tenant `alu`.
2. Bắt đầu M1 của contract allocation: migration `0027`, contracts và D1 guards; chưa deploy production.
3. Sau M1, làm canonical material key, supplier coordinator, allocation planner và concurrency tests theo thứ tự trong `NEXT_TASKS.md`.
4. Chỉ cutover production sau dry-run backfill trên backup, checksum, staging migration/smoke và backup mới.

Backlog đầy đủ ở `NEXT_TASKS.md`.

## File nên đọc đầu tiên

1. `PROJECT_CONTEXT.md`
2. `ARCHITECTURE.md`
3. `CURRENT_STATUS.md`
4. `NEXT_TASKS.md`
5. `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`
6. `package.json`, `pnpm-workspace.yaml`, `README.md`
7. `server/apps/tenant-worker/src/index.ts`
8. `server/apps/tenant-worker/src/aggregate-do.ts`
9. `server/packages/document-kernel/src/kernel.ts`
10. `server/packages/document-kernel/src/d1-store.ts`
11. `server/packages/clouderp-core/src/controllers.ts`
12. `server/packages/clouderp-core/src/types.ts`
13. `server/packages/contracts/src/index.ts`
14. Với Alumdoor: generator, brief, app Worker và các test Alumdoor.

## Giả định không được tự ý thay đổi

- Frappe-shaped API là compatibility contract.
- Frontend production là runtime metadata-driven dùng chung.
- Server permission là authoritative.
- Mọi mutation phải qua document kernel/Durable Object.
- D1 migration là append-only.
- Brief sinh tự động phải sửa từ generator.
- Tenant deploy phải qua script tạo config đúng tenant/database.
- Allocation ledger mới phải là nguồn sự thật; progress table cũ chỉ được giữ làm compatibility projection sinh từ cùng plan.
- Không đưa `.env`, `.dev.vars`, token, private key, session secret hoặc Cloudflare secret vào Git/log/tài liệu.
- Không coi `server/STATUS.md` cũ là nguồn sự thật nếu mâu thuẫn với code/migration hiện tại.

## Chạy local

Từ `C:\Forge`:

```powershell
pnpm.cmd install
pnpm.cmd run typecheck
pnpm.cmd --filter cloudforge run dev:tenant
pnpm.cmd --filter cloudforge run dev:gateway
```

Cần cấu hình local D1/KV/R2/Queue và `.dev.vars` theo `server/.dev.vars.example`; không dùng production secret. Đọc scripts cụ thể trong `server/package.json` và hướng dẫn `server/README.md` trước khi khởi động/provision.

## Test, build và deploy

```powershell
pnpm.cmd --filter metaforge run lint
pnpm.cmd run test
pnpm.cmd run typecheck
pnpm.cmd run build
```

Deploy:

- Stage runtime bằng `server/scripts/stage-client-bundle.mjs`.
- Gateway dùng `server/apps/gateway-worker/wrangler.jsonc`.
- Tenant dùng `server/scripts/deploy-tenant.mjs`.
- Migration remote dùng `server/scripts/d1-migrate-remote.mjs`.
- Tenant mới dùng `server/scripts/provision-tenant.mjs`.

Luôn kiểm tra account, bindings, pending migration, clean worktree và secret trước deploy. Không deploy Cloudflare hoặc sửa production secrets nếu chưa được yêu cầu rõ.

## Câu hỏi còn lại cần chứng minh bằng implementation

- D1 batch/latency thực tế khi một xe sinh hàng trăm allocation rows.
- Contention của supplier coordinator dưới nhiều Receipt liên tiếp.
- UX preview, manual override và settlement action trên dữ liệu thật.
- Tỷ lệ legacy resolved/unresolved và checksum khi dry-run trên production backup.
- Print Purchase Order đã được khách chốt visual cuối hay còn vòng QA font/PDF.
