# R6 Final Certification — 2026-08-04

Program: R6 Production Certification  
Lane: R6-05 — Independent Final Certification  
Execution topology: SINGLE  
Risk: CRITICAL certification / governance, non-UI  
Branch: `agent/r6-05-final-certification`  
Branch baseline: `main@86958c8bb79dda5d7615078535ece35af280f45b`  
R6-00 locked candidate: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`  
Certified SHA: **NONE — no candidate is certified for controlled pilot**  
Final verdict: **PILOT-NO-GO**

## 1. Independent certification conclusion

R6-05 cannot issue `PILOT-GO`.

The mandatory R6 evidence does not converge on one exact release/environment/profile identity:

1. R6-00 locked candidate `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`.
2. Exact current `main` is `86958c8bb79dda5d7615078535ece35af280f45b`, three commits ahead of the locked candidate. The delta includes R6-00 documentation plus two merged UI runtime changes (#645 and #646). R6-05 does not silently relock those source changes into a new candidate.
3. Latest R6-04 pilot-target observation at `2026-08-04T12:22:46.220Z` reported release SHA `450aaf0e3e70c0c8af2ebffabb0fa2632b61b603` and bundle hash `39de9138edeb6ebc`, not the locked candidate.
4. R6-01, R6-02, R6-03 and R6-04 all published explicit blockers. Mandatory provider, migration/restore/reconciliation, telemetry/profile and Golden Flow evidence remains incomplete.
5. No evidence shows that an unauthorized production mutation was used to manufacture PASS. The missing production/non-production mutations remained behind explicit authorization boundaries.

The exact-SHA invariant therefore fails before the remaining mandatory blockers are considered. Any future GO requires one newly agreed exact candidate identity and rerun of every evidence item invalidated by source/runtime/config/profile/migration changes.

## 2. Identity audited

### 2.1 Source and release

| Identity | Value | Certification meaning |
|---|---|---|
| R6-00 locked source | `4149af7c3e49b25fb1f43a50b62f99d7c04e6488` | Only currently locked R6 candidate |
| Current main | `86958c8bb79dda5d7615078535ece35af280f45b` | Not covered by the locked R6 evidence contract |
| Latest pilot-target observed release | `450aaf0e3e70c0c8af2ebffabb0fa2632b61b603` | Observed descendant, not exact locked candidate |
| Latest observed bundle hash | `39de9138edeb6ebc` | Bound to observed `450aaf0...`, not `4149af...` |
| Pilot target | tenant `alu`, `https://alu.kairo.vn` | `PILOT_TARGET_OBSERVED` target |

Independent compare of locked candidate -> current main is `ahead 3 / behind 0`. Runtime/source delta includes:

- `client/packages/views/src/data-surface/v3.ts` + regression from UI PR #645;
- `client/apps/runtime/src/alumdoor-dark-palette.css`, runtime import and palette guard from UI PR #646;
- R6-00 manifest/handoff documentation.

These changes are not treated as SHA-equivalent to the R6-00 candidate.

### 2.2 Package and profile identity

Expected package/app versions from the R6-00 manifest:

| Package/app | Expected version |
|---|---:|
| Alumdoor | `2.2.3` |
| HRM | `1.8.0` |
| VN Accounting | `1.6.1` |
| Manufacturing QMS | `1.1.0` |
| Maintenance | `1.5.1` |

Active Alumdoor capability-profile ID/version/content-hash: **UNPROVEN**.

R6-04 could not authenticate the approved read-only profile API because `ALU_META_ADMIN_USER` / `ALU_META_ADMIN_PASSWORD` were absent, and its read-only D1 profile query returned `wrangler_command_failed`. Source/example profile identity is not accepted as target identity.

### 2.3 Migration identity

Locked migration inventory:

- 86 SQL files across control/jobs/tenant;
- aggregate digest `904907b05c579898bed18966c6b2d348dc957a498d703dd90ecd57ca012695c8`;
- pilot tenant expected tenant migrations: 79;
- provider-observed applied: 49;
- pending: 30;
- unknown applied: 0.

Latest R6-02 read-only snapshot evidence:

- export bytes: `10,555,806`;
- snapshot SHA-256: `19590df8cad53475c19ea83f3ef3dfa755b6719adfbbaab1aa305d31fcafa65d`;
- isolated replay: 88 tables / 49 recorded migrations;
- SQLite `quick_check=ok`;
- FK violations: 0;
- tenant-scope violations: 0.

This proves backup/replay quality for the observed state; it does not prove migration convergence to the locked candidate.

## 3. Evidence table — R6-E01..R6-E23

R6-05 uses only `PASS`, `NOT_APPLICABLE`, `BLOCKED`, or `STALE_SHA` as required by the R6 evidence contract.

