# Forge Architecture

Ngày rebaseline: **2026-08-05**.

This document describes durable architecture, not a rollout phase or temporary implementation snapshot. Exact code, migrations, tests and release evidence override stale prose.

## 1. System shape

```text
Forge client/runtime
  └─ shared metadata-driven React packages (`@metaforge/*` technical namespace)
      └─ Frappe-shaped compatibility/API surface where required
          └─ Forge server/runtime
              ├─ Gateway / tenant routing
              ├─ Tenant worker / authenticated API composition
              ├─ Document Kernel / aggregate coordination
              ├─ Domain packages: Finance, Stock, CRM, Procurement, Manufacturing, HRM, Service...
              ├─ Query / Jobs / Control Plane / integration workers
              └─ D1 + Durable Objects + Queues + R2 + KV support
```

**Forge** is the product brand. Existing `@metaforge/*`, `metaforge.api.*` and `cloudforge-*` names are technical identifiers retained for compatibility where useful; see `BRAND_AND_NAMING.md`.

## 2. Core architectural invariants

### Authoritative writes

Business mutations go through the canonical Document Kernel / aggregate path. Do not bypass it with direct D1 writes for normal ERP operations.

The write path owns or coordinates:

- lifecycle/state transitions;
- optimistic concurrency/version checks;
- idempotency;
- tenant/permission enforcement;
- audit/version lineage;
- outbox/domain side effects;
- canonical Finance/Stock consequences.

### Server-owned identity and permissions

Tenant, actor, roles and permission scope come from trusted server/runtime context. Client visibility/editability is UX only.

### Canonical ledgers

- Finance: GL + Payment Ledger authorities.
- Inventory: Stock Ledger/valuation/repost authorities.
- Vertical apps must not create shadow ledgers.

### Append-only migration governance

Applied migrations are not rewritten. Environment claims require applied-state/checksum evidence.

## 3. Runtime and storage layers

| Layer | Responsibility |
|---|---|
| Client/runtime | metadata-driven shell, list/form/report/dashboard/builder and app surfaces |
| API compatibility | Frappe-shaped resource/method boundary used by current client/integration contracts |
| Tenant/runtime worker | authenticated routing/composition and application APIs |
| Document Kernel | document lifecycle, permissions, OCC/idempotency, authoritative mutation coordination |
| Domain packages | reusable business behavior and domain invariants |
| App Registry/App Factory | package lifecycle, metadata apps, capability profiles |
| Durable Objects | serialization/coordination where required |
| D1 | authoritative tenant/query persistence under migration governance |
| Queues | outbox, retry, async jobs and DLQ contracts |
| R2 | files/artifacts when configured |
| KV | routing/cache/config support; not authoritative ERP state |

## 4. Frappe/ERPNext compatibility boundary

Forge uses Frappe-shaped API behavior where it creates leverage for the existing client and interoperability.

This includes resources/method envelopes, metadata concepts and compatibility adapters. It does **not** mean:

- Forge is a Frappe runtime;
- Python app compatibility is guaranteed;
- Forge is positioned as an ERPNext clone/replacement.

Compatibility quirks must not weaken Forge invariants around tenant identity, permissions, idempotency, money, stock or audit.

## 5. Metadata-driven client

The Forge client stack uses existing `@metaforge/*` packages as a technical namespace.

Principles:

- metadata/manifest drives shared UI whenever possible;
- server permissions remain authoritative;
- shared runtime does not absorb vertical schema/rules unnecessarily;
- common patterns used by multiple apps should become reusable runtime/App Factory primitives;
- user-facing product copy uses Forge branding unless a vertical has its own explicit identity.

## 6. Domain package boundary

Reusable business behavior belongs in shared domain packages.

Examples:

- CRM/Sales;
- Procurement;
- Stock/WMS;
- Manufacturing/QMS;
- Finance/VN Accounting;
- HRM/Payroll;
- Projects/Service;
- Workplace/Commerce.

Vertical apps compose these authorities. They own only genuinely industry-specific behavior.

## 7. App Factory and package model

Forge supports both metadata-oriented apps and code-backed domain behavior.

A metadata-oriented app may contain:

```text
app.json
  doctypes/
  workflows/
  reports/
  prints/
  roles/permissions
  fixtures
  capability/profile metadata
```

Server-authoritative App Registry/App Factory contracts own install/upgrade/profile state.

Not all ERP behavior belongs in metadata. Logic that must participate atomically in authoritative posting/valuation/security remains in platform/domain code.

Rule:

> App Factory expands product breadth without allowing arbitrary app code to bypass canonical business authorities.

## 8. Capability profiles

Package installation and capability activation are separate concepts.

- disabling a capability does not imply uninstall;
- disabling must not erase historical data;
- profile state is versioned/server-authoritative;
- runtime/jobs/hooks/integrations must respect active capability state where the contract requires it.

The Alumdoor controlled pilot currently uses the frozen `alumdoor-pilot@1` profile identified in R6/Pilot-00 evidence.

## 9. Vertical architecture — Alumdoor

Alumdoor is the reference vertical.

It consumes shared:

- CRM/Customer/Sales;
- Procurement;
- Stock/WMS;
- Manufacturing/QMS;
- Finance/AR/AP/Payment/GL;
- HR/Employee;
- Warranty/Service.

Cutting/configuration rules that are truly aluminum-door-specific remain vertical. Generic transaction behavior belongs in platform/domain packages.

## 10. Release / evidence architecture

Forge separates:

- source state;
- build/release identity;
- provider-observed deployment state;
- migration state;
- package/profile state;
- browser/business-flow evidence.

Merge does not imply deploy. Source/config does not imply provider state. Production/pilot claims are exact-identity and evidence-bound.

Current certified Alumdoor pilot baseline and final R6 evidence are indexed from `CURRENT_STATUS.md` and `docs/agents/r6/README.md`.

## 11. Naming boundary

Do not mass-rename package/API/worker/resource identifiers as a branding exercise.

`@metaforge/*`, `metaforge.api.*`, `cloudforge-*` and exact `kairo.vn` environment names can remain until a dedicated compatibility/migration program proves a rename safe. Product-facing documentation/UI should use Forge.

## 12. Strategic direction

Architecture decisions should advance `FORGE_ENTERPRISE_NORTH_STAR.md`:

- deep ERP correctness;
- Vietnam compliance;
- metadata/App Factory leverage;
- verticalization without core forks;
- enterprise security/SRE;
- migration/onboarding/customer-success readiness.
