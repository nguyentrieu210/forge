# ARCHITECTURE

## Cây thư mục rút gọn

```text
C:\Forge
├─ client/
│  ├─ apps/runtime/                 # SPA production chung
│  ├─ apps/demo|sample-*|kho-vn/    # demo/sample apps
│  ├─ packages/
│  │  ├─ adapter-frappe/            # API boundary
│  │  ├─ core/                      # types, metadata resolver
│  │  ├─ controls|ui|views/         # render controls/list/form
│  │  ├─ builder/                   # metadata builder
│  │  └─ shell/                     # app shell, auth, navigation
│  └─ scripts/
├─ server/
│  ├─ apps/
│  │  ├─ gateway-worker/
│  │  ├─ tenant-worker/
│  │  ├─ query-worker/
│  │  ├─ jobs-worker/
│  │  ├─ control-plane-worker/
│  │  └─ social-ingress-worker/
│  ├─ apps-src/                     # app Workers ngành dọc
│  ├─ packages/                     # kernel, API, model, services
│  ├─ migrations/{tenant,control,jobs}/
│  ├─ briefs/                       # app manifests/metadata
│  ├─ scripts/                      # build, install, migrate, deploy
│  └─ tests/
├─ docs/
├─ package.json
└─ pnpm-workspace.yaml
```

Các thư mục `node_modules`, `dist`, `build`, `.git`, `coverage`, `server/work` và `tmp` là dependency/generated/cache, không phải nguồn kiến trúc.

## Entry points và router

| Lớp | Entry point | Vai trò |
|---|---|---|
| Frontend | `client/apps/runtime/src/main.tsx` | Tạo adapter, auth/manifest boundary, provider và React Router |
| Gateway | `server/apps/gateway-worker/src/index.ts` | Host routing, Assets, trusted identity, dispatch |
| Tenant | `server/apps/tenant-worker/src/index.ts` | Native routes, Frappe facade, internal routes |
| Frappe router | `server/packages/frappe-api/src/router.ts` | `/api/resource/*`, `/api/method/*`, CRUD/workflow/report/print |
| Query | `server/apps/query-worker/src/index.ts` | Prepared/report query workload |
| Jobs | `server/apps/jobs-worker/src/index.ts` | Queue và scheduled maintenance |
| Control plane | `server/apps/control-plane-worker/src/index.ts` | Tenant routing/provisioning state |
| Social ingress | `server/apps/social-ingress-worker/src/index.ts` | OAuth/webhook/social event ingress |

Frontend routes được khai báo trực tiếp trong `client/apps/runtime/src/main.tsx`, gồm list/form/new/print/report/workspace/overview/catalog/permissions/import/action screen.

## Request và service layers

```mermaid
flowchart LR
    U["Browser / MetaForge"] --> G["Gateway Worker"]
    G --> A["Cloudflare Assets"]
    G -->|signed tenant identity| T["Tenant Worker"]
    T --> F["Frappe API router"]
    T --> N["Native API routes"]
    F --> P["Metadata + Permission services"]
    F --> K["Document Kernel"]
    N --> K
    K --> DO["Aggregate Durable Object"]
    DO --> D1["Tenant D1"]
    K --> Q["Outbox Queue"]
    F --> R2["R2 Files"]
    T --> AW["App Worker / app methods"]
```

- **API layer:** tenant Worker + `server/packages/frappe-api/src/router.ts`.
- **Service layer:** `server/packages/frappe-api/src/services/`, `server/packages/query/`, `server/packages/app-registry/` và domain packages.
- **Data access:** `server/packages/document-kernel/src/d1-store.ts`, `server/packages/frappe-model/src/store.ts` và package ledger/query stores.
- **Write path:** router → controller/validator → document kernel → Durable Object → D1 + outbox.
- **Read path:** router/service → D1 session; bookmark được trả về để client có read-your-writes.

## Database schema

Migration là nguồn sự thật:

- Tenant: `server/migrations/tenant/0001_core.sql` đến `0026_supplier_receipt_tolerance.sql`.
- Control plane: `server/migrations/control/`.
- Jobs: `server/migrations/jobs/`.

Nhóm bảng chính:

- Documents/lifecycle: `documents`, `document_children`, `versions`, mutation guard/receipts.
- Metadata: doctype definitions, custom fields, property setters, workflows, print formats.
- Auth/permission: users, roles, user roles, user permissions, shares.
- ERP ledger: GL, stock ledger, payment ledger, order fulfillment và các reporting views.
- Platform: installed apps, app objects/hooks, files, imports, notifications, auto-repeat.
- Social commerce, maintenance, AI logs và Alumdoor-specific views/tolerance.

Không sửa migration cũ đã có khả năng chạy production; thêm migration mới và test upgrade path.

