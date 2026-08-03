# UI01 — META

Date: 2026-08-03
Original baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Current convergence target: `main@a97c7c48e792aaf5b6af98225270dd54d64389bc`
Branch: `agent/ui-01-meta`
PR: `#387` — `feat(ui01): canonical Matrix metadata contract`
Role: canonical UI Grammar + Matrix metadata contract

## Mission

Create the canonical metadata contract that lets MetaForge describe a Matrix surface and, over time, the Enterprise UI Pattern System without app-specific React routing.

Primary output of this branch is a clean, deterministic contract and compiler/validator support. Do not implement pricing business rules or shared React renderers.

## Read first

1. exact branch/main/PR state;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `skills/forge-enterprise-completion/SKILL.md`;
5. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
6. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
7. `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md`;
8. current `client/packages/core/src/types/meta.ts` and server mirror/compiler/parser paths;
9. Draft PR #370 planning docs if useful, but exact code wins.

## Owned scope

Preferred ownership:

- `client/packages/core/src/types/meta.ts` and narrowly related core policy/resolver files;
- server-side metadata types/parser/compiler/manifest transport corresponding to `viewPolicy`;
- metadata validation/selfchecks/fixtures for Matrix/UI Grammar;
- App Factory authoring contract only where it is already owned by WS09 and can be changed without unrelated runtime work.

Do not touch `client/packages/views/src/**` except test fixtures that cannot be separated. RUNTIME owns renderer code.

## Required Matrix v1 capabilities

Design a first-class canonical `viewPolicy.matrix` contract able to express, without Item Price literals:

- optional hierarchical navigator;
- row axis source/key/label;
- column axis source/key/label/subtitle;
- sparse cell source and identity;
- value field/editor;
- optional enabled/disabled field semantics;
- row auxiliary fields such as conversion factor;
- search/filter capabilities;
- create/remove row member policy;
- create/hide/show column policy;
- sticky-axis/focus/mobile hints as presentation metadata;
- read projection reference;
- write action reference;
- permission Doctype/action boundary;
- dirty/conflict policy hints;
- bounded paging/search declaration.

Keep exact naming small and composable. Do not encode Alumdoor nouns into the schema.

## Contract principles

1. Metadata describes UI intent and bindings, not domain algorithms.
2. Compound/unsafe write targets use named server actions, not generic document mutation.
3. Existing `viewPolicy.bulk` remains backward compatible.
4. Unknown/unsafe combinations fail closed during validation.
5. Referenced fields/actions/sources must be statically checkable where possible.
6. Mobile fallback must be deterministic.
7. Contract must serialize cleanly through app package/manifest/compiler layers.
8. Avoid a giant free-form `Record<string, unknown>` escape hatch for authoritative semantics.

## Validation cases

At minimum include negative/positive cases for:

- missing axis key;
- duplicate axis identity;
- cell editor targeting read-only/server-owned fields;
- action missing permission boundary;
- transaction/ledger target trying to use generic `document_update`;
- invalid mobile/layout hint;
- invalid source reference shape;
- legacy Bulk metadata remains accepted;
- valid simple matrix;
- valid projection+action matrix.

## Parallel boundary

RUNTIME may define a local renderer view-model under its own views subtree. Do not edit its files. Provide a clear canonical-to-view-model mapping contract in docs/tests if needed.

PRICING owns Item Price semantics. If Matrix metadata needs a generic named action/projection reference, define only the generic reference shape and issue a Dependency Request for the concrete pricing method.

## Dependency Requests

```text
Dependency Request
Owner: UI02 / RUNTIME
Need: Consume canonical `viewPolicy.matrix` and map it to the generic Matrix renderer/view-model.
Why: UI01 owns grammar/transport, not renderer implementation.
Blocked scope: Runtime Matrix rendering and mobile/desktop interaction behavior.
Can continue independently: no — UI01 contract/transport is complete; renderer is the next owner.
```

```text
Dependency Request
Owner: UI03 / SERVER + UI04 / PRICING
Need: Supply concrete projection/action implementations for each business Matrix, including OCC/version behavior.
Why: UI01 deliberately defines generic source/action references and permission boundaries only.
Blocked scope: Live business Matrix reads/writes such as pricing parity.
Can continue independently: no — concrete domain methods belong to their owning workstreams.
```

## Acceptance

Wave A is complete when:

- Matrix contract is first-class, typed and validated;
- compiler/parser/manifest transport preserves it end-to-end;
- no Item Price/Alumdoor literals appear in generic contract code;
- Bulk compatibility is preserved;
- targeted typecheck/tests/selfchecks pass or blockers are documented;
- changed files and maturity are recorded;
- branch remains unmerged/un-deployed pending convergence approval.

