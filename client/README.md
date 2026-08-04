# Forge Client Runtime

`client/` contains the shared React runtime, design system, views, builder and app surfaces used by Forge.

The existing `@metaforge/*`, `create-metaforge-app` and Frappe adapter names are **technical package/compatibility namespaces retained for source compatibility**. They are not a separate current product brand. Product-facing copy uses **Forge** unless a vertical app has its own identity.

Naming policy: `../docs/BRAND_AND_NAMING.md`.

## Architecture

```text
packages/
  core/                 @metaforge/core
  adapter-frappe/       @metaforge/adapter-frappe
  ui/                   @metaforge/ui
  controls/             @metaforge/controls
  views/                @metaforge/views
  builder/              @metaforge/builder
  shell/                @metaforge/shell
  create-metaforge-app/ create-metaforge-app
apps/
  runtime/              shared Forge runtime/PWA
  demo/                 test/demo surface
  hrm/                  HRM surface
  ...                   additional app/vertical surfaces
frappe-app/metaforge/   compatibility/orchestration app for Frappe-backed usage
```

The shared runtime is metadata/manifest-driven. Vertical apps should compose it rather than fork the engine.

## Current product context

The client is one layer of the Forge enterprise operating platform.

Current repository state:

- R5 integrated client/runtime productization: complete;
- R6 exact-release certification: `PILOT-GO` for the frozen Alumdoor candidate;
- Pilot-00: locked;
- Pilot-01: preview/control-plane ready, waiting for approved real source data.

Do not use old client RC labels or historical standalone MetaForge reports to infer current Forge release state. Use `../CURRENT_STATUS.md`.

## Key invariants

- server-side permission/tenant enforcement is authoritative;
- client permission is UX only;
- shared runtime should not hard-code vertical business schema where metadata can express it;
- Frappe-shaped adapter is a compatibility boundary, not the product identity;
- production/browser claims must bind to exact release evidence;
- app/vertical code should reuse shared controls/views/shell rather than copy engine source.

## Toolchain

- Node 20+ / repository-pinned workflow versions where applicable;
- pnpm workspace;
- TypeScript + React + Vite;
- Playwright for browser/E2E paths.

Typical local commands:

```bash
corepack enable
pnpm install
pnpm -r run typecheck
pnpm -r run build
```

Use focused tests/workflows for the touched package/app. Do not infer a repository-wide PASS from one package build.

## Documentation

Current authority:

- `../CURRENT_STATUS.md`
- `../PROJECT_CONTEXT.md`
- `../docs/ARCHITECTURE.md`
- `../docs/BRAND_AND_NAMING.md`
- `../docs/FORGE_ENTERPRISE_NORTH_STAR.md`

Client-local design/technical docs may remain as implementation/history references, but stale release/status reports do not override repository authority.

## Compatibility note

Frappe/ERPNext remains a useful compatibility and ERP-depth benchmark. The Forge client can speak Frappe-shaped APIs where required, while current Forge deployments use the repository's own server/runtime authorities.
