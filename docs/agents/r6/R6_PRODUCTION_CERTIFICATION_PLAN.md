# R6 Production Certification Plan

Date: 2026-08-04  
Program: R6  
Baseline: `main@7940331c589d4e5699cf00e2ec843c5a7b8c50ac`  
Input state: R5 COMPLETE  
Output state: `PILOT-GO` or `PILOT-NO-GO`

## 1. Mission

R6 certifies that one exact Forge release candidate is operationally safe enough to enter the controlled Alumdoor pilot.

R5 answered: **is the integrated product engineered coherently?**

R6 answers: **can this exact candidate be released, observed, recovered, reconciled and exercised in a production-like environment with evidence strong enough to accept pilot risk?**

R6 is therefore evidence-heavy and mutation-light. It is not another horizontal feature program.

## 2. Non-goals

R6 must not:

- implement all remaining Missing capabilities;
- reopen RC4/R5 domains merely to improve maturity counts;
- create new shadow ledgers, stock stores or vertical authority;
- fork shared runtime/domain code into Alumdoor;
- invent a second deployment/recovery stack;
- convert a source/config check into a production-observed claim;
- treat a merged commit as deployed evidence;
- perform subjective visual/pixel QA as a release requirement;
- silently run production mutations under the label of certification.

A code change is acceptable only when R6 finds a bounded pilot/release blocker. Any code change creates a new candidate identity and invalidates affected exact-SHA evidence.

## 3. Initial certification baseline

The initial R6 source baseline is the R5 merge commit:

`7940331c589d4e5699cf00e2ec843c5a7b8c50ac`

This is only the **starting source baseline**. `R6-00` must materialize the actual certification manifest before downstream lanes claim evidence.

The manifest must include at minimum:

```text
sourceSha
releaseSha / deployedSha when applicable
bundleHash
release marker URL/environment identity
package versions
Alumdoor app version
capabilityProfileId
capabilityProfileVersion
capabilityProfileHash or canonical digest
migration inventory/checksum digest
provider observation timestamp
```

The final `certifiedSha` may differ from the initial baseline only if a bounded R6 fix is merged and all affected lanes rerun.

## 4. Program invariants

### R6-I01 — exact SHA
Every execution/evidence item identifies the exact source/release SHA it proves.

### R6-I02 — observed state beats desired state
Git config, Wrangler files and scripts establish desired state. Production/provider claims require observed evidence.

### R6-I03 — no hidden production mutation
Provider observation and health checks are separated from deploy, migration, rollback, restore/PITR, DNS, secret or customer-data mutation.

### R6-I04 — backup is not recovery evidence until replayed
A SQL export alone is insufficient. At minimum the backup must pass checksum/manifest verification and isolated replay/integrity checks.

### R6-I05 — Worker rollback does not roll back data
Worker code/config rollback and D1 state recovery remain separate controls.

### R6-I06 — cutover evidence is reconciled evidence
Successful import or document counts do not prove readiness. Opening balances and canonical ledgers must reconcile.

### R6-I07 — provider load is bounded
Remote load smoke uses only approved bounded GET/HEAD paths and repository guardrails. No uncontrolled production stress.

### R6-I08 — vertical remains a composition
Alumdoor consumes canonical CRM/Sales/Procurement/Stock/Manufacturing/Finance/HCM/Service authorities; R6 must reject new vertical shadow authority.

### R6-I09 — correction paths matter
Golden Flow certification includes bounded failure/correction/idempotency evidence, not only happy-path document creation.

### R6-I10 — R5 visual waiver remains scoped
R6 does not reopen subjective visual QA. Functional browser proof is allowed only where necessary to prove authenticated release behavior or Golden Flow functionality.

## 5. Certification environments

R6 recognizes four environment classes. Evidence must name the class explicitly.

| Class | Purpose | Production mutation allowed? |
|---|---|---|
| Local/offline | build, source checks, backup replay, deterministic tests | No |
| Disposable isolated | restore drill, migration rehearsal, destructive test data | Yes inside disposable target only |
| Production-like/staging | exact release rehearsal, auth/golden flow, bounded load | Only under environment-specific authorization |
| Production/pilot target | provider observation and final release proof | Mutations require explicit authorization |

No evidence may say only `remote` or `cloud`; it must identify the environment class and non-secret target identity.

## 6. R6 lanes

### R6-00 — Release Lock and Evidence Contract

Purpose: create one immutable certification identity and dependency manifest.

Responsibilities:

- audit exact `main`, open R6 branches/PRs and current deployment/recovery tooling;
- freeze the initial candidate identity;
- enumerate packages/app/profile/migrations participating in the pilot candidate;
- create evidence IDs and producer/consumer mapping;
- define which steps are read-only vs mutation-gated;
- classify every R6 residual as `must-certify / bounded-fix / defer / pilot-excluded`;
- refuse stale branch replay.