## Completion record — 2026-08-03

### Implemented

- Added first-class typed `viewPolicy.matrix` on client and server.
- Added generic `doctype | projection` read sources with explicit permission boundaries.
- Added sparse cell identity/value/editor/enabled/version semantics.
- Added row/column/navigator semantics required by the UI04 parity fixture without business nouns: primary row marker, disabled column marker, selected-first, auxiliary editor/read-only condition, positive/non-negative validation, token/accent-insensitive search, resizable/collapsible navigator, dirty/unsaved guards.
- Added named-action write/member mutation references and restricted generic `document_update` to safe master-style Matrix metadata.
- Added fail-closed Matrix parser validation for unknown keys, invalid sources, duplicate axes, unsafe editors, missing permission boundaries, invalid query/presentation hints and unsafe write targets.
- Preserved canonical top-level `viewPolicy.bulk` through the server parser while retaining the existing legacy `mobile.bulk` compatibility bridge.
- Proved Frappe/getdoctype transport preserves `viewPolicy` without a second translation layer.
- Added an App Factory authoring stage: brief `bulk`/`matrix` blocks compile into package metadata, then immediately pass the authoritative `parseAppManifest -> parseDocTypeMeta` validation path.
- Audited App Source canonicalization: its existing `...declared` behavior already preserves Matrix/Bulk; no extra source dialect was introduced.
- Did not touch `client/packages/views/src/**` and did not add Alumdoor/Item Price literals to generic contract code.

### Files changed

- `client/packages/core/src/types/matrix.ts`
- `client/packages/core/src/types/meta.ts`
- `client/packages/core/src/index.ts`
- `server/packages/frappe-model/src/matrix-types.ts`
- `server/packages/frappe-model/src/matrix-validate.ts`
- `server/packages/frappe-model/src/bulk-validate.ts`
- `server/packages/frappe-model/src/types.ts`
- `server/packages/frappe-model/src/validate.ts`
- `server/packages/frappe-model/src/index.ts`
- `server/scripts/lib/brief-ui-view-policy.mjs`
- `server/scripts/lib/compile-app-brief.mjs`
- `server/scripts/lib/compile-app-brief.d.mts`
- `server/scripts/lib/validate-brief-schema.mjs`
- `server/scripts/forge-app.mjs`
- `server/tests/meta-view-policy.test.mjs`
- `server/tests/ui01-compile-view-policy.test.mjs`
- this handoff and the branch-local `NO-STOP-RULE.md`

### Test / evidence

- Added positive coverage for current-DocType Matrix and projection + named-action Matrix.
- Added negative coverage for missing axis key, duplicate axis identity, readonly/server-owned editor target, missing action permission boundary, transaction generic write, invalid mobile hint, invalid source kind, query bounds, conditional marker dependencies and numeric validation mismatch.
- Added Bulk canonical + legacy compatibility coverage.
- Added brief -> UI-aware compiler -> authoritative manifest parser coverage and a proof that brief authoring cannot bypass canonical Matrix bounds.
- Added `toFrappeDocType` transport assertion to prove Matrix metadata is not dropped.
- `node --check` passed for the two new compiler modules during branch audit.
- GitHub exposed no PR workflow/status checks for the feature head during implementation, so full repository build/unit execution is **not claimed**. The tests are committed as evidence but await the repository's normal validation environment.
- `main@faec4cbe...` purchase-funding/internal-cash changes were audited with no UI01-owned core/parser/compiler overlap.
- `main@a97c7c48...` adds only the temporary Alumdoor purchase-funding deploy workflow; it was audited and merged into this branch with no UI01 overlap.

### Maturity

`Wired / RC` for the **Matrix metadata contract and transport**: typed, authorable, parsed, fail-closed and preserved end-to-end through package/manifest/Frappe meta shape.

This does **not** mean the overall Matrix product is live. Runtime renderer integration and concrete domain projection/action methods remain in UI02/UI03/UI04.

### Merge / deploy

`UNMERGED / UNDEPLOYED` by design. This branch changes shared client/server metadata contracts and App Factory compilation, therefore it is not UI-only. Per project policy it must stop before merge/deploy for explicit convergence approval.

## Prompt to start this agent

`Đọc docs/agents/ui-factory/UI01-META.md và Forge Enterprise Completion Skill. Làm owner META trên branch hiện tại: audit exact main, khóa viewPolicy.matrix/UI Grammar contract, implement type/compiler/validator/fixtures theo metadata-first. Không sửa renderer hoặc pricing business logic. Nếu cần contract từ nhánh khác ghi Dependency Request rồi tiếp tục phần độc lập. Không merge/deploy.`
