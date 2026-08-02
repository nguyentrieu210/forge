# WS13 — Migration / Import / Implementation / Customer Success

Status: **ACTIVE**  
Owner: **chatgpt-ws13**  
Branch: `agent/ent-13-migration-implementation`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Tạo đường chuyển khách vào Forge và go-live có kiểm soát: import wizard, mapping/validation/preview, opening data, migration adapters, reconciliation, setup wizard/checklist/training/support/adoption.

## Own

import/migration orchestration, source mapping, staging/validation, duplicate handling, opening balances/data, incremental migration, post-migration reconciliation framework, adapters MISA/ERPNext/Odoo/FAST/Bravo/legacy theo demand, implementation/setup/go-live tooling.

## Exact-state sync

- Agent branch was rebased/reset from stale seed to exact `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` before implementation.
- The stale branch contained only this workstream handoff file, so no implementation was discarded.
- Current source-relevant baseline includes existing Frappe-shaped CSV preview/apply routes, document-kernel idempotency, app installer atomicity and current tenant migration tooling.

## Phase A audit

### Existing import path

- `server/packages/frappe-api/src/router.ts` exposes Frappe-compatible data-import preview and apply methods.
- Preview parses CSV, checks import permission, rejects child DocTypes and rejects unknown target columns.
- Apply checks import + create permission and routes every row through `buildCommand -> context.runCommand`, so current CSV import does **not** bypass the document kernel/lifecycle.
- Apply is row-isolated: one bad row returns a per-row failure while valid rows can commit.
- `buildCommand` derives deterministic command IDs from tenant/doctype/name/action/version/payload, so retries for an already-resolved target name are kernel-idempotent.
- Gap: rows that rely on newly resolved autonames do not yet have a persisted source-row -> target-name mapping. A retry can therefore resolve another name before the kernel sees the command. This blocks claiming end-to-end migration retry safety.

### Installer / provisioning evidence

- `server/packages/app-registry/src/installer.ts` already treats identical re-install as no-op and commits app activation metadata/ownership through one D1 batch. Reuse this invariant for implementation provisioning; do not create a competing setup metadata path in WS13.
- Tenant migration remains sequential under `server/migrations/*` and `server/scripts/migrate-tenant.mjs`; WS13 must not rewrite an already-applied migration.

### Capability audit

| Capability | Current maturity | Evidence / gap |
|---|---|---|
| `IM01-001` Setup Wizard | Missing | no WS13 setup state/checkpoint contract located yet |
| `IM01-008` Implementation checklist | Missing | no canonical customer go-live checklist state located |
| `IM01-009` Go-live checklist | Missing | no canonical readiness gate located |
| `IM01-010` Demo/seed data | Foundation | `server/scripts/seed-local.mjs` / app fixtures exist, not yet customer implementation orchestration |
| `IM02-001` CSV import | Wired | preview + row-by-row kernel apply exists |
| `IM02-002` Excel import | Missing | XLSX client utility exists elsewhere, no canonical WS13 migration adapter audited yet |
| `IM02-003` Mapping wizard | Foundation | new deterministic mapping-plan primitive added; no API/UI wiring yet |
| `IM02-004` Validation preview | Wired | existing CSV preview validates parse/header shape; new plan adds target mapping invariants |
| `IM02-005` Duplicate handling | Missing | policy type exists in plan contract, authoritative duplicate executor not implemented |
| `IM02-006` Error correction/retry | Foundation | per-row failure exists; deterministic target identity for autoincrement/autoname migration still missing |
| `IM02-007` Opening balance import | Missing | requires WS01/WS04 canonical opening contracts |
| `IM02-008` Incremental migration | Missing | no persisted cursor/checkpoint/run state yet |
| `IM02-009` Post-migration reconciliation | Foundation | new exact-metric reconciliation primitive; domain metric providers missing |
| `IM02-010` Excel -> Forge template | Missing | not implemented in WS13 |
| `IM02-011` MISA -> Forge adapter | Missing | not implemented |
| `IM02-012` ERPNext -> Forge adapter | Missing | not implemented |
| `IM02-013` Odoo -> Forge adapter | Missing | not implemented |
| `IM02-014` FAST -> Forge adapter | Missing | not implemented |
| `IM02-015` Bravo -> Forge adapter | Missing | not implemented |
| `IM02-016` Legacy SQL/API migration | Foundation | generic source kind contract exists; no connector/checkpoint implementation |

### Legacy PR disposition

- `docs/agents/LEGACY_PR_INBOX.md` lists no substantive PR with WS13 as primary owner.
- Repository PR search for import/migration found sales/release fixes rather than a reusable migration pipeline. PR `#65` and `#91` document legacy/imported naming problems but remain domain evidence, not a WS13 implementation to reuse or cherry-pick.
- Disposition for WS13 implementation: **no reusable substantive legacy PR identified yet**.

## Phase B — first slice implemented

New package: `server/packages/migration/`.

