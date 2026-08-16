# R6 Production Certification — historical record

Status: **CLOSED / HISTORICAL EVIDENCE**  
This directory is retained for R6 certification provenance. It is not an active agent program and must not be used to infer current `main`, current release target or current production state.

## Retained material

- `R6_PRODUCTION_CERTIFICATION_PLAN.md` — historical scope/invariants of the certification program.
- `EVIDENCE_MATRIX.md` — durable evidence contract from the program.
- `R6_CANDIDATE_MANIFEST.json` — historical candidate identity/materialization.
- Any final evidence/certification records retained elsewhere under the R6/convergence history.

Temporary execution artifacts such as `OPEN_ORDER.md`, `AGENT_PROMPTS.md` and superseded branch handoffs are intentionally removed after convergence. Git/PR history retains their provenance.

## Current-state rule

Before doing release/pilot work:

1. resolve exact current GitHub `main`;
2. read root `CURRENT_STATUS.md` and `NEXT_TASKS.md`;
3. use current release/runbook/governance docs;
4. bind every production claim/action to the exact current candidate and evidence.

Historical R6 evidence can inform a new release, but evidence from an old SHA is not automatically valid for a newer source tree.

## Production mutation boundary

Nothing in this historical directory authorizes production deploy/rollback, production migration, restore/PITR, DNS/routes/secrets/provider mutation, customer-data writes/import/cutover or destructive queue/state operations.
