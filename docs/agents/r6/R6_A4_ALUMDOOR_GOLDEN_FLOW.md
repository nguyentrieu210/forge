# R6-04 — Alumdoor Exact-Release Golden Flow

Date: 2026-08-04  
Branch: `agent/r6-04-alumdoor-golden-flow`  
Locked source candidate: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`  
R6-00 control: PR #640  
Risk: CRITICAL certification/evidence; non-UI

## Mission

Prove that the Alumdoor reference vertical operates on the exact R6 candidate while consuming canonical Sales, Procurement, Stock, Manufacturing, Finance and Warranty/Service authorities. R6-04 is an evidence lane, not an implementation lane.

The branch is intentionally rooted at the exact R6-00 locked source candidate. Its delta is limited to R6-04 test/evidence tooling, workflow and documentation; it does not change runtime, schema, migrations or business authority and therefore does not create a new release candidate.

## Locked identity

Expected identity from R6-00:

- source SHA: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`;
- tenant: `alu`;
- pilot target: `https://alu.kairo.vn`;
- Alumdoor `2.2.3`;
- HRM `1.8.0`;
- VN Accounting `1.6.1`;
- Manufacturing QMS `1.1.0`;
- Maintenance `1.5.1`;
- active capability profile identity must be observed from target state, including canonical `capability_profile_revisions.content_hash`.

## Evidence strategy

### Safe exact-source evidence

The R6-04 workflow runs deterministic exact-head supporting regressions for:

- capability-profile resolution/persistence and non-destructive activation;
- Sales O2C lifecycle;
- Procurement P2P plus correction boundary;
- Alumdoor manufacturing lineage;
- canonical Warranty/Service linkage;
- existing read-only same-order Golden Order evaluator;
- cross-ledger reconciliation self-test;
- exact Alumdoor package composition;
- a guard against vertical direct Stock/GL/Payment authority.

These are supporting evidence only. They are not promoted to `PRODUCTION_LIKE_OBSERVED`.

### Read-only pilot-target identity

`server/scripts/r6-04-alumdoor-identity-readonly.mjs` performs only:

- `GET /release.json`;
- session login needed for authenticated reads;
- `GET metaforge.api.get_app_manifest` for required packages;
- `GET metaforge.api.get_capability_profile`;
- one remote D1 `SELECT` joining `capability_profile_active` to `capability_profile_revisions` to obtain the canonical profile content hash.

It performs no document create/update/submit/cancel/delete, no app install, no migration, no provider mutation and no D1 write. The output is restricted to non-secret release/package/profile identity.

## Evidence matrix

| ID | Required level | Current state before workflow observation | Certification rule |
|---|---|---|---|
| R6-E18 | `PRODUCTION_LIKE_OBSERVED` | `PENDING_REMOTE_OBSERVATION` | release/package/profile ID+version+hash must bind to the locked candidate |
| R6-E19 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | requires a fresh authenticated writable Golden Flow on approved production-like state |
| R6-E20 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | must read Stock/AR/Payment/GL from the fresh E19 canonical lineage |
| R6-E21 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | duplicate/retry and invalid/insufficient action must be exercised in approved environment |
| R6-E22 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | correction plus partial/equivalent receivable transition must be environment-bound |
| R6-E23 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | warranty/service must bind to the exact delivered document from fresh E19 lineage |

Historical production Golden Order evidence and local regressions remain useful provenance but cannot satisfy a new exact-candidate production-like evidence requirement.

## Dependency Request

### DR-R6-04-01 — writable production-like Golden Flow environment

Owner: R6 program / environment owner  
Status: OPEN

Required evidence cannot be manufactured from local tests. R6-E19 through R6-E23 need one approved writable production-like environment running the exact locked candidate and exact active Alumdoor profile. The environment must permit disposable/test business documents and canonical correction/retry paths without touching real customer state.

Alternative: explicit authorization for Golden Flow writes against real pilot customer state. The existence of production credentials, a production deployment or read access does **not** imply that authorization.

R6-04 continues all independent source/read-only work while this dependency is open.

## Safety boundary

No production deployment, migration, restore/PITR, DNS/secret/provider mutation or customer-data write is part of this branch. The existing full ALU release workflow is not invoked by R6-04.

This is non-UI certification work. Open PR and stop before merge/deploy pending explicit approval.

## Current lane verdict

`R6-04-RUNNING`
