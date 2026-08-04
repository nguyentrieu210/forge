# NEXT TASKS

Ngày cập nhật: **2026-08-04**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Current state

- RC4: DONE.
- R5: **DONE / merged via PR #638**.
- R5 merge commit: `7940331c589d4e5699cf00e2ec843c5a7b8c50ac`.
- Active program: **R6 Production Certification**.
- Next milestone after R6: **Alumdoor Controlled Pilot**.

Do not reopen R5 merely because production evidence is missing; that evidence belongs to R6.

## 1. R6-00 — Release Lock + Evidence Contract

Open first and alone.

Required output:

- exact current `main`;
- initial R6 candidate SHA;
- package/app/profile identity;
- expected migration inventory/checksum digest;
- target environment identity without secrets;
- evidence index;
- read-only vs mutation-gated action matrix;
- dependency order;
- `R6-00-LOCKED`.

Canonical plan: `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`.

## 2. R6 worker wave — open after R6-00-LOCKED

Open in parallel:

### R6-01 Provider + Exact Release

- Cloudflare source governance;
- desired-vs-observed provider inventory;
- exact health/auth boundary;
- exact release SHA + bundle hash;
- observability evidence.

### R6-02 Data Safety + Migration + Cutover

- expected/applied migration inventory;
- fresh backup verification;
- isolated replay;
- disposable restore drill;
- PITR/rollback decision evidence;
- production-like cutover/opening reconciliation rehearsal.

### R6-03 Security + Performance + Recovery

- IAM/session/admin/tenant isolation;
- secret/config hygiene;
- queue retry/DLQ safety;
- truthful Worker/app recovery semantics;
- bounded representative p50/p95/p99/error/RPS;
- logs/traces/cost-pressure evidence.

### R6-04 Alumdoor Exact-Release Golden Flow

- exact Alumdoor package/profile identity;
- authenticated canonical Golden Flow;
- Stock/Payment/GL readback;
- duplicate/idempotent retry;
- fail-closed invalid/insufficient action;
- correction/settlement path;
- warranty linked to exact delivery source.

No subjective visual/pixel QA gate is required. Functional browser smoke is used only if necessary to prove an authenticated real user path.

## 3. R6-05 — Independent Final Certification

Open only after R6-01 through R6-04 have final evidence or explicit blocker disposition.

R6-05 must:

- independently resolve exact candidate identity;
- reject stale-SHA evidence;
- verify R6 evidence IDs `R6-E01..R6-E23`;
- verify no unauthorized production mutation;
- verify no unresolved P0/P1 in pilot scope;
- emit exact certified SHA and `PILOT-GO` or `PILOT-NO-GO`.

R6-05 is an auditor, not another implementation worker.

## 4. Source-fix rule during R6

If R6 finds a pilot-blocking source defect:

1. record failed invariant;
2. make smallest owner-correct fix;
3. merge through normal boundary;
4. issue new candidate SHA;
5. rerun every affected evidence lane;
6. never treat old-SHA evidence as proof of new candidate.

Do not create separate release candidates per R6 lane.

## 5. Explicit authorization boundaries

Opening R6 agents does **not** authorize:

- production deploy/redeploy/rollback;
- production migration;
- production restore/PITR;
- customer production data import/write/cutover;
- DNS/route/secret/provider mutation;
- destructive queue replay.

Agents should exhaust read-only/local/disposable work and record the exact remaining live operation instead of stopping the whole program early.

## 6. After PILOT-GO

Move to Alumdoor Controlled Pilot:

1. freeze Alumdoor Production Profile;
2. map/import real master + opening data under explicit authorization;
3. dry run representative transactions;
4. parallel run against current operational source;
5. daily Stock/AR/AP/payment/revenue/COGS/manufacturing/GL reconciliation;
6. cutover;
7. hypercare;
8. Pilot Exit Gate -> Accepted Production Reference -> GA.

## 7. Standing boundaries

- Global capability score is not a reason to reopen a blanket feature wave.
- Vertical apps consume shared authorities; no copied HRM/CRM/Finance/Stock implementation inside Alumdoor.
- Capability disable != package uninstall/data purge.
- Production/provider evidence must be observed directly; source presence is insufficient.
- Worker rollback != data rollback.
- R5 browser/visual QA waiver is not a reason to fabricate a browser PASS; it simply is not a release blocker.

## 8. Documentation discipline

Use `docs/README.md` as the documentation map and `docs/agents/r6/README.md` as the active R6 entrypoint. After R6 converges, remove temporary agent prompts/order from `main` and retain the final certification/evidence record.