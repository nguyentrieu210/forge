# PROJECT CONTEXT

## 1. Dự án và mục tiêu

**Forge / CloudForge + MetaForge** là một ERP đa tenant chạy trên Cloudflare, cung cấp API tương thích hình dạng Frappe để một frontend React dùng chung có thể render ứng dụng từ metadata. Tuyên bố sản phẩm và ranh giới tương thích nằm tại `README.md`; các workspace thực tế được khai báo trong `pnpm-workspace.yaml`.

Mục tiêu kiến trúc là:

- **CloudForge** xử lý document lifecycle, metadata, permission, ledger, workflow, file và hạ tầng tenant trong `server/`.
- **MetaForge** là Desk/builder React metadata-driven trong `client/`.
- Ứng dụng nghiệp vụ được đóng gói bằng manifest/brief, cài vào tenant dưới dạng metadata và dữ liệu thay vì fork giao diện. Luồng này nằm ở `server/packages/app-registry/src/manifest.ts`, `server/packages/app-registry/src/installer.ts` và `server/scripts/forge-app.mjs`.

Người dùng mục tiêu là doanh nghiệp cần ERP theo vai trò: quản trị tenant, kế toán, bán hàng, kho, mua hàng, sản xuất/bảo trì và các nghiệp vụ ngành dọc. Alumdoor là ứng dụng ngành dọc đang được phát triển tích cực; nguồn brief hiện hành là `server/briefs/alumdoor-v2.json`, được sinh từ `server/scripts/build-alumdoor-v2-brief.mjs`.

## 2. Chức năng đã có

### Nền tảng

- API document CRUD, metadata, workflow, collaboration, print, import/export, report và app catalog được mount trong `server/packages/frappe-api/src/router.ts`.
- Native API và điều phối request nằm trong `server/apps/tenant-worker/src/index.ts`.
- Gateway phân giải tenant theo hostname, phục vụ SPA cùng origin và dispatch Worker trong `server/apps/gateway-worker/src/index.ts`.
- Document mutation có idempotency, lifecycle/controller và receipt trong `server/packages/document-kernel/src/kernel.ts` và `server/packages/document-kernel/src/d1-store.ts`.
- Metadata, custom field, property setter, workflow và print format được đọc từ D1 qua `server/packages/frappe-model/src/store.ts`.
- Quyền theo role, DocPerm, permlevel, owner, share và user permission được thực thi bởi `server/packages/frappe-model/src/permission.ts`.
- Outbox, ledger, report/query, social commerce và app hooks đã có package/service riêng trong `server/packages/`.

### Frontend

- Runtime React chung khởi động tại `client/apps/runtime/src/main.tsx`.
- Router hỗ trợ list/form/new form/print/report/workspace/overview/action screen/import trong cùng file.
- Mọi gọi API Frappe-shaped đi qua `client/packages/adapter-frappe/src/frappe-adapter.ts`.
- Form/list/child table được render từ metadata bởi `client/packages/views/src/container/`, `client/packages/views/src/form/` và registry tại `client/packages/views/src/registry.ts`.
- Field state như hidden, masked, locked và editable được suy ra bởi `client/packages/core/src/meta/resolver.ts`.
- Session boundary/login nằm tại `client/packages/shell/src/auth/AuthBoundary.tsx`.

### Alumdoor

- Brief v2 hiện là `2.0.34`, gồm metadata hàng hóa, mua hàng, bán hàng, kho, báo cáo, action và print format trong `server/briefs/alumdoor-v2.json`.
- Logic chuyên biệt gồm công thức cửa, cắt nhôm, giữ/trả tồn, reconciliation, khóa kỳ kế toán, quote/order/receipt/FIFO/delivery/OCR trong `server/apps-src/alumdoor-worker/src/`.
- Migration tenant hiện đi tới `server/migrations/tenant/0026_supplier_receipt_tolerance.sql`.
- Công việc gần nhất là bản in Purchase Order Alumdoor và sửa lưu partial document. Nguồn print phải sửa ở `server/scripts/build-alumdoor-v2-brief.mjs`, sau đó sinh lại `server/briefs/alumdoor-v2.json`; không nên sửa riêng JSON rồi để generator ghi đè.

## 3. Phần đang dở hoặc giới hạn

- `client/apps/runtime/src/main.tsx` còn `DeskFallback` cho một số page/dashboard chưa có renderer chuyên biệt.
- `ProcessContainer` đã có phía client nhưng comment trong luồng gọi cho biết API process chưa hoàn chỉnh; `server/packages/frappe-api/src/router.ts` vẫn có nhánh trả not-implemented cho method không được đăng ký.
- UI collaboration mới nối một phần: picker assign, upload attachment và inline tag còn được ghi Partial trong `client/docs/implementation-traceability.md`.
- Lint frontend đã được đưa về 0 vi phạm và full test đã chạy hết sau khi đồng bộ contract Alumdoor v2.0.34; chi tiết ở `CURRENT_STATUS.md`.
- `server/STATUS.md` và một số tài liệu cũ không còn phản ánh migration/phiên bản hiện tại. Khi mâu thuẫn, ưu tiên code, migration và manifest đang build.

## 4. Luồng nghiệp vụ chính

