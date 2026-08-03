# V3-04 — DATA SURFACES

Branch: `ui/v3-04-data-surfaces`
Role: shared business data-surface presentation owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Upgrade the reusable Forge business surfaces to Vben-grade density, hierarchy and interaction while keeping the current metadata-driven renderer authoritative. Own List/Table/Form/Detail/Context and generic overlay/quick-entry presentation, not domain business behavior.

## Exclusive hotspots

- `client/packages/views/src/list/**`;
- generic table/list presentation under shared views;
- form/detail/context presentation modules;
- generic data-surface layout helpers;
- generic drawer/modal/quick-entry composition when view-owned.

Coordinate with V3-01 for tokens/motion and V3-02 for shell/chrome boundaries.

## Required List/Table UX

- strong page header/action hierarchy;
- compact search/filter/sort/column controls;
- bulk action state only when selection exists;
- high-density readable headers/rows;
- sticky header behavior;
- column sizing/resizing where existing primitives permit;
- clear selected/hover/focus/current states;
- new/updated cell highlight motion kept subtle;
- empty/loading/error/retry states;
- skeleton loading where appropriate;
- responsive transformation using current metadata/runtime policy rather than hard-coded domain cards;
- keyboard and screen-reader behavior preserved/improved.

## Required Form/Detail UX

- record header with status/actions;
- clear sections without card-within-card sprawl;
- efficient multi-column desktop layout;
- context/activity/related information composition;
- section collapse/reveal motion;
- validation focus/error reveal without gimmicky shake;
- sticky action/workflow behavior where current runtime supports it;
- mobile/tabbed context adaptation;
- preserve canonical controls registry and field permission behavior.

## Overlay/Quick Entry

Standardize business-facing drawer/modal/quick-entry presentation and motion, but keep create/update actions on canonical adapter/document paths.

## Matrix boundary

Do not rewrite the Matrix metadata contract or pricing/domain semantics. Reuse generic Matrix renderer and apply V3 visual treatment only within ownership-safe seams; issue Dependency Request to existing Matrix owners if a shared hotspot would conflict.

## Hard rules

- no `if doctype === ...` domain styling in shared views;
- no business calculations inside React;
- no permission authority changes;
- no duplicate document state/source of truth;
- no raw DataV/command-center decoration on everyday accounting/forms/lists;
- no separate Builder renderer.

## Vben parity

Audit Vben table/form/overlay UX for reusable behaviors. PORT interaction quality, ADAPT to Forge metadata controls, REPLACE where Forge already has stronger canonical behavior, and reject only with explicit reason.

## Verification

- representative large List;
- List selection/bulk/filter/sort/empty/loading/error;
- create/edit/read-only Form;
- workflow/status/validation/error states;
- detail/context panel;
- drawer/modal/quick-entry;
- desktop/tablet/mobile evidence;
- keyboard/a11y/reduced-motion;
- targeted views typecheck/build/tests;
- scan for domain-specific literals added to generic renderer.

## No-stop behavior

Make normal layout/density/component/refactor decisions autonomously. If one renderer hotspot is actively owned elsewhere, isolate the visual adapter/fixture, file a Dependency Request and continue every other data surface instead of waiting.

## Acceptance

DATA is complete when everyday ERP screens are visibly V3, denser and clearer than the old system, while metadata, controls, permissions and document behavior remain canonical and generic.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-04-DATA-SURFACES.md. Làm DATA SURFACES trên branch hiện tại: audit exact main + Vben table/form parity, rebuild List/Table/Form/Detail/Context/overlay presentation theo Forge V3, giữ metadata/controls/permission/business authority nguyên vẹn. Không hard-code domain. Không dừng vì blocker cục bộ; ghi Dependency Request và tiếp tục các surface độc lập.`

---

## Completion record — 2026-08-04

### Exact repository truth

- implementation branch: `ui/v3-04-data-surfaces`;
- initial current-main sync: PR `#446`;
- Finance/AP drift sync: PR `#462`;
- V3-01 foundation/current-main sync: PR `#476`, main head consumed `a022aae7ee967e0c9e08d0ce2514efb11ea3b771`;
- release PR: `#464`;
- V3-01 shared foundation is now resolved on `main`; V3-04 does not modify `client/packages/ui/src/styles.css` or create competing token/motion authority.

### Implementation evidence

Owned client delta is deliberately narrow:

- `client/packages/views/src/app/DoctypeWorkspace.tsx` activates one generic V3 data-surface seam and standardizes view switcher / confirm / quick-entry composition;
- `client/packages/views/src/data-surface/v3.ts` applies business-neutral List/Table/Form/Detail/Context presentation using existing semantic tokens and `mf-*` hooks;
- `client/packages/views/tests/data-surface-v3.test.mjs` guards generic coverage, domain-literal leaks, authority smells, canonical renderer retention, dirty-close guard and reduced-motion seam.

Canonical renderers remain mounted: `ListContainer`, `FormContainer`, `ContextContainer`, `NewFormContainer`, `BulkGridContainer`. No document kernel, adapter, permission, workflow, query, schema or business-rule authority moved into React presentation.

### Vben parity decision

- **Table/List: ADAPT.** Keep Forge TanStack table, server/query state, virtualization, sticky/resizable columns, selection, filters and metadata-derived mobile representation; adapt hierarchy/density/chrome rather than porting Vue/VXE runtime.
- **Form: REPLACE_WITH_FORGE.** Forge metadata resolution, controls registry, React Hook Form/Zod, field permissions, workflow and conflict/dirty behavior are already the stronger canonical engine; only presentation is upgraded.
- **Modal/Quick Entry: ADAPT.** Preserve current focus/escape/dirty-close/document paths, widen and normalize V3 presentation; do not introduce a second mini document engine.
- **Command-center styling on daily ERP data: REJECT_WITH_REASON.** Dark/glow treatment is reserved for V3-05 operational/command surfaces; business List/Form surfaces use neutral enterprise hierarchy.

### Validation evidence

Temporary PR gate `tmp-ui-v3-04-validation` run `30839214217` passed after V3-01 foundation was consumed:

- workspace install: PASS;
- `pnpm --filter @metaforge/views run typecheck`: PASS;
- `node --test client/packages/views/tests/data-surface-v3.test.mjs`: PASS;
- `pnpm --filter sample-wms run build`: PASS;
- generated CSS contains List/Form/Context V3 selectors: PASS.

Responsive and accessibility behavior is intentionally preserved from the canonical surfaces: existing desktop/tablet/mobile `SplitView`, mobile list cards, keyboard row navigation, focus-visible states, dialog focus handling and dirty guards remain intact. V3-04 adds reduced-motion overrides to its presentation seam rather than replacing those behaviors.

### Dependency Request — DR-V3-04-01

**Owner:** V3-07 MOBILE-QA / final convergence.  
**Request:** run the program-level desktop/tablet/mobile screenshot matrix, visual regression and full a11y pass after V3-02 shell, V3-03 auth and V3-04 data surfaces are converged together.  
**Reason:** screenshot fixtures and cross-surface QA are V3-07-owned hotspots; V3-04 can validate build/runtime presentation seams independently without racing that owner.  
**Blocking:** no for V3-04 implementation/merge; yes for final program-level V3 acceptance.

Release merge/deploy evidence is recorded on PR `#464` after the UI-only fast path completes.
