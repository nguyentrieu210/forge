# UI Runtime Boundary — 2026-08-06

Status: implementation boundary for `arch/ui-runtime-boundary-20260806`.

Exact base: `main@b8f0851d2833d1ecb4a07ded30ede08685d2e728`.

## Decision

Forge UI uses a hybrid boundary rather than attempting to describe every operational screen through metadata.

```text
App manifest / metadata
  -> navigation, route, label, icon, visibility, generic CRUD composition

Generic runtime
  -> shell, routing, CRUD, generic screen/action/report/dashboard primitives

Experience registry
  -> maps a declared experience capability/prefix to an app-owned React workbench

App/vertical React workbench
  -> operator interaction and orchestration for complex business jobs

Named server/domain capabilities
  -> authoritative calculation, permission, lifecycle and compound writes
```

## Rules

1. Ordinary CRUD remains metadata-driven through canonical DocType metadata and `DoctypeWorkspace`.
2. Small declared commands may use generic `ActionScreen`; composable read/operate surfaces may use generic `ScreenView`.
3. A complex operator workbench may be React code. Metadata only needs to declare that the route exists and which registered experience it resolves to.
4. `main-base.tsx` must not directly import vertical/application experience implementations or branch on vertical experience names.
5. App-specific experience composition belongs in `experience-registry.tsx` for this phase. A later package/plugin split may move registrations out of the runtime bundle without changing the resolver contract.
6. Business formulas, stock valuation, finance posting, payroll/statutory logic and compound mutations remain server/domain authority.
7. Navigation authority convergence is a separate slice: this change does not remove existing shell/system navigation entries because doing that is user-visible behavior and should be proven independently.

## Concurrency boundary

Open PR `#743` currently owns:

- `client/apps/runtime/src/experiences/AlumdoorOperationsCenter.ts`
- `client/apps/runtime/src/experiences/AlumdoorSalesPolicyBridge.ts`
- `server/apps-src/alumdoor-worker/src/sales-wizard-context.ts`

This branch does not modify those paths. The registry references the existing `AlumdoorOperationsCenter` public module only, so #743 can merge/rebase independently.

Open PR `#749` is an operator E2E harness and changes only test/workflow/seeding paths. It has no direct source-file collision with this slice; after either branch changes visible routing/labels, exact-head operator evidence must be rerun.

## Follow-up dependency request

After #743 is resolved, rebase this branch (or its successor) on exact `main` and evaluate whether the temporary sales policy bridge is still required. Do not silently rewrite #743-owned logic from this architecture slice.
