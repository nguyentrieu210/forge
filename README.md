# Forge ERP

**Cloud-native enterprise resource planning and operating platform built on Cloudflare.**

Forge ERP là nền tảng quản trị doanh nghiệp hợp nhất, được thiết kế cho vận hành đa phòng ban, đa tenant và mở rộng theo ngành. Hệ thống kết hợp ERP core, workflow, analytics, automation, App Factory và vertical applications trên một kiến trúc metadata-driven với authority dữ liệu tập trung.

**Product baseline:** `0.2.0` — Enterprise Parallel Baseline.  
**Current phase:** Controlled Pilot.  
**Reference vertical:** Alumdoor.

## Năng lực chính

Forge ERP tổ chức các capability doanh nghiệp trên cùng một platform:

- **Finance & Vietnam Accounting** — GL, AR/AP, payment, cash/bank, reconciliation và compliance foundation.
- **CRM & Sales** — customer, contact, opportunity, quotation, order và revenue workflows.
- **Procurement** — supplier, purchase order, receipt, invoice và settlement lineage.
- **Inventory & WMS** — stock ledger, warehouse, movement, valuation và operational controls.
- **Manufacturing & QMS** — BOM, work order, operations, material consumption và quality processes.
- **HCM & Payroll** — employee, organization, attendance, payroll và workforce operations.
- **Projects & Service** — project execution, task, service, warranty và field operations.
- **BI & Reporting** — operational reports, dashboards, KPI surfaces và governed analytics.
- **Workflow & Automation** — approvals, rules, actions, jobs, notifications và event-driven processing.
- **App Factory** — metadata-driven app packaging, configuration, lifecycle và vertical composition.
- **AI-assisted Operations** — semantic/context layer, governed recommendations và deterministic actions có permission/approval.

## Kiến trúc sản phẩm

Forge ERP gồm hai lớp chính:

### CloudForge

Authoritative backend và runtime của hệ thống:

- Document Kernel và business lifecycle;
- tenant isolation và server-side permission;
- workflow/action execution;
- Finance, Stock, Payment và các domain authorities;
- D1, Durable Objects, Queues, R2 và KV theo bounded responsibility;
- App Registry / App Factory;
- migration, release, recovery và operational controls.

### MetaForge

Shared metadata-driven React runtime và builder:

- workspace, list, form và child table;
- report, dashboard và print surfaces;
- workflow/action UI;
- role-aware presentation;
- application composition và configuration;
- responsive/PWA surfaces theo capability hỗ trợ.

## Nguyên tắc nền tảng

- **Authoritative writes** đi qua Document Kernel / domain authority.
- **Server-side permission** là security authority.
- **Finance và Stock** dùng canonical ledgers, không tạo shadow source of truth theo app.
- **Metadata-first** cho shared runtime và application composition.
- **Vertical apps** tái sử dụng platform/domain capabilities và chỉ giữ logic đặc thù ngành.
- **Migrations** append-only và applied-state-aware.
- **Evidence-driven release**: merge, deploy và production certification là các trạng thái khác nhau.

## Hạ tầng Cloudflare

Forge ERP sử dụng Cloudflare làm nền hạ tầng vận hành:

- Workers;
- Workers for Platforms khi deployment contract yêu cầu;
- D1;
- Durable Objects;
- Queues;
- R2;
- KV;
- Workers Assets cho frontend runtime.

Kiến trúc multi-tenant được thiết kế để giữ tenant boundary, authoritative mutation, asynchronous processing và operational recovery tách bạch.

## Trạng thái hiện tại

Các checkpoint chính đã hoàn tất:

- RC4 integrated closure — **DONE**;
- R5 hardening/productization — **DONE / R5-GO**;
- R6 Production Certification — **DONE / PILOT-GO**;
- Pilot-00 — **DONE / PILOT-00-LOCKED**.

Certified R6 baseline:

- source SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- UI bundle hash: `838218167db020d8`;
- Alumdoor: `2.2.3`;
- HRM: `1.8.0`;
- VN Accounting: `1.6.1`;
- capability profile: `alumdoor-pilot@1`.

Alumdoor đang ở **Controlled Pilot**. Pilot-01 đã ingest source thực và đang reconcile/normalize master + opening data để đạt `PREVIEW_PASS` theo contract.

Live state luôn được đọc từ `CURRENT_STATUS.md`, `NEXT_TASKS.md` và phase authority tương ứng; README không thay thế live evidence.

## Cấu trúc repository

| Thư mục | Vai trò |
|---|---|
| `server/` | CloudForge kernel, Workers, business domains, storage/runtime services và operational tooling |
| `client/` | MetaForge runtime, builder, shared UI/view packages và application surfaces |
| `docs/` | architecture, product contracts, capability model, pilot/release evidence và operations documentation |
| `skills/` | phase-aware execution doctrine cho agent |
| `deploy-evidence/` | machine-verifiable release/certification evidence |

## Đọc trước khi làm

1. `CURRENT_STATUS.md` — verified live state.
2. `NEXT_TASKS.md` — active queue và current gate.
3. `docs/pilot/alumdoor/README.md` — controlled-pilot authority khi phase này đang active.
4. `PROJECT_CONTEXT.md` — architecture/source-of-truth hiện hành.
5. `skills/forge-enterprise-completion/SKILL.md` — execution doctrine.
6. `docs/README.md` — documentation index.
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — strategic target.
8. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — capability denominator.

Exact GitHub state, code, migrations và tests luôn thắng prose stale.

## Development

```bash
corepack enable
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

Validation được chọn theo blast radius thông qua các FAST / STANDARD / CRITICAL gates của dự án.

## Release & production boundary

Source version không đồng nghĩa deployed version. Production identity được chứng minh bằng exact SHA/artifact/package/profile và environment evidence.

Production migration, restore/PITR, secrets/DNS/provider mutation, customer-data mutation, cutover và non-UI production deploy tuân theo authorization boundary trong phase contract, `RUNBOOK.md` và `DELIVERY_POLICY.md`.

## Product direction

Forge ERP hướng tới một enterprise operating platform có thể:

- vận hành xuyên Finance, Sales, Procurement, Stock, Manufacturing, HCM và Service;
- đối soát số liệu và audit lifecycle;
- đáp ứng Vietnam compliance theo versioned/source-bound rules;
- triển khai tenant và vertical applications nhanh;
- tạo workflow/report/app mới qua reusable platform primitives;
- dùng automation và AI như lớp điều phối có permission, preview và approval;
- mở rộng theo nhu cầu khách hàng mà không fork authoritative core.
