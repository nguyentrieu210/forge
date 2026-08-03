# MetaForge UI Matrix — Wave A Convergence

Date: 2026-08-03
Branch: `converge/ui-matrix-v3`
Baseline at final replay: `main@1cb8881849f60933ac8d847d01c11df938681092`
Scope: UI00–UI05 Matrix/UI Factory Wave A convergence

## Executive result

The parallel UI Factory agents have been reconciled into one clean convergence tree based on exact current main rather than by blindly merging stale branch histories.

Integrated outcomes:

- UI01 / META: first-class canonical `viewPolicy.matrix`, server/client mirror types, fail-closed validation, and brief/compiler transport;
- UI02 / RUNTIME: business-neutral Matrix renderer/view-model with sparse cells, navigator, auxiliary row fields, responsive/mobile behavior, keyboard/a11y, sticky axes and virtualization seams;
- UI03 / PRICING: server-authoritative Item Price Matrix read/commit boundary with trusted tenant context, permissions, OCC, idempotency and fixed-point UOM/price semantics;
- UI04 / ALUMDOOR: already merged to main through PR #384 and inherited by this branch; it supplies the reference behavior inventory, parity fixture/checklist and removal gate;
- UI05 / QA: selectively adopted domain-leak and second-reference gates plus semantic fixtures, avoiding the stale `client/package.json` conflict from the QA branch.

This is a real Wave A convergence, but it is deliberately **not** described as a completed Item Price migration or Matrix RC. The generic source/action transport is still a dependency before the Alumdoor price screen can move off its compatibility path.

## Convergence decisions

### KEEP

- UI01 canonical Matrix types, validation and parser/manifest transport.
- UI02 generic renderer family and runtime harness.
- UI03 pricing authority boundary and targeted regression.
- UI04 reference/parity artifacts already on main.
- UI05 architectural leak gate and second-reference fixtures.

### EXTRACT GENERIC

UI01 originally carried its own `compile-app-brief.mjs` wrapper. Current main now has the richer WS09 canonical compiler `compile-brief-app-factory.mjs` with AppAction input-table and business-context support.

Convergence resolution:

- keep WS09 `compile-brief-app-factory.mjs` as the single canonical compiler;
- attach Bulk/Matrix policies as its final post-stage through `attachBriefUiViewPolicies`;
- combine AppAction input-table compatibility, business-context validation and UI view-policy compatibility in the existing brief schema validator;
- retarget UI01 regression to the canonical App Factory compiler;
- delete the superseded UI01 compiler wrapper/declaration.

This prevents a second App Factory compiler from surviving convergence.

### SUPERSEDED

- stale `converge/ui-matrix-v1` / `v2` integration attempts;
- UI01 standalone brief compiler wrapper;
- wholesale UI05 branch merge, because only its QA fixtures/gates are needed and its old package-script delta conflicted with newer main.

### REJECT

- blind merge of stale workstream snapshots;
- pricing-specific cases in shared Matrix React code;
- direct document mutations from the generic Matrix renderer;
- claiming the old Item Price compatibility route can be removed before its parity/removal gate passes.

## Canonical architecture after this convergence

```text
viewPolicy.matrix metadata
        ↓
Matrix validation / App Factory transport
        ↓
generic Matrix semantic view-model
        ↓
shared Matrix renderer
        ↓
named read source / named action contract
        ↓
domain authority (pricing is first reference)
        ↓
Document kernel / permission / OCC / idempotency
```

The first four layers and the pricing domain boundary now exist in the same convergence tree. The generic named-source/action binding between runtime/API composition and domain services remains the next shared seam.

## UI01 evidence

Integrated Matrix contract covers:

- `doctype | projection` read source;
- explicit read/write permission boundary;
- navigator, row axis and column axis;
- sparse cell identity/value/editor/enabled/version semantics;
- row auxiliary fields;
- named action writes/member actions;
- safe generic document-update restriction;
- bounded query/search policy;
- desktop/mobile presentation hints;
- dirty/conflict policy.

The parser fails closed on malformed/unsafe combinations and preserves Bulk compatibility.

The current WS09 App Factory compiler remains authoritative. Matrix/Bulk authoring is attached to it rather than implemented through a parallel compiler.

## UI02 evidence

Integrated shared runtime provides:

- optional hierarchical navigator;
- independent axis search;
- row/column axes and sparse cells;
- existing ControlRegistry reuse for editors;
- enabled/toggle cell state;
- auxiliary row fields;
- generic row/column actions;
- hide/show columns;
- sticky headers/row axis;
- focus mode;
- dirty/loading/error/conflict states;
- keyboard cell navigation and accessible focus semantics;
- desktop/tablet/mobile composition;
- row virtualization and bounded column-window seams;
- no pricing/Alumdoor business literals in generic Matrix implementation.

