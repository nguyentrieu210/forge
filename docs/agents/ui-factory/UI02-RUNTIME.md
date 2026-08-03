# UI02 — RUNTIME

Date: 2026-08-03
Baseline: `main@55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`
Branch: `agent/ui-02-runtime`
Role: generic Matrix renderer + shared responsive runtime

## Mission

Build the reusable Matrix presentation/runtime layer without knowing pricing, Alumdoor, Item Price, Supplier Item or any other business name.

This branch owns the UI/runtime architecture only. META owns canonical metadata contracts. PRICING owns server business semantics.

## Read first

1. exact branch/main/PR state;
2. `CURRENT_STATUS.md` and `NEXT_TASKS.md`;
3. `skills/forge-enterprise-completion/SKILL.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
5. `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md`;
6. current `client/packages/views/src/bulk/ItemPriceMatrixPanel.tsx` as a reference UX, not as a contract;
7. `client/packages/views/src/bulk/BulkGridContainer.tsx`, `SplitView`, controls registry, list/form patterns;
8. Draft PR #370 planning docs if useful.

## Owned scope

Preferred ownership:

- new `client/packages/views/src/matrix/**`;
- narrow exports/registry/router integration under `client/packages/views/src/**`;
- shared UI primitives only when truly generic and required;
- renderer-specific tests/browser fixtures.

Do not edit canonical `client/packages/core/src/types/meta.ts` or server compiler/parser contracts. UI01 owns those.

## Parallel-safe architecture

Define a local semantic renderer model inside the views package so implementation can proceed before canonical metadata convergence. The local model should represent renderer needs only, for example:

- navigator nodes/search state;
- row axis members;
- column axis members;
- sparse cell state;
- auxiliary row fields;
- capabilities/actions;
- loading/error/conflict state;
- responsive presentation hints.

Do not turn this local view-model into a competing canonical metadata schema. During convergence, META metadata will adapt into this renderer model.

## Required UX capabilities

Matrix v1 should support generic equivalents of the successful Alumdoor Price Manager behaviors:

1. optional hierarchical navigator;
2. independent navigator/search scopes;
3. row/column axes;
4. sparse cells;
5. editable cell via existing control registry;
6. optional enabled/toggle state per cell;
7. auxiliary editable fields on a row axis;
8. add/remove row member actions;
9. create/hide/show column actions;
10. sticky headers and sticky row axis;
11. focus/full-width mode;
12. unsaved-change guard;
13. empty/loading/error/conflict states;
14. keyboard cell navigation;
15. accessible labels/focus behavior;
16. desktop split layout;
17. tablet adaptation;
18. mobile step flow;
19. large-grid rendering strategy/virtualization seam;
20. no N x M network-call assumptions in component design.

## Hard rules

- No `if (doctype === "Item Price")` or equivalent business-name routing.
- No pricing/UOM/currency rules in renderer code.
- No direct multi-document business mutation from the generic renderer.
- Renderer invokes supplied capabilities/actions and renders returned state.
- Existing controls should be reused rather than cloning field editors.
- Mobile behavior should be runtime policy, not an Alumdoor fork.
- A11y and keyboard behavior are part of the primitive, not later decoration.

## Performance design

Design for bounded business-scale matrices:

- visible-window rendering/virtualization seam for large cell counts;
- sticky headers without rendering the full Cartesian product if data is sparse;
- cancellable/debounced search at adapter boundary;
- stable keys;
- batch state updates;
- no per-cell network fetch;
- deterministic loading placeholders.

Do not invent customer SLA numbers; record measured evidence only when tests exist.

## Dependency Requests

If implementation needs a canonical metadata field from UI01, a pricing action from UI03, or a reference fixture from UI04, record a Dependency Request and keep building independent renderer behavior.

Do not edit another owner's hotspot just to unblock yourself.

## Acceptance

Wave A is complete when:

- generic Matrix renderer exists behind a business-neutral interface;
- no pricing/Alumdoor literals exist in shared Matrix code;
- desktop/tablet/mobile composition is implemented or explicitly staged with tests;
- keyboard/a11y/dirty/error/conflict states are addressed;
- targeted typecheck/unit/browser evidence is recorded;
- changed files and remaining dependencies are documented;
- branch is not merged/deployed pending convergence.

Target maturity: `Wired` for renderer in isolation, not RC until canonical metadata + domain action + reference parity are integrated.

## Wave A implementation handoff — 2026-08-03

Observed start state:

- branch head before implementation: `dc4f46b37dda8ff9b6512024302dcc5615130e1b`;
- shared baseline: `55e105e7a03f6bffc70a5ddb0e52d125e5b8d270`;
- `main` observed during audit: `a9e3cde352dbe78c93b28097094c45fc5baad845`;
- the two then-newer `main` commits were Employee Lite / tenant operations and did not own Matrix runtime files, so UI02 continued from its coordinated baseline instead of rebasing unrelated production work into the Wave A branch.

Implemented in owned scope:

- business-neutral local `MatrixViewModel` for navigator, row/column axes, sparse cells, auxiliary fields, capabilities, runtime state and presentation hints;
- JSON-tuple sparse cell identity helper to avoid delimiter collisions;
- accent-insensitive token search including Vietnamese `đ` normalization;
- hierarchical navigator filtering that preserves matching ancestor paths;
- cancellable/debounced search callback boundary for navigator/rows/columns;
- supplied action/capability boundary only, with no generic multi-document mutation;
- existing `ControlRegistry` reuse for cell and auxiliary editors, fail-closed display fallback when a field control is unavailable;
- enabled/toggle state, row auxiliary editing, add/remove/create actions and local column visibility;
- loading, empty, error and conflict surfaces; conflict locks editing/save and exposes supplied reload action;
- dirty badge, `beforeunload` guard and guarded navigator/mobile-step transitions;
- desktop resizable navigator split, tablet split, focus mode and mobile step/card runtime;
- sticky header/row-axis composition;
- roving keyboard focus with Arrow/Home/End, Ctrl/Meta edge jumps, Enter/F2 editor entry and Escape return;
- virtualized desktop/tablet rows with real row measurement, overscan and keyboard scroll-to-row behavior;
- explicit column-window seam plus `onViewportWindowChange`, without any per-cell fetch assumption;
- browser harness with 84 rows, 16 columns, sparse cells, 10-column render window, navigator, dirty/conflict and edit/toggle callbacks;
- public package subpath `@metaforge/views/matrix` and targeted `test:matrix` lane.

Owned/touched files:

- `client/packages/views/src/matrix/types.ts`
- `client/packages/views/src/matrix/model.ts`
- `client/packages/views/src/matrix/MatrixRenderer.tsx`
- `client/packages/views/src/matrix/MatrixChrome.tsx`
- `client/packages/views/src/matrix/MatrixGrid.tsx`
- `client/packages/views/src/matrix/index.ts`
- `client/packages/views/tests/matrix-model.test.mjs`
- `client/packages/views/package.json`
- `client/apps/runtime/matrix-harness/main.tsx`
- `client/apps/runtime/matrix-harness/index.html`
- `client/apps/runtime/vite.matrix-e2e.config.ts`
- this handoff document.

Local evidence available in the agent environment:

- pure Matrix model compiled with TypeScript in an isolated checker: PASS;
- `node --test` Matrix model regression: **5/5 PASS**;
- renderer modules compiled in a structural TypeScript checker with React/UI/control stubs: PASS;
- forbidden business-name scan over `client/packages/views/src/matrix/**`: no Item Price/Pricing/Alumdoor/Price List/UOM/Supplier Item literals found.

Repository/browser evidence still belongs to convergence/CI:

- full workspace `pnpm --filter @metaforge/views typecheck` was not runnable in the connector-only environment because the repository checkout/dependency tree is unavailable there;
- the Vite browser harness is committed but has not been visually executed in this environment;
- CI/QA should run the real package typecheck/build and browser evidence on the branch/PR.

Dependency Request
Owner: UI01 / `agent/ui-01-meta`
Need: canonical `viewPolicy.matrix` -> local `MatrixViewModel` adapter/mapping during convergence.
Why: UI02 deliberately does not edit the canonical metadata contract or claim a new router `ViewKind`.
Blocked scope: metadata-selected Matrix routing from installed app manifests.
Can continue independently: no further Wave A renderer work is blocked; convergence remains.
Next independent work: complete branch evidence/PR handoff and preserve the adapter seam.

Dependency Request
Owner: UI03 / `agent/ui-03-pricing`
Need: named projection/action implementation for the first compound-write reference.
Why: generic renderer only invokes supplied actions and must not implement pricing or multi-document correctness.
Blocked scope: end-to-end save/OCC/idempotency proof for the first business reference.
Can continue independently: no further Wave A renderer work is blocked.
Next independent work: keep action context generic and test renderer states independently.

Dependency Request
Owner: UI04 / `agent/ui-04-alumdoor`
Need: current reference parity fixture and metadata wiring against the generic Matrix runtime.
Why: a generic primitive cannot be declared parity-complete from renderer code alone.
Blocked scope: replacement of the current specialized reference UI.
Can continue independently: no further Wave A renderer work is blocked.
Next independent work: hand off the neutral browser harness to QA/convergence.

Current maturity: **Wired in isolation**. It is intentionally **not RC** until UI01 canonical metadata, UI03 server-authoritative actions, UI04 parity wiring and UI05 integration/browser evidence converge.

Merge/deploy status: **not merged, not deployed**. This is a coordinated shared-runtime Wave A branch, and its own acceptance/convergence contract explicitly requires it to remain isolated until cross-branch convergence. It is not treated as a presentation-only hotfix fast path.

## Prompt to start this agent

`Đọc docs/agents/ui-factory/UI02-RUNTIME.md và Forge Enterprise Completion Skill. Làm owner RUNTIME trên branch hiện tại: xây generic Matrix renderer trong views, responsive/mobile/a11y/keyboard/performance seam, dùng local semantic view-model để chạy song song. Không sửa canonical meta contract, không nhét pricing/Alumdoor logic vào React. Ghi Dependency Request nếu cần owner khác. Không merge/deploy.`