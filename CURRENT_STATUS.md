# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này chỉ giữ **live verified state**, không giữ lịch sử dài.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- RC4 integrated closure: **DONE**.
- R5 integrated hardening/productization: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact R6 certified/deployed source SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full production deploy run: `30952411424` — **SUCCESS**.
- Final post-release certification run: `30952703083` — **SUCCESS**.
- Final machine evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json`.
- Authorization/orchestration evidence: `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`.

Evidence/docs commits after the certified SHA may advance `main`; they do not change the exact deployed product identity. Any later product-source change requires new exact-release evidence before it can be claimed as deployed/certified.

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

R6 did not reopen a blanket capability-promotion wave. Pilot-critical acceptance was proven by exact package/profile/runtime/domain evidence instead.

## 3. R6 final certification truth

The exact candidate `49315112a21182d2ce077b08a1fb9e26db07fd36` is certified **PILOT-GO** for the ALU Alumdoor controlled pilot.

Verified final identity:

- release SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- UI bundle hash: `838218167db020d8`;
- Alumdoor: `2.2.3`;
- HRM: `1.8.0`;
- VN Accounting: `1.6.1`;
- active capability profile: `alumdoor-pilot@1`;
- profile valid: `true`;
- blocked capabilities: none.

Final evidence state:

- R6 evidence matrix: **23/23 PASS** (`R6-E01..R6-E23`);
- migration inventory: **80 expected / 80 applied / 0 pending / 0 unknown**;
- fresh production backup manifest/replay: PASS;
- disposable remote D1 restore: PASS;
- source/restored reconciliation: PASS;
- PITR capability/read-only bookmark plan: PASS;
- auth/session/CSRF/tenant-isolation evidence: PASS;
- provider/bindings/observability evidence: PASS;
- exact release health and guest boundary: PASS;
- authenticated Golden Flow + Stock/Finance readback + correction/idempotency/warranty lineage: PASS;
- bounded live pressure: 50 requests, concurrency 5, 0 errors, p50 21.84 ms, p95 78.08 ms, p99 97.82 ms, 141.85 RPS.

No unresolved R6 blocker remains in controlled-pilot scope.

## 4. Current production/pilot truth

`https://alu.kairo.vn` has been observed serving the exact certified R6 release SHA and bundle hash.

This means Forge is **production-certified for entry into the controlled Alumdoor pilot**. It does **not** mean:

- customer opening/master data has been imported;
- parallel run has completed;
- business cutover has been accepted;
- hypercare has completed;
- GA has been declared.

Those are Controlled Pilot gates, not R6 gates.

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

The active sequence is now:

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Alumdoor Controlled Pilot -> Pilot Exit Gate -> Accepted Production Reference -> GA`

The active queue is `NEXT_TASKS.md`.

R6 durable evidence remains under:

- `docs/agents/r6/README.md`;
- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`;
- `docs/agents/r6/R6_PRODUCTION_CERTIFICATION_PLAN.md`;
- `docs/agents/r6/EVIDENCE_MATRIX.md`;
- `deploy-evidence/r6-final-production-certification-49315112a211.json`.

## 7. Standing boundaries

- R6 `PILOT-GO` authorizes entry into controlled pilot; it is not GA.
- Real customer/master/opening-data import or mutation remains an explicit authorization boundary.
- Production restore/PITR, DNS/route/secret/provider mutation and destructive queue/state operations remain explicit authorization boundaries.
- Pilot cutover requires reconciliation and an explicit cutover decision; it is not implied by technical certification.
- Worker rollback does not imply D1/KV/R2/external-state rollback.
- Source/config presence does not equal observed provider state.
- A future source-changing fix invalidates exact-SHA deployment claims until affected release evidence reruns.

## 8. Documentation authority

Start at `docs/README.md`, then `NEXT_TASKS.md` for the controlled-pilot queue. R6 coordination prompts/order are removed after closure; Git history retains their provenance.