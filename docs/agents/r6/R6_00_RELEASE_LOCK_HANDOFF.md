# R6-00 — Release Lock + Evidence Contract Handoff

Date: 2026-08-04  
Branch: `agent/r6-00-release-lock`  
PR: #640  
Execution topology: **SINGLE**  
Risk: governance/evidence only; no production mutation  
Status: **LOCKED — pending non-UI merge approval**

## 1. Exact candidate lock

R6-00 re-audited exact GitHub state immediately before materializing this handoff.

- Current `main`: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`.
- R5 COMPLETE runtime baseline: `7940331c589d4e5699cf00e2ec843c5a7b8c50ac`.
- Delta `7940331..4149af7`: merged R6 launch/governance documentation only; no runtime/schema/migration/release-workflow behavior change.
- Current R6 planning PR #639 is merged.
- R6-00 branch did not exist before this lane; #640 is the active R6-00 control PR.
- Older R5/R6 planning drafts (#624/#626) are superseded coordination history and are not candidate source.

The frozen initial R6 certification candidate is therefore:

`sourceSha = 4149af7c3e49b25fb1f43a50b62f99d7c04e6488`

Any later runtime/config/schema/profile-contract source fix creates a new candidate identity and invalidates affected evidence according to `EVIDENCE_MATRIX.md`.

## 2. Exact package/app identity

R6-00 did not trust the older WS17 `alumdoor@2.2.2` handoff. Exact current source was recomposed with the repository's canonical sidecar loader.

| Package/app | Candidate source version | Authority |
|---|---:|---|
| Alumdoor | **2.2.3** | `server/briefs/alumdoor-v2.json` + sidecars; integration sidecar applies last |
| HRM | **1.8.0** | `server/apps-src/hrm/app.json` |
| VN Accounting | **1.6.1** | `server/apps-src/vn-accounting/app.json` |
| Manufacturing QMS | **1.1.0** | `server/apps-src/manufacturing-qms/app.json` |
| Maintenance / Warranty / Field Service | **1.5.1** | `server/apps-src/maintenance/app.json` |

Alumdoor's composed source still declares minimum dependencies `vn-accounting@1.1.0` and `hrm@1.5.0`; the candidate package sources above are newer and must remain the identities used for R6 evidence.

The generic ERP/Sales/Procurement/Stock/Finance document and ledger authorities remain platform/domain authorities. They are not duplicated into an Alumdoor package list merely to make the table longer.

## 3. Capability Profile identity contract

There is **no legitimate source-only active tenant profile identity** to freeze. The active profile is tenant state.

Canonical authority:

- read current profile through `metaforge.api.get_capability_profile` / `AppInstaller.currentCapabilityProfile()` / `CapabilityProfileStore.active(tenantId)`;
- active pointer: `capability_profile_active`;
- immutable revisions: `capability_profile_revisions`;
- canonical revision hash: `capability_profile_revisions.content_hash`, created by `sha256Hex(semanticProfileState(proposal,resolution))`;
- preview/apply remain System Manager + session + CSRF guarded.

Therefore the R6 candidate manifest intentionally carries:

- `capabilityProfileId = null`;
- `capabilityProfileVersion = null`;
- `capabilityProfileHash = null`;
- state `TARGET_STATE_NOT_SOURCE_MATERIALIZED`.

This is **not** permission to invent `alumdoor-pilot` from an example fixture. R6-04 must observe and bind E18-E23 to the actual profile id/version/hash used by the approved certification environment. R6-05 rejects profile-mismatched evidence.

## 4. Expected migration inventory lock

R6-00 ran a temporary read-only GitHub Actions source probe against the exact PR base candidate. Run `30906240439` passed.

Canonical aggregate definition:

`sha256(sorted "<relative-path>\t<file-sha256>" lines + final newline)`

Locked expected inventory:

- SQL files: **86**;
- migration directories: `control`, `jobs`, `tenant`;
- aggregate digest: `904907b05c579898bed18966c6b2d348dc957a498d703dd90ecd57ca012695c8`;
- first: `control/0001_control_plane.sql` — `3c2e7c673315a70792eafcd5941a0449116889183e37fad2ef753ead3c030cbd`;
- last: `tenant/0115_capability_profiles.sql` — `e97468b5ea5c27a9384ab34749b0e2eaf73102ce4da3de045e29cb606bf0e441`.

This is **expected source inventory**, not proof of applied target state. R6-02 owns expected-vs-applied filenames/checksums and may not convert this source digest into E06 PASS by itself.

## 5. Release marker and target identity

Canonical full release workflow: `.github/workflows/alu-build-deploy.yml`.

Non-secret pilot-target identity from source:

- environment class: `PRODUCTION/PILOT_TARGET`;
- tenant: `alu`;
- base URL: `https://alu.kairo.vn`;
- Gateway Worker: `cloudforge-gateway`;
- Alumdoor app Worker: `cloudforge-app-alumdoor`;
- dispatch namespace: `cloudforge-production`;
- health: `/health`;
- public release marker: `/release.json`;
- expected unauthenticated boot boundary: `403`.

