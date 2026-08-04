# R5-08 — Final Convergence

Date: 2026-08-04  
Branch: `agent/r5-08-final-convergence`  
Seed: exact current `main` at branch creation (`8316d2a5f24863d3347cf9f92ec5987145b8dc9e`)  
Role: final R5 evidence/convergence only; no domain implementation

## Final verdict

# R5-NO-GO

R5 cannot issue `R5-GO` because the required integrated release candidate has not been materialized and independently replayed.

This verdict is fail-closed. It does not invalidate green worker evidence; it rejects using branch-local evidence as proof of one integrated R5 candidate.

## Gate results

| Gate | Required | Exact observed state | Verdict |
|---|---|---|---|
| R5-00 integration control | explicit immutable integrated candidate SHA | PR #629 remains `GO_WAVE_1`; no integrated R5 candidate SHA published | BLOCK |
| R5-01 package/profile | stable canonical package/profile contract in candidate | PR #634 is open/draft; validated worker/merge candidate exists but is not integrated | BLOCK |
| R5-02 Finance/HCM | accepted candidate disposition | PR #632 is open/draft; worker validation green but not integrated | BLOCK |
| R5-03 Commercial/Supply Chain | accepted candidate disposition | PR #636 is open/draft; worker validation green but not integrated | BLOCK |
| R5-04 Manufacturing/Service | accepted candidate disposition | PR #628 is open/draft; worker validation green but not integrated | BLOCK |
| R5-05 Integration/BI/Workplace/Logistics | resolved or explicitly accepted bounded disposition | PR #630 remains BLOCKED on shared scheduler/capability-state integration | BLOCK |
| R5-06 package/migration rehearsal | candidate-bound fresh install/upgrade/reinstall/profile lifecycle rehearsal | PR #635 rehearsal is not bound to an integrated R5 SHA | BLOCK |
| R5-07 independent QA | integrated replay on the same immutable candidate SHA | PR #637 has setup gate success only; manifest keeps `candidate_sha: null` and `BLOCKED_PRECONDITION` | BLOCK |
| 956 capability arithmetic | exactly one entry per capability and valid maturity arithmetic | current main remains H=0 / RC=66 / Wired=406 / Foundation=327 / Missing=157 = 956 | PASS baseline only |
| authority collision | no unresolved duplicate authority in candidate | no candidate exists; scheduler/profile integration still unresolved | BLOCK |
| production/provider proof | not required for R5 source convergence; belongs to R6 | explicitly unverified | NOT AN R5 BLOCKER by itself |

## Evidence provenance

### R5-00

PR #629 correctly establishes that RC4 is already integrated and that R5 must not replay stale RC4 worker branches. Its current published result is `GO_WAVE_1`; it does not publish the later immutable composed R5 candidate required by R5-06/R5-07.

### R5-01

PR #634 reports green exact merge-candidate validation for package/capability profile work, including non-destructive capability disable/re-enable and migration `0115_capability_profiles.sql`. However:

- the PR is still unmerged;
- R5-06 separately identified package-version semantics and package lifecycle regression dependencies;
- R5-01 also records shared host/API and R5-05 effective-capability-state dependencies.

Therefore R5-08 treats R5-01 as strong worker evidence, not integrated release evidence.

### R5-02 / R5-03 / R5-04

These lanes report successful focused validations on their own exact heads. They remain separate candidate deltas. R5-08 does not infer that independently green Finance, Supply Chain and Manufacturing heads are mutually compatible until one combined SHA is created and replayed.

### R5-05

R5-05 remains explicitly BLOCKED because the canonical tenant maintenance scheduler does not yet register Workplace scheduled notifications and because capability-profile consumption must use the canonical R5-01 effective state rather than create a second authority.

R5-08 does not fix these shared hotspots.

### R5-06

R5-06 successfully created reusable rehearsal machinery and reported substantial green evidence on current-main fixtures, but its own record says full Wave-2 rehearsal requires the exact integrated candidate SHA. Candidate-bound profile activate/deactivate/reactivate evidence is therefore absent.

### R5-07

R5-07 setup workflow run `30890438588` completed successfully on head `555dc3bc2e01572d538c7b1841b90f16877e82e8`. That workflow intentionally proves only the QA setup/fail-closed precondition. Its manifest has no candidate SHA, so this is not an integrated QA PASS.

## Capability truth

R5-08 does **not** rewrite capability maturity from worker PR claims. Current canonical main remains exactly:

- Hardened: **0**
- RC: **66**
- Wired: **406**
- Foundation: **327**
- Missing: **157**
- Total: **956**

No R5 worker-only capability promotion is materialized before integrated candidate evidence.

## Alumdoor Pilot Capability Set

Machine-readable record: `docs/agents/r5/R5_ALUMDOOR_PILOT_CAPABILITY_SET.json`.

The set cannot be finalized/frozen because the R5-01 canonical capability profile is not integrated and no candidate-bound profile resolution has been rehearsed. R5-08 therefore records:

