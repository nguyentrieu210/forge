# R6-06 — Post-Certification Capability Reconciliation

Status: PLANNED  
Runs after: `R6-05` final certification  
Release authority: none — this lane does not change `PILOT-GO` / `PILOT-NO-GO`  
Capability denominator: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` (956 IDs)

## 1. Mission

R6-06 converts the final R6 evidence into an exact capability-maturity recount so the repository does not finish production certification with stale headline numbers.

R6-05 answers whether one exact candidate may enter controlled pilot.

R6-06 answers:

> After consuming all accepted R6 evidence, what are the exact `Hardened / RC / Wired / Foundation / Missing` counts across all 956 enterprise capabilities, and which IDs changed maturity?

This is an evidence-reconciliation lane, not an implementation lane and not a second release-certification verdict.

## 2. Inputs

R6-06 must read exact current `main` and use:

1. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
2. `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
3. the final `R6-05` certification record;
4. accepted R6-01 provider/release evidence;
5. accepted R6-02 data/migration/recovery evidence;
6. accepted R6-03 security/performance/recovery/observability evidence;
7. accepted R6-04 Golden Flow/correction/reconciliation evidence;
8. `docs/VALIDATION_GATES.md` and the existing capability maturity truth rules.

No stale pre-fix SHA evidence may be used to promote a capability whose semantics changed after that evidence was collected.

## 3. Truth rules

R6-06 must preserve the existing maturity meanings:

- `Missing`: no real path proven or no authoritative evidence found;
- `Foundation`: schema/API/metadata/provider seam exists but path/evidence is incomplete;
- `Wired`: meaningful path exists but release-grade evidence is incomplete;
- `RC`: declared scope has main path, invariants and focused regression evidence;
- `Hardened`: production-grade scope with failure/correction/security/reconciliation, UI/E2E where relevant, and exact release evidence for deployed claims.

### No automatic promotion from release verdict

`PILOT-GO` does **not** mean every pilot-used capability becomes `Hardened`.

A capability may be promoted only when the evidence bundle for that exact ID satisfies the target maturity definition. Capabilities outside the certified pilot scope remain unchanged unless R6 produced directly applicable evidence for them.

`PILOT-NO-GO` also does not invalidate valid lower-level evidence. R6-06 may still record justified `Foundation/Wired/RC` promotions, but it must not infer `Hardened` from a failed release certification.

### Demotions are allowed

If R6 proves that a previous maturity claim relied on stale SHA, shadow authority, unobserved provider state, missing correction/reconciliation, or another invalid assumption, R6-06 must demote that capability and record the reason.

## 4. Required procedure

1. Resolve exact current `main` SHA.
2. Resolve the exact `certifiedSha` or final blocked candidate from R6-05.
3. Run the existing capability-status completeness validator before edits:

```bash
node server/scripts/validate-enterprise-capability-status.mjs
```

4. Snapshot the pre-R6-06 maturity assignment for every one of the 956 IDs.
5. Build an R6 evidence-to-capability matrix. Every proposed maturity change must name:
   - capability ID;
   - old maturity;
   - new maturity;
   - exact evidence ID/file/run;
   - exact SHA/environment when relevant;
   - reason the target maturity definition is satisfied.
6. Reject bulk family promotion without per-ID evidence.
7. Update `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` only for justified changes.
8. Re-run the completeness validator.
9. Independently count all five maturity classes and verify the sum is exactly 956.
10. Publish the post-R6 report and delta ledger.

## 5. Mandatory outputs

Create a durable report named like:

`docs/agents/r6/R6_06_CAPABILITY_RECONCILIATION_YYYYMMDD.md`

It must contain:

### A. Exact identity

- current `main` SHA;
- R6 `certifiedSha` or blocked candidate SHA;
- final R6 verdict;
- capability-map denominator SHA/content identity if available;
- capability-status source SHA before reconciliation.

### B. Before/after headline counts

```text
POST-R6 CAPABILITY STATUS

              Before   After   Delta
Hardened           ?       ?      ?
RC                 ?       ?      ?
Wired              ?       ?      ?
Foundation         ?       ?      ?
Missing            ?       ?      ?
------------------------------------
Total            956     956      0
```

### C. Promotion/demotion ledger

For every changed ID:

| Capability | Before | After | Evidence | Reason |
|---|---|---|---|---|
| `Fxx-xxx` | RC | Hardened | exact R6 evidence | target maturity rule satisfied |

No changed ID may lack evidence.

### D. Domain summary

At minimum summarize changes by major family: Finance/VN, CRM/Sales, Procurement, Stock/WMS, Manufacturing, HCM, Service, App Factory, IAM/SRE, UI, Migration and Alumdoor.

### E. Unchanged Missing inventory

Report the final Missing count and list/range the remaining Missing IDs. Do not hide candidate vertical packs or long-tail enterprise capabilities from the denominator.

### F. Completeness proof

The report must include successful output equivalent to:

```text
Capability map: 956 unique IDs
Capability status: 956 unique IDs
Missing from status: 0
Unknown in status: 0
Duplicate status IDs: 0
Maturity: Hardened=? RC=? Wired=? Foundation=? Missing=?
Capability status completeness: 956/956
```

## 6. Guardrails

R6-06 must not:

- implement missing business features;
- edit production data;
- deploy/redeploy/rollback infrastructure;
- reinterpret `PILOT-GO` as proof of every capability;
- promote an ID merely because its app/package was installed;
- promote an ID merely because source code exists;
- reuse evidence from a stale SHA after a semantics-changing fix;
- reduce the denominator to make percentages look better;
- delete Missing IDs from the capability map;
- change R6-05's release verdict.

If a proposed promotion needs evidence that does not exist, leave the maturity unchanged and record the evidence gap as a next task.

## 7. Gate

R6-06 succeeds only when:

- exactly 956 capability IDs are represented once;
- the five maturity counts sum to 956;
- every maturity delta has exact evidence;
- every demotion has an explicit reason;
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` headline counts match its registry;
- the existing validator passes;
- the durable post-R6 report exists.

Final line:

`R6-06-CAPABILITY-RECONCILED`

or

`R6-06-BLOCKED: <exact evidence/accounting reason>`

## 8. Relationship to pilot

R6-06 is post-certification accounting. It does not delay an already valid `PILOT-GO` unless the reconciliation uncovers evidence fraud/staleness severe enough that R6-05 itself was based on invalid provenance; in that case the issue must be escalated back to release control rather than silently changing the verdict here.

The controlled pilot may later produce new sustained real-operation evidence. That evidence belongs to a later Pilot Exit capability reconciliation and may justify additional `Hardened` promotions.
