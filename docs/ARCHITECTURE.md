# Kiến trúc Forge

Ngày cập nhật: **2026-08-05**.

Forge là **ERP / enterprise operating platform độc lập** trên Cloudflare. Kiến trúc của Forge được định nghĩa bởi Forge-owned contracts: Document Kernel, permission, metadata, domain services, ledgers, App Registry/App Factory, tenant runtime và MetaForge frontend.

Các adapter mang hình dạng API của hệ thống ngoài chỉ là **bounded compatibility surfaces**. Chúng không phải source of truth, không sở hữu business semantics và không định nghĩa product identity.

## 1. Hình dạng hệ thống

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
│ Document / Domain Kernel   │    │ Compatibility / Integration│
│ lifecycle · permission     │    │ migration · interop facade │
│ validation · workflow      │    │ external API translations  │
│ idempotency · audit        │    │ no business authority      │
└───────────────┬────────────┘    └────────────────────────────┘
                │
        ┌───────┼───────────┬──────────────┐
        ▼       ▼           ▼              ▼
      D1      Durable     Queues           R2
   tenant DB  Objects    outbox/jobs     files/artifacts
```

Cloudflare is the infrastructure substrate; Forge remains the application/runtime authority.

## 2. Product layers

### CloudForge

Authoritative backend/kernel gồm:

- tenant/runtime composition;
- Document Kernel / aggregate serialization;
- metadata and document lifecycle;
- server-side permission;
- workflow/action execution;
- domain services/controllers;
- Finance/Stock/Payment and other authoritative ledgers;
- outbox/jobs/retry/DLQ;
- App Registry/App Factory lifecycle;
- files, import/export, reporting/query services;
- release, migration, recovery and operational contracts.

### MetaForge

Shared frontend/runtime gồm:

- metadata-driven app shell;
- list/form/child-table rendering;
- report/dashboard/workspace surfaces;
- workflow/action UI;
- permission-aware presentation;
- builder/configuration surfaces;
- responsive/PWA behavior where supported.

MetaForge renders Forge metadata/contracts. It must not become the owner of business rules or server authorization.

### Domain packages

Generic ERP behavior belongs to shared domain authority, including:

- Finance / VN Accounting;
- CRM / Sales;
- Procurement;
- Stock / WMS;
- Manufacturing / QMS;
- HCM / Payroll;
- Projects / Service;
- Workplace / collaboration;
- other enterprise capabilities as materialized.

### Vertical apps

Verticals such as Alumdoor compose shared capabilities and only own genuinely industry-specific behavior.

A vertical must not create duplicate Finance, Stock, HCM, CRM or document authorities merely to make its flow pass.

## 3. Authoritative request/write path

```text
User/Client
  -> Gateway resolves trusted tenant context
  -> Tenant runtime authenticates principal
  -> server-side permission/contract validation
  -> domain controller / workflow / action
  -> Document Kernel / authoritative service
  -> Durable Object serialization where required
  -> D1 authoritative persistence + ledger/outbox
  -> query/readback/report/audit
