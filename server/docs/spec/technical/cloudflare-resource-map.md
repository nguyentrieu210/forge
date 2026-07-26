# Cloudflare Resource Map

| Concern | Primitive | Rule |
|---|---|---|
| HTTP/API | Workers | small services + service bindings, no monolith |
| Canonical tenant SQL | D1 database/tenant | transaction/business source; archive before limits |
| Global reads | D1 Sessions/read replicas | bookmark after write |
| Coordination | Durable Objects | document/counter/reservation atoms; no singleton |
| Async | Queues | at-least-once; outbox/idempotency |
| Long process | Workflows | provisioning/import/close/migration/repost/report |
| Files/exports/snapshots | R2 | hashes, signed URLs, retention |
| Stale-tolerant cache | KV/Cache | meta/flags only, not permission/ledger |
| Tenant code | Workers for Platforms | capability manifest and quotas |
| Heavy analytics | Containers/Sandboxes | Python/Ibis/DuckDB/extracts |
| External SQL | Hyperdrive | pooled Postgres/MySQL read sources |
| Telemetry | Analytics Engine | operational metrics, not canonical audit |
