# AI HANDOFF

## Dự án này là gì

Forge là monorepo ERP đa tenant trên Cloudflare. Backend CloudForge cung cấp API tương thích hình dạng Frappe; frontend MetaForge là React Desk dùng chung, render list/form/navigation từ metadata. Ứng dụng ngành dọc được đóng gói thành manifest/brief và app Worker thay vì fork runtime.

Repo gốc là `C:\Forge`. Package manager là pnpm 9, Node yêu cầu từ 22.

## Hiện trạng

- Branch: `hotfix/alumdoor-print-list-delete`.
- Latest commit: `e21a281 fix(alumdoor): căn giữa nội dung thân bảng in`.
- Typecheck: pass.
- Build toàn monorepo: pass, có warning bundle lớn.
- Lint: fail 26 lỗi trong 9 frontend files.
- Test: fail 2 stale Alumdoor tests tại `server/tests/alumdoor-item-model.test.mjs`; suite dừng trước SQL/client tests.
- Không có thay đổi logic trong lần audit này. `server/work/` và `tmp/` là untracked generated/work directories có sẵn, không xóa.

## Kiến trúc cốt lõi

Browser vào Gateway Worker (`server/apps/gateway-worker/src/index.ts`). Gateway phân giải tenant bằng KV, phục vụ SPA qua Workers Assets, bỏ identity header không tin cậy, ký trusted identity và dispatch tenant Worker.

Tenant Worker (`server/apps/tenant-worker/src/index.ts`) mount native API và Frappe facade. Generic Frappe router là `server/packages/frappe-api/src/router.ts`. Read dùng D1/metadata stores; write phải qua document kernel và Aggregate Durable Object để serialize, tạo mutation receipt, ledger/outbox. Không bypass đường write này.

Frontend entry là `client/apps/runtime/src/main.tsx`. API boundary là `client/packages/adapter-frappe/src/frappe-adapter.ts`. `MetaForgeProvider`, metadata resolver và form/list containers nằm trong `client/packages/views/` và `client/packages/core/src/meta/resolver.ts`.

Auth cookie/session nằm trong `server/packages/frappe-api/src/session.ts` và `auth-routes.ts`. Permission thực thi thật ở `server/packages/frappe-model/src/permission.ts`; việc UI ẩn nút không phải security boundary.

Migration tenant đi từ `server/migrations/tenant/0001_core.sql` tới `0026_supplier_receipt_tolerance.sql`. Không sửa migration đã chạy; thêm migration mới.

## Việc gần nhất

Alumdoor v2.0.34 đang là app được chỉnh gần nhất. Nguồn generator là `server/scripts/build-alumdoor-v2-brief.mjs`, output là `server/briefs/alumdoor-v2.json`. Công việc cuối tập trung vào Purchase Order print: layout A4 dọc, cột/căn giữa/header/logo và preview/PDF; commit cuối căn giữa nội dung thân bảng. Trước đó router đã được sửa để merge partial Frappe PUT với stored document trước controller normalization.

Hai test Alumdoor hiện còn kỳ vọng version `2.0.7`, header text/asset và cột cũ (`qty_bundle`, `theoretical_kg`), nên test gate đỏ dù build xanh.

## Nên làm tiếp

1. Đọc BRD/mẫu Alumdoor và xác nhận contract print v2.0.34.
2. Sửa test stale, không revert generator về contract cũ.
3. Chạy root test đến hết để biết SQL/client suite thật sự xanh hay đỏ.
4. Thêm visual/integration fixture cho preview và PDF.
5. Xử lý lint từng component, không mass replace native controls.

Backlog đầy đủ ở `NEXT_TASKS.md`.

## File nên đọc đầu tiên

1. `PROJECT_CONTEXT.md`
2. `ARCHITECTURE.md`
3. `CURRENT_STATUS.md`
4. `package.json`, `pnpm-workspace.yaml`, `README.md`
5. `client/apps/runtime/src/main.tsx`
6. `client/packages/adapter-frappe/src/frappe-adapter.ts`
7. `server/apps/gateway-worker/src/index.ts`
8. `server/apps/tenant-worker/src/index.ts`
9. `server/packages/frappe-api/src/router.ts`
10. `server/packages/document-kernel/src/kernel.ts`
11. `server/packages/frappe-model/src/permission.ts`
12. Với Alumdoor: generator, brief, app Worker và `server/tests/alumdoor-item-model.test.mjs`.

## Giả định không được tự ý thay đổi

- Frappe-shaped API là compatibility contract.
- Frontend production là runtime metadata-driven dùng chung.
- Server permission là authoritative.
- Mọi mutation phải qua document kernel/Durable Object.
- D1 migration là append-only.
- Brief sinh tự động phải sửa từ generator.
- Tenant deploy phải qua script tạo config đúng tenant/database.
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
pnpm.cmd run build
```

Deploy không được thực hiện trong audit. Khi được phê duyệt:

- Stage runtime bằng `server/scripts/stage-client-bundle.mjs`.
- Gateway dùng `server/apps/gateway-worker/wrangler.jsonc`.
- Tenant dùng `server/scripts/deploy-tenant.mjs`.
- Migration remote dùng `server/scripts/d1-migrate-remote.mjs`.
- Tenant mới dùng `server/scripts/provision-tenant.mjs`.

Luôn kiểm tra account, bindings, pending migration, clean worktree và secret trước deploy.

## Câu hỏi chưa có đáp án chắc chắn từ code

- Print Purchase Order Alumdoor v2.0.34 đã được khách chốt làm contract cuối hay vẫn còn vòng visual QA?
- Các test kỳ vọng cột cũ cần xóa hẳn hay giữ cho một print format legacy riêng?
- Page/dashboard/process renderer nào là ưu tiên tiếp theo và contract API chính thức là gì?
- `server/STATUS.md` sẽ được duy trì hay thay bằng release manifest tự sinh?
- Các deployment hiện hành dùng đầy đủ Query/Jobs/Social services cho mọi tenant hay chỉ bật theo plan?
- Warning bundle lớn có SLA tải trang cụ thể để đặt budget hay chưa?