```

Non-negotiable invariants:

- tenant/user/role authority comes from trusted server context;
- OCC/version/idempotency must survive retries;
- business document writes do not bypass lifecycle;
- ledger/history is corrected through explicit correction/reversal semantics;
- verticals and adapters cannot direct-write shadow state.

## 4. Storage and runtime authority

| Primitive | Role |
|---|---|
| D1 | authoritative tenant/query persistence under append-only migration governance |
| Durable Objects | serialized authoritative mutation/state where required |
| Queues | outbox, async jobs, bounded retry and DLQ |
| R2 | files/artifacts/backups where configured |
| KV | cache/routing/config support; not business source of truth |
| Workers | Gateway, tenant runtime and bounded platform/domain services |
| Workers for Platforms | isolated app/tenant execution where current deployment contract uses it |

Presence of a provider resource does not prove production state; production claims require exact observed release/evidence.

## 5. Domain source-of-truth

- **Finance:** canonical GL + Payment Ledger.
- **Inventory:** canonical Stock Ledger / valuation / repost semantics.
- **Payroll:** canonical HCM/payroll lifecycle feeding Finance authority.
- **CRM/Sales:** canonical customer/contact/opportunity/order documents.
- **Procurement:** canonical supplier/PO/receipt/invoice lineage.
- **Manufacturing:** BOM/Work Order/operations consuming canonical Stock/Finance.
- **Legal/statutory:** source-bound, effective-dated, versioned and auditable rule contracts.

Read models, dashboards, compatibility APIs and vertical-specific projections must never silently become write authorities.

## 6. Metadata and App Factory

Forge is metadata-first, not metadata-only.

Metadata may define:

- DocType/fields/child tables;
- forms/lists/workspaces;
- roles/DocPerm;
- workflow/rules/formulas where supported;
- reports/dashboards/prints;
- app manifest/dependency/configuration.

Business invariants that must execute atomically with authoritative writes remain code/domain contracts when metadata cannot safely express them.

App lifecycle is owned by Forge App Registry/App Factory. Installing/disabling a capability is distinct from deleting package/history/data.

## 7. Frontend/API boundary

The architectural rule is **Forge-owned semantics, edge-level translation**.

New product behavior should target Forge-owned document/domain/action contracts. A compatibility facade may expose alternate URL/envelope/parameter shapes for existing clients or migrations, but:

- it contains no authoritative business rule;
- it cannot weaken permission, idempotency or validation;
- it cannot redefine document lifecycle/status semantics;
- it cannot make an external framework a runtime dependency;
- its removal/replacement must not require rewriting canonical business state.

Legacy package names such as `adapter-frappe`, `frappe-api` or `frappe-source` should therefore be read as compatibility/interop seams, not as Forge's architectural identity.

## 8. External ERP/framework references

Frappe/ERPNext, MISA and other systems may be used for:

- benchmark/parity analysis;
- migration adapters;
- import mapping;
- interoperability;
- deterministic regression/reference source locks.

They do **not** determine Forge's roadmap, internal data model or authoritative behavior.

Forge should benchmark the depth of mature ERP systems without cloning their UI, internal architecture or product identity.

## 9. Security and permission

- Server-side permission is authoritative.
- UI visibility/editability is UX only.
- Trusted tenant/user identity must not come from arbitrary client fields.
- Role/DocPerm/owner/share/user-permission rules are enforced server-side.
- Secrets, production credentials, private backups and raw customer data do not belong in Git/docs.

## 10. Migration and release

- migrations are append-only;
- never rewrite a migration that may have been applied;
- applied-state claims require environment/checksum evidence;
- merge != deploy;
- production identity is exact SHA/artifact/package/profile evidence;
- a new source/artifact creates a new candidate, not a retroactive failure of an old certified candidate;
- rerun affected evidence according to the current change/evidence matrix;
- production migration, restore/PITR, DNS/secret/provider mutation, customer-data write and cutover require explicit authorization.

## 11. Current phase

Current live sequence is controlled by `CURRENT_STATUS.md`, `NEXT_TASKS.md` and the active phase authority.

At the 2026-08-05 audit:

`R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 reconcile/normalize -> PREVIEW_PASS -> Pilot-02 -> Pilot-03 -> Pilot-04 -> Pilot-05 -> ACCEPTED_REFERENCE -> GA_EVOLUTION`

This snapshot must not be hard-coded by agents as permanent truth. Resolve phase again before each task.

## 12. Canonical reading

- `PROJECT_CONTEXT.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/pilot/alumdoor/README.md` while Controlled Pilot is active
- `skills/forge-enterprise-completion/SKILL.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/API_SURFACE.md`
- `docs/APP_FACTORY.md`

Git history retains older architecture decisions. Current docs should describe the current Forge architecture, not preserve obsolete product identity as if it were still authoritative.