| ID | Producer | R6-05 status | Level / provenance | Independent disposition |
|---|---|---|---|---|
| R6-E01 | R6-01 | **PASS** | `SOURCE` | Locked-candidate Cloudflare source governance passed. Supporting only; cannot compensate for observed provider blockers. |
| R6-E02 | R6-01 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | `cloudforge-tenant-alu` lacks candidate-required `BROWSER` binding. |
| R6-E03 | R6-01 | **STALE_SHA** | `PILOT_TARGET_OBSERVED` | Health/root/guest-boot behavior passed on the live target, but the live release observed with that lane was not the exact locked candidate. R6-05 requires exact-release provenance for final acceptance. |
| R6-E04 | R6-01/R6-04 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | Latest observed release `450aaf0...` != locked candidate `4149af...`; bundle `39de9138edeb6ebc` belongs to the observed descendant. |
| R6-E05 | R6-01 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | Gateway + tenant observability observed; Alumdoor app Worker observability absent/unobserved. |
| R6-E06 | R6-02 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | 79 expected / 49 applied / 30 pending tenant migrations. Production migration not authorized or executed. |
| R6-E07 | R6-02 | **PASS** | read-only backup evidence | Fresh D1 export manifest and latest snapshot digest verified. |
| R6-E08 | R6-02 | **PASS** | `LOCAL` | Isolated replay clean: quick_check OK, FK 0, tenant-scope violations 0. |
| R6-E09 | R6-02 | **BLOCKED** | `DISPOSABLE_REMOTE` required | Disposable remote restore lifecycle not run; no authorized disposable target lifecycle available. |
| R6-E10 | R6-02 | **PASS** | read-only pilot/provider planning | D1 Time Travel current + target bookmarks resolved; restore `executed=false`; Worker-vs-data rollback boundary preserved. |
| R6-E11 | R6-02 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | No authorized Alumdoor opening dataset/provider proving Stock + AR/AP + cash/bank + GL/import reconciliation. |
| R6-E12 | R6-03 | **PASS** | `PRODUCTION_LIKE_OBSERVED` | Real workerd auth/session/System Manager/CSRF boundaries passed. |
| R6-E13 | R6-03 | **PASS** | `PRODUCTION_LIKE_OBSERVED` | Cross-tenant binding mismatch failed closed; server permission path exercised. |
| R6-E14 | R6-03 | **PASS** | `LOCAL` | Bounded retry/backoff and distinct DLQs validated. |
| R6-E15 | R6-03 | **PASS** | `LOCAL` | Recovery semantics are truthful: regular Worker exact-version rollback guarded; tenant/app compatible-forward/source-redeploy only; storage separate. |
| R6-E16 | R6-03 | **PASS** | `PRODUCTION_LIKE_OBSERVED` | 200 requests, concurrency 5, 0% errors, 157.11 RPS, p50 25 ms, p95 69 ms, p99 77 ms. |
| R6-E17 | R6-03 | **BLOCKED** | `PILOT_TARGET_OBSERVED` required | Alumdoor app telemetry unobserved and pilot cost-pressure evidence absent. |
| R6-E18 | R6-04 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | Exact target package/profile identity not proven and pilot target is not on locked candidate. |
| R6-E19 | R6-04 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | No approved writable exact-candidate production-like environment for fresh authenticated Golden transaction lineage. |
| R6-E20 | R6-04 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | Fresh canonical Stock/AR/Payment/GL readback depends on E19 lineage. |
| R6-E21 | R6-04 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | Retry/duplicate/invalid authoritative-action evidence cannot be promoted from local source tests. |
| R6-E22 | R6-04 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | Canonical correction + partial/equivalent receivable transition not observed on approved exact-candidate state. |
| R6-E23 | R6-04 | **BLOCKED** | `PRODUCTION_LIKE_OBSERVED` required | Warranty/service lineage requires the fresh delivered source document from E19. |

Final count:

- PASS: **9**
- BLOCKED: **13**
- STALE_SHA: **1**
- NOT_APPLICABLE: **0**

`PILOT-GO` requires zero `BLOCKED` and zero `STALE_SHA` items in pilot scope. That gate is not close to satisfied.

## 4. Lane acceptance audit

### R6-01 — BLOCKED

Accepted supporting evidence: E01.  
Exact blockers: E02 binding drift, E04 release mismatch, E05 Alumdoor app observability gap.  
R6-05 additionally downgrades E03 to `STALE_SHA` for final exact-release provenance because the health/auth observation was not bound to the locked release.

### R6-02 — BLOCKED

Accepted supporting evidence: E07, E08, E10.  
Exact blockers: E06 30 pending production migrations; E09 remote disposable restore not run; E11 production-like opening reconciliation absent.

R6-02 also introduced safety-tooling fixes on its lane branch. They are useful evidence tooling, but they are not silently incorporated into the R6-00 runtime candidate by R6-05.

### R6-03 — BLOCKED

Accepted evidence: E12-E16.  
Exact blocker: E17 pilot-target telemetry/cost pressure.  
The lane also records a release-safety owner dependency involving duplicate Gateway production-deploy authority; R6-05 does not repair shared release authority from an audit lane.

### R6-04 — BLOCKED

