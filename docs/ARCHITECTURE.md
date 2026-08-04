# Forge ERP Architecture

Ngày cập nhật: **2026-08-05**.

Forge ERP là enterprise resource planning và operating platform multi-tenant, metadata-driven, cloud-native trên Cloudflare. Kiến trúc được tổ chức quanh các authority lõi: Document Kernel, permission, metadata, domain services, canonical ledgers, App Registry/App Factory, tenant runtime và MetaForge frontend.

## 1. System shape

```text
┌──────────────────────────────────────────────────────────────┐
│ MetaForge                                                   │
│ React metadata-driven workspace/runtime/builder             │
│ list · form · report · dashboard · workflow · app surfaces  │
└─────────────────────────────┬────────────────────────────────┘
                              │ Forge application/API contracts
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Gateway / Tenant Runtime                                    │
│ tenant resolution · auth/session · routing · API composition│
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
                ▼                              ▼
┌────────────────────────────┐    ┌────────────────────────────┐
│ Document / Domain Kernel   │    │ Integration Services       │
│ lifecycle · permission     │    │ import · migration · APIs  │
│ validation · workflow      │    │ mapping · normalization    │
│ idempotency · audit        │    │ governed translation       │
└───────────────┬────────────┘    └────────────────────────────┘
                │
        ┌───────┼───────────┬──────────────┐
        ▼       ▼           ▼              ▼
      D1      Durable     Queues           R2
   tenant DB  Objects    outbox/jobs     files/artifacts
```

Cloudflare cung cấp infrastructure substrate; Forge ERP sở hữu application/runtime contracts và business authority.

## 2. Product layers

### CloudForge

Authoritative backend/kernel gồm:

- tenant/runtime composition;
- Document Kernel / aggregate serialization;
- metadata and document lifecycle;
- server-side permission;
- workflow/action execution;
- domain services/controllers;
- Finance/Stock/Payment và các authoritative ledgers;
- outbox/jobs/retry/DLQ;
- App Registry/App Factory lifecycle;
- files, import/export, reporting/query services;
- release, migration, recovery và operational contracts.

### MetaForge

Shared frontend/runtime gồm:

- metadata-driven app shell;
- list/form/child-table rendering;
- report/dashboard/workspace surfaces;
- workflow/action UI;
- permission-aware presentation;
- builder/configuration surfaces;
- responsive/PWA behavior theo capability hỗ trợ.

MetaForge render metadata/contracts của Forge ERP và không sở hữu server-side business rules hoặc authorization.

### Domain packages

Generic business behavior thuộc shared domain authority, gồm:

- Finance / VN Accounting;
- CRM / Sales;
- Procurement;
- Stock / WMS;
- Manufacturing / QMS;
- HCM / Payroll;
- Projects / Service;
- Workplace / collaboration;
- các enterprise capabilities khác theo capability map.

### Vertical applications

Verticals như Alumdoor compose shared capabilities và chỉ sở hữu business behavior đặc thù ngành.

Vertical không tạo duplicate Finance, Stock, HCM, CRM hoặc document authorities.

## 3. Authoritative request/write path

```text
User / Client
  -> Gateway resolves trusted tenant context
  -> Tenant runtime authenticates principal
  -> server-side permission + contract validation
  -> domain controller / workflow / action
  -> Document Kernel / authoritative service
  -> Durable Object serialization where required
  -> D1 authoritative persistence + ledger/outbox
  -> query/readback/report/audit
```

Non-negotiable invariants:

- tenant/user/role authority đến từ trusted server context;
- OCC/version/idempotency phải survive retries;
- business document writes không bypass lifecycle;
- ledger/history correction dùng explicit correction/reversal semantics;
- verticals và integrations không tạo shadow authoritative state.

## 4. Storage and runtime authority

