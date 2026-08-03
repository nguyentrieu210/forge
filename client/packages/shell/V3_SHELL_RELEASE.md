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

Final validation ran on GitHub pull-request merge ref `b7ef58aca7ea1a870c47ddc3f1f4d1c6ea514431`, which merged V3-02 head `18848ff024a728578db32b8e8b2e972572c802c2` into then-current `main` `bbf79b541ede38222544774ec8b5393f8e1bb1fe`.

Run `30840838170`, job `91777246716`:

- PASS — `pnpm --filter @metaforge/shell run typecheck`
- PASS — `pnpm --filter @metaforge/shell run build`
- PASS — `pnpm --filter runtime... run build`
- PASS — `node client/scripts/check-app-shell-mobile.mjs`
- PASS — workspace-navigation selfcheck
- PASS — repository client typecheck on the converged merge result
- PASS — client selfchecks (`89` selfcheck groups plus linked form/bulk/workspace/matrix checks)

The runtime production build compiled the V3 stylesheet consumer successfully. The only build notes were the existing missing local `VITE_FORGE_RELEASE_SHA` warning outside deployment and Rollup chunk-size advisory; the production deploy workflow supplies the release SHA.

## Remaining repository-wide native UI lint debt

`check-native-ui.mjs` still reports `32` violations across `10` files on the converged main merge result. None are in the V3-02 files `AppShell.tsx`, `ShellV3Chrome.tsx`, `WorkspaceAppShell.tsx`, or `workspace-tab-state.ts`.

The reported debt belongs to Builder, V3-03 auth presentation, Views and Matrix surfaces. It is preserved as cross-workstream evidence rather than being suppressed or silently claimed as V3-02 work.

## Dependency Request — DR-V3-02-01

**Need:** record-level tab identity, authoritative dirty state, and per-record scroll/view restoration.

**Owner:** router/view/runtime workstream (V3-04 or the current app runtime owner).

**Why not implemented in shell:** the current shell/navigation contract exposes route/menu keys but does not expose authoritative document identity or dirty truth. Inventing that state in the shell would create a competing router/document authority.

**Non-blocking seam delivered:** `WorkspaceTab` plus optional lifecycle callbacks let the owning runtime supply record/dirty/restoration behavior later. The default shell remains conservative route-key presentation state.

## Authority boundary

No backend, schema, migration, auth/session semantic, permission authority, business rule, shared list/form renderer, or server contract is changed by V3-02.