UI02 agent evidence reported targeted model tests and isolated structural/type checks passing. Full repository/browser validation is not newly claimed by this convergence session because there is no local checkout runner in the connector environment.

## UI03 evidence

Pricing Matrix authority exposes named contracts:

- `pricing.item_price_matrix.read`;
- `pricing.item_price_matrix.commit`;
- `pricing.price_list.create`.

The domain boundary includes:

- trusted tenant and actor context;
- permission-aware read/mutation ports;
- bounded/searchable navigation and sparse cells;
- Item/Item Price OCC versions;
- fixed-point UOM conversion and currency precision;
- stock-UOM protection;
- safe UOM removal/default cleanup;
- disabled Price List guard;
- duplicate active price-cell fail-closed behavior;
- SHA-256 idempotency identities;
- explicit retryable partial-failure semantics without pretending cross-document atomicity exists.

UI03 agent evidence reported isolated strict TypeScript PASS and 14/14 targeted pricing authority tests PASS.

## UI04 reference gate

UI04 reference artifacts are already on canonical main via PR #384 and therefore are inherited by this branch.

The reference protects the successful Alumdoor Price Manager workflow including:

- Price List → Item Group → Item navigation;
- dual search scopes;
- UOM rows and conversion-factor editing;
- Price List columns/effective-date/status;
- cell enable/disable and rate editing;
- add/remove UOM;
- create Price List;
- hide/show columns;
- focus mode;
- sticky axes;
- desktop split and mobile step flows;
- dirty/conflict/error behavior;
- large catalog completeness/paging assumptions.

The existing `if (props.doctype === "Item Price")` compatibility path is intentionally retained until the generic binding + parity + failure-path gate passes.

## UI05 adopted QA gates

The convergence tree now wires into normal client verification:

- `check-matrix-domain-leaks.mjs` in client lint;
- `check-matrix-second-references.mjs` in client test;
- `qa/matrix/second-reference-fixtures.json`.

The second-reference fixture ladder contains:

1. Supplier × Item — ready for integration;
2. Item × Warehouse/Reorder — ready for integration;
3. Item Group × Account — critical reference candidate;
4. User × Role — explicitly deferred until WS11 security review.

The fixtures require sparse behavior, explicit domain/security write authority and zero renderer business-name conditionals.

## Dependency Request — DR-MATRIX-01

Owner: shared platform/API composition boundary, coordinated with WS00/WS09/WS14; pricing supplies the first domain handler.

Need: a generic registered named-source/named-action adapter that resolves Matrix metadata references to permission-aware domain handlers and routes mutations through the canonical Document kernel.

Why: UI01 defines the safe generic reference contract, UI02 invokes supplied capabilities/actions, and UI03 owns pricing semantics. The repo still lacks the shared binding that connects these layers without adding pricing-specific cases to generic router/runtime code.

Blocked scope:

- live generic Matrix loading from `viewPolicy.matrix`;
- live generic action invocation from Matrix runtime;
- Alumdoor metadata switch from compatibility Item Price route to the generic Matrix renderer;
- deletion of `if (props.doctype === "Item Price")`;
- executable second-reference proof through the same binding.

Can continue independently: yes. The converged Wave A foundations are safe to land as non-default capability seams while the existing Item Price screen remains authoritative for users.

## Maturity after convergence

| Area | Maturity | Reason |
| --- | --- | --- |
| Matrix metadata contract | Wired | typed, validated, transported through canonical App Factory path |
| Generic Matrix renderer | Wired | reusable renderer/view-model exists with runtime behavior seams |
| Pricing Matrix authority | Foundation/Wired boundary | domain service and regressions exist; generic transport binding is missing |
| Alumdoor reference specification | RC-quality reference | parity/removal gate is explicit and already merged |
| Matrix QA framework | Wired | architecture/second-reference checks are wired into client verification |
| Integrated live Matrix capability | Foundation | named source/action bridge and live metadata-to-runtime wiring remain |

Do not promote the overall Matrix capability to RC from this merge alone.

## Merge/deploy boundary

This convergence contains shared metadata/compiler/runtime and server business behavior, so it is **not UI-only**.

User explicitly requested the agent results be converged/merged in the current task. That authorizes the final source merge after exact-main/mergeability checks.

No production deploy, migration, secret/DNS change or customer-data mutation is part of this convergence.