Implemented deterministic, side-effect-free migration planning primitives:

1. source kind and duplicate-policy contract;
2. source header -> target field mapping, including explicit ignored columns;
3. target-field validation and duplicate target-map rejection;
4. required target-field coverage check;
5. deterministic source fingerprint + plan ID;
6. deterministic per-row key/fingerprint with duplicate source-key rejection;
7. explicit migration run state machine with controlled retry transitions;
8. exact string-based reconciliation metrics to avoid float semantics for money/quantity evidence.

Target state machine:

`draft -> validated -> applying -> applied -> reconciling -> completed`

Failure/retry paths:

- `applying -> failed -> applying` for restartable apply;
- `reconciling -> failed -> reconciling` for repeatable reconciliation;
- cancellation only before authoritative completion.

Regression: `server/tests/migration-plan.test.mjs` covers deterministic mapping/fingerprints, duplicate target mapping, duplicate source key, retry transition and exact reconciliation mismatch.

## Source -> target contract v0

A migration source must resolve to:

- `source_id` + `source_kind`;
- ordered source `headers` and raw rows;
- explicit mapping where ignored columns map to `null`;
- optional stable `key_field` used as source identity;
- target DocType field contract;
- duplicate policy (`error | skip | update`);
- immutable `source_fingerprint`, `plan_id` and per-row `fingerprint` before apply.

The planner does not write documents. Authoritative apply remains responsible for permission, document lifecycle, domain invariants and ledger effects.

## Dependency requests

### Dependency request DR-WS13-01
- Target stream: WS00
- Need: canonical generic migration apply contract for stable source-row identity -> target document identity while preserving document-kernel idempotency/autoname semantics.
- Why generic: required by every importer/adaptor, not one domain.
- Contract proposed: persisted migration run + row receipt stores `source_key`, `row_fingerprint`, `target_doctype`, `target_name`, command receipt and retry state.
- Blocking: yes for claiming `IM02-006` Wired/RC and incremental migration.
- Temporary workaround: explicit source `name`/stable target identity only.

### Dependency request DR-WS13-02
- Target stream: WS01, WS04, WS06
- Need: canonical opening-data and reconciliation metric providers for finance, stock and HR/payroll.
- Why generic: WS13 orchestrates migration but must not invent domain ledger/opening invariants.
- Contract proposed: domain validates mapped payload, applies through authoritative command path, then exposes exact source-vs-target reconciliation metrics.
- Blocking: yes for `IM02-007` and Hardened `IM02-009`.
- Temporary workaround: master-data migration only.

### Dependency request DR-WS13-03
- Target stream: WS12
- Need: production migration preflight/backup/rollback boundary and evidence contract.
- Why generic: every production migration needs the same safety gate.
- Contract proposed: backup marker + migration run id + pre/post verification + explicit no-rollback-after-authoritative-posting rule where applicable.
- Blocking: no for development; yes for production migration/go-live.
- Temporary workaround: development/dry-run only.

## Verification evidence

- Exact branch base comparison: PASS; branch started from current main and currently contains WS13-only files.
- New migration core compiled under an isolated TypeScript 5.8 strict harness using the server's strict flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): PASS.
- GitHub combined status on the implementation head returned no development CI statuses, consistent with current build/deploy-only Actions policy.
- Full repository `pnpm --filter cloudforge run build` and `node --test server/tests/migration-plan.test.mjs` are **not yet evidenced** in this session because the execution shell has no repository checkout/dependencies and DNS cannot clone GitHub.
- No production data mutation, migration, merge or deploy performed.

## Phase B next slices

1. Persist migration run + row receipts/checkpoints without bypassing the kernel.
2. Wire existing CSV preview/apply to the migration plan contract while preserving Frappe compatibility.
3. Implement duplicate executor (`error/skip/update`) with server-side permission and correction semantics.
4. Add master/opening import contracts, then domain reconciliation providers.
5. ERPNext adapter first; MISA adapter after canonical field/opening contracts are stable.
6. Setup/go-live checklist after data migration state is first-class.

## Dependencies

WS00 data contracts, WS01 finance opening/reconcile, WS04 stock opening, WS06 HR, WS11 tenant/security, WS12 backup/migration safety; mọi domain cung cấp canonical import contract.

## Guard

Không import thẳng bypass business invariants nếu dữ liệu cần authoritative posting. Migration phải restartable/idempotent và có dry-run/preview theo scope.

## Handoff

Workstream: WS13  
Branch: `agent/ent-13-migration-implementation`  
Owner: `chatgpt-ws13`  
Status: ACTIVE  
Capabilities: `IM01-*`, `IM02-*` with first implementation slice focused on `IM02-003`, `IM02-006`, `IM02-009` foundations  
Changed zones: `server/packages/migration/**`, `server/tests/migration-plan.test.mjs`, this workstream file  
Migration: none  
Production: untouched  
Recommended merge order: after WS00 review of stable source-row identity/apply contract; before adapter-specific work.
