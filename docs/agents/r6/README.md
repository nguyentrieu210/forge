# R6 Production Certification

Status: **CLOSED / PILOT-GO**  
Initial baseline: `main@7940331c589d4e5699cf00e2ec843c5a7b8c50ac`  
Certified/deployed source: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Final certification run: `30952703083`  
Downstream: **Alumdoor Controlled Pilot**

R6 was the final certification program between R5 engineering convergence and the first controlled production pilot. It is complete.

## Final authority

Read in this order when auditing R6 closure:

1. `R6_FINAL_CERTIFICATION_20260805.md` — human-readable final certification record.
2. `../../../deploy-evidence/r6-final-production-certification-49315112a211.json` — machine final evidence and exact identities.
3. `../../../deploy-evidence/r6-authorized-orchestrator-49315112a211.json` — authorized canonical deploy/certification run linkage.
4. `R6_PRODUCTION_CERTIFICATION_PLAN.md` — original mission, invariants and acceptance model.
5. `EVIDENCE_MATRIX.md` — durable R6-E01..R6-E23 evidence contract.
6. `../../ops/SRE_RUNBOOK.md` — canonical release/recovery operator intent.
7. `../../ops/CLOUDFLARE_PRODUCTION_GOVERNANCE.md` — provider governance.
8. `../../VALIDATION_GATES.md` — exact-SHA validation rules.

Temporary coordination files `OPEN_ORDER.md` and `AGENT_PROMPTS.md` are intentionally removed after convergence. Git history retains them.

## Certified identity

- source/release SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- bundle hash: `838218167db020d8`;
- Alumdoor: `2.2.3`;
- HRM: `1.8.0`;
- VN Accounting: `1.6.1`;
- capability profile: `alumdoor-pilot@1`;
- profile valid: `true`;
- blocked capabilities: none;
- migration state: `80/80`, zero pending/unknown.

## Final outcome

`R6-E01..R6-E23`: **23/23 PASS**.

The final run proved, on the exact candidate and required evidence levels:

- source/release governance and desired-vs-observed provider state;
- exact deployed release marker and bundle hash;
- fresh verified backup, isolated replay and disposable remote restore;
- source/restored reconciliation;
- migration convergence and read-only PITR planning capability;
- auth/session/CSRF/tenant isolation;
- queue/recovery/observability controls;
- bounded live pressure with zero errors;
- exact package/profile identity;
- authenticated Alumdoor Golden Flow;
- canonical Stock/Payment/GL readback;
- duplicate/idempotent and fail-closed behavior;
- correction/settlement paths;
- warranty/service lineage.

Final verdict:

`PILOT-GO`

## What PILOT-GO means

R6 certifies that the exact candidate is safe enough to enter **Alumdoor Controlled Pilot** under the repository's governed boundaries.

It does not claim:

- customer/master/opening-data import is complete;
- parallel run is complete;
- business cutover is accepted;
- hypercare is complete;
- GA is achieved.

Those are downstream pilot gates tracked in `../../../NEXT_TASKS.md`.

## Exact-release rule remains active

R6 closure does not weaken exact-SHA governance. Any future product-source change creates a new release identity. A changed release cannot inherit `49315112...` deployment/certification evidence without rerunning affected release evidence.

## Mutation boundary after closure

The explicit R6 release/certification authorization has been consumed. Controlled-pilot production data import/write, cutover, production restore/PITR, DNS/routes/secrets/provider mutation and destructive state operations remain explicit authorization boundaries.