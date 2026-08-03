# UI01 — META

Date: 2026-08-03
Baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Branch: `agent/ui-01-meta`
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

Record blockers in this file or a branch-local handoff note using:

```text
Dependency Request
Owner: UI02/UI03/UI04/UI05
Need: ...
Why: ...
Can continue independently: yes/no
```

Never solve a dependency by editing another agent's hotspot without evidence that ownership changed.

## Acceptance

Wave A is complete when:

- Matrix contract is first-class, typed and validated;
- compiler/parser/manifest transport preserves it end-to-end;
- no Item Price/Alumdoor literals appear in generic contract code;
- Bulk compatibility is preserved;
- targeted typecheck/tests/selfchecks pass or blockers are documented;
- changed files and maturity are recorded;
- branch remains unmerged/un-deployed pending convergence approval.

Target maturity: `Foundation` for Matrix metadata contract, possibly `Wired` only if transport is proven end-to-end.

## Prompt to start this agent

`Đọc docs/agents/ui-factory/UI01-META.md và Forge Enterprise Completion Skill. Làm owner META trên branch hiện tại: audit exact main, khóa viewPolicy.matrix/UI Grammar contract, implement type/compiler/validator/fixtures theo metadata-first. Không sửa renderer hoặc pricing business logic. Nếu cần contract từ nhánh khác ghi Dependency Request rồi tiếp tục phần độc lập. Không merge/deploy.`
