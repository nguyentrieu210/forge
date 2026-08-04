# CURRENT STATUS

Ngày cập nhật: **2026-08-04**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này chỉ giữ **live verified state**, không giữ lịch sử dài.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- RC4 integrated closure: DONE.
- R5 integrated hardening/productization: **DONE / R5-GO**.
- R5 merge commit: `main@7940331c589d4e5699cf00e2ec843c5a7b8c50ac` via PR `#638`.
- R5 final verdict used an explicit project-owner waiver for the remaining browser/visual QA gate; non-visual engineering/package/runtime/domain/migration/reconciliation gates were green before merge.
- No production deploy, production migration, DNS/secret/provider mutation or customer-data cutover is implied by R5 closure.

## 2. Capability truth

Canonical denominator remains exactly **956 capabilities** unless a later convergence record explicitly materializes a new maturity distribution.

Latest accepted materialized distribution remains:

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 66 |
| Wired | 406 |
| Foundation | 327 |
| Missing | 157 |
| **Total** | **956** |

R5 focused on integration/productization and did not justify reopening a blanket capability-promotion wave.

## 3. R5 closure state

R5 converged the implementation needed before production certification, including:

- package dependency/version hardening;
- canonical capability-profile persistence and activation semantics;
- System Manager/session/CSRF guarded capability profile snapshot/preview/apply;
- hosted capability-profile authoring surface;
- capability-aware hook fanout and retry suppression;
- canonical Workplace scheduled notification wiring;
- Finance/HCM reconciliation;
- commercial/supply-chain quantity authority cleanup;
- Manufacturing/QMS/Service integrated regression;
- package lifecycle, migration governance, cross-ledger and runtime build evidence.

The historical R5 browser/visual QA waiver does not reopen R5. R6 may still use bounded functional browser evidence when required to prove an authenticated exact-release path or Alumdoor Golden Flow.

## 4. Current production/provider truth

Forge is **not yet production-certified for the new R5 candidate**.

Still to prove in R6:

- exact candidate/release/package/profile identity lock;
- Cloudflare desired-vs-observed state for pilot-used resources;
- exact deployed release marker and bundle hash;
- applied migration inventory on the target context;
- backup replay + disposable restore/cutover rehearsal;
- truthful PITR/rollback/recovery boundaries;
- representative bounded performance/observability evidence;
- auth/tenant/security acceptance on the candidate;
- authenticated exact-release Alumdoor Golden Flow with correction/readback evidence.

Historical ALU production releases are operational history, not proof that `7940331c...` or any future R6 candidate is deployed.

## 5. Current architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Tenant/query store: D1 under repository migration governance.
- Money authority: canonical GL + Payment Ledger contracts; no shadow finance ledger.
- Stock authority: canonical Stock Ledger/valuation contracts; no vertical stock ledger fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory install/upgrade contracts.
- Capability activation: versioned server-authoritative profile; disable != uninstall/data purge.
- Frontend: shared metadata-driven MetaForge runtime; verticals do not fork shared runtime.
- Alumdoor: reference vertical consuming generic Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.

## 6. Active program

The active program is now:

`R5 COMPLETE -> R6 production certification -> Alumdoor controlled pilot -> GA`

Canonical R6 planning on the active planning branch:

- `docs/agents/r6/README.md`
- `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`
- `docs/agents/r6/OPEN_ORDER.md`
- `docs/agents/r6/AGENT_PROMPTS.md`
- `docs/agents/r6/EVIDENCE_MATRIX.md`

R6 starts from R5 merge commit `7940331c...`, but R6-00 must resolve exact current `main` before locking the certification candidate.

## 7. Standing boundaries

- Do not implement all 157 Missing capabilities to raise a score; only pilot-critical/shared-safety gaps can become bounded R6 fixes.
- Source/config presence does not equal observed provider state.
- Exact release evidence is invalid after a source-changing fix unless affected lanes rerun on the new SHA.
- Production deploy/migration/restore/PITR, DNS/route/secret/provider mutation and customer-data write/cutover remain explicit authorization boundaries.
- Worker rollback does not imply D1/KV/R2/external-state rollback.
- R5's subjective browser/visual QA waiver stands; R6 does not re-open visual polish as a release program.

## 8. Documentation authority

Start at `docs/README.md`, then `docs/agents/r6/README.md` for the active certification program. Old agent boards/prompts/handoffs from closed programs are provenance, not live authority.