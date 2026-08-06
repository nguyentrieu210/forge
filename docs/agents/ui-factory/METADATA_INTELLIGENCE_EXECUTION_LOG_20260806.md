# METADATA INTELLIGENCE EXECUTION LOG — 2026-08-06

Parent program: `METADATA_INTELLIGENCE_PROGRAM_20260806.md`

This file records implementation evidence only. It does not replace `CURRENT_STATUS.md`, `NEXT_TASKS.md`, release evidence, or deployed pilot identity.

---

## MDI-00 — neutral conformance fixture

Status: **DONE**

Merged in PR #741, `0d22fddbc7e286ecdf4cfe5a904c876a75fd8d8e`.

- Added `client/apps/demo/src/metadata-intelligence-selfcheck.ts`.
- Wired the fixture into the existing demo `selfcheck` command.
- Neutral fixture covers native ownership/edit semantics, defaults, reactive dependency collection, dirty preservation, set-once and immutable-after-submit behavior.
- Later phases extended the same fixture for context-link capability, AppAction canonical binding and ChildGrid DocType-name independence.

Evidence: R6 run `31074065182` PASS after fixing local-time Today/Now compatibility before merge.

## MDI-01 — existing field intelligence becomes operational

Status: **DONE**

Merged with MDI-00 in PR #741.

- Added `@metaforge/core/meta/intelligence` as the pure canonical interpretation layer.
- `resolveFieldContract()` consumes explicit `valueSource`, `editMode`, `surface`, `serverEnforced`, `dirtyGuard` first and falls back to Frappe-compatible flags.
- `resolveField()` honors canonical `hidden`, `readonly`, `set_once`, and `immutable_after_submit` semantics while preserving server permission/docstatus authority.
- Added reusable default, reactive-field, provenance and automatic-patch primitives.

## MDI-02 — defaults, Link effects and Business Context convergence

Status: **DONE**

Merged in PR #742, `73edc480d07cb1539fdec78623fdf7920179cacf`.

- New forms use canonical metadata defaults.
- Form `fetch_from` tracks automatic provenance and does not overwrite operator overrides.
- Stale async source responses are discarded.
- Child-row defaults come only from `BusinessContextPolicy` mappings.
- Table MultiSelect consumes canonical Link filters and reference context.
- Removed the generic `Price List` target-name branch: selling/buying narrowing is derived from canonical context dimensions plus target metadata capabilities.

Evidence: R6 run `31074727574` PASS.

## MDI-03 — ChildGrid convergence

Status: **DONE**

Merged in PR #746, `41a4e23fd55f5d193edc5918d5b351195d7037f8`.

- Replaced the business-aware ~1,900-line ChildGrid execution path with one metadata renderer.
- Column precedence is `viewPolicy.list.columns -> in_list_view -> safe fallback`.
- New rows use canonical metadata defaults plus policy-resolved context defaults.
- Child rows use `resolveField()` and generic chained `fetch_from` with stale-response/user-provenance protection.
- Add/delete/undo/duplicate, paste, keyboard navigation, mobile row cards, expanded grid, row detail and device-local column layout remain presentation features only.
- `ChildGridWithExtensions` no longer renders anything; it is a temporary compatibility barrel.
- Neutral regression proves exact names such as `Sales Order Item` and `Purchase Order Item` do not alter/inject columns.

Evidence: full R6 run for PR #746 PASS, including production builds, migration/PITR, lifecycle, auth/tenant, provisioning, Golden Flow, release safety, package/version authority and diff hygiene.

## MDI-04 — AppAction canonical binding

Status: **DONE**

Merged in PR #745, `4279ebf3f7b4180d2b9ce41a7ab9ae3def43e57f`.

- Added canonical action-field/table binding helpers.
- A bound row field inherits DocType fieldtype/options/required/default/fetch/dependency/edit semantics; legacy action copies are compatibility fallback, not authority.
- Removed `AUTO_FIELDS`, Item/Material Specification enrichment, aluminium calculations and business-specific clearing/width maps from `ActionChildGrid`.
- Action rows execute the same chained `fetch_from` model with stale-response and operator-provenance guards.
- Canonical defaults win over legacy action defaults.

