# R6 Agent Open Order

Baseline: `main@7940331c589d4e5699cf00e2ec843c5a7b8c50ac`

This file exists so R6 agents are opened in dependency order instead of creating multiple incompatible production candidates.

## 1. Open exactly this first

### R6-00 — Release Lock + Evidence Contract

Suggested branch:

`agent/r6-00-release-lock`

R6-00 must publish:

- exact current `main` SHA;
- initial R6 candidate SHA;
- package/app/capability-profile identity;
- expected migration inventory digest;
- provider/release target identity without secrets;
- evidence index;
- read-only vs mutation-gated action list;
- dependency order;
- `R6-00-LOCKED` verdict.

Do **not** allow worker lanes to certify different candidate SHAs.

## 2. After R6-00-LOCKED, open these four in parallel

### R6-01 — Provider + Exact Release Evidence

Branch:

`agent/r6-01-provider-release`

May proceed immediately with source governance and read-only inventory.

Final PASS may depend on an authorized exact-candidate deployment.

### R6-02 — Data Safety + Migration + Cutover Rehearsal

Branch:

`agent/r6-02-data-migration-recovery`

May proceed with local/isolated replay and disposable restore.

Production migration/PITR/customer-data actions are not implied by opening the agent.

### R6-03 — Security + Performance + Recovery

Branch:

`agent/r6-03-security-performance-recovery`

May run local/read-only/approved bounded remote checks.

Must not generate load outside repository safety caps.

### R6-04 — Alumdoor Golden Flow

Branch:

`agent/r6-04-alumdoor-golden-flow`

May prepare package/profile/fixture and staging evidence immediately.

Final exact-release PASS waits for the common certification candidate/environment from R6-00/R6-01.

## 3. Do not open R6-05 yet

R6-05 is the independent certifier. Opening it too early encourages it to become another implementation worker.

Open only when R6-01 through R6-04 have one of:

- PASS on the same candidate; or
- explicit BLOCKED record with a dependency/authorization requirement.

## 4. Final lane

### R6-05 — Independent Final Certification

Branch:

`agent/r6-05-final-certification`

Inputs:

- R6-00 candidate manifest;
- R6-01 provider/release evidence;
- R6-02 data/migration/recovery evidence;
- R6-03 security/performance/recovery evidence;
- R6-04 Alumdoor Golden Flow evidence.

Output:

- exact certified SHA;
- evidence index;
- blocker list;
- `PILOT-GO` or `PILOT-NO-GO`.

R6-05 must not fix business code. A code defect returns to the owning lane, creates a new candidate SHA, and causes affected certification evidence to rerun.

## 5. Merge order

Preferred merge sequence for any R6 source fixes:

```text
R6-00 governance/docs if needed
 -> bounded owner-correct worker fixes
 -> re-lock candidate
 -> rerun affected worker evidence
 -> R6-05 final evidence/convergence docs
```

Do not merge lane evidence that claims a stale exact SHA as current after a source-changing lane has merged.

## 6. Authorization checkpoints

Agents stop and request explicit authorization before any of these:

- production deploy/redeploy/rollback;
- production migration;
- production restore/PITR;
- customer production data import/write/cutover;
- DNS/route/secret/provider mutation;
- destructive queue replay.

An agent should continue all independent read-only/local/disposable work instead of blocking the entire lane on a future authorization.

## 7. Recommended human opening sequence

```text
1. Open R6-00 only.
2. Wait for R6-00-LOCKED.
3. Open R6-01, R6-02, R6-03, R6-04 together.
4. Let each lane exhaust read-only/local/disposable work.
5. Authorize only the specific live operations required for remaining evidence.
6. Re-lock if any source fix changes the candidate SHA.
7. Open R6-05 only after four worker lanes are final.
8. Accept PILOT-GO or resolve blockers and rerun affected lanes.
```

## 8. Stop conditions

An agent may stop early only for:

- an explicit production mutation authorization boundary;
- an irreducible business/pilot scope decision;
- a shared-contract dependency that cannot be safely separated;
- discovery that the candidate SHA changed and its evidence is stale.

Ordinary technical choices should be resolved from repo authority, runbooks, tests and exact evidence without asking the user.