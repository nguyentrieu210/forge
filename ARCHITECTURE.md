# ARCHITECTURE

Ngày cập nhật: **2026-08-05**.

Canonical architecture authority hiện tại: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Forge là **ERP / enterprise operating platform độc lập**, metadata-driven, multi-tenant và cloud-native trên Cloudflare. Forge sở hữu authoritative runtime/contracts riêng; external ERP/framework không phải runtime dependency hay source of truth.

## Core shape

```text
MetaForge
  -> Gateway / Tenant Runtime
  -> Forge-owned API / permission / workflow / domain contracts
  -> Document Kernel + authoritative domain services
  -> Durable Object serialization where required
  -> D1 + canonical ledgers + outbox
  -> Queues / R2 / query/report services

External systems
  -> compatibility / migration / integration adapters
  -> Forge-owned validation and authority
```

## Architectural authorities

- **Document/business writes:** Document Kernel / aggregate serialization.
- **Permission:** server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- **Finance:** canonical GL + Payment Ledger.
- **Inventory:** canonical Stock Ledger/valuation/repost semantics.
- **App lifecycle:** App Registry / App Factory.
- **Frontend:** MetaForge shared metadata-driven runtime/builder.
- **Verticals:** compose shared authorities; no shadow core.
- **Storage:** D1/DO/Queues/R2/KV according to their bounded role.

## Compatibility is not identity

Packages or source trees containing names such as `frappe-api`, `adapter-frappe`, `frappe-source` or source-locked ERPNext/Frappe code are compatibility, migration, benchmark or regression surfaces.

They do not mean Forge is Frappe-based, Frappe-compatible by identity, or dependent on Frappe to run.

New Forge capability design should target **Forge-native contracts first**. Compatibility translation stays at the edge and may not weaken Forge permission, lifecycle, idempotency, ledger or tenant invariants.

## Live-state rule

Architecture is stable authority; phase is not.

Before execution, read:

1. `CURRENT_STATUS.md`
2. `NEXT_TASKS.md`
3. active phase authority such as `docs/pilot/alumdoor/README.md`
4. `PROJECT_CONTEXT.md`
5. `skills/forge-enterprise-completion/SKILL.md`
6. `docs/ARCHITECTURE.md`
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`

Do not use old ADR/program snapshots as current product identity. Git history preserves them when historical provenance is needed.
