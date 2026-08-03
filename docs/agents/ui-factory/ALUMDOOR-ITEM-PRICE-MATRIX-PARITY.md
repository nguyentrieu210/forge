# Alumdoor Item Price Matrix — Reference UX / Parity / Removal Gate

Date: 2026-08-03  
Owner: UI04 / ALUM  
Reference fixture: `docs/agents/ui-factory/fixtures/alumdoor-item-price-matrix-reference.json`  
Exact audited baseline: `main@a9e3cde352dbe78c93b28097094c45fc5baad845`

## 1. Scope and intent

This document freezes the useful operator behavior of the current Alumdoor Item Price Manager while explicitly refusing to freeze its architectural debt.

The current `ItemPriceMatrixPanel.tsx` is a **UX specimen**, not the future authority boundary. The generic Matrix runtime must preserve or improve the workflow without learning Alumdoor, pricing, Item Price, Price List or UOM business names.

The fixture's `genericMatrixMapping` is a **UI04 semantic reference shape**, not the canonical `viewPolicy.matrix` schema. UI01 remains the schema owner and may choose different field names as long as it can express the same intent without loss.

## 2. Exact current behavior inventory

### Navigator and search

1. The left navigator is `Price List -> Item Group -> Item`.
2. Price List and item/group search are independent inputs.
3. Search normalizes Vietnamese diacritics with NFD removal, lowercases, tokenizes punctuation and requires every token to be contained.
4. Item search covers item code, item name, group and stock unit.
5. While item search is active, matching groups and ancestors auto-expand; users can still collapse search-result branches locally.
6. The root group named `Dịch vụ` is sorted after other groups.
7. Selected Price List and selected Item are both visually preserved.
8. Selecting an Item also carries the selected Price List context into the matrix.
9. Price List rows show effective date and disabled status.
10. Item rows show label, technical code and stock unit.
11. Empty search states are explicit for both Price List and Item search.

### Bounded catalog loading

12. Price Lists are requested with a 200-row page length.
13. Item Groups and UOMs request 500 rows, although the API may cap responses.
14. Items are explicitly fetched at starts `0`, `200`, `400` because the current production catalog exceeded one API page.
15. The three Item pages are deduplicated by identity and disabled Items are removed.
16. Selected-item prices are read sparsely from Item Price, not by issuing one request per matrix cell.
17. The current fixed three-page Item strategy is reference debt, not the target generic paging contract.

### Row axis / unit behavior

18. Row membership is composed from stock unit, default purchase unit, default sales unit, stored conversions and locally added units, minus locally removed units.
19. The stock unit is always present, has conversion factor `1`, is read-only and cannot be removed.
20. Non-stock rows expose an editable positive conversion factor.
21. A user can add a unit by Link search and can remove a non-stock unit.
22. Newly added units are visually marked.
23. Removing a unit also clears default purchase/sales unit references when those defaults point to the removed unit.
24. Existing active prices for a removed unit are disabled by the current client save flow.

### Column axis / Price List behavior

25. Every Price List is a matrix column.
26. The selected Price List is sorted before other columns for comparison context.
27. Column headers show label, effective date and disabled state and link to the underlying record.
28. Users can hide/show individual columns, hide all and show all.
29. Column visibility is component-local state today, not durable user preference.
30. Users can create a Price List from a dialog with name and effective date; current client creation fixes currency to VND.
31. A disabled Price List makes the numeric value editor read-only. The current checkbox interaction is ambiguous and is **not** a parity requirement; target capability should be server-derived.

### Cell behavior

32. Cells are keyed by row member plus Price List.
33. Existing sparse records hydrate value, enabled state and OCC/version data.
34. Missing intersections exist as disabled/empty client cells and become authoritative records only when enabled and saved.
35. Each cell has an enabled checkbox plus Currency editor.
36. Enabled cells require a finite non-negative price.
37. Missing enabled cells are created; existing changed cells are updated.
38. Existing disabled records can be re-enabled and updated rather than duplicated.
39. Individual document writes carry `modified`/version tokens for OCC.
40. Currency displayed by this specimen is VND/`đ`; generic renderer must receive editor/currency semantics from metadata/projection rather than hard-code this.

### Save, feedback and failure behavior

41. Save validates all enabled price drafts before sending writes.
42. Save validates all non-stock conversion factors as finite values greater than zero.
43. Save shows a busy spinner and success/error toasts.
44. The current implementation performs Item update, affected Item Price disables and changed Item Price create/update calls sequentially from React.
45. Therefore the current compound save can partially succeed before a later request fails; this is architectural debt and must not be preserved as a generic contract.
46. Errors are surfaced as a mapped toast, not structured per-cell conflict state.
47. The specialist panel has no dedicated dirty count/indicator and no before-unload guard.
48. The specialist panel has no dedicated keyboard cell-navigation model.

### Responsive / layout behavior

