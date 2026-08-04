# RC4-A20 — Capability Convergence

Status: **BOOTSTRAPPED**  
Branch: `agent/rc4-20-capability-convergence`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD governance/evidence**

## Mission

Converge evidence from A1-A19 into the canonical 956-capability registry without inflating maturity.

## Own

- capability-status convergence tooling;
- evidence index normalization;
- missing/duplicate/unknown ID validation;
- maturity arithmetic and top blocker queue;
- exact-head provenance checks.

## Forbidden

- no domain implementation;
- no capability promotion without direct source/test/migration/permission/reconciliation/UI/provider/production evidence appropriate to the level;
- no production/provider mutation.

## Acceptance

- exactly 956/956 unique capability IDs;
- zero missing/unknown/duplicate IDs;
- maturity totals reconcile to 956;
- every promotion/demotion has exact evidence;
- stale/circular evidence rejected;
- residual top blockers ranked by release confidence impact.

## Output

Open convergence PR and stop before merge unless explicitly approved.
