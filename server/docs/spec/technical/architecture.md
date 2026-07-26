# Technical Architecture — CloudForge Full Suite

## 1. Planes and services

```text
Cloudflare Global Edge
  ├─ Gateway Worker: auth, tenant routing, rate-limit, request IDs
  ├─ Meta Worker: schema/permission/workflow/report bundles
  ├─ Document Worker: CRUD/lifecycle/Unit of Work
  ├─ Query Worker: list/report/query compiler and budgets
  ├─ File Worker: signed R2 upload/download/virus pipeline
  ├─ Realtime Durable Objects: document rooms/presence/locks
  ├─ Counter Durable Objects: naming/reservation atoms
  ├─ Queues: outbox, notifications, projections, connectors
  ├─ Workflows: provisioning, imports, close, migration, large reports
  ├─ Workers for Platforms: tenant/app custom code
  └─ Containers/Sandboxes: Python/Ibis/DuckDB/large analytics

Per tenant
  ├─ D1 canonical DB
  ├─ R2 namespace/prefix
  ├─ meta/cache versions
  └─ app release set
```

## 2. Package boundaries

- `@cloudforge/contracts`: platform-neutral types/errors/events.
- `@cloudforge/meta`: schema compiler, field ledger, migrations.
- `@cloudforge/policy`: role/row/field/action policy compiler.
- `@cloudforge/document`: lifecycle, Unit of Work, child diff, naming.
- `@cloudforge/query`: filters, joins, aggregates, budget, index advisor.
- `@cloudforge/workflow`: state machine/action/task runtime.
- `@cloudforge/ledger`: accounting/stock immutable posting primitives.
- `@cloudforge/runtime-worker`: Worker adapters/bindings.
- `@cloudforge/outbox`, `jobs`, `files`, `audit`, `realtime`.
- `@clouderp/*`, `@cloudhr/*`, `@cloudcrm/*`, `@cloudinsights/*`.
- `@metaforge/*`: FE renderer/builders via `PlatformAdapter`.

## 3. Non-negotiable boundaries

1. UI does not call D1 or Cloudflare bindings directly.
2. Product packs cannot bypass document/policy/ledger kernels.
3. Cross-pack integration uses versioned events/contracts, never circular imports.
4. Custom code runs outside platform Workers with explicit capabilities.
5. Read models/cache can be rebuilt and never become ledger authority.
