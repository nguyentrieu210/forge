# GRID PARITY — AGENT BOARD

Program: `program/grid-parity-20260811`
Baseline: `main@cecb19c51855ab3e6a05ce84261d717c630c96b7`
Status vocabulary: `BOOTSTRAPPED | RUNNING | BLOCKED | READY | CONVERGING | DONE | SUPERSEDED/CLOSED`

## Current topology

| Agent | Branch | PR | Mission | Status | Depends / blocker |
|---|---|---:|---|---|---|
| GRID-01 PARITY | `agent/grid-01-parity-20260811` | — | Audit mature vs current grid; lock feature + per-DocType parity contract | BOOTSTRAPPED | — |
| GRID-02 RUNTIME | `agent/grid-02-runtime-20260811` | — | Restore SmartGrid interactions in metadata-owned generic runtime | BOOTSTRAPPED | Program contract; consume GRID-01 refinements |
| GRID-03 ALUM META | `agent/grid-03-alumdoor-meta-20260811` | — | Reconcile AlumDoor quick/full/internal columns against current backend | BOOTSTRAPPED | Current Sales/Procurement backend contracts |
| GRID-04 QA | `agent/grid-04-qa-20260811` | — | Build parity/E2E/convergence evidence | BOOTSTRAPPED | Final GRID-02 + GRID-03 candidate heads |

Coordinator/control branch is not counted as a worker agent.

## Ownership rules

### GRID-01

Allowed:
- `docs/agents/grid-parity/**` parity/reference documents;
- dedicated reference fixtures/tests that do not alter runtime behavior.

Forbidden:
- shared renderer implementation;
- AlumDoor business metadata;
- backend controllers.

### GRID-02

Allowed:
- `client/packages/views/src/form/MetadataChildGrid.tsx`;
- generic child-grid interaction/presentation helpers under views;
- narrowly necessary generic grid tests owned with runtime.

Forbidden:
- `server/scripts/lib/alumdoor-child-presentation.mjs`;
- generated AlumDoor brief;
- Sales/Pricing/Stock/Payroll business rules.

### GRID-03

Allowed:
- `server/scripts/lib/alumdoor-child-presentation.mjs`;
- `server/scripts/build-alumdoor-v2-brief.mjs` only where presentation materialization requires it;
- generated `server/briefs/alumdoor-v2.json` through the generator;
- focused server metadata contracts.

Forbidden:
- shared React grid implementation;
- domain controller algorithms.

### GRID-04

Allowed:
- parity/e2e/browser fixtures and test harnesses;
- workflow test wiring if narrowly required;
- convergence evidence documents.

Forbidden:
- solving runtime or business metadata bugs inside QA-owned files.

## Dependency requests

Use this format in branch-local handoff when blocked:

```text
Dependency Request
Owner: GRID-XX
Need: <exact contract/file/output>
Why: <reason ownership belongs there>
Blocked scope: <what cannot proceed>
Can continue independently: yes/no
Next independent work: <what the agent will continue>
```

## Convergence order

1. GRID-01 parity contract accepted as evidence baseline.
2. Reconcile GRID-02 runtime against exact current control head.
3. Reconcile GRID-03 metadata against exact current Sales/Procurement authority.
4. Build one convergence candidate containing GRID-02 + GRID-03 without duplicate logic.
5. GRID-04 runs exact-candidate tests/browser evidence.
6. Coordinator audits forbidden-zone leakage, generated artifacts and diff hygiene.
7. Stop before non-trivial merge/deploy unless separately authorized.