1. Gateway nhận hostname và tìm route tenant từ KV trong `server/apps/gateway-worker/src/index.ts`.
2. Static route nhận SPA từ Assets; API được ký trusted identity và dispatch tới tenant Worker.
3. Tenant Worker xác thực tenant header, session/JWT và chuyển Frappe endpoint vào `server/packages/frappe-api/src/router.ts`.
4. Router tải metadata và permission, validate input, rồi mọi write đi qua `runCommand`/document kernel.
5. Durable Object serialize mutation; D1 lưu document, metadata, ledger, receipt và outbox.
6. Frontend lấy boot + app manifest, dựng navigation/router và dùng metadata để render list/form.
7. Ứng dụng ngành dọc đăng ký validators/hooks/app methods qua manifest và app Worker; platform callback dùng signed internal identity.

## 5. Stack thực tế

- Node.js `>=22`, pnpm workspace 9.
- TypeScript ESM.
- Frontend: React 19, React Router, TanStack Query/Table, React Hook Form, Zod, Tailwind CSS v4, Radix/shadcn, Vite, Recharts, jsPDF/html2canvas/xlsx.
- Backend: Cloudflare Workers, Workers for Platforms/dispatch namespace, D1, Durable Objects, KV, R2, Queues và tùy chọn Workers AI.
- Test: Vitest, `@cloudflare/vitest-pool-workers`, Node test runner và SQL verification scripts.
- Deploy: Wrangler 4 và các script trong `server/scripts/`.

## 6. Kiến trúc frontend, backend và database

- Frontend là generic runtime, không chứa schema cứng cho từng app. `client/apps/runtime/src/main.tsx` khởi tạo adapter, boot, manifest và provider.
- Backend gồm Gateway, Tenant, Query, Jobs, Control Plane và Social Ingress Worker trong `server/apps/*`.
- Service/domain logic nằm ở `server/packages/*`; app logic độc lập nằm ở `server/apps-src/*`.
- D1 schema được quản lý tuần tự tại `server/migrations/tenant/`, `server/migrations/control/` và `server/migrations/jobs/`.
- Durable Object `AGGREGATES` là điểm serialize write; D1 là store/query replica; Queue đảm nhiệm outbox và prepared report; R2 lưu file.

## 7. Frontend gọi backend

`client/packages/adapter-frappe/src/frappe-adapter.ts` là ranh giới API duy nhất cho giao diện. Adapter gọi endpoint Frappe-shaped (`/api/resource/*`, `/api/method/*`) cùng origin, xử lý CSRF/session, cache metadata và D1 bookmark để read-your-writes. Không nên gọi `fetch` rải rác trong component mới nếu adapter có thể mở rộng.

## 8. Xác thực và phân quyền

- Cookie `sid` được ký HMAC, `HttpOnly`, `Secure`, `SameSite=Lax`; session có TTL, sliding renewal và epoch revoke trong `server/packages/frappe-api/src/session.ts`.
- Login/logout, PBKDF2 password verification và rate limit nằm tại `server/packages/frappe-api/src/auth-routes.ts`.
- Native API dùng Bearer JWT HS256 với issuer/audience bắt buộc trong production.
- Gateway loại bỏ platform identity header không tin cậy rồi ký envelope ngắn hạn cho tenant.
- UI dùng capability/meta để ẩn hoặc khóa thao tác, nhưng server-side `MetadataPermissionService` mới là nguồn cưỡng chế cuối cùng.

## 9. Metadata render giao diện

1. Tenant đọc installed apps và metadata từ D1.
2. Server tạo client manifest đã lọc quyền qua app registry/Frappe router.
3. Runtime tải manifest bằng `metaforge.api.get_app_manifest` tại `client/apps/runtime/src/main.tsx`.
4. `MetaForgeProvider` trong `client/packages/views/src/container/provider.tsx` giữ adapter, registry, roles, scope và locale.
5. Resolver tại `client/packages/core/src/meta/resolver.ts` tính visibility/editability.
6. List/Form/ChildGrid chọn control từ `client/packages/views/src/registry.ts`.

## 10. Module hiện có

- Platform workers: gateway, tenant, query, jobs, control-plane, social-ingress (`server/apps/`).
- Core packages: frappe-api, document-kernel, frappe-model, app-registry, query, ledger, money, outbox (`server/packages/`).
- ERP/domain packages: clouderp-core, erpnext, selling, stock, pricing và social-commerce (`server/packages/`).
- App packages/brief: Alumdoor, Center, Assets, Phân bón, HRM, Maintenance, Visits, Social Commerce (`server/briefs/`, `server/apps-src/`).
- Frontend packages: core, adapter-frappe, ui, controls, views, builder, shell, stock-vn (`client/packages/`).

## 11. Quyết định kiến trúc không nên đổi tùy tiện

- Giữ API Frappe-shaped làm compatibility boundary (`README.md`, `server/packages/frappe-api/src/router.ts`).
- Không bypass document kernel/Durable Object khi ghi dữ liệu.
- Không lấy UI permission làm lớp bảo mật duy nhất.
- Không hard-code schema app vào runtime chung; dùng metadata/manifest.
- Không chỉnh migration đã chạy; thêm migration mới theo số thứ tự.
- Không sửa riêng file brief sinh tự động khi có generator tương ứng.
- Không đưa secret, D1/KV/R2 identifier sản xuất hoặc `.dev.vars` vào Git/tài liệu.
- Không deploy tenant bằng config chung; dùng `server/scripts/deploy-tenant.mjs` để tránh bind nhầm database.

## 12. Vấn đề kỹ thuật và hướng tiếp theo

Ưu tiên hiện tại là giữ GitHub Actions xanh, bổ sung test render/PDF ổn định và hoàn thiện renderer/API còn fallback. Sau đó mới tối ưu bundle Vite đang cảnh báo chunk 500 KB–1.1 MB. Backlog cụ thể ở `NEXT_TASKS.md`.