Supporting deterministic source evidence passed, including capability/profile observer guards, Commercial flow regressions, Manufacturing/Warranty lineage, cross-ledger self-test, Alumdoor package dry-run and vertical shadow-authority guard.

None of that can replace required production-like exact-release evidence. E18-E23 remain BLOCKED.

R6-04 also found pre-existing strict TypeScript `exactOptionalPropertyTypes` debt in shared Selling/Model paths on the locked candidate. The official release-build path must be proven or the source debt repaired and the candidate relocked; R6-05 does not fix it.

## 5. Production mutation audit

No unauthorized production mutation is accepted or required to explain the current evidence:

- R6-01: provider/public reads only; no deploy/redeploy/resource/DNS/secret mutation.
- R6-02: read-only export/observation/PITR planning plus local replay; no production migration/restore/customer-data write/route switch.
- R6-03: local/production-like bounded validation; no production rollback/storage/queue/data mutation.
- R6-04: pilot reads + deterministic source tests; no pilot customer-data Golden Flow writes.
- R6-05: GitHub/source/evidence audit only; no provider or customer-data mutation.

Required destructive/production actions remain explicit dependencies, not implied authorization.

## 6. Unresolved release blockers

1. **Candidate identity drift:** current main contains source/runtime UI changes after the R6-00 lock. If those changes are part of the intended pilot, a new exact candidate must be issued; if not, the locked SHA must be deliberately deployed as such. R6-05 does not choose a new candidate implicitly.
2. **Exact release mismatch:** latest observed pilot release is `450aaf0...`, not `4149af...`.
3. **Provider drift:** candidate-required tenant `BROWSER` binding is absent.
4. **Alumdoor app observability:** app Worker logs/traces are not observed and locked source has an owner/config gap.
5. **Migration convergence:** 30 expected tenant migrations remain pending on pilot.
6. **Disposable restore drill:** E09 not executed.
7. **Opening reconciliation:** no approved production-like Alumdoor opening dataset/provider for E11.
8. **Pilot telemetry/cost evidence:** E17 incomplete.
9. **Package/profile identity:** active package/profile ID/version/content-hash remains unproven on the target.
10. **Golden Flow:** E19-E23 lack an approved writable exact-candidate production-like environment or explicit pilot customer-data write authorization.
11. **Locked-candidate build debt:** strict shared Selling/Model TypeScript debt requires official build-path proof or repair/relock.
12. **R6-02 safety tooling disposition:** useful safety fixes exist only on the R6-02 lane and need explicit convergence/relock treatment if they are to become release source.

Because mandatory evidence itself is incomplete, R6-05 cannot certify the stronger condition "no unresolved P0/P1 in pilot scope". It does not invent a severity downgrade to bypass missing evidence.

## 7. Dependency Requests for a future certification rerun

### DR-R6-05-01 — Candidate/relock owner

Publish one exact final candidate SHA after disposing all source-changing R6 fixes and the post-lock UI runtime merges. Record which current-main changes are intentionally in or out. Recompute affected package/runtime identity and rerun evidence according to the R6 invalidation matrix.

### DR-R6-05-02 — Release/provider owner

For the chosen candidate, close provider drift and Alumdoor app observability source/config gaps, then perform an explicitly authorized exact release if production deployment is required. Re-observe E02-E05 from the resulting target state.

### DR-R6-05-03 — Data/recovery owner + authorized operator

After a fresh verified backup and explicit production authorization, converge required pilot migrations and rerun E06. Provide/authorize the disposable remote restore target for E09 and a production-like opening dataset/provider for E11.

### DR-R6-05-04 — Pilot environment/profile owner

Provide an approved read-only package/profile identity path and an approved writable production-like exact-candidate environment for E18-E23. If the only available environment is the real pilot target, customer-data write authorization must be explicit.

### DR-R6-05-05 — R6-03 telemetry owner

Collect pilot-target Alumdoor app observability and bounded cost/pressure evidence on the same final exact release identity, then rerun E17.

## 8. Waivers and boundaries

- R5 subjective visual/pixel QA waiver remains historical and is **not reopened**.
- No R6 mandatory evidence item is waived in this certification.
- Broad global Missing-capability completion remains outside Alumdoor pilot scope.
- Statutory BHXH/BHYT/BHTN numeric automation without clause-level official-source evidence remains fail-closed/pilot-excluded per R6-00.
- Receipt-targeted landed-cost historical valuation/COGS propagation remains pilot-excluded unless separately brought into scope.
- Formal customer SLA/SLO/RTO/RPO policy and durable off-account backup retention are not invented by this audit.
- Worker rollback is not represented as D1/data rollback.

## 9. Merge/deploy boundary

This file is a non-UI CRITICAL certification record.

- Branch creation and documentation commit are allowed.
- No production operation was performed.
- Do not merge this R6-05 record without explicit user approval.
- This certification record itself has no deploy action and does not authorize deployment, migration, restore, DNS/secret mutation or customer-data writes.

## 10. Final verdict

**PILOT-NO-GO**
