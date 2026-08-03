# Forge UI V3 Shell — Release Evidence

Date: 2026-08-04
Owner: V3-02 SHELL
Execution branch: `ui/v3-02-shell-exec-20260804`
Pull request: #466

## Delivered

- Decomposed the former monolithic `AppShell.tsx` into a thin public contract plus `ShellV3Chrome.tsx`.
- Added App Rail for product/workspace modules and Context Navigation for the currently selected module.
- Preserved the existing manifest/runtime as navigation and permission authority; the shell only re-presents allowed entries.
- Added contextual navigation search, group reveal, pinning and collapse.
- Added command/header chrome with breadcrumb collapse, global search fallback, AI entry, notifications, fullscreen and account controls.
- Added centralized presentation preferences for light/dark/system, mixed/sidebar/header, compact/standard/comfortable, breadcrumb/workspace-tab visibility and reduced motion.
- Added responsive mobile navigation with the shared Radix Sheet primitive and a skip-to-content path.
- Added presentation-only workspace route tabs with open history, close, pin, refresh intent, close-others, close-right, reorder and maximize.
- Added an external `WorkspaceTab` contract so router/view owners can later supply record identity, authoritative dirty state and richer restoration without creating a second document store in the shell.
- Removed the legacy static module-shortcut tab strip from `WorkspaceAppShell`; module selection now belongs to App Rail and current module screens belong to Context Navigation.
- Opted the production runtime consumer into `@metaforge/ui/v3.css`, while preserving app-boundary Alumdoor brand overrides.
- Updated the mobile/a11y regression guard to follow the decomposed V3 shell and shared Sheet focus/Escape authority.

## Port / Adapt / Reject

| Reference capability | Decision | Forge implementation |
|---|---|---|
| App Rail | ADAPT | Existing manifest modules rendered by React shell |
| Context Sidebar | ADAPT | Existing allowed module items; searchable/pinnable/collapsible |
| Command header / global search | ADAPT | Existing app search remains authoritative; shell has navigation fallback |
| Workspace tabs | ADAPT | Route-key presentation state by default; richer app-owned contract available |
| Preferences center | ADAPT | Local presentation preferences only |
| Notifications / profile | PORT + ADAPT | Existing callbacks and session semantics retained |
| Mobile drawer | REPLACE_WITH_FORGE | Shared React/Radix `Sheet`, not copied Vue runtime |
| Vue/Vben runtime | REJECT_WITH_REASON | UX reference only; Forge remains React/Tailwind/shadcn |
| Client permission authority | REJECT_WITH_REASON | Server/manifest/runtime remain authoritative |
| Second router/document store | REJECT_WITH_REASON | Shell stores route-key presentation history only |

## Validation evidence

Final validation is executed on the GitHub pull-request merge result against current `main`, so it consumes V3-01 foundation and concurrent RC changes rather than validating an obsolete branch snapshot.

Required V3-02 gates:

- `pnpm --filter @metaforge/shell run typecheck`
- `pnpm --filter @metaforge/shell run build`
- `pnpm --filter runtime... run build`
- `node client/scripts/check-app-shell-mobile.mjs`
- workspace-navigation selfcheck

The prior merge-result validation run `30840297436` / job `91775425358` passed shell typecheck, shell build, mobile/a11y regression and workspace-navigation selfcheck before the final runtime V3 stylesheet opt-in. The final PR run after this evidence file is the release gate for merge.

## Inherited baseline debt

The repository-wide baseline currently contains issues outside V3-02 ownership:

- `client/packages/builder/src/formula/formula-rule.ts:68` has TS2322 (`number` returned from a `void` path).
- Native UI lint reports pre-existing violations in Builder/Views/Matrix files outside the shell workstream.
- Client selfchecks transitively hit the same Builder typecheck debt.

The focused shell/runtime gates remain authoritative for this UI-only workstream. These baseline failures are recorded, not hidden or reclassified as V3-02 defects.

## Dependency Request — DR-V3-02-01

**Need:** record-level tab identity, authoritative dirty state, and per-record scroll/view restoration.

**Owner:** router/view/runtime workstream (V3-04 or the current app runtime owner).

**Why not implemented in shell:** the current shell/navigation contract exposes route/menu keys but does not expose authoritative document identity or dirty truth. Inventing that state in the shell would create a competing router/document authority.

**Non-blocking seam delivered:** `WorkspaceTab` plus optional lifecycle callbacks let the owning runtime supply record/dirty/restoration behavior later. The default shell remains conservative route-key presentation state.

## Authority boundary

No backend, schema, migration, auth/session semantic, permission authority, business rule, shared list/form renderer, or server contract is changed by V3-02.
