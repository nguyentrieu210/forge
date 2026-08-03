# UI04 — ALUMDOOR

Date: 2026-08-03
Status: **CLAIMED**
Owner: **GPT-5.6 Thinking / UI04**
Started from: `main@a9e3cde352dbe78c93b28097094c45fc5baad845`
Branch: `agent/ui-04-alumdoor`
Role: reference vertical / UX parity / metadata mapping

## Mission

Treat the current Alumdoor Item Price Manager as the reference UX specimen, not as the future architecture. Capture exactly what makes it good, define parity fixtures, and prepare Alumdoor metadata to consume the generic Matrix contract without a shared-runtime fork.

This branch must protect product quality while allowing genericization.

## Read first

1. exact branch/main/PR state;
2. `CURRENT_STATUS.md`, `NEXT_TASKS.md`;
3. `skills/forge-enterprise-completion/SKILL.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
5. `client/packages/views/src/bulk/ItemPriceMatrixPanel.tsx` in full;
6. `client/packages/views/src/bulk/BulkGridContainer.tsx` special-case routing;
7. Alumdoor manifests/brief/views/fixtures related to Item, UOM, Price List, Item Price;
8. `server/docs/METAFORGE-BULK-VIEW-ARCHITECTURE-20260802.md`;
9. current production/release evidence only when validating a claim, never as permission to mutate production.

## Owned scope

Preferred ownership:

- Alumdoor app metadata/manifest/brief/view configuration;
- reference fixtures and UX acceptance docs/tests;
- Alumdoor-only adapter wiring that consumes generic contracts;
- no shared renderer implementation;
- no pricing-domain authoritative logic.

Do not patch generated Alumdoor JSON alone when a generator/source file owns it. Follow repo generator rules.

## Reference behavior inventory

Capture and protect at least these existing behaviors:

1. Price List -> Item Group -> Item navigation;
2. Price List search;
3. Item/group search including accent-insensitive behavior where currently supported;
4. selected Price List context;
5. selected Item context;
6. UOM row construction;
7. stock UOM identification;
8. UOM conversion-factor editing;
9. add UOM;
10. remove UOM;
11. Price List columns;
12. effective-date/status display;
13. enabled/disabled Item Price cell state;
14. Currency rate editor;
15. create Price List;
16. hide/show columns;
17. focus/full-width mode;
18. sticky headers/axes;
19. dirty/save feedback;
20. conflict/error feedback;
21. mobile tree -> prices step flow;
22. desktop split flow;
23. large catalog completeness/search behavior;
24. no loss of existing price/UOM data semantics.

If more behavior exists in exact code, include it. The list above is minimum, not a ceiling.

## Deliverables

### A. Reference fixture

Create a deterministic acceptance fixture/document describing representative data:

- multiple Price Lists with effective dates and one disabled list;
- multi-level Item Groups;
- several Items with different stock/default UOMs;
- Item with multiple UOM conversions;
- sparse Item Price coverage across UOM x Price List;
- at least one missing cell to test creation;
- at least one existing cell to test update;
- at least one UOM removal case;
- enough items to exercise search/paging assumptions.

### B. Metadata mapping

Map the reference into generic concepts only:

- navigator;
- row axis;
- column axis;
- cell;
- auxiliary fields;
- named read source;
- named write/create actions;
- interaction policy;
- responsive policy;
- design hints.

The mapping must not require shared renderer knowledge of `Item Price`, `Price List`, `UOM` or Alumdoor.

### C. Parity checklist

Create a before/after acceptance table with status and evidence placeholders for desktop/tablet/mobile.

### D. Removal gate

Specify the exact evidence required before deleting the current shared-runtime special case:

```ts
if (props.doctype === "Item Price") { ... }
```

Do not delete it on this reference branch unless convergence ownership explicitly assigns that final change.

## Quality rule

Genericization is rejected if it materially worsens the current operator workflow merely to make the schema simpler.

Prefer adding a genuinely reusable primitive over flattening the experience into generic CRUD.

## Parallel boundary

- META owns canonical schema.
- RUNTIME owns shared renderer.
- PRICING owns server business semantics.
- QA owns cross-branch and second-reference proof.

If a needed generic capability is absent, write a Dependency Request. Do not implement it as an Alumdoor fork.

## Acceptance

Wave A is complete when:

- current UX behavior is fully inventoried;
- deterministic reference fixtures exist;
- proposed generic metadata mapping exists;
- parity checklist exists across desktop/tablet/mobile;
- any missing generic primitive is expressed as a Dependency Request;
- no shared runtime fork or duplicate pricing authority is added;
- exact changed-file/test/evidence/handoff state is recorded.

Target maturity: reference specification `RC` quality; runtime capability remains dependent on integration.

## Audit plan

1. Re-audit exact main after Employee Lite delta and confirm it does not change Matrix semantics.
2. Inventory the full Item Price Manager read/write/responsive behavior from exact source.
3. Lock deterministic fixture + expected outcomes.
4. Map the specimen to business-neutral Matrix concepts without inventing canonical UI01 field names.
5. Add parity/removal-gate acceptance and fixture selfcheck.
6. Record cross-stream Dependency Requests, then final verification/handoff.
