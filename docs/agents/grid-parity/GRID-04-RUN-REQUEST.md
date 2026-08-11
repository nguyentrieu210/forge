# GRID-04 convergence run request

Candidate composition:

- GRID-02 product runtime: exact implementation `c9d6995c8210195ff8116faf0deb28c2cefa0ead`; later PR #826 head changes handoff only.
- GRID-03 product blobs: materialized on this QA head without worker coordination history.
- GRID-04 QA layer: convergence contracts, browser harness/workflow, plus narrow test-infrastructure corrections discovered by exact-candidate execution. No runtime/business metadata implementation was changed.

Observed evidence before this rerun:

- `31475251792`: AlumDoor contract PASS; exposed strict-null selfcheck errors and initial QA build invocation issue.
- `31475440211`: AlumDoor 6/6 PASS; GRID-04 cross-layer tests PASS; diff hygiene PASS; source-contract false-positive identified; browser assertions did not execute because workspace dist entries were unavailable.
- `31476662376`: confirms the same product evidence on merge-ref `987e8a1acf0bc615f9e5f4ab5a8f1f898ac6c971`; browser lane was isolated to workspace sources.
- `31476915025`: product contracts remained green; browser lane exposed QA source-alias defects only: unresolved workspace package entries and `@metaforge/ui/v3.css` being rewritten to `index.ts/v3.css`.
- `31478412332`: browser lane PASS after source-alias repair; canonical build, AlumDoor contract, selfchecks and diff hygiene PASS. The remaining contract-lane failure was limited to three stale source-spelling assertions while their architectural invariants were visibly present in the implementation.

GRID-04 corrected only QA/test infrastructure:

1. `metadata-child-grid-smart-selfcheck.ts`: explicit non-null fixture bindings so strict TypeScript can typecheck deterministic test data.
2. `metadata-child-grid-runtime.test.mjs`: source-contract assertions now verify the actual architecture/behavioral seams (metadata routing, locale numeric normalization and internal-column suppression) instead of obsolete local variable names or equivalent expression spellings.
3. `vite.grid-parity.config.ts`: exact-match source aliases for workspace packages plus a dedicated `@metaforge/ui/v3.css` alias, preventing package-root aliases from swallowing CSS subpaths while keeping browser QA independent of prebuilt workspace dist output.

This marker requests the final fresh exact PR merge-ref run containing those QA-only corrections. No runtime, business metadata, controller, schema, migration, tenant, production or deploy state is changed.
