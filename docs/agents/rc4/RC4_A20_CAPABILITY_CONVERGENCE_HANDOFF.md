# RC4-A20 — Capability Convergence

- Status: **CONVERGING — PR/exact-head validation pending**
- Branch: `agent/rc4-20-capability-convergence`
- Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
- Risk: **STANDARD governance/evidence**

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
- no promotion from branch existence, PR existence, source presence, authored-but-unrun tests, skipped CI or in-progress CI;
- no production/provider mutation.

## Snapshot result

Point-in-time RC4 evidence was audited through PR `#606`; A19 independent run `30868619676` was still in progress at the convergence cutoff.

Candidate maturity remains conservatively unchanged:

- Hardened: `0`;
- RC: `65`;
- Wired: `407`;
- Foundation: `327`;
- Missing: `157`;
- Total: `956`.

No A1-A19 maturity promotion/demotion is accepted in this snapshot. Strong executable evidence from A1/A3/A11 is retained, but each lane still has an explicit capability-level promotion blocker or does not claim the broader capability promotion.

## Delivered

- `docs/agents/rc4/RC4_A20_EVIDENCE_MANIFEST.json` — machine-readable A1-A19 snapshot/provenance and zero-change maturity decision;
- `server/scripts/validate-rc4-capability-convergence.mjs` — RC4 provenance/evidence/arithmetic gate layered on the canonical 956 validator;
- `docs/agents/rc4/RC4_A20_CAPABILITY_CONVERGENCE.md` — convergence analysis, ranked blockers and Dependency Requests;
- `.github/workflows/rc4-a20-capability-convergence.yml` — exact PR-head gate pinned to the actual PR base SHA.

## Acceptance

The new validator requires:

- exactly 956/956 unique capability IDs;
- zero missing/unknown/duplicate IDs;
- maturity totals reconcile to 956;
- all Evidence Index references are defined exactly once and used;
- A1-A19 occur exactly once in the evidence manifest;
- PR-backed lane evidence carries immutable head SHA;
- every future maturity change points to an accepted lane with exact validated head, executable workflow provenance, explicit capability IDs and direct non-circular evidence;
- stale A20 snapshot fails closed when PR base `main` SHA changes.

## Current dependency boundary

- A19 must complete the independent worker-head replay and later replay the final converged candidate head before RC4 maturity promotion.
- A21/A22/A24 must consume A20's provenance contract for migration governance, cross-ledger evidence and final QA.
- Domain/provider/browser/legal gaps remain owned by A1-A18; A20 records them but does not bypass their authority.

## Output boundary

Open convergence PR and collect exact-head validation. This is non-UI governance/evidence work: **stop before merge/deploy unless explicitly approved**.
