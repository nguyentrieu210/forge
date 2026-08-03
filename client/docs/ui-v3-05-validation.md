# UI V3-05 validation evidence

Date: 2026-08-04
Source delivery SHA: `040d65b49f397d44b59e211d879d4efdc3b868fc`
Validation run: `30843088702`
Runner: GitHub Actions / Node 22 / pnpm 9.15.0
Temporary validation base: `tmp/ui-v3-05-validation-base-20260804`

Passed on the exact delivery source head after deterministic lock generation and migration of the stale dashboard Recharts selfcheck to the Forge chart-surface contract:

- root workspace dependency resolution;
- nested client workspace dependency resolution;
- root frozen-lock install replay;
- client frozen-lock install replay;
- `@metaforge/charts` build + chart-model tests;
- `@metaforge/visual` typecheck;
- `@metaforge/views` typecheck;
- complete client workspace typecheck;
- client selfchecks;
- runtime dependency-graph production build.

Repository native UI lint observation: `failure`.
This observation is recorded separately because current main already carries known cross-workstream native-UI lint debt; V3-05 does not suppress that debt.

Generated dependency outputs:

- `client/pnpm-lock.yaml` and the updated dashboard selfcheck are committed to the delivery branch;
- root `pnpm-lock.yaml` is committed separately on `deps/ui-v3-05-root-lock-20260804` so the production UI-only deploy guard is not bypassed.

No backend, schema, migration, permission, tenant or business-authority mutation was performed by this validation lane.
