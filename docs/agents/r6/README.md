# R6 Production Certification

Status: ACTIVE PLAN  
Baseline: `main@7940331c589d4e5699cf00e2ec843c5a7b8c50ac`  
Upstream: R5 COMPLETE / GO by explicit browser-visual QA waiver  
Downstream: Alumdoor Controlled Pilot

R6 is the final certification program between R5 engineering convergence and the first controlled production pilot.

R6 does **not** reopen R5 as another implementation wave. It proves that one exact release candidate can be deployed, observed, recovered, reconciled and operated safely enough to enter the Alumdoor pilot.

## Read order

1. `R6_PRODUCTION_CERTIFICATION_PLAN.md` — scope, invariants, lanes and GO/NO-GO.
2. `OPEN_ORDER.md` — exact order for opening agents and dependency rules.
3. `AGENT_PROMPTS.md` — copy-paste prompts for R6 agents.
4. `EVIDENCE_MATRIX.md` — evidence IDs, producer, consumer and acceptance criteria.
5. `docs/ops/SRE_RUNBOOK.md` — canonical release/recovery operator intent.
6. `docs/ops/CLOUDFLARE_PRODUCTION_GOVERNANCE.md` — desired-vs-observed provider governance.
7. `docs/VALIDATION_GATES.md` — exact-SHA validation and production evidence rules.
8. `docs/ALUMDOOR-REFERENCE-VERTICAL-CONTRACT.md` — vertical authority boundary.

## Program shape

```text
R5 COMPLETE
   |
   v
R6-00 Release Lock + Evidence Contract
   |
   +----------------+----------------+----------------+
   |                |                |                |
   v                v                v                v
R6-01            R6-02            R6-03            R6-04
Provider/        Data Safety      Security/        Alumdoor
Release          Migration        Perf/Recovery    Golden Flow
   \                |                |                /
    \_______________|________________|_______________/
                    |
                    v
             R6-05 Final Certification
                    |
             PILOT-GO / PILOT-NO-GO
                    |
                    v
          Alumdoor Controlled Pilot
```

## Hard rule: exact release identity

Every R6 claim is bound to an immutable certification identity:

- source commit SHA;
- release/deployed SHA where applicable;
- UI bundle hash;
- package/app versions;
- capability profile ID + version/hash;
- migration inventory/checksum state;
- provider observation timestamp/environment identity.

If R6 requires a source fix, evidence tied to the old SHA is stale. The affected certification lanes must rerun against the new exact candidate.

## Explicit R5 waiver carry-forward

R5's browser/visual QA waiver remains historical fact and does not reopen R5.

R6 does not require subjective visual inspection or pixel QA. It may still require bounded functional browser evidence when that is the only way to prove an authenticated release path or the Alumdoor Golden Flow on the exact deployed candidate.

## Mutation boundary

This plan is not authorization to mutate production.

Read-only inventory, source verification, local/offline replay and non-production disposable drills may proceed when credentials/environment are available.

The following remain explicit authorization boundaries:

- production deploy or rollback;
- production migration;
- production restore/PITR;
- DNS/routes/secrets/provider mutation;
- customer production data writes/import/cutover;
- destructive queue replay or state rewind.

## Definition of done

R6 is complete only when `R6-05` publishes one exact final record with either:

- `PILOT-GO`, with all mandatory evidence satisfied; or
- `PILOT-NO-GO`, with explicit blockers and owners.

After convergence, temporary `OPEN_ORDER.md` and `AGENT_PROMPTS.md` may be removed from `main`; the final certification record and durable evidence contract must remain.