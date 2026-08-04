# Forge — Enterprise Operating Platform

**Product baseline: `0.2.0` — Enterprise Parallel Baseline.**  
Live deployment/certification state is tracked separately from source version.

Forge is a **metadata-driven, multi-tenant enterprise operating platform on Cloudflare**. It combines a shared platform kernel, ERP/domain packages, App Factory capabilities and vertical apps without forking authoritative business logic.

Current reference vertical: **Alumdoor**.

## Repository map

| Path | Role |
|---|---|
| `server/` | Forge platform/runtime: Workers, D1/DO/Queues/R2, document kernel, ERP/domain services and integration surfaces |
| `client/` | Forge client/runtime/builder. Existing `@metaforge/*` names are technical package namespaces, not a separate product brand |
| `docs/` | architecture, business contracts, North Star, capability truth, pilot/release evidence and operations docs |
| `skills/` | repository execution/audit policy for agents |

## Read first

Exact GitHub state, code, migrations and tests always win over stale prose.

Canonical order:

1. `CURRENT_STATUS.md` — latest verified state.
2. `NEXT_TASKS.md` — active queue.
3. `PROJECT_CONTEXT.md` — current architecture/source-of-truth boundaries.
4. `docs/README.md` — documentation authority and retention policy.
5. `AI_HANDOFF.md` — concise session handoff.
6. `docs/BRAND_AND_NAMING.md` — product/technical naming authority.
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — strategic completion target.
8. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` + `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — capability denominator/maturity truth.
9. `RUNBOOK.md`, `DELIVERY_POLICY.md` and `docs/ops/` — operational/merge/deploy boundaries.
10. `skills/forge-enterprise-completion/SKILL.md` — audit/implementation/verification rules.

## Current checkpoint

- RC4: **DONE**.
- R5: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 preview/control-plane: **READY**.
- Pilot-01 real source set: **OBSERVED / HASHED / INGESTED**.
- Current Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED** pending reconciliation/normalization.
- Frozen certified pilot software baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Final R6 evidence: `R6-E01..R6-E23 = 23/23 PASS`.

See `CURRENT_STATUS.md` and `docs/pilot/alumdoor/PILOT_01_SOURCE_INGEST_20260805.md` for current data-ingest evidence; `NEXT_TASKS.md` owns the controlled-pilot sequence.

## Product architecture

Forge follows these invariants:

- authoritative business writes pass through the canonical Document Kernel/aggregate path;
- tenant and permission boundaries are enforced server-side;
- Finance uses canonical GL + Payment Ledger authorities;
- Inventory uses canonical Stock Ledger/valuation authorities;
- vertical apps consume shared domain authorities instead of creating shadow ledgers/services;
- D1 migrations are append-only and applied-state-aware;
- app lifecycle and capability activation are server-authoritative;
- frontend surfaces are rendered by the shared metadata-driven runtime;
- release/deploy claims are exact-identity and evidence-bound.

Core architecture references:

- `docs/ARCHITECTURE.md`
- `docs/API_SURFACE.md`
- `docs/APP_FACTORY.md`
- `docs/VALIDATION_GATES.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/ALUMDOOR-REFERENCE-VERTICAL-CONTRACT.md`

## Brand and compatibility

**Forge** is the platform product brand.

Legacy/current technical identifiers such as `@metaforge/*`, `metaforge.api.*`, `cloudforge-*` and deployed `kairo.vn` hostnames remain where they are real package/API/resource/environment contracts. They are not separate umbrella product brands.

Frappe/ERPNext is used as an API compatibility target and ERP benchmark where relevant; Forge is not positioned as a clone or drop-in replacement.

See `docs/BRAND_AND_NAMING.md`.

## Local verification

```bash
corepack enable
pnpm install
pnpm run typecheck
pnpm run test
```

Use blast-radius-specific gates from repository workflows/docs. Source presence or PR merge is not equivalent to a production PASS.

## Production boundary

A code/docs request does not imply production authorization. Production migration, restore/PITR, secrets/DNS/provider mutation, real customer-data mutation, cutover and non-UI deployment remain explicit authorization boundaries under `RUNBOOK.md` and `DELIVERY_POLICY.md`.