49. Desktop uses a resizable split with navigator left and matrix right.
50. The navigator can collapse to a narrow restore rail.
51. Focus mode hides the navigator and gives the matrix full width.
52. Matrix header and first two row-axis columns are sticky.
53. Mobile uses an explicit two-step flow: navigator -> matrix, with a back action to the navigator.
54. Tablet currently follows the non-mobile split path; target runtime may improve tablet behavior but cannot lose access to the same actions/data.
55. Loading and fatal read error states are explicit.
56. When no item is selected, the matrix shows an instructional empty state.
57. When all Price List columns are hidden, the matrix shows an explicit recovery hint.

## 3. Reference dataset

The JSON fixture intentionally combines a small human-readable business specimen with a deterministic synthetic tail:

- 4 columns, including an effective-dated disabled column;
- a multi-level navigator with Vietnamese labels and a `Dịch vụ` root;
- multiple stock/default unit patterns;
- one selected item with three configured rows and two conversion factors;
- sparse existing cells;
- explicit create/update/remove/disabled/conflict scenarios;
- a deterministic 405-item tail with anchors at 200/201 and 400/401 so paging assumptions are testable without committing hundreds of repetitive rows.

The large-catalog contract is **reachability**, not "always fetch exactly three pages". A future source can use cursor search, bounded server projection or another declared mechanism if `REF-405` remains reachable without N x M requests.

## 4. Generic semantic mapping required from convergence

The renderer-facing semantics are business-neutral:

| Concern | Required semantic |
| --- | --- |
| Surface | `matrix` |
| Read | one named, permission-aware bounded source |
| Navigator | optional hierarchy with key/label/parent/search |
| Row axis | key/label/primary marker + auxiliary editable fields |
| Column axis | key/label/subtitle/disabled + create/visibility capabilities |
| Sparse cell | row key + column key + value + enabled + version |
| Writes | named compound commit/action capability |
| Row membership | named add/remove capabilities, primary member protected |
| Interaction | sticky axes, column visibility, focus, dirty guard, conflict state |
| Responsive | desktop/tablet split policy + deterministic mobile step policy |
| Data | bounded read, sparse cells, no per-cell fetch |

The fixture binds abstract refs such as `matrix.read` and `matrix.commit` to illustrative pricing-domain names only in the **app-side binding section**. Shared Matrix code must not branch on those names.

## 5. Parity acceptance table

Status vocabulary:

- `LOCKED`: current behavior is fully specified by exact source + fixture.
- `TARGET`: required from convergence but cannot be proven on UI04 alone.
- `IMPROVE`: current specimen has debt; convergence must improve rather than preserve the defect.

| Capability | Desktop | Tablet | Mobile | Status | Evidence required at convergence |
| --- | --- | --- | --- | --- | --- |
| hierarchical navigator | split tree | split tree | first step | LOCKED | browser assertions against fixture |
| separate column/node search | yes | yes | yes | LOCKED | accent-insensitive `nhom -> Nhôm` case |
| selected column context | selected-first | selected-first | preserved across step | LOCKED | column-order assertion |
| selected item context | visible | visible | preserved across step | LOCKED | item header + row set assertion |
| primary row marker | visible | visible | visible | LOCKED | `CAY` primary fixture case |
| edit conversion | yes | yes | yes | LOCKED | positive-factor edit case |
| add/remove non-primary row | yes | yes | yes | LOCKED | add `BO`, remove `KG` cases |
| reject primary row removal | implicit UI guard | implicit UI guard | implicit UI guard | LOCKED | capability/disabled action assertion |
| sparse cell create | yes | yes | yes | LOCKED | `MET x PL-RETAIL-2026-08` create case |
| existing cell update + OCC | yes | yes | yes | LOCKED | `CELL-001` with version token |
| disabled column semantics | value read-only | value read-only | value read-only | IMPROVE | server-derived capability; no ambiguous enable toggle |
| create column | dialog | dialog | reachable | LOCKED | create action and post-create selection |
| hide/show columns | yes | yes | yes | LOCKED | hide-all + recovery + show-all |
| sticky axes | yes | yes | applicable | LOCKED | screenshot/browser geometry assertion |
| collapsible navigator | yes | yes | replaced by steps | LOCKED | collapse/restore assertion |
| focus/full width | yes | yes | matrix step is full | LOCKED | focus action assertion |
| dirty indicator | absent | absent | absent | IMPROVE | visible dirty state from generic runtime |
| unsaved-change guard | absent | absent | absent | IMPROVE | navigation/unload guard test |
| structured conflict feedback | toast only | toast only | toast only | IMPROVE | stale-version case preserves draft and locates conflict |
| keyboard matrix navigation | absent | absent | absent | IMPROVE | UI02 keyboard/a11y evidence |
| large catalog reachability | fixed 3 pages | fixed 3 pages | fixed 3 pages | IMPROVE | `REF-405` reachable through declared bounded source |
| no N x M network reads | yes | yes | yes | LOCKED | request-count/adapter assertion |
| compound atomic/explicit partial failure | no | no | no | IMPROVE | UI03 domain action regression |

