# E2E Evidence Contract

Date: 2026-08-06  
Program: PILOT-UX-E2E

## 1. Principle

Operator E2E evidence must be bound to the exact candidate and environment observed. Evidence for an older source/deployed/package identity remains historical and cannot silently certify a newer candidate.

This follows the same provenance discipline as the R6 Evidence Matrix while adding browser/operator-specific evidence.

## 2. Required identity fields

Every run records, when applicable:

- `evidenceId`;
- flow ID;
- source SHA;
- deployed/release SHA;
- UI bundle hash;
- app/package/profile ID and version/digest;
- environment class;
- non-secret target/tenant identity;
- browser/project/device profile;
- persona/role profile;
- execution timestamp;
- test/harness path and revision;
- fixture/preflight version or hash;
- mutation classification;
- result and failed/last-completed step.

Unknown identity fields that are material to the claim must cause `BLOCKED` or `RELEASE_DRIFT`, not be invented.

## 3. Evidence result vocabulary

Per flow run:

- `PASS`
- `PARTIAL`
- `FAIL`
- `BLOCKED`

For evidence freshness:

- `CURRENT`
- `HISTORICAL`
- `STALE_IDENTITY`

## 4. Evidence manifest

Recommended minimum shape:

```json
{
  "evidenceId": "UX-E2E-01-20260806T000000Z",
  "flow": "E2E-01",
  "result": "FAIL",
  "freshness": "CURRENT",
  "sourceSha": "<sha>",
  "deployedSha": "<sha>",
  "bundleHash": "<hash>",
  "package": {"id":"alumdoor","version":"<version>","digest":"<digest-if-available>"},
  "environment": "E1_DISPOSABLE",
  "target": "<non-secret-target-alias>",
  "browser": "chromium",
  "persona": "sales-user",
  "readiness": "READY",
  "startedAt": "<iso-time>",
  "completedAt": "<iso-time>",
  "lastCompletedStep": 7,
  "failedStep": 8,
  "primaryFailureClass": "BACKEND",
  "severity": "P1",
  "documentRefs": [],
  "unexpectedHttpErrors": [],
  "pageErrors": [],
  "consoleErrors": [],
  "uiErrors": [],
  "artifacts": {
    "trace": "<artifact-ref>",
    "screenshots": [],
    "video": null
  },
  "mutationClass": "DISPOSABLE_ONLY"
}
```

## 5. Mutation classification

Use:

- `NONE`
- `DISPOSABLE_ONLY`
- `AUTHORIZED_NON_PROD`
- `AUTHORIZED_PILOT_WRITE`

The last value requires an explicit authorization reference. No E2E document or test grants that authorization.

## 6. Minimum evidence by result

### PASS

- identity fields;
- preflight result;
- step/checkpoint results;
- authoritative readback assertions;
- network/browser error summary proving no unexpected errors;
- screenshot at final state;
- trace retained according to CI policy;
- document references safe enough for audit.

### FAIL

All PASS metadata plus:

- failed step;
- screenshot at failure;
- trace;
- network/browser/UI diagnostic summaries;
- failure class and severity.

### BLOCKED

- exact blocker;
- preflight requirement that failed;
- reason it is external/test-data/environment rather than application failure;
- no false application PASS.

## 7. Artifact retention

CI artifacts should contain machine-readable manifests plus Playwright diagnostics. Git should contain durable specs, status summaries and artifact references rather than large binary traces/screenshots unless an existing evidence practice requires otherwise.

Never commit:

- passwords;
- access tokens/session cookies;
- API secrets;
- full sensitive customer data;
- raw production payload dumps merely for convenience.

## 8. Evidence invalidation

Rerun affected operator flows when changes affect:

- UI composition/control behavior used by the flow;
- metadata declaration or contract used by the flow;
- runtime renderer used by the flow;
- API/action binding;
- business validation/calculation;
- permission/session/context;
- schema/migration touched by the flow;
- package/profile identity;
- deployed UI artifact.

A docs-only change with no operational contract change does not invalidate browser evidence.

## 9. Historical evidence

Historical scripts and screenshots can help diagnose regressions but must be labelled historical when their identity differs. The current status file reports only evidence that is current for the candidate/environment being evaluated.

## 10. Reproducibility

A reviewer must be able to determine from an evidence record:

1. what exact software/package was tested;
2. where it was tested;
3. under what persona and readiness state;
4. which job steps ran;
5. what authoritative outcome was observed;
6. why the result was PASS/FAIL/BLOCKED;
7. where the diagnostic artifacts are stored.
