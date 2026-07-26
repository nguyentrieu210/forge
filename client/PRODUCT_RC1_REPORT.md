# MetaForge 1.0.0-rc.1 — Product hardening report

## Release decision

**Source release candidate: PASS. Live production deployment: pending site acceptance.**

The seven P1 blockers identified in the Goal100 review are closed in source. This report deliberately does not claim that the target Frappe site has been deployed or live-verified.

## Closed blockers

1. **Role-aware Business Context** — app dimensions are a maximum; the backend intersects them with effective Frappe access and User Permissions. Company/Fiscal Year/Warehouse are no longer forced solely because a template listed them.
2. **Contextual data scope** — List and count use server endpoints that apply company/date/branch and resolve warehouses found in parent or child-table fields.
3. **KPI/Process parity** — operator filters such as `between`, `not in`, and `>=` survive URL routing and are included in both list and count queries.
4. **Process definitions** — stages use distinct DocTypes/state filters. Unknown modules return an explicit unsupported state; they never show Stock data as fallback.
5. **Permission Center** — effective analysis uses the selected user. System Managers can manage native User Permission rows, direct roles, or native Role Profiles, with self-lockout/Administrator safeguards.
6. **Workspace/catalog completeness** — item-level permission filtering is applied and all native workspace artifact groups are surfaced. Unsupported custom blocks fail visibly.
7. **Link/display consistency** — Link filters are autocomplete controls, Table MultiSelect rejects arbitrary IDs, and reports resolve Link titles.

## Offline verification completed

- Python orchestration compile: PASS.
- TypeScript syntax scan: 169 files, 0 parse failures.
- Strict targeted builds: `@metaforge/core`, `@metaforge/adapter-frappe`, `create-metaforge-app`: PASS using offline dependencies.
- Views structural typecheck with external UI primitives stubbed: PASS.
- Product static integration gates: 17/17 PASS.
- Backend process/endpoint contract gate: PASS for 13 endpoints, 11 Overview domains and 11 Process domains.
- Native UI gate: PASS.
- Secret scan: 0 findings.

## Not verified in this environment

- `pnpm install --frozen-lockfile` because the npm registry is unavailable.
- Full `pnpm typecheck`, `pnpm build`, Playwright E2E and a real browser session against the target Frappe site.
- Live performance of very large warehouse child-table scopes.
- Real Role Profile/User Permission mutation and permission trace parity on the target site's exact ERPNext customizations.

These items are mandatory before changing the release from RC to production.

## Final offline rerun — 2026-07-25

The release source was rechecked immediately before packaging:

- Python `api.py` compile: PASS.
- TypeScript/TSX parser: 169 files, 0 syntax diagnostics.
- Targeted TypeScript project builds: core, adapter-frappe and create-metaforge-app PASS.
- Product integration gate: 17/17 PASS.
- Backend contract gate: 13 endpoints, 11 Overview domains, 11 Process domains PASS.
- Native UI gate: 0 violations.
- Secret scan: 0 findings.

The distributed archive is source-only: no `node_modules`, stale `dist`, `*.tsbuildinfo`, Python bytecode or browser-test output.
