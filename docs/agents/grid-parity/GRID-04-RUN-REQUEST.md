# GRID-04 convergence run request

Candidate composition:

- GRID-02 product runtime: exact implementation `c9d6995c8210195ff8116faf0deb28c2cefa0ead`; later PR #826 head changes handoff only.
- GRID-03 product blobs: materialized on this QA head without worker coordination history.
- GRID-04 QA layer: convergence contracts, browser harness/workflow, plus two narrow test-infrastructure corrections discovered by exact-candidate execution. No runtime/business metadata implementation was changed.

Observed evidence before this rerun:

- `31475251792`: AlumDoor contract PASS; exposed strict-null selfcheck errors and initial QA build invocation issue.
- `31475440211`: AlumDoor 6/6 PASS; GRID-04 cross-layer tests PASS; diff hygiene PASS; source-contract false-positive identified; browser assertions did not execute because workspace dist entries were unavailable.
- `31476662376`: confirms the same product evidence on merge-ref `987e8a1acf0bc615f9e5f4ab5a8f1f898ac6c971`; browser lane was isolated to workspace sources.

GRID-04 corrected only QA/test infrastructure:

1. `metadata-child-grid-smart-selfcheck.ts`: explicit non-null fixture bindings so strict TypeScript can typecheck deterministic test data.
2. `metadata-child-grid-runtime.test.mjs`: hook-boundary regression now checks the actual architectural invariant — hook-free router wrapper + no legacy fallback inside the hook-owning smart component — instead of a broad regex that misclassified helper-local returns.

This marker requests a fresh exact PR merge-ref run containing those QA corrections. No runtime, business metadata, controller, schema, migration, tenant, production or deploy state is changed.
