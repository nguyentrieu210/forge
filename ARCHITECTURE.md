# Forge ERP Architecture

Ngày cập nhật: **2026-08-05**.

Canonical architecture authority: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Forge ERP là enterprise resource planning và operating platform metadata-driven, multi-tenant, cloud-native trên Cloudflare.

## Core shape

```text
MetaForge
  -> Gateway / Tenant Runtime
  -> Forge API / permission / workflow / domain contracts
  -> Document Kernel + authoritative domain services
  -> Durable Object serialization where required
  -> D1 + canonical ledgers + outbox
  -> Queues / R2 / query/report services

Integration Services
  -> import / migration / external APIs
  -> mapping / normalization / reconciliation
  -> authoritative Forge validation and write path
```

## Architectural authorities

- **Document/business writes:** Document Kernel / aggregate serialization.
- **Permission:** server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- **Finance:** canonical GL + Payment Ledger.
- **Inventory:** canonical Stock Ledger/valuation/repost semantics.
- **App lifecycle:** App Registry / App Factory.
- **Frontend:** MetaForge shared metadata-driven runtime/builder.
- **Verticals:** compose shared authorities and keep only industry-specific behavior.
- **Storage/runtime:** D1, Durable Objects, Queues, R2, KV và Workers theo bounded responsibility.

## Execution context

Architecture là stable authority; execution phase được resolve lại theo live state.

Trước khi thực thi task, đọc:

1. `CURRENT_STATUS.md`
2. `NEXT_TASKS.md`
3. active phase authority như `docs/pilot/alumdoor/README.md`
4. `PROJECT_CONTEXT.md`
5. `skills/forge-enterprise-completion/SKILL.md`
6. `docs/ARCHITECTURE.md`
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`

Git history giữ historical decisions; current docs phản ánh kiến trúc và operating model đang có hiệu lực.
