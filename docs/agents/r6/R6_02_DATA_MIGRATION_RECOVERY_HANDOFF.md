# R6-02 — Data Safety, Migration & Recovery Handoff

**Verdict:** `R6-02-BLOCKED`  
**Lane:** `agent/r6-02-data-migration-recovery`  
**PR:** #643  
**R6-00 locked runtime/source candidate:** `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`  
**R6-00 migration inventory:** 86 SQL files / `904907b05c579898bed18966c6b2d348dc957a498d703dd90ecd57ca012695c8`  
**Pilot target:** `alu` / `cloudforge-alu`  
**Mutation performed against pilot:** NONE for migration observation and PITR; backup is a read-only D1 export.

## 1. Executive result

R6-02 cannot honestly emit `R6-02-PASS` yet.

The locked migration tree is internally valid and replayable, fresh backup + isolated restore verification passes, and a read-only D1 Time Travel plan resolves provider bookmarks successfully. However, the pilot tenant is behind the locked tenant migration inventory: **79 expected / 49 applied / 30 pending**. Applying those migrations is a production database mutation and was deliberately not performed in this lane without explicit authorization.

Two additional evidence requirements remain unresolved:

- E09 requires a disposable remote restore target lifecycle.
- E11 requires an authorized production-like Alumdoor opening dataset/provider covering Stock, AR/AP, cash/bank and GL/import reconciliation; the repository currently contains only generic opening-migration contracts and fixture-level coverage, which cannot be promoted to production-like evidence.

## 2. Candidate integrity and local certification

The R6-02 validation workflow pins the R6-00 source candidate as an ancestor, verifies that `server/migrations/**` has **no delta** from that candidate, and recomputes the locked aggregate migration inventory.

Latest local certification on R6-02 head before this handoff:

- locked source ancestry: PASS
- total migration inventory: **86 files**
- aggregate migration digest: `904907b05c579898bed18966c6b2d348dc957a498d703dd90ecd57ca012695c8`
- migration-tree diff from locked candidate: NONE
- migration governance / append-only checks: PASS
- focused migration + backup + destructive-guard tests: PASS
- full SQL replay verifier: PASS
- durable migration journal replay: PASS

The R6-02 commits modify safety tooling/tests/workflow/documentation only; they do **not** alter the locked migration SQL tree. R6-05/R6-00 must still decide whether these runtime/tooling fixes require a refreshed final release lock before convergence.

## 3. Evidence matrix

| Evidence | Status | Observed result | Mutation boundary |
| --- | --- | --- | --- |
| R6-E06 Applied migration inventory | **BLOCKED** | Tenant inventory expected **79**, applied **49**, pending **30**, unknown applied **0**, source-checksum-bound applied rows **49** | NONE |
| R6-E07 Fresh backup verification | **PASS** | Fresh export **10,555,806 bytes**, SHA-256 `1f1529b842a31d5a7b6d7209c7e92a4482772d329c3528d1a38fbadccb9c1ae6`, immutable manifest verified | Read-only export |
| R6-E08 Isolated replay integrity | **PASS** | **88 tables**, **49 recorded migrations**, SQLite `quick_check=ok`, FK violations **0**, tenant-scope violations **0** for documents/doctype definitions/installed apps | LOCAL ONLY |
| R6-E09 Disposable remote restore | **BLOCKED / NOT RUN** | Canonical restore drill exists and rejects live targets, but no disposable remote target lifecycle was authorized/executed in this run | DISPOSABLE_REMOTE required |
| R6-E10 PITR / rollback decision | **PASS** | Cloudflare `d1 info` omitted storage version, but direct read-only `d1 time-travel info` resolved current + target bookmarks; `executed=false` | NONE |
| R6-E11 Production-like opening reconciliation | **BLOCKED / NOT AVAILABLE** | No authorized Alumdoor production-like opening dataset/provider found for Stock + AR/AP + cash/bank + GL/import reconciliation; generic fixture evidence is insufficient | AUTHORIZED_NON_PROD required |

## 4. R6-E06 production migration blocker

Provider-observed `d1_migrations` contains 49 known filenames. All 49 map to source files and were bound to the exact source SHA-256 observed during this certification run. D1 historical bookkeeping stores migration filenames rather than applied-time content hashes, so R6-02 does **not** fabricate historical checksums.

The 30 pending tenant migrations are:

1. `0088_app_revision_history.sql`
2. `0089_vn_accounting_statutory_foundation.sql`
3. `0090_vn_accounting_statutory_registry_integrity.sql`
4. `0091_vn_einvoice_compliance_evidence.sql`
5. `0092_vn_tax_ruleset_dsl_integrity.sql`
6. `0093_finance_budget_commitment.sql`
7. `0094_finance_budget_submission_closure.sql`
8. `0095_finance_budget_permission_alignment.sql`
9. `0096_vn_vat_dataset_mapping.sql`
10. `0097_vn_accounting_policy_integrity.sql`
11. `0098_tt99_account_company_policy_binding.sql`
12. `0099_hrm_statutory_payroll_integrity.sql`
13. `0100_hrm_workforce_finance_integrity.sql`
14. `0101_hrm_lifecycle_closure_integrity.sql`
15. `0102_hrm_recruitment_depth_integrity.sql`
16. `0103_hrm_organization_position_integrity.sql`
17. `0104_hrm_loan_disbursement_integrity.sql`
18. `0105_ws15_collaboration_integrity.sql`
19. `0106_ws15_workplace_domain_integrity.sql`
20. `0107_ws15_workplace_update_integrity.sql`
21. `0108_ws15_workplace_actor_integrity.sql`
22. `0109_ws15_evidence_state_integrity.sql`
23. `0110_batch_replay_claims.sql`
24. `0110_rc020_finance_posting_period_integrity.sql`
25. `0110_rc023_cash_bank_reconciliation.sql`
26. `0111_rc020_finance_gl_scope_reconciliation.sql`
27. `0112_rc021_finance_ar_reconciliation.sql`
28. `0113_vn_vat_account_mapping_guard_hardening.sql`
29. `0114_app_factory_approval_runtime.sql`
30. `0115_capability_profiles.sql`