Evidence: R6 run `31076616159` PASS after correcting a type-only import defect before merge.

## MDI-05 — Builder/App Factory authoring parity

Status: **DONE**

Merged in PR #744, `05be894a0e6e82b41249c265f8e650171d150986`.

- Added `MetadataIntelligenceEditor` to Meta Studio.
- Builder authors `valueSource`, `editMode`, `surface`, `serverEnforced`, `dirtyGuard`, `fetch_from`, `link_filters`.
- Canonical edit modes synchronize with Frappe legacy flags so round-trip metadata cannot state conflicting ownership.
- DocType Studio shows live runtime preview for the authored contract.

Evidence: R6 run `31075286034` PASS after a guarded `link_filters` type fix.

## MDI-06 — Class-C domain projection decision

Status: **DONE — NO NEW SHARED CONTRACT REQUIRED**

Decision evidence after MDI-02/03/04:

1. Form/ChildGrid/AppAction now cover Class-A/Class-B behavior with existing metadata.
2. Alumdoor multi-source pricing/ATP/formula behavior already has vertical Worker/Experience ownership (`alumdoor.sales.item_context`, production-line context, operator Experience).
3. No neutral or second-domain conformance case demonstrated a need for a generic projection DSL or a new DocField executable key.

Therefore the program deliberately **does not** add `projection_method`, arbitrary effects, client formula scripting, or another shared vocabulary. This is a successful MDI-06 outcome, not a missing implementation: the resolver doctrine says vertical-only behavior stays vertical until reuse is proven.

## MDI-07 — reference declaration migration / hardcode retirement

Status: **DONE**

- Sales/Purchase/Alumdoor schema knowledge was removed from shared ChildGrid and ActionChildGrid execution.
- Existing canonical Alumdoor metadata is now consumed directly by the generic runtime.
- Current Sales/Purchase package contracts and Golden Flow remained green after hardcode removal; therefore no speculative brief mutation was added merely to recreate renderer-owned field lists under a metadata key.
- Daily domain intelligence remains in Alumdoor Experience/Worker; generic fallback remains metadata-correct.

Exit interpretation: declaration changes are required only when a real operator flow demonstrates a missing declaration, not to preserve old renderer guesses.

## MDI-08 — hardening and architecture closure

Status: **IMPLEMENTED IN FINAL CANDIDATE**

Final candidate work:

- Removed FormView client business-total computation (`items/qty/rate/grand_total` and Sales-specific discount behavior). Generic Form no longer calculates money from schema names.
- Removed RichAction result inference that guessed DocTypes from `purchase_order` / `purchase_receipt` field names. Generic navigation now requires explicit canonical `{doctype, name}` from the Worker result.
- Added `metadata-intelligence-architecture-guard.mjs`, executed by demo selfcheck, which refuses concrete Sales/Purchase/Alumdoor schema literals in guarded shared Form/Grid/Action/service files.
- Architecture guard is intentionally static and narrow: it protects ownership boundaries without banning ordinary ERP field vocabulary everywhere.

Final exit requires the final candidate full R6 gate to PASS before merge.

---

## Program exit criteria

A metadata-intelligence program candidate is closed only when all statements below hold:

- one Form renderer;
- one executing ChildGrid renderer;
- one canonical field contract interpretation;
- Form/ChildGrid/bound AppAction share default/Link/dependency/fetch/edit semantics;
- Builder can author the intelligence runtime consumes;
- no concrete Sales/Purchase/Alumdoor schema routing in guarded generic runtime;
- no generic client authority for stock, money, ledger, payroll, legal or lifecycle rules;
- Class-C industry logic remains app/vertical unless a reusable case is proven;
- neutral conformance selfcheck passes;
- full R6 source/release-safety gate passes.

## Release boundary

This program authorizes source merges only. It does **not** authorize production deploy, pilot relock, customer/master/opening-data mutation, provider/DNS/secret mutation, cutover, or real Pilot-01 source import. Historical R6/deployed pilot identity remains distinct from the latest source candidate.