## 6. Current debt that MUST NOT become generic metadata

Do not encode these implementation accidents into UI01 or UI02 merely to reach visual parity:

1. hard-coded `Item Price` special-case routing;
2. three fixed Item page requests;
3. VND creation rule inside a shared renderer;
4. direct React updates across parent conversion rows and price documents;
5. disabling affected records from client orchestration;
6. document-name knowledge in generic Matrix code;
7. silent/ambiguous disabled-column checkbox behavior;
8. lack of dirty/conflict/keyboard semantics.

## 7. Dependency Requests

### DR-UI04-01 -> UI01 / META

- **Need:** canonical first-class Matrix metadata and manifest/compiler transport that can express every field in `genericMatrixMapping` semantically.
- **Why generic:** navigator + row/column axes + sparse cells + action refs are reusable outside pricing.
- **Blocked scope:** installing real Alumdoor `viewPolicy.matrix` metadata.
- **Can continue independently:** yes; fixture/mapping/parity are complete without choosing UI01's field names.

### DR-UI04-02 -> UI02 / RUNTIME

- **Need:** business-neutral Matrix renderer with split/mobile-step composition, sticky axes, row auxiliary editors, sparse cell toggle/value editor, column visibility, focus mode, dirty guard and structured conflict state.
- **Why generic:** all behavior is expressed by the semantic mapping and has second-reference value.
- **Blocked scope:** browser parity on the future generic renderer.
- **Can continue independently:** yes.

### DR-UI04-03 -> UI03 / PRICING

- **Need:** permission-aware bounded read projection and server-authoritative compound commit/create-column/row-member capabilities with OCC/idempotency and explicit atomic/partial-failure semantics.
- **Why generic/domain-owned:** pricing correctness belongs to pricing authority, not the Alumdoor client.
- **Blocked scope:** removing current direct multi-document React mutation.
- **Can continue independently:** yes.

### DR-UI04-04 -> UI05 / QA

- **Need:** convergence E2E/performance evidence and second-reference leakage proof before declaring Matrix generic.
- **Why:** one Alumdoor specimen is insufficient to prove a platform primitive.
- **Blocked scope:** final special-case removal gate only.
- **Can continue independently:** yes.

## 8. Exact removal gate for the current special case

The following code in `BulkGridContainer.tsx` must remain until convergence owns its removal:

```ts
if (props.doctype === "Item Price") {
  return <div className="h-full min-h-0 p-2"><ItemPriceMatrixPanel ... /></div>;
}
```

It may be deleted only when **all** items below have evidence on the same integration head:

1. `viewPolicy.matrix` or its final canonical equivalent is typed, validated and transported through app install/manifest without app literals in generic schema code.
2. Alumdoor metadata selects the generic Matrix surface without a `doctype === ...` route.
3. Generic renderer source contains no pricing, Alumdoor, Item Price, Price List or UOM conditionals/literals used for behavior selection.
4. Pricing read source returns navigator/axes/sparse cells in bounded calls and does not require one network request per cell.
5. Pricing compound commit is server-authoritative and has tests for permission, trusted tenant, validation, stale OCC, retry/idempotency, create/update/disable/remove and failure semantics.
6. Fixture scenarios `accent-insensitive-search`, `selected-column-first`, `update-existing-cell`, `create-missing-cell`, `remove-non-primary-row`, `reject-primary-row-removal`, `add-row-and-cell`, `disabled-column-readonly`, `large-catalog-last-page`, `mobile-step-flow` and `conflict-feedback` pass.
7. Desktop `1440x1000`, tablet `834x1112` and mobile `390x844` browser evidence shows no material workflow regression.
8. Dirty state and unsaved-change protection are present even though the old specialist panel lacked them.
9. Stale-version/conflict evidence preserves the operator's draft and points to the affected state instead of only emitting a generic toast.
10. Typecheck/build + targeted Matrix/runtime/pricing tests pass on the exact integration head.
11. QA proves at least one non-pricing Matrix reference can map without a renderer fork before the primitive is advertised as generic.
12. The removal diff deletes the special-case route rather than moving the same business conditional elsewhere.

If any item is missing, keep the existing path as a compatibility fallback. A duplicate renderer is ugly; silent pricing regression is uglier and has invoices attached to it.

## 9. UI04 maturity

- Reference behavior specification: **RC** once fixture selfcheck passes.
- Alumdoor canonical Matrix metadata wiring: **BLOCKED by UI01**.
- Generic runtime parity: **BLOCKED by UI02**.
- Server-authoritative pricing Matrix action: **BLOCKED by UI03**.
- Whole convergence/removal: **not yet RC** until UI05/integration evidence exists.