- direct vertical evidence IDs currently proven in canonical history: `VP01-007`, `VP01-008`;
- exact-release evidence dependency: `O01-002`;
- required shared authority families for pilot composition: IAM, App Registry/Profile, CRM/Sales/O2C, Procurement/P2P, Inventory/valuation, Manufacturing/QMS, Finance/AR/AP/Cash-Bank, Warranty/Service, migration/reconciliation, responsive PWA;
- all final package/capability IDs remain `UNLOCKED` until generated by the integrated capability-profile resolver on the immutable R5 candidate.

This avoids inventing a hand-authored capability profile that would compete with R5-01 server authority.

## Pilot-scope blockers

### P0 — R5-CANDIDATE-001

**Owner:** R5-00 / integration coordinator  
**Problem:** no immutable integrated R5 candidate SHA.  
**Acceptance:** publish one SHA with exact accepted source heads, reconciliation order, migration collision result and authority-overlap disposition.

### P0 — R5-REHEARSAL-001

**Owner:** R5-06  
**Problem:** package/migration/profile lifecycle rehearsal is not run on the immutable integrated candidate.  
**Acceptance:** fresh tenant -> package install -> idempotent reinstall -> upgrade -> capability deactivate/reactivate -> data preservation -> migration/checksum -> opening/reconciliation -> failure/recovery -> tenant isolation on the same candidate SHA.

### P0 — R5-QA-001

**Owner:** R5-07  
**Problem:** independent integrated QA has not replayed the candidate.  
**Acceptance:** one candidate SHA passes the R5-07 matrix without treating skipped tests, worker self-verdicts, source presence or historical production proof as PASS.

### P0 — R5-PROFILE-001

**Owner:** R5-01 + shared host integration  
**Problem:** canonical package/capability profile authority is not part of an integrated candidate; browser/API host and downstream consumer integration are not candidate-proven.  
**Acceptance:** server-authoritative profile current/preview/apply surface + installed package/profile lifecycle + representative Alumdoor composition proven on candidate.

### P1 — R5-INTEGRATION-001

**Owner:** R5-05/shared scheduler owner  
**Problem:** Workplace scheduled notifications are not registered in canonical maintenance execution and downstream hook/job/provider dispatch still needs canonical effective-capability-state consumption.  
**Acceptance:** one scheduler authority; capability-gated execution uses R5-01 effective state; no raw-manifest shadow activation authority.

### P1 conditional — R5-LANDED-COST-001

**Owner:** R5-02 + R5-03/shared Stock/Kernel  
**Problem:** receipt-targeted landed-cost valuation identity and historical Stock/COGS -> GL propagation remain unresolved.  
**Block scope:** becomes P0 only if the frozen Alumdoor Pilot Capability Set includes landed-cost accounting in initial pilot scope.

### Bounded/non-R5 blocker — Vietnam statutory numeric rules

BHXH/BHYT/BHTN automation remains fail-closed where clause-level official source evidence is incomplete. This does not block an Alumdoor pilot that excludes those automated statutory calculations; it blocks any claim that includes them.

## Anti-circularity rules

R5-08 rejects:

- using this convergence PR as evidence that R5 itself passed;
- using a GitHub virtual merge SHA for an individual worker as the composed R5 release candidate;
- treating R5-07 setup success as integrated QA success;
- treating current main RC4 evidence as proof of unmerged R5 deltas;
- treating historical production Alumdoor evidence as exact-current R5 deployment proof;
- hand-authoring a capability profile outside the R5-01 canonical resolver.

## Minimum path to R5-GO

1. Resolve/accept final dispositions for R5-01..05 shared dependencies.
2. Build one explicit immutable integrated candidate SHA without stale RC4 replay.
3. Run R5-06 full candidate-bound package/migration/profile rehearsal.
4. Run R5-07 independent integrated QA on that exact same SHA.
5. Re-run R5-08 from the candidate that passed R5-07.
6. Validate exactly 956 capability IDs on that candidate.
7. Materialize the exact resolved Alumdoor Pilot Capability Set from canonical package/profile metadata.
8. If all pilot P0/P1 release blockers are closed or explicitly out-of-scope with evidence, issue `R5-GO`; otherwise issue a new `R5-NO-GO`.

## R6 boundary

R6 **must not start as certification** from this R5-08 result because there is no `R5-GO` candidate to lock.

Provider/live observation, backup/restore/PITR, production-like cutover rehearsal, exact deployed SHA/hash and authenticated Alumdoor Golden Flow remain R6 work after R5-GO.

## Safety / merge boundary

R5-08 changes convergence/evidence files and a validation workflow only. No business runtime, schema, migration, provider resource, DNS/secret, production deployment or customer-data mutation is performed.

This is non-UI governance/evidence. Keep the PR Draft and **do not merge/deploy without explicit user authorization**.