# SENTRUX MAP

Ngày cập nhật: **2026-08-16**.  
Topology sample: `main@81b0b171cb6d0c7c22beb5e04e01ee4503a82aad`.

Đây là **navigation/ownership map** cho người và AI agent. Nó không phải Sentrux scan output và không lưu score cố định. Nếu code đã đổi topology, exact tree/import graph thắng file này và map phải được cập nhật trong cùng PR.

## 1. Mục tiêu

Trước khi sửa code, dùng map để trả lời bốn câu:

1. File/feature thuộc owner nào?
2. Authority nằm ở layer nào?
3. Dependency được phép đi theo hướng nào?
4. Verification/Sentrux blast radius nào phải chạy?

Không bắt đầu bằng search một symbol rồi sửa file đầu tiên tìm thấy nếu chưa biết nó nằm ở đâu trong dependency graph.

## 2. Root map

```text
forge/
├─ apps/alumdoor/              vertical composition
├─ client/
│  ├─ apps/                    runtime/mobile/demo/domain surfaces
│  └─ packages/                shared frontend primitives
├─ server/
│  ├─ apps/                    Worker/runtime entrypoints
│  ├─ packages/                shared platform + ERP/domain authority
│  ├─ migrations/              append-only schema history
│  ├─ briefs/                  manifests/metadata composition
│  ├─ scripts/                 build/migrate/install/release tooling
│  └─ tests/                   backend verification
├─ docs/                       canonical docs + durable evidence
├─ skills/                     agent policy/routing
├─ qa/ + validation/           verification assets
├─ .github/workflows/          CI/release/Sentrux automation
└─ .sentrux/rules.toml         machine-readable structural guardrails
```

## 3. Runtime dependency spine

```text
Browser / MetaForge
        |
        v
client/apps/runtime
        |
        v
client/packages/adapter-frappe
        |
        v
server/apps/gateway-worker
        |
        v
server/apps/tenant-worker
        |
        +--> server/packages/frappe-api
        |             |
        |             v
        |     server/packages/document-kernel
        |             |
        |             v
        |       Durable Object / D1
        |
        +--> bounded native/internal routes
                      |
                      v
            shared domain/platform packages
```

Background/data planes branch to query/jobs/control/social workers without becoming alternate business-write authorities.

## 4. Frontend ownership

### `client/apps/runtime/`

Shared application runtime. Owns route/runtime composition, not generic field/view primitives and not vertical business authority.

Change here when: global runtime route/provider/composition changes.  
Look next: `client/packages/views`, `shell`, `adapter-frappe` before duplicating behavior locally.

### `client/apps/*-mobile/`, `hrm/`, `kho*`, samples/demo

Bounded app surfaces. They consume shared packages. Reusable behavior discovered here should move downward to a shared package rather than be copied to sibling apps.

### `client/packages/core/`

Low-level metadata/types/resolution contracts. Keep dependency-light. Avoid importing view/shell/app packages upward into core.

### `client/packages/controls/`

Field/control rendering primitives. Keep business/domain rules out unless they are genuinely generic control semantics.

### `client/packages/views/`

List/form/report/workspace/container behavior. Known depth/fan-out hotspot: prefer narrow subpath/leaf imports and bounded dependency kits over one giant root barrel.

### `client/packages/shell/`

Authentication UX, app shell and navigation composition. It may consume core/UI/view contracts; lower-level packages should not depend back on shell.

### `client/packages/adapter-frappe/`

Client/backend compatibility boundary. Keep transport/Frappe shape here; do not pull server implementation into client.

### `client/packages/builder/`, `ui/`, `visual/`, `charts/`, `stock-vn/`

Bounded shared capabilities. `stock-vn` may integrate domain-specific presentation/report contracts but must not become authoritative stock logic.

## 5. Server ownership

### `server/apps/gateway-worker/`

Edge/host/assets/trusted tenant dispatch. Do not put ERP business rules here.

### `server/apps/tenant-worker/`

Tenant runtime/API composition. Router/service assembly belongs here; reusable business logic belongs in packages. Large route wrappers should be split by bounded concern rather than allowed to become one fan-out hub.

### `server/apps/query-worker/`

Read/report workloads. Query projection cannot become authoritative write path.

### `server/apps/jobs-worker/`

Queue/scheduled/background execution. Idempotency/retry contracts matter; do not invent shadow domain state here.

### `server/apps/control-plane-worker/`

Tenant/provisioning/control-plane authority. Keep tenant business data out unless contract explicitly requires it.

### `server/apps/social-ingress-worker/`

External OAuth/webhook/social ingress. Normalize/validate ingress, then hand off to bounded shared authority.

### Other `server/apps/*`

`workflow-worker`, `purchase-qa-callback`, `web` are bounded entrypoints. If logic becomes reusable or business-authoritative, move it into the owning package.

## 6. Shared server packages

### `server/packages/document-kernel/`

**Canonical business mutation/lifecycle spine.** Preserve OCC/idempotency/permission/audit/aggregate serialization. Highest-risk changes.

### `server/packages/frappe-api/`