Output:

- `R6_CANDIDATE_MANIFEST.md` or machine-readable equivalent;
- exact candidate SHA;
- dependency order;
- authorization checklist;
- R6 evidence index.

Gate: `R6-00-LOCKED`.

No other lane may issue a final PASS before this gate exists.

### R6-01 — Provider and Exact Release Evidence

Purpose: prove desired-vs-observed Cloudflare and exact release convergence.

Read-only scope:

- run source governance verification;
- observe Worker/resource/binding/route state for resources actually used by the candidate;
- record unexplained drift;
- verify release marker identity after an authorized deployment exists;
- verify `/health`, `/`, guest boot auth boundary and `/release.json`;
- prove `releaseSha` and `bundleHash` match the candidate.

Mutation-gated scope:

- deploy/redeploy Worker or Gateway;
- provision or alter bindings/resources;
- route/domain changes;
- secret changes.

Acceptance:

- no unexplained critical desired-vs-observed drift in pilot-used resources;
- exact release marker converges;
- no evidence from a different source SHA is reused;
- observability expected by the runbook is present for the exercised service family.

Gate: `R6-01-PASS` or explicit BLOCKED with the mutation authorization required.

### R6-02 — Data Safety, Migration and Cutover Rehearsal

Purpose: prove the candidate can move data forward and recover without inventing unsafe rollback semantics.

Scope:

- read current applied migration inventory;
- compare expected vs applied migration filenames/checksums;
- create/verify a fresh backup in an approved test/rehearsal path;
- isolated SQLite replay and integrity/foreign-key/tenant-scope checks;
- restore drill into a new empty disposable D1 target;
- cutover rehearsal on production-like snapshot/data shape;
- opening stock, AR/AP, cash/bank and GL reconciliation where applicable;
- document rollback decision matrix for code vs D1 vs external state;
- produce PITR read-only plan/bookmark evidence if applicable.

Mutation-gated production scope:

- production migration;
- production PITR/restore;
- customer delta import;
- production routing switch.

Acceptance:

- backup manifest/checksum verified;
- isolated replay clean;
- disposable restore clean;
- migration expected/applied state reconciles;
- no cross-tenant rows;
- cutover rehearsal has deterministic stop/rollback criteria;
- no claim that Worker rollback reverts data.

Gate: `R6-02-PASS`.

### R6-03 — Security, Recovery, Performance and Observability

Purpose: prove the release behaves safely under representative operational pressure and failure boundaries.

Scope:

- authenticated/unauthenticated boundary checks;
- tenant isolation and System Manager/admin boundaries for new R5 surfaces;
- secret/config hygiene;
- queue retry/DLQ safety;
- regular Worker rollback plan/evidence where supported;
- tenant/app Worker compatible forward/source-redeploy recovery contract;
- representative bounded p95/p99/error/RPS measurements;
- provider cost/pressure observations needed for pilot sizing;
- logs/traces/health evidence for service families used by the pilot.

Acceptance:

- no P0 security/tenant-isolation gap;
- bounded load completes within agreed engineering smoke envelope or is explicitly blocked with measured reason;
- rollback/recovery path is truthful about unsupported provider semantics;
- no secret or request-body leakage in evidence;
- no uncontrolled remote load.

Gate: `R6-03-PASS`.

### R6-04 — Alumdoor Exact-Release Golden Flow

Purpose: prove the reference vertical can operate on the exact candidate without bypassing canonical domain authorities.

Minimum authenticated flow:

```text
Customer / Contact
 -> Quotation
 -> Sales Order
 -> procurement/material demand when required
 -> Purchase Order
 -> Purchase Receipt
 -> Manufacturing / Work Order
 -> stock issue / production movement
 -> Delivery Note
 -> Sales Invoice
 -> Payment
 -> GL / AR readback
 -> Warranty / service evidence
```

Required bounded correction/failure evidence:

- duplicate/idempotent retry on at least one authoritative action;
- insufficient/invalid material or blocked action fails closed;
- one correction path: cancel/return/adjustment according to canonical domain contract;
- partial payment or equivalent receivable state transition;
- warranty claim tied to the exact delivered source document;
- stock and finance readback from canonical ledgers.

Package/profile checks:

- Alumdoor profile ID/version is exact;
- required HRM/CRM/Finance/Stock/Manufacturing capabilities are active;
- unrelated capabilities may remain disabled;
- disabling a capability does not uninstall the package or erase history;
- no shared code literal creates Alumdoor-only authority.

Browser scope:

- no subjective visual QA;
- functional authenticated browser smoke only if needed to prove the actual user path;
- API/domain evidence remains authoritative for ledger correctness.

