# MetaForge Matrix named-source/action bridge — 2026-08-03

Status: **IMPLEMENTED ON BRANCH / VALIDATION IN PROGRESS / NOT MERGED / NOT DEPLOYED**

Branch: `feat/matrix-named-source-action-bridge`
Base after exact-main sync: `main@2e6346a87870961db59cb97869150c3028b07d02`
Draft PR: `#419`
Risk: **STANDARD shared/backend contract**

## Result

DR-MATRIX-01 is implemented end-to-end for the existing-row pricing Matrix slice:

```text
viewPolicy.matrix
  -> MatrixContainer
  -> GET metaforge.matrix.read / POST metaforge.matrix.action
  -> closed MatrixSourceActionRegistry
  -> pricing Matrix binding
  -> permission-scoped DocumentListService reads
  -> clouderp-pricing authority
  -> canonical /api/resource mutation path
  -> organization/app validation + permission + OCC + Document Kernel/DO
```

No generic renderer contains pricing business rules. No pricing mutation writes D1 directly.

## Convergence decisions

### KEEP

- UI01 `viewPolicy.matrix` contract and authoritative parser/compiler.
- UI02 generic Matrix renderer/view model.
- UI03 pricing projection/compound mutation semantics.
- existing Frappe adapter `callGet/callPost` transport.
- tenant-worker authenticated wrapper as the domain composition root.
- existing Item Price compatibility panel until the removal gate is actually green.

### EXTRACT GENERIC

A closed `MatrixSourceActionRegistry` now maps metadata names to registered domain handlers. Metadata cannot execute arbitrary dotted methods. Tenant/actor are supplied only by the authenticated server context and caller-provided tenant selectors are rejected.

`DoctypeWorkspace` now chooses Matrix from `meta.viewPolicy.matrix`, not `doctype === "Item Price"`. When a DocType declares both Bulk and Matrix, Bulk remains the compatibility default unless `view=matrix` is explicitly selected. This preserves current behavior without a business-name branch in the workspace.

The brief `.views.json` loader now transports a `matrix` block to the canonical top-level authoring field. It performs only shallow shape checks; deep Matrix semantics remain owned by the UI01/App Factory validator and parser. Legacy `mobile.bulk` sidecar behavior remains unchanged.

### WRITE AUTHORITY

Pricing writes re-enter the canonical Frappe `/api/resource` path using the authenticated request context. That existing path owns:

- tenant/organization guards;
- app and DocType validation;
- server permissions;
- optimistic concurrency via Frappe `modified` carrying kernel version;
- Document Kernel / Durable Object serialization;
- canonical mutation receipts/idempotency behavior.

The pricing Matrix package remains the authority for UOM/price rules and desired-state retry semantics. The bridge does not create a second store or ledger.

## Current live-capable slice

Once this branch is eventually approved/merged/deployed, the generic Matrix path can support:

- metadata-driven Matrix routing;
- bounded/searchable item navigator;
- sparse Item Price cells;
- edit/toggle existing or missing price cells;
- edit conversion factors;
- remove non-primary UOM rows;
- permission-derived save capability;
- OCC/conflict feedback without discarding local drafts;
- desktop/tablet/mobile behavior provided by the shared UI02 renderer.

The branch intentionally does **not** make Matrix the default Item Price surface yet.

## Dependency Request — DR-MATRIX-02

Owner: **WS09 App Factory + WS14 shared runtime**

Need: a generic Matrix member-action input contract that can describe and render scalar/table inputs for member creation actions, reusing AppAction input-field/input-table semantics instead of adding pricing-specific dialogs to `MatrixContainer`.

Required first references:

1. add a row member with fields such as UOM + conversion factor;
2. create a column member with fields such as name/currency/effective date;
3. invoke the metadata-declared named action with those generic inputs;
4. permission/capability-driven visibility and validation;
5. cancel/dirty behavior consistent with other Matrix actions.

Why: the old Item Price Manager can add UOMs and create Price Lists. UI01 metadata currently names member actions but does not describe their input form. Hard-coding those dialogs in the generic Matrix renderer would simply move the old special case to a less obvious file.

Blocked scope:

- full Alumdoor Item Price parity;
- switching Matrix to the default Item Price surface;
- deleting the remaining `BulkGridContainer -> ItemPriceMatrixPanel` compatibility branch;
- claiming Matrix RC.

Can continue independently: **yes**. DR-MATRIX-01, existing-row edit/read/write integration, exact-head build/tests, domain-leak checks and browser harness evidence are independent.

## Removal gate remains

Do not remove the legacy Item Price path until all are true:

- DR-MATRIX-02 member create actions exist generically;
- add/remove UOM parity passes;
- create Price List parity passes;
- price create/update/disable and OCC/retry parity pass;
- exact-head desktop/tablet/mobile browser evidence exists;
- second non-pricing Matrix reference passes without a business-name conditional;
- shared runtime domain-leak gate stays green.

## Validation target

Temporary PR-only workflow on #419 runs:

- exact server build;
- Matrix source/action registry regression;
- view-sidecar transport regression;
- real Alumdoor brief -> canonical App Factory -> authoritative manifest parser regression;
- existing pricing authority regression;
- UI01 Matrix compiler regression;
- views TypeScript build + Matrix test family;
- shared Matrix domain-leak gate.

The temporary workflow must be removed after evidence is captured. Its absence from the final merge diff is part of the cleanup gate.

## Production boundary

No production migration, Worker deploy, secret/DNS change, tenant/customer-data mutation, or compatibility-path removal is authorized by this branch. Merge/deploy remains blocked on explicit user approval because this changes shared backend/runtime behavior.