Frappe-shaped compatibility facade. Router/controller/service split should remain bounded. Translation belongs here; generic ERP authority belongs below/in domain packages.

### `server/packages/frappe-model/`

Metadata/model/permission semantics. Security-sensitive; client visibility is never a substitute.

### `server/packages/app-registry/`

App manifest/install/registry lifecycle. Registry growth should be split by bounded registrars rather than one god registry.

### `server/packages/core/` + `contracts/`

Shared low-level contracts. Keep them stable and dependency-light; avoid importing domain/app/vertical implementations upward.

### `server/packages/clouderp-*`

ERP/domain authorities. Current examples include core, ERPNext compatibility, pricing, selling and stock. Split by domain ownership, not by vertical consumer.

### Other platform/integration packages

Own bounded reusable service contracts. They must not silently duplicate Document Kernel, Stock, Finance, Payroll, Pricing or permission authority.

## 7. Vertical boundary — `apps/alumdoor/`

Alumdoor composes shared capabilities and keeps only industry-specific behavior. Before adding code here, ask whether the behavior is reusable by another ERP customer. If yes, place it in the owning shared domain/platform package.

Forbidden direction conceptually:

```text
shared core/domain  --->  Alumdoor implementation
```

Shared code may expose extension contracts consumed by Alumdoor; it should not import Alumdoor implementation to make generic behavior work.

## 8. Import/refactor rules for Sentrux work

1. **No score-only refactor.** Preserve behavior, tests, type contracts and business invariants.
2. **Prefer leaf imports in hotspots.** Root barrels are public API only, not convenience dependency hubs.
3. **Split by ownership.** Router/registry/controller split must create coherent bounded modules, not arbitrary chunks by line count.
4. **No cycle trade.** Never lower fan-out/depth by introducing circular dependency.
5. **Keep core downward.** Low-level contracts/core must not depend on app/shell/vertical/high-level orchestration.
6. **Keep client/server separated.** Client talks through contracts/API; server packages do not import React/runtime code.
7. **Generated vs handwritten.** Generated/source-data files need explicit generator boundary and should not inflate handwritten module dependencies.
8. **Delete experiments after learning.** One-off probe/experiment workflows are not permanent architecture.

## 9. When changing X, inspect Y

| Change | Inspect together |
|---|---|
| Runtime routes/providers | `client/apps/runtime`, `views`, `shell`, adapter contracts |
| Form/list/workspace behavior | `client/packages/views`, controls/core, consuming apps |
| Frappe endpoint/controller | `frappe-api`, `frappe-model`, Document Kernel/domain owner, adapter contract |
| Business document mutation | Document Kernel, domain package, migration/schema, ledger side effects, tests |
| Stock/reservation | `clouderp-stock`, Sales/Manufacturing consumers, Stock Ledger tests |
| Pricing/Sales | pricing/selling packages, order/fulfillment consumers, server-authoritative totals |
| App install/manifest | app-registry, briefs/manifests, runtime/app composition |
| Tenant routing/auth | gateway, tenant worker, auth/frappe-model permission paths |
| Vertical Alumdoor feature | `apps/alumdoor`, owning shared ERP package, metadata/brief and UI consumer |
| Sentrux structural refactor | affected package + reverse dependents + `sentrux gate` + compile/tests |

## 10. Verification loop

For structural work:

```bash
sentrux scan .
sentrux gate --save .
# make the smallest coherent change
sentrux gate .
sentrux check .
pnpm run typecheck
# targeted/full tests according to blast radius
```

A Sentrux improvement is accepted only when architecture health does not regress **and** correctness/contract verification remains green.

## 11. Documentation ownership

- Repo map: `SENTRUX_MAP.md`.
- Machine constraints: `.sentrux/rules.toml`.
- System architecture: `docs/ARCHITECTURE.md`.
- Live checkpoint: `CURRENT_STATUS.md`.
- Active queue: `NEXT_TASKS.md`.
- Stable invariants: `PROJECT_CONTEXT.md`.
- Docs retention/index: `docs/README.md`.

Do not create another file with the same authority under root/client/server. Update the owner above instead.


## R7 integration runtime ownership

`integration-hub` owns immutable webhook fanout/delivery state and encrypted Connected App lifecycle. Tenant Worker `integration-runtime.ts` binds trusted tenant-specific operator credentials/config and outbound host policy; `index-core-base.ts` enqueues committed source events before ACK and runs bounded delivery during maintenance. `frappe-api/integration-methods.ts` owns browser-session and admin control checks, never token disclosure. Website response validators and owner-scoped Web Form services remain in `frappe-api`; all document updates use the existing kernel. No client/server or vertical dependency was introduced.

## R8 manufacturing operation-cost ownership

`clouderp-erpnext/manufacturing-rollout.ts` composes receipt-specific actual operation
costs through `manufacturing-operation-cost.ts`. The helper adjusts canonical Stock Entry
valuation and balanced GL inside the existing mutation plan; cancellation consumes stored
ledger evidence. It creates no separate cost ledger and keeps the existing stock/kernel
dependency direction.
