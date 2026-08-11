# GRID-04 convergence run request

Candidate composition:

- GRID-02 implementation candidate: `c9d6995c8210195ff8116faf0deb28c2cefa0ead` (PR #826 later handoff-only head does not change product source).
- GRID-03 product blobs: materialized on this QA head without worker coordination history.
- GRID-04 QA workflow: server, canonical build, grid/selfcheck and browser lanes run independently so one blocker cannot hide later evidence.

Observed exact-candidate evidence so far:

- run `31475251792`: AlumDoor child-presentation contracts PASS; exposed GRID-02 selfcheck TypeScript errors and a QA build-invocation issue;
- run `31475440211`: AlumDoor contracts PASS 6/6; GRID-04 cross-layer convergence tests PASS; diff hygiene PASS; canonical build/selfcheck still blocked by GRID-02 selfcheck typing; existing GRID-02 hook-order source test is a false-positive because its broad regex sees helper-local returns before a later hook, while the wrapper routing itself has no hook and no conditional hook execution;
- browser artifacts from `31475440211` prove the UI assertions did not execute: Vite could not resolve built workspace package entries. GRID-04 therefore changed only QA infrastructure to run the harness against explicit workspace source aliases.

This marker requests the next exact PR merge-ref run with the corrected source-isolated browser lane. It changes no runtime, business metadata, business rule, schema, tenant state or production state.
