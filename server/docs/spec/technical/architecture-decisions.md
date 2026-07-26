# Architecture Decision Record Index

| ADR | Decision |
|---|---|
| ADR-001 | Workers for Platforms per tenant isolates bindings and avoids one-script binding ceiling. |
| ADR-002 | D1 per tenant default; fiscal-year ledger/archive shards for large tenants. |
| ADR-003 | Aggregate Durable Objects coordinate hot writes; D1 remains canonical transaction store. |
| ADR-004 | Transactional outbox for all external effects. |
| ADR-005 | Source parity is behavior + evidence, not source-name resemblance. |
| ADR-006 | Insights v3 is behavior baseline, not native Frappe v16 runtime claim. |
| ADR-007 | Legacy Python/Jinja may run isolated only; no direct canonical DB access. |
| ADR-008 | MetaForge depends on Platform Contract, allowing Frappe and CloudForge adapters. |
