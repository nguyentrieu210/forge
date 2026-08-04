# Forge Server / Platform Runtime

`server/` contains the authoritative backend/runtime of Forge: Cloudflare Workers, tenant routing, Document Kernel, domain packages, App Registry/App Factory, migrations, integration services and release tooling.

Existing identifiers such as `cloudforge-*`, `metaforge.api.*` and package paths containing historical names are **technical contracts**, not separate current product brands. Product-facing documentation uses **Forge**.

Naming authority: `../docs/BRAND_AND_NAMING.md`.

## Runtime shape

Forge server uses:

- Cloudflare Workers / Workers for Platforms where configured;
- Durable Objects for serialization/coordination where required;
- D1 for tenant/query persistence under append-only migration governance;
- Queues for outbox/background/retry/DLQ paths;
- R2 for files/artifacts where configured;
- KV for routing/cache/config support;
- a Frappe-shaped compatibility API used by the shared client and integration contracts.

## Authoritative business boundaries

- Document/business writes use the canonical Document Kernel / aggregate path.
- Finance uses canonical GL + Payment Ledger authorities.
- Inventory uses canonical Stock Ledger/valuation authorities.
- Domain/vertical apps do not create shadow Finance/Stock ledgers.
- Tenant/role/DocPerm/owner/share/user-permission checks are server-authoritative.
- Money, stock and legal/statutory behavior must remain deterministic, auditable and correction-aware.
- Applied migrations are append-only; do not rewrite migration history.

## App Registry / App Factory

Forge supports versioned app/package lifecycle and server-authoritative capability profiles.

Metadata-oriented apps can contribute DocTypes, workflows, reports, print/templates, permissions and fixtures. Business logic that must participate atomically in authoritative accounting/stock/security remains in platform/domain code.

Capability disable is not package uninstall and must not erase historical data.

## Current repository/release context

Do not use historical CloudForge v0.x/v1.0 component release notes as current Forge state.

Current authority is `../CURRENT_STATUS.md`:

- RC4: DONE;
- R5: DONE / R5-GO;
- R6: DONE / PILOT-GO;
- Pilot-00: LOCKED;
- Pilot-01: real source set observed/hashed/ingested; reconciliation/normalization is blocking `PREVIEW_PASS`.

The frozen Alumdoor pilot software baseline is exact-release/evidence bound. See `../docs/agents/r6/README.md` and `../docs/pilot/alumdoor/README.md`.

## Verification

Use repository scripts/workflows appropriate to the touched blast radius. Typical server checks include TypeScript/typecheck, domain tests, migration validation, permission/tenant tests and workerd/integration tests where applicable.

Do not claim production readiness from source presence or a single test suite. Production claims require the evidence level defined by `../docs/VALIDATION_GATES.md`.

## Compatibility

Frappe/ERPNext is a compatibility/benchmark reference where useful. Forge is not a Python/Frappe runtime and should not be marketed as a complete ERPNext clone or drop-in replacement.

Compatibility behavior must never weaken Forge's own tenant, permission, idempotency, ledger, migration or audit invariants.

## Operational boundary

Merge != deploy.

Production deploy, migration, restore/PITR, DNS/routes/secrets/provider mutation, real customer-data import/write and cutover remain explicit authorization boundaries under `../RUNBOOK.md`, `../DELIVERY_POLICY.md` and current pilot contracts.

## Read next

- `../CURRENT_STATUS.md`
- `../PROJECT_CONTEXT.md`
- `../docs/ARCHITECTURE.md`
- `../docs/BRAND_AND_NAMING.md`
- `../docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `../docs/VALIDATION_GATES.md`