| Primitive | Role |
|---|---|
| D1 | authoritative tenant/query persistence dưới append-only migration governance |
| Durable Objects | serialized authoritative mutation/state khi cần |
| Queues | outbox, async jobs, bounded retry và DLQ |
| R2 | files/artifacts/backups theo configured role |
| KV | cache/routing/config support; không phải business source of truth |
| Workers | Gateway, tenant runtime và bounded platform/domain services |
| Workers for Platforms | isolated app/tenant execution khi deployment contract sử dụng |

Provider resource tồn tại không đồng nghĩa production state đã được chứng minh; production claims cần exact observed release/evidence.

## 5. Domain source-of-truth

- **Finance:** canonical GL + Payment Ledger.
- **Inventory:** canonical Stock Ledger / valuation / repost semantics.
- **Payroll:** canonical HCM/payroll lifecycle feeding Finance authority.
- **CRM/Sales:** canonical customer/contact/opportunity/order documents.
- **Procurement:** canonical supplier/PO/receipt/invoice lineage.
- **Manufacturing:** BOM/Work Order/operations consuming canonical Stock/Finance.
- **Legal/statutory:** source-bound, effective-dated, versioned và auditable rule contracts.

Read models, dashboards và vertical-specific projections không trở thành write authorities.

## 6. Metadata and App Factory

Forge ERP là metadata-first, không phải metadata-only.

Metadata có thể định nghĩa:

- DocType/fields/child tables;
- forms/lists/workspaces;
- roles/DocPerm;
- workflow/rules/formulas theo capability hỗ trợ;
- reports/dashboards/prints;
- app manifest/dependency/configuration.

Business invariants phải execute atomically với authoritative writes vẫn thuộc code/domain contracts khi metadata không thể diễn đạt an toàn.

App lifecycle thuộc Forge App Registry/App Factory. Capability activation, package installation và historical data lifecycle là các concern tách biệt.

## 7. Frontend / API contracts

New product behavior được xây trên Forge-owned document, domain, query và action contracts.

API/runtime boundary phải bảo toàn:

- permission;
- lifecycle/state transition;
- validation;
- idempotency;
- tenant isolation;
- ledger invariants;
- auditability.

Frontend có thể tối ưu presentation và interaction nhưng không thay thế authoritative server contracts.

## 8. Integration & migration architecture

Integration services phục vụ:

- data import/export;
- migration;
- third-party API integration;
- mapping/transformation;
- event/webhook flows;
- reconciliation.

Integration layer chỉ translate và orchestrate. Canonical business state luôn được validate và ghi qua Forge ERP authorities.

## 9. Security and permission

- Server-side permission là authoritative.
- UI visibility/editability là UX.
- Trusted tenant/user identity không lấy từ arbitrary client fields.
- Role/DocPerm/owner/share/user-permission rules được enforce server-side.
- Secrets, production credentials, private backups và raw customer data không thuộc Git/docs.

## 10. Migration and release

- migrations append-only;
- không rewrite migration có khả năng đã được apply;
- applied-state claims cần environment/checksum evidence;
- merge != deploy;
- production identity là exact SHA/artifact/package/profile evidence;
- source/artifact mới tạo candidate mới;
- rerun affected evidence theo current change/evidence matrix;
- production migration, restore/PITR, DNS/secret/provider mutation, customer-data write và cutover cần explicit authorization.

## 11. Current phase

Live sequence được điều khiển bởi `CURRENT_STATUS.md`, `NEXT_TASKS.md` và active phase authority.

Tại audit ngày 2026-08-05:

`R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 reconcile/normalize -> PREVIEW_PASS -> Pilot-02 -> Pilot-03 -> Pilot-04 -> Pilot-05 -> ACCEPTED_REFERENCE -> GA_EVOLUTION`

Snapshot này không phải permanent truth. Agent phải resolve phase lại trước mỗi task.

## 12. Canonical reading

- `PROJECT_CONTEXT.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/pilot/alumdoor/README.md` khi Controlled Pilot đang active
- `skills/forge-enterprise-completion/SKILL.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/API_SURFACE.md`
- `docs/APP_FACTORY.md`

Git history giữ historical architecture decisions; current docs mô tả kiến trúc đang có hiệu lực.
