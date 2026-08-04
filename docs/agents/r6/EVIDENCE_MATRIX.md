# R6 Evidence Matrix

Date: 2026-08-04  
Purpose: make R6 evidence composable, exact-SHA bound and auditable.

Every evidence item records:

- `evidenceId`;
- exact source SHA;
- release/deployed SHA when applicable;
- environment class;
- non-secret target identity;
- producer lane;
- observation/execution timestamp;
- command/workflow/tool path;
- result;
- artifact/path/reference;
- whether any production mutation occurred;
- dependency on package/profile/migration identity.

Evidence with an old SHA is historical, not current certification evidence.

## R6-01 — Provider and Release

| ID | Evidence | Minimum acceptance |
|---|---|---|
| R6-E01 | Cloudflare desired-state source governance | governed pilot-used configs validate; no unexplained source drift |
| R6-E02 | Remote desired-vs-observed provider inventory | pilot-used Workers/resources/bindings/routes observed; critical drift = none or explicitly blocked |
| R6-E03 | Exact health/auth boundary | `/health=200+ok`, root served, guest boot remains forbidden as designed |
| R6-E04 | Exact release marker | `releaseSha/deployedSha` matches candidate and `bundleHash` is non-empty/canonical |
| R6-E05 | Provider observability | logs/traces/metrics expectations present for exercised service families; no secret/request-body evidence leak |

## R6-02 — Data Safety, Migration, Cutover

| ID | Evidence | Minimum acceptance |
|---|---|---|
| R6-E06 | Expected/applied migration inventory | filenames/checksums/applied state reconcile |
| R6-E07 | Fresh backup verification | manifest, tenant/database identity, byte count, SHA and replay checks pass |
| R6-E08 | Isolated replay integrity | SQLite replay, integrity, FK and tenant-scope checks pass |
| R6-E09 | Disposable remote restore drill | new empty target only; restore succeeds; no live routing change |
| R6-E10 | PITR/rollback decision evidence | read-only PITR plan/bookmark/undo semantics and Worker-vs-data rollback boundary are explicit |
| R6-E11 | Cutover/opening reconciliation rehearsal | opening Stock, AR/AP, cash/bank, GL and migration/import totals reconcile for included pilot scope |

## R6-03 — Security, Performance, Recovery

| ID | Evidence | Minimum acceptance |
|---|---|---|
| R6-E12 | Auth/session/admin boundaries | unauthenticated/authenticated/System Manager boundaries pass |
| R6-E13 | Tenant isolation/permission | cross-tenant access fails closed; server-side permission path remains authoritative |
| R6-E14 | Queue/retry/DLQ safety | bounded retry + distinct DLQ for exercised queues; no blind replay |
| R6-E15 | Recovery evidence | supported regular-Worker rollback or truthful tenant/app forward-redeploy recovery contract |
| R6-E16 | Representative performance/load | bounded test reports p50/p95/p99/error/RPS; no uncontrolled production stress |
| R6-E17 | Operational telemetry/cost pressure | enough logs/traces/provider pressure evidence to size/observe pilot without inventing SLA |

## R6-04 — Alumdoor Golden Flow

| ID | Evidence | Minimum acceptance |
|---|---|---|
| R6-E18 | Exact Alumdoor package/profile identity | app/package/profile ID+version/digest match certified candidate |
| R6-E19 | Golden transaction lineage | authenticated Customer/Quotation/SO/PO/PR/Manufacturing/DN/Invoice/Payment/Warranty lineage completes as scoped |
| R6-E20 | Canonical Stock/Finance readback | Stock Ledger, Payment/AR and GL evidence reconcile; no shadow authority |
| R6-E21 | Failure/idempotency path | duplicate/retry and invalid/insufficient action fail safely without duplicate authority |
| R6-E22 | Correction/settlement path | at least one canonical correction plus partial/equivalent receivable transition proves lifecycle integrity |
| R6-E23 | Warranty/source-document lineage | warranty/service evidence tied to exact delivered source document and correct tenant/user boundary |

## Evidence levels

Use one of these exact values:

- `SOURCE`
- `LOCAL`
- `DISPOSABLE_REMOTE`
- `PRODUCTION_LIKE_OBSERVED`
- `PILOT_TARGET_OBSERVED`

`SOURCE` alone cannot satisfy an R6 production claim.

## Mutation classification

Use one of:

- `NONE`
- `DISPOSABLE_ONLY`
- `AUTHORIZED_NON_PROD`
- `AUTHORIZED_PRODUCTION`

Any `AUTHORIZED_PRODUCTION` evidence must reference the explicit authorization context. An agent may not infer authorization from the existence of this program.

## Evidence invalidation matrix

| Candidate change | Evidence that must rerun |
|---|---|
| Docs-only prose with no operational contract change | provenance check only |
| Capability profile/package contract | E01, E04 if bundled, E12-E13, E18-E23 as affected |
| Migration/schema | E06-E11 and every domain/Golden Flow item touching changed schema |
| Finance/Stock authority | E11, E19-E22 plus correction/reconciliation checks |
| Worker/runtime/release workflow | E01-E05, E12-E17, functional Golden Flow paths affected |
| Auth/session/tenant boundary | E03, E12-E13, E19-E23 as applicable |
| Alumdoor app code/profile | E18-E23 and exact release evidence if deployed artifact changes |

R6-05 decides final invalidation scope conservatively. It may require more reruns, never fewer than the changed authority implies.

## Final acceptance table

R6-05 must materialize all IDs as one of:

- `PASS`
- `NOT_APPLICABLE` with explicit reason approved by program scope
- `BLOCKED`
- `STALE_SHA`

`PILOT-GO` requires every mandatory item to be `PASS` or legitimately `NOT_APPLICABLE`, with no `BLOCKED` or `STALE_SHA` item in pilot scope.