Acceptance:

- Golden Flow completes on exact release identity;
- corrections and canonical readbacks reconcile;
- no duplicate ledger/stock authority;
- no unresolved P0/P1 pilot blocker.

Gate: `R6-04-PASS`.

### R6-05 — Independent Final Certification

Purpose: independently verify that all mandatory R6 evidence refers to one final candidate and emit the release decision.

R6-05 must not implement missing features. It may only:

- validate evidence provenance;
- rerun safe read-only/automated checks;
- identify stale/mismatched SHA evidence;
- classify blockers;
- emit final certification.

Mandatory checks:

1. exact candidate ancestry and immutable identity;
2. R6-01 provider/release evidence;
3. R6-02 data/migration/recovery evidence;
4. R6-03 security/performance/observability evidence;
5. R6-04 Golden Flow evidence;
6. no unauthorized production mutation recorded;
7. no unexplained P0/P1 blocker in pilot scope;
8. any R6 source fix caused affected evidence rerun on the new SHA.

Output:

- `R6_FINAL_CERTIFICATION_YYYYMMDD.md`;
- evidence index;
- exact `certifiedSha`;
- exact package/profile/release identity;
- `PILOT-GO` or `PILOT-NO-GO`.

## 7. Parallelization

After `R6-00-LOCKED`, open R6-01, R6-02, R6-03 and R6-04 in parallel.

They may prepare source/read-only evidence independently. Final environment-specific steps may remain blocked on a common exact deployment.

R6-05 opens only after all four lanes publish a final PASS or explicit blocker disposition.

Do not create separate competing release candidates per lane.

## 8. Source change policy during R6

R6 is certification-first, but bounded fixes are allowed.

When a lane finds a real blocker:

1. record the invariant that failed;
2. classify whether it blocks pilot scope;
3. make the smallest owner-correct fix;
4. merge through normal non-UI boundary;
5. issue a new candidate SHA;
6. rerun all evidence whose semantics depend on the changed source;
7. never relabel old evidence as proving the new SHA.

Examples:

- documentation typo: normally does not invalidate runtime evidence;
- health probe code change: rerun release/health evidence;
- migration change: rerun migration/replay/cutover and affected domain evidence;
- finance/stock authority change: rerun correction/reconciliation + Golden Flow;
- release workflow/config change: rerun exact deployment/release convergence.

## 9. Evidence quality levels

| Level | Meaning | Can satisfy R6? |
|---|---|---|
| Source | config/code exists | No, by itself |
| Local | local deterministic test | Supporting only |
| Isolated remote | disposable Cloudflare/non-prod drill | Yes for recovery/rehearsal classes |
| Production-like observed | exact candidate observed in approved environment | Yes |
| Production/pilot-target observed | exact candidate observed on pilot target | Required where the claim is specifically about that target |

Every evidence item records level explicitly.

## 10. GO criteria

`PILOT-GO` requires all of the following:

- exact certification identity frozen;
- provider desired-vs-observed state acceptable for pilot-used resources;
- exact release marker and bundle hash converge;
- applied migration state verified;
- backup verified and restorable via isolated drill;
- cutover rehearsal and opening reconciliation clean;
- security/tenant/auth boundaries clean;
- bounded representative performance evidence acceptable;
- recovery/rollback limitations documented and tested where safely possible;
- authenticated Alumdoor Golden Flow + correction/readback evidence clean;
- no P0 or unresolved P1 in pilot scope;
- all final evidence points to the same certified SHA/environment/profile version.

## 11. NO-GO conditions

Any one of these is sufficient for `PILOT-NO-GO`:

- release marker SHA/hash mismatch;
- unexplained provider drift affecting pilot traffic/data;
- backup cannot replay or restore cleanly;
- applied migration checksum/inventory mismatch;
- unresolved tenant isolation/auth bypass;
- canonical ledger/stock reconciliation drift;
- Golden Flow depends on a shadow authority or stale vertical fork;
- correction/idempotency path corrupts or duplicates authority;
- required production-like evidence refers to another candidate SHA;
- destructive production action is required but not authorized;
- P0 or unresolved P1 remains in pilot scope.

## 12. Pilot handoff

R6 does not perform the full customer cutover. `PILOT-GO` authorizes moving to the **controlled Alumdoor pilot process**, whose next steps are:

1. freeze Alumdoor Production Profile;
2. map/import real masters/opening data under explicit data authorization;
3. dry run representative real transactions;
4. parallel run with current source system;
5. daily reconciliation;
6. cutover;
7. hypercare;
8. Pilot Exit Gate -> Accepted Production Reference -> GA.

R6 certifies the platform/release. The pilot certifies sustained real operational use.