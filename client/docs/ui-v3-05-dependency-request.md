# UI V3-05 Dependency Request

Date: 2026-08-04
Status: BLOCKED ONLY ON LOCKFILE GENERATION + EXECUTABLE VALIDATION

## Dependency

V3-05 introduces two new client workspace packages and one new external runtime dependency:

- `@metaforge/charts` -> `echarts@6.1.0`;
- `@metaforge/visual`;
- `@metaforge/views` consumes both packages and removes direct Recharts ownership from the migrated chart surfaces.

Forge production deploy installs with `pnpm install --frozen-lockfile`. The current root/client lockfiles predate these workspace importers and ECharts. Merging without regenerated lockfiles would knowingly create a frozen-lock install failure.

## Required runner capability

Use a runner/workstation with normal package-registry access and the repository checkout. No production secret or backend access is required.

Run from repository root:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --no-frozen-lockfile
pnpm --dir client install --no-frozen-lockfile
pnpm --filter @metaforge/charts run test
pnpm --filter @metaforge/visual run typecheck
pnpm --filter @metaforge/views run typecheck
pnpm --dir client run lint
pnpm --filter runtime... run build
git add pnpm-lock.yaml client/pnpm-lock.yaml
```

Expected generated dependency changes are limited to the root/client pnpm lockfiles plus any deterministic pnpm normalization caused by the current workspace manifests.

## Evidence required before merge

- root `pnpm-lock.yaml` matches current workspace manifests;
- `client/pnpm-lock.yaml` matches current client workspace manifests;
- `@metaforge/charts` model tests pass;
- `@metaforge/visual` typecheck passes;
- `@metaforge/views` typecheck passes;
- client structural lint passes;
- runtime dependency-graph production build passes on the exact delivery head.

## Why this cannot be completed by the current execution path

- the GitHub connector can write repository files but does not expose a workflow-dispatch action;
- a validation workflow added only on the feature branch cannot serve as `pull_request` validation because GitHub loads that workflow definition from the base/default branch;
- the available code execution container cannot resolve the repository/npm network path needed to fetch ECharts;
- GitHub content writes require complete-file replacement, so hand-editing a ~large generated pnpm lockfile would be unsafe and non-deterministic.

## Isolation

This dependency does not block further UI code audit. It blocks only the final clean replay, exact-head green validation, merge and automatic UI deploy.

No backend/schema/business contract change is requested. If the only alternative is adding/merging repository-level CI or lock-refresh infrastructure into `main`, that is outside UI-only scope and must be treated as a separate non-UI merge decision.