`releaseSha`, `deployedSha`, `bundleHash` and provider observation timestamp are **UNOBSERVED_BY_R6_00**. Git source, Wrangler configuration and a green historical workflow do not prove this candidate is deployed.

R6-01 must observe exact release convergence. Historical Alumdoor release evidence is not reusable as current-candidate proof.

## 6. Evidence contract

All R6 evidence IDs are preallocated in `R6_CANDIDATE_MANIFEST.json`.

| Lane | Evidence | Required outcome |
|---|---|---|
| R6-01 | R6-E01..E05 | source governance + provider desired/observed + health/release/telemetry |
| R6-02 | R6-E06..E11 | migration/applied state + backup/replay/restore/PITR boundary + opening reconciliation |
| R6-03 | R6-E12..E17 | auth/tenant/queue/recovery/performance/telemetry |
| R6-04 | R6-E18..E23 | exact package/profile + Golden Flow + canonical ledgers + failure/correction/warranty |
| R6-05 | all | independent same-candidate provenance and `PILOT-GO` / `PILOT-NO-GO` |

Rules:

1. Every evidence record names exact `sourceSha`, environment class, target identity, producer, timestamp and mutation classification.
2. `SOURCE` cannot satisfy a production-observed claim.
3. A source-changing fix cannot reuse old-SHA evidence.
4. Package/profile/migration identity is part of evidence provenance, not decorative metadata.
5. R6-05 may demand broader reruns than the minimum invalidation matrix, never fewer.

## 7. Dependency order

After this lock is accepted:

`R6-00 -> [R6-01 || R6-02 || R6-03 || R6-04] -> R6-05`

R6-01..04 may prepare read-only/local/disposable evidence in parallel. Their final environment-specific PASS remains conditional on the same exact candidate and approved environment.

There must be no separate candidate per lane.

## 8. Mutation boundary / authorization request

Allowed now without production mutation authorization:

- source validation;
- read-only provider inventory;
- read-only health/release/profile/applied-migration observation;
- local deterministic checks;
- isolated disposable drills that cannot route live traffic.

Explicit authorization is required before any of:

- full production deploy/redeploy/rollback;
- production migration;
- production restore/PITR;
- DNS/domain/route/resource/binding mutation;
- secret mutation;
- production customer-data import/delta/write;
- live route switch;
- Golden Flow writes against real pilot customer state.

Exact downstream live-deploy request, if R6-01/04 need pilot-target convergence:

`ALU Build and Deploy -> scope=full -> confirm=alu -> target_sha=4149af7c3e49b25fb1f43a50b62f99d7c04e6488`

R6-00 does **not** execute or imply approval of that mutation.

## 9. Residual classification

### must-certify

- R6-E01..R6-E23 on the locked identity;
- active profile id/version/hash on the exercised environment;
- expected-vs-applied migration state;
- provider-observed exact release marker and pilot-used resource drift;
- canonical Stock/Finance/AR/GL and correction/idempotency evidence.

### bounded-fix

- none identified by R6-00 source-lock audit. If a downstream lane finds one, smallest owner-correct fix only; return to R6-00 for candidate reissue.

### defer

- formal customer SLA/SLO/RTO/RPO and DR cadence remain unset policy decisions; use measured engineering evidence without inventing promises;
- encrypted durable off-account backup retention remains unimplemented and must not be conflated with isolated replay/restore evidence.

### pilot-excluded

- broad global Missing-capability completion outside Alumdoor pilot scope;
- subjective visual/pixel QA reopened from R5;
- statutory BHXH/BHYT/BHTN numeric automation without clause-level official-source evidence;
- receipt-targeted landed-cost historical valuation/COGS propagation unless explicitly brought into pilot scope.

## 10. R6-00 gate

The candidate identity, package set, expected migration digest, capability-profile derivation contract, release-marker contract, target identity, evidence ownership, dependency order and mutation boundary are now explicit and reproducible.

No production deploy, migration, restore/PITR, DNS, secret, provider repair or customer-data mutation was performed.

R6-00-LOCKED