No production migration was applied. This is a release-state fact, not a CI defect.

## 5. Safety defects fixed by R6-02

### 5.1 Remote migration dry-run was not strictly read-only

`d1-migrate-remote.mjs --dry-run` previously issued `CREATE TABLE IF NOT EXISTS d1_migrations` before the dry-run exit. That violated the expected no-mutation dry-run contract.

R6-02 now:

- checks `sqlite_schema` first;
- treats an absent tracking table as an empty applied set in dry-run mode;
- never creates bookkeeping during dry-run;
- permits tracking-table creation only on live apply;
- has regression tests for absent/existing tracking tables and live apply behavior.

### 5.2 Applied-state evidence lacked a canonical observer

R6-02 adds a read-only observer that records:

- provider-observed applied filenames;
- expected source filenames;
- exact current source SHA-256 per file;
- pending and unknown-applied sets;
- explicit checksum semantics;
- `cloudflare_mutated=false`.

### 5.3 PITR preflight was brittle to Wrangler JSON shape drift

The previous PITR planner failed when `wrangler d1 info --json` omitted the `version` field even though Time Travel was available.

R6-02 now:

- still rejects explicit legacy/alpha storage;
- treats an omitted version as requiring a direct capability probe;
- proves capability by resolving current and target bookmarks via read-only `wrangler d1 time-travel info`;
- keeps actual restore behind the existing destructive `--execute --confirm <tenant> --reason ... --backup-dir ...` guards.

## 6. Backup and replay evidence

Fresh pilot export produced during the final read-only evidence run:

- source DB: `cloudforge-alu`
- bytes: **10,555,806**
- SHA-256: `1f1529b842a31d5a7b6d7209c7e92a4482772d329c3528d1a38fbadccb9c1ae6`
- manifest: VERIFIED
- local replay duration: **14,305 ms**
- tables: **88**
- recorded migrations: **49**
- `quick_check`: `ok`
- foreign-key violations: **0**
- tenant scope violations: **0 / 0 / 0**
- Cloudflare mutation during verification: FALSE

The plaintext SQL export was deleted from the CI workspace after isolated verification. Only sanitized JSON evidence was retained as the GitHub Actions artifact.

## 7. PITR decision evidence

R6-E10 is PASS at read-only planning level:

- D1 storage version field: not reported by the observed Wrangler/API response
- direct Time Travel probe: SUPPORTED
- current bookmark: resolved
- target bookmark for a past timestamp: resolved
- restore executed: FALSE
- customer data mutated: FALSE

Worker rollback and D1 Time Travel remain separate recovery mechanisms: Worker rollback changes runtime deployment; D1 Time Travel changes database state and must not be implied by runtime rollback evidence.

## 8. Dependency Requests

### DR-R6-02-01 — Production migration authorization

**Needed to unblock:** R6-E06.  
**Request:** explicit authorization to apply the 30 pending migrations to `cloudforge-alu` using the canonical remote migration path after a fresh verified backup.  
**Why blocked:** this is a production database mutation.  
**Independent work completed:** inventory, source checksum binding, dry-run safety, backup/replay and PITR planning are already complete.

### DR-R6-02-02 — Disposable remote restore lifecycle

**Needed to unblock:** R6-E09.  
**Request:** authorize creation/use and cleanup of a new empty `cloudforge-drill-*` / `cloudforge-restore-*` D1 target, or provide an already-authorized empty disposable target.  
**Why blocked:** remote restore changes provider state; cleanup deletes the disposable resource.  
**Safety contract already present:** live target names are rejected and route bindings are not changed.

### DR-R6-02-03 — Alumdoor production-like opening dataset/provider

**Needed to unblock:** R6-E11.  
**Request:** identify/provide the authorized non-production pilot dataset and domain opening provider for Stock, AR/AP, cash/bank and GL/import totals.  
**Why blocked:** repository evidence currently reaches generic provider + fixture level only; fixture data cannot satisfy `PRODUCTION_LIKE_OBSERVED`.

### DR-R6-02-04 — Final candidate re-lock decision

**Needed before:** R6-05 final convergence.  
**Request to R6-00/R6-05:** determine whether the R6-02 safety-tooling fixes should be included in a refreshed final candidate lock. Migration SQL itself remains exactly unchanged from the R6-00 locked candidate.

## 9. Merge / deploy disposition

PR #643 is intentionally kept **draft**.

- Risk class: CRITICAL / non-UI
- Merge: **NOT PERFORMED**
- Deploy: **NOT PERFORMED**
- Production migration: **NOT PERFORMED**
- PITR/restore: **NOT PERFORMED**

R6-02 remains `BLOCKED` until the required mutation/data dependencies above are explicitly resolved and the affected evidence gates are rerun against the final locked candidate.
