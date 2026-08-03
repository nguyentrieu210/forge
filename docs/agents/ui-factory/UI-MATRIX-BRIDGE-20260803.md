# MetaForge Matrix named-source/action bridge — 2026-08-03

Status: **IMPLEMENTED + OWNED-SCOPE VALIDATED / READY FOR APPROVAL / NOT MERGED / NOT DEPLOYED**

Branch: `feat/matrix-named-source-action-bridge`
Exact-main lineage validated against: `main@82cbb01f768f32583f029d02d2bd9051ecef09fb`
Validated branch head before CI-cleanup-only commits: `d560eabd483aef72c6f509c86b8a05a95ddc6d45`
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

The shared Link service also no longer special-cases `Price List` by name. Buying/selling narrowing is now derived from the parent business-context policy plus target metadata fields (`selling` / `buying`). The Matrix domain-leak gate found that pre-existing shared-runtime debt and the branch removes it generically rather than suppressing the gate.

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

Why: the old Item Price Manager can add UOMs and create Price Lists. UI01 metadata currently names member actions but does not specify their input form. Hard-coding those dialogs in the generic Matrix renderer would simply move the old special case to a less obvious file.

Blocked scope:

- full Alumdoor Item Price parity;
- switching Matrix to the default Item Price surface;
- deleting the remaining `BulkGridContainer -> ItemPriceMatrixPanel` compatibility branch;
- claiming Matrix RC.

Can continue independently: **yes**. DR-MATRIX-01, existing-row edit/read/write integration, exact-head build/tests and domain-leak evidence are complete on this branch.

## Removal gate remains

Do not remove the legacy Item Price path until all are true:

- DR-MATRIX-02 member create actions exist generically;
- add/remove UOM parity passes;
- create Price List parity passes;
- price create/update/disable and OCC/retry parity pass;
- exact-head desktop/tablet/mobile browser evidence exists;
- second non-pricing Matrix reference passes without a business-name conditional;
- shared runtime domain-leak gate stays green.

## Final validation evidence

Temporary PR-only workflow run: **30818380398**

Validated branch head: `d560eabd483aef72c6f509c86b8a05a95ddc6d45`, which already contains exact `main@82cbb01f768f32583f029d02d2bd9051ecef09fb`.

Result: **SUCCESS**.

- frozen workspace install: PASS;
- whole-server TypeScript compile was executed and still returns non-zero because current main contains unrelated pre-existing MRP/CRM/QMS/App Factory exact-optional/export debt;
- Matrix-owned server paths (`matrix-api.ts`, `pricing-matrix-binding.ts`, `matrix-canonical-mutation.ts`): **0 TypeScript errors**;
- tenant-worker core emit guard: PASS;
- targeted server Matrix/App Factory/pricing regressions: **27/27 PASS**;
- `@metaforge/views` TypeScript build: PASS;
- Matrix view regression family: **8/8 PASS**;
- shared Matrix domain-leak gate: PASS;
- real Alumdoor brief -> view sidecar -> canonical App Factory compiler -> authoritative manifest parser: PASS;
- pricing permission/OCC/idempotency/fixed-point authority regression: PASS.

During validation the gate found and forced removal of a pre-existing shared `doctype === "Price List"` conditional in `container/services.ts`; it is now metadata-capability-driven.

The temporary workflow was deleted immediately after evidence capture in cleanup commit `55307b64b9736e0bea41a6f94ea6f523d99791a1`; it is not part of the final feature diff.

## Production boundary

No production migration, Worker deploy, secret/DNS change, tenant/customer-data mutation, or compatibility-path removal has been performed. Merge/deploy remains blocked on explicit user approval because this changes shared backend/runtime behavior.
