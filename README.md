# Forge — Enterprise Operating Platform / ERP độc lập trên Cloudflare

**Forge product baseline: `0.2.0` — Enterprise Parallel Baseline.** Version source không đồng nghĩa production deploy.

Forge là một **ERP / enterprise operating platform độc lập**, metadata-driven, multi-tenant và cloud-native trên Cloudflare. Forge sở hữu runtime, document/business kernel, permission model, app lifecycle, domain authorities, ledger contracts và frontend runtime riêng; không phụ thuộc Frappe/ERPNext hoặc một ERP bên thứ ba để vận hành.

Forge gồm hai lớp sản phẩm chính:

- **CloudForge** — authoritative backend/kernel: document lifecycle, business APIs, permission, workflow, ledger, jobs, storage và tenant/runtime infrastructure.
- **MetaForge** — metadata-driven React workspace/runtime/builder cho list, form, report, dashboard, workflow và app surfaces.

Trên nền đó là first-party ERP/domain packages và vertical apps. Alumdoor là reference vertical đầu tiên, compose các authority chung thay vì fork core.

| Thư mục | Vai trò |
|---|---|
| `server/` | CloudForge kernel/backend, Workers, D1/DO/Queues/R2, business domains, app/runtime services và integration/compatibility adapters |
| `client/` | MetaForge React runtime/builder, metadata-driven workspace, list/form/report/dashboard/app surfaces |
| `docs/` | architecture, product contracts, live authority, capability truth, pilot/release evidence và operations docs |
| `skills/` | phase-aware execution doctrine cho agent |
| `upstream/` | source-locked external references phục vụ benchmark, migration, parity/interop audit; không phải runtime dependency hay product identity |

## Product identity

Forge **không phải**:

- frontend thay thế cho Frappe/ERPNext;
- bản port Frappe lên Cloudflare;
- clone giao diện MISA/ERPNext;
- compatibility layer lấy hệ thống khác làm source of truth.

Forge là implementation riêng với authoritative contracts riêng. External ERP/framework chỉ có thể xuất hiện ở các vai trò bounded như:

- benchmark độ sâu nghiệp vụ;
- migration/import source;
- interoperability adapter;
- regression/reference corpus.

Các adapter hoặc package mang tên legacy như `frappe-api`, `adapter-frappe` hay `frappe-source` không biến Frappe thành kiến trúc nền của Forge; chúng là compatibility/migration surfaces và phải đứng ngoài authoritative core.

## Đọc trước khi làm

**README không phải live status.** Thứ tự canonical:

1. `CURRENT_STATUS.md` — live verified state.
2. `NEXT_TASKS.md` — active queue/current gate.
3. phase authority đang active, hiện tại bắt đầu tại `docs/pilot/alumdoor/README.md`.
4. `PROJECT_CONTEXT.md` — architecture/source-of-truth hiện hành.
5. `AI_HANDOFF.md` — handoff cô đọng cho workstream tiếp nối.
6. `docs/README.md` — documentation index + retention policy.
7. `RUNBOOK.md` và `DELIVERY_POLICY.md` — operational/merge/deploy boundary.
8. `skills/forge-enterprise-completion/SKILL.md` — phase-aware operating doctrine.
9. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` + capability map/status — strategic target và portfolio maturity.
10. `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md` khi task cần multi-agent/program execution.

Exact GitHub state, code, migrations và tests luôn thắng snapshot prose cũ. **Live phase/current gate thắng static roadmap/wave.**

## Current checkpoint

Forge đã đi qua các đợt integration/productization/certification lớn:

- RC4 integrated closure: **DONE**.
- R5 integrated hardening/productization: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Certified/deployed R6 source baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Certified UI bundle hash: `838218167db020d8`.
- Alumdoor Controlled Pilot: **ACTIVE**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set: **OBSERVED / HASHED / INGESTED**.
- Current Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Active work: reconcile + normalize real master/opening data toward a private zero-unexplained-variance `PREVIEW_PASS` batch.

R6 certification is exact-SHA bound historical truth. Documentation/control-plane commits do not change the deployed product identity. A later product-source change creates a new candidate and reruns only affected release evidence before it can replace a frozen pilot identity.

Current capability materialization remains a portfolio metric, not the live queue:

- Hardened: 0
- RC: 66
- Wired: 406
- Foundation: 327
- Missing: 157
- Total: 956

Missing/Foundation counts do not automatically reopen a platform-wide build wave while a controlled-pilot gate is active.

## Kiến trúc chính

Forge giữ các authority/invariant sau:

- authoritative business writes đi qua **Document Kernel / aggregate serialization**;
- server-side tenant/permission enforcement là security authority;
- **GL + Payment Ledger** là Finance authority, không fork theo app;
- **Stock Ledger/valuation** là Inventory authority, không tạo vertical shadow ledger;
- migrations append-only và applied-state-aware;
- frontend dùng shared **MetaForge metadata-driven runtime**;
- first-party apps được install/upgrade qua **App Registry / App Factory**;
- capability activation tách khỏi package installation;
- vertical apps compose shared domain capabilities thay vì copy domain code;
- AI/automation phải đi qua permission + deterministic tool/action + preview/approval trước authoritative write khi cần.

Nền tảng Cloudflare hiện hành sử dụng Workers cùng các storage/runtime primitives phù hợp như D1, Durable Objects, Queues, R2 và KV theo đúng authority của từng loại dữ liệu.

Tài liệu nền:

- `PROJECT_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/API_SURFACE.md`
- `docs/APP_FACTORY.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/VERSIONING.md`
- `docs/VALIDATION_GATES.md`

## Execution model hiện tại

Forge không còn điều hành bằng một checklist xây nền cố định.

`skills/forge-enterprise-completion/SKILL.md` resolve live phase trước mỗi task:

`FOUNDATION -> INTEGRATION -> CERTIFICATION -> CONTROLLED_PILOT -> ACCEPTED_REFERENCE -> GA_EVOLUTION`

Priority mặc định:

`current gate blocker -> correctness/regression -> pilot/operator usability -> evidence gap -> required reusable primitive -> post-gate hardening -> enterprise backlog`

North Star vẫn là strategic compass, nhưng không được dùng để tự mở lại R5/R6 hoặc một broad capability wave đã đóng.

## Chạy local

```bash
corepack enable
pnpm install
pnpm run typecheck
pnpm run test
```

Chạy gate theo blast radius; không suy PASS từ việc source tồn tại hoặc PR merge.

## Production boundary

Không tự hiểu yêu cầu sửa code là authorization deploy production.

Các thao tác như production migration, restore/PITR, secrets/DNS/provider mutation, real customer-data mutation, cutover và non-UI production deploy chỉ thực hiện khi có authorization rõ theo phase contract, `RUNBOOK.md` và `DELIVERY_POLICY.md`.

UI-only có thể đi fast path sau khi chứng minh blast radius. Nếu UI mới được deploy lên một frozen pilot target thì source/bundle trở thành candidate identity mới và phải rerun/relock affected release evidence; certification cũ vẫn là historical PASS cho candidate cũ.

## External references và compatibility

Repo có thể giữ source-lock, fixtures, adapters hoặc migration tooling liên quan Frappe/ERPNext và các hệ thống khác. Chúng tồn tại để:

- benchmark/parity audit;
- import/migration;
- interoperability;
- deterministic regression.

**Chúng không định nghĩa Forge. Forge là ERP độc lập với runtime, data authority và product roadmap riêng.**
