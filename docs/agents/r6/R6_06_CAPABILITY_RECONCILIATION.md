# R6-06 — Source/Live Capability Reconciliation

Status: ACTIVE CONTRACT  
Authority model: source/live-first  
Release authority: none  
Capability denominator: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` (956 IDs)

## 1. Mission

R6-06 answers one question from current observable truth:

> What capability maturity can Forge prove now, from the exact source, current CI and directly observed runtime/provider/data state?

R6-06 is an evidence accountant. It is not an implementation lane and is not a release deployer.

## 2. Authority order

Use evidence in this order:

1. exact current repository/candidate SHA and current source tree;
2. current GitHub Actions runs, job steps and raw logs on that source;
3. direct read-only production release markers and provider observations;
4. direct installed-package and active capability-profile observations;
5. direct migration, backup/restore, reconciliation and Golden Flow artifacts from the relevant exact run;
6. `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` only as the previous 956-ID registry baseline.

`R6-00` through `R6-05` reports are historical context only. They are **not authority for current state**, must not be required inputs, and must never override newer source/CI/live evidence.

If prose conflicts with a current job log, provider observation, release marker or exact source, the direct observation wins.

## 3. Maturity truth rules

- `Missing`: no real path proven or no authoritative current evidence found.
- `Foundation`: schema/API/metadata/provider seam exists but path/evidence is incomplete.
- `Wired`: meaningful path exists but release-grade evidence is incomplete.
- `RC`: current source has the declared main path, invariants and focused executable regression evidence.
- `Hardened`: production-grade scope with failure/correction/security/reconciliation, UI/E2E where relevant, **and exact deployed-release evidence** for deployed claims.

### Exact-live rule

A current-source capability cannot be promoted to `Hardened` when production is running a different source SHA.

A failed deployment does not erase valid source-side RC evidence, but it also cannot manufacture production-grade evidence.

### Per-ID rule

No bulk promotion by app, domain, package, workflow name or overall CI green status. Every changed capability ID needs direct evidence that satisfies its target maturity definition.

## 4. Required procedure

1. Resolve current repository `main` and the exact runtime candidate being assessed.
2. Read the latest relevant CI runs and raw job logs; do not summarize from old R6 reports.
3. Observe the pilot/production target directly and record:
   - deployed release SHA/bundle identity;
   - provider bindings and observability;
   - installed app versions/content hashes;
   - active capability profile identity when observable;
   - migration/data/reconciliation state only when directly observed.
4. Run `node server/scripts/validate-enterprise-capability-status.mjs` to prove the existing registry denominator is 956 before any status edit.
5. Treat the current status file as the **baseline registry**, not as a new post-R6 result.
6. Build an evidence-to-capability matrix from current source/CI/live evidence.
7. For every proposed change record capability ID, before/after maturity, exact run/SHA/environment and why the target rule is satisfied.
8. Update `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` only for justified per-ID changes.
9. Re-run the validator and prove 956/956, zero missing/unknown/duplicate IDs.
10. Publish a durable actual-state report.

## 5. Mandatory actual-state output

The report must separate observed runtime truth from registry accounting.

### A. Observed state

At minimum:

```text
Source/build gates       PASS | FAIL | UNKNOWN
Provider/bindings        PASS | FAIL | UNKNOWN
Exact production SHA     PASS | FAIL | UNKNOWN
Package identity         PASS | FAIL | UNKNOWN
Active profile identity  PASS | FAIL | UNKNOWN
Migration/data state     PASS | FAIL | UNKNOWN | NOT_RUN
Golden/reconciliation    PASS | FAIL | UNKNOWN | NOT_RUN
```

### B. Capability accounting

If a full per-ID recount is proven, publish exact before/after/delta counts for all five maturity classes.

If it is not proven, say **NOT RECONCILED**. Do not copy old headline numbers and present them as a new result.

The previous registry counts may be shown only under a label such as `baseline registry (not post-R6 recount)`.

### C. Promotion/demotion ledger

Every changed ID must have exact evidence. No evidence means no change.

### D. Completeness proof

Any status mutation must end with validator output equivalent to:

```text
Capability map: 956 unique IDs
Capability status: 956 unique IDs
Missing from status: 0
Unknown in status: 0
Duplicate status IDs: 0
Capability status completeness: 956/956
```

## 6. Guardrails

R6-06 must not:

- use R6-00..R6-05 prose as current-state authority;
- infer a live state from a planned/old evidence matrix;
- implement missing business features;
- deploy, migrate or mutate provider/customer state;
- promote an ID merely because source exists or a package is installed;
- promote `Hardened` while exact current-source deployment is unproven;
- reduce the 956 denominator;
- invent a five-way recount when per-ID evidence has not been reconciled.

## 7. Gate

`R6-06-CAPABILITY-RECONCILED` is allowed only when the current evidence set supports an exact per-ID accounting and the validator proves 956/956.

Otherwise finish with:

`R6-06-BLOCKED: <current direct evidence reason>`

Historical reports may explain how Forge got here, but they do not decide this gate.
