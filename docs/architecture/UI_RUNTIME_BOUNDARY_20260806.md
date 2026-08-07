# UI Runtime Boundary — superseded 2026-08-08

Status: **GENERIC RUNTIME ONLY**. This document supersedes the hybrid workbench decision made on 2026-08-06.

## Decision

Forge UI no longer permits app/vertical-specific React workbenches to be registered inside the shared runtime.

```text
App manifest / DocType / screen / action metadata
  -> navigation, labels, visibility, composition and declared operator surfaces

Generic runtime
  -> shell, routing, list/tree, document CRUD, context, screen/action/report/dashboard primitives

Named server/domain capabilities
  -> authoritative calculation, permission, lifecycle, workflow and compound writes
```

There is no app-owned React experience registry in the operating architecture.

## Rules

1. **Declaration first.** App and vertical UI is expressed through installed manifest, DocType metadata, screen/action declarations and bounded presentation contracts.
2. **Generic document CRUD remains.** The form renderer is an internal generic document primitive used by create/edit/detail flows. It is not a standalone app view and must not contain vertical business knowledge.
3. **No standalone Grid/Bulk mode.** A DocType workspace has one canonical list/tree -> document -> context path. Spreadsheet/child-table interaction may exist as a bounded generic control inside a declared operation; it is not a competing global view mode.
4. **No runtime app dispatch.** Shared runtime code must not import or branch to `Alumdoor*`, Approval Inbox, Social Commerce, Daily Ledger or another app-specific React workbench.
5. **Generic screen/action primitives are allowed.** `screen:*` and `action:*` remain metadata-native because their structure and server binding are declared in the app package and rendered by shared components.
6. **No UI business authority.** Pricing formulas, stock reservation/valuation, accounting posting, payroll/statutory logic, approvals and compound writes remain named server/domain capabilities with server-side permission enforcement.
7. **No hidden fallback.** Removing a bespoke workbench means deleting its route/registration/entrypoint instead of retaining a silent fallback that can be re-enabled accidentally.
8. **App chrome is declarative.** Branding/navigation differences come from manifest/design metadata, not `if (appId === ...)` branches in shared TypeScript.
9. **Shared metadata vocabulary stays bounded.** Add shared contract only when a valid reusable UI requirement cannot be expressed with the current grammar. Do not turn metadata into an arbitrary business-logic DSL.
10. **Release discipline still applies.** A shared runtime or metadata contract change creates a new candidate and must receive the evidence required by the active phase before deployment/relock.

## Removed legacy pattern

The following pattern is no longer architectural authority:

```text
manifest experience key
  -> experience-registry.tsx
  -> app-specific React workbench
```

Legacy source references that cannot yet be physically removed must be inert, excluded from navigation/compilation, and tracked as cleanup debt. They never justify restoring runtime dispatch.

## Guardrail

Architecture tests must fail when shared runtime reintroduces:

- direct `./experiences/*` imports;
- vertical/application names in runtime dispatch;
- a standalone Bulk/Grid DocType mode;
- app-specific DocType override routing;
- app-id-specific chrome branches.

This boundary aligns Forge with the North Star: app creation should primarily be metadata + domain rules + integrations, without forking the runtime.
