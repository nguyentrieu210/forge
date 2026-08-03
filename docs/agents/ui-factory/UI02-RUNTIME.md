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

## Prompt to start this agent

`Đọc docs/agents/ui-factory/UI02-RUNTIME.md và Forge Enterprise Completion Skill. Làm owner RUNTIME trên branch hiện tại: xây generic Matrix renderer trong views, responsive/mobile/a11y/keyboard/performance seam, dùng local semantic view-model để chạy song song. Không sửa canonical meta contract, không nhét pricing/Alumdoor logic vào React. Ghi Dependency Request nếu cần owner khác. Không merge/deploy.`