## Authentication flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant G as Gateway
    participant T as Tenant Worker
    participant A as Auth routes
    participant D as D1
    B->>G: POST /api/method/login
    G->>T: dispatch by tenant
    T->>A: login request
    A->>D: user + rate-limit lookup
    A-->>B: signed sid cookie + CSRF nonce
    B->>G: API request + sid + x-frappe-csrf-token
    G->>T: trusted tenant envelope
    T->>A: verify signature, TTL, epoch, roles
    A-->>T: authenticated principal
```

Chi tiết nằm ở `server/packages/frappe-api/src/session.ts` và `auth-routes.ts`. Native API dùng Bearer JWT; internal Gateway/app callbacks dùng HMAC envelope khác với user session.

## Authorization flow

`server/packages/frappe-model/src/permission.ts` kết hợp DocPerm metadata, role, permlevel, owner, share và user permission. Router redacts document/metadata khi đọc và assert quyền khi ghi. Frontend resolver chỉ phục vụ presentation; không thay thế server authorization.

## State management

- Server state/cache: TanStack Query trong các container frontend.
- Runtime context: `MetaForgeProvider` tại `client/packages/views/src/container/provider.tsx`.
- Auth/session: `AuthBoundary` và adapter.
- View state: React hooks, URL query string cho list/filter/page/selection, localStorage cho một số layout/preference.
- Không dùng Redux.

## Form/list và metadata loading

```mermaid
flowchart TD
    Boot["getBoot + get_app_manifest"] --> Provider["MetaForgeProvider"]
    Provider --> Route["React Router"]
    Route --> Meta["adapter.getMeta(doctype)"]
    Meta --> Resolve["metadata resolver + permissions"]
    Resolve --> List["ListContainer / TanStack Table"]
    Resolve --> Form["FormContainer / ChildGrid"]
    Form --> Registry["Control registry"]
    List --> Adapter["FrappeAdapter"]
    Form --> Adapter
    Adapter --> API["Frappe-shaped API"]
```

Manifest parser/server model nằm tại `server/packages/app-registry/src/manifest.ts`; frontend validation/loading bắt đầu từ `client/apps/runtime/src/main.tsx`.

## File upload

Frontend gọi `uploadFile` trong `client/packages/adapter-frappe/src/frappe-adapter.ts`. Frappe router nhận upload/file endpoints, lưu metadata File trong D1 và binary qua binding `FILES` (R2) của tenant Worker. Truy cập file phải đi qua facade để áp dụng tenant/session/permission.

## Build flow

1. `pnpm.cmd run typecheck`
2. `pnpm.cmd run build`
3. Server TypeScript build.
4. Client packages/apps build bằng TypeScript/Vite.
5. Runtime production được stage bởi `server/scripts/stage-client-bundle.mjs` vào Assets của Gateway khi chạy release flow.
6. App brief được compile/verify bằng `server/scripts/forge-app.mjs` và các script build brief tương ứng.

Root scripts và release gates nằm trong `package.json`; chi tiết server/client nằm trong `server/package.json` và `client/package.json`.

## Deployment flow

- Gateway: Wrangler config `server/apps/gateway-worker/wrangler.jsonc`; deploy sau khi stage client bundle.
- Tenant: dùng `server/scripts/deploy-tenant.mjs`, không dùng config tenant chung để tránh bind nhầm D1.
- Tenant mới: `server/scripts/provision-tenant.mjs` chạy migration, deploy dispatch Worker, thiết lập secret/route/admin.
- Remote D1 migration: `server/scripts/d1-migrate-remote.mjs`.
- Các Worker khác có `wrangler.jsonc` riêng dưới `server/apps/*`.

```mermaid
flowchart TB
    Pages["Gateway Assets / SPA"] --> Gateway["Gateway Worker"]
    Routes["ROUTES KV"] --> Gateway
    Gateway --> Dispatch["Workers for Platforms Dispatcher"]
    Dispatch --> Tenant["Per-tenant Worker"]
    Tenant --> D1["Per-tenant D1"]
    Tenant --> DO["Aggregate Durable Object"]
    Tenant --> Files["R2 FILES"]
    Tenant --> Outbox["OUTBOX Queue"]
    Outbox --> Jobs["Jobs Worker"]
    QueryQ["Prepared-report Queue"] --> Query["Query Worker"]
    Control["Control-plane Worker + D1"] --> Routes
    Social["Social ingress + Queue"] --> Dispatch
```

Repo hiện không dùng Cloudflare Pages như một project frontend độc lập; SPA được phục vụ bằng Workers Assets của Gateway. Không ghi resource ID hoặc secret thật vào tài liệu hay cấu hình mẫu.
