# WS08 — BI Semantic Layer + Planning + AI Data

Status: **REVIEW**  
Owner: **ChatGPT-WS08**  
Branch: `agent/ent-08-bi-semantic-ai`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `191e1c9de156898ea397c21b9bae5196b5b35b2a`  
Implementation head before handoff: `af23ad045475a135d3d3cfdaef6e9525650b03b2`  
PR: **#311** — `feat(semantic): add permission-aware BI semantic query foundation` (Draft)  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Xây lớp metric/semantic/query có quyền làm nguồn tin cậy cho dashboard, planning và AI. AI không được tự đoán raw schema rồi tuyên bố doanh thu như một nhà tiên tri bảng tính.

## Own

semantic metric definitions, dimensions/measures, permission-aware query, KPI/dashboard/pivot/report planning, drilldown, scheduled report contracts, forecast/scenario planning, data feed/warehouse seam, AI query/data context/tool proposal layer.

## Phase A audit

Audit report/query packages, current dashboards/charts, AI ask implementation/context, permission propagation, cross-module metric duplication, large-data limits. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit result — 2026-08-03

- Exact branch was reset onto `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`; only the WS08 handoff file was branch-owned before claim.
- `server/packages/query/src/index.ts` already has tenant-bound report compilation, server-owned SQL/view definitions, field/filter/order allowlists and prepared-report budgeting. This is report infrastructure, not yet a reusable semantic metric layer.
- App reports are constrained to one tenant + one manifest-owned DocType and parameterized values. Current aggregate implementation uses `CAST(... AS REAL)` for `sum/avg`, so it cannot be the authoritative money/decimal semantic contract.
- `server/packages/frappe-api/src/router.ts` asserts `action: "report"` on app-report DocTypes and applies user-permission filters before `AppReportService.run`; this permission seam should be reused rather than duplicated by WS08.
- `client/packages/views/src/report/ReportView.tsx` is presentational and already supports locale formatting, sorting, pinning and Excel/CSV export. Shared renderer ownership remains WS14; WS08 did not edit it.
- `server/apps/tenant-worker/src/ai-assistant.ts` is read-only, context-bounded and audit-logs successful answers. It does not yet provide natural-language semantic query; AI currently receives client-supplied visible context only.
- Legacy PR `#199` remains owned by WS01/WS00/WS14 surfaces. WS08 disposition: **REUSE as dependency/evidence only**, no code cherry-pick into WS08. Daily Ledger semantic definitions must consume the authoritative ledger contract after its owner resolves the PR.
- No other open substantive PR found whose primary implementation should be adopted as canonical WS08 semantic/AI work.

## Capability maturity after Slice 1

- `A01-001` Metric definition: **Foundation** — reusable declarative metric contract exists on WS08 branch; not yet wired to production API/model catalog.
- `A01-002` Dimension definition: **Foundation** — reusable declarative dimension contract exists; not yet wired.
- `A01-003` Measure definition: **Foundation** — aggregation/value kind/scale/unit/exactness contract exists; executable verification still pending.
- `A01-004` Permission-aware semantic query: **Foundation** — compiler + mandatory access-controller boundary exist; existing WS11 permission service adapter/API wiring still pending.
- `A01-005..020`: mixed Missing/Foundation; unchanged by this slice.
- `A02-004..006`, `A02-012..024`: **Missing/Foundation**; current AI remains context assistant, not semantic query/tool execution.
- `A02-025` AI audit log: **Wired** for current assistant answer path only; unchanged by this slice.

## Slice 1 implementation

Changed zones:
- `server/packages/semantic/src/index.ts`
- `server/packages/semantic/src/service.ts`
- `server/tests/semantic-layer.test.mjs`
- `server/tests/semantic-service.test.mjs`
- this workstream handoff only

Contract:
1. Model definitions declare trusted source, grain, dimensions, metrics, value semantics and required `report` permission.
2. Query callers select only semantic IDs; they cannot supply raw table/view/SQL expressions.
3. Tenant is always the first trusted scope in generated SQL. DocType sources additionally bind one declared DocType and exclude cancelled documents.
4. Filters and ordering are allowlisted by semantic member; values are parameters, not SQL fragments.
5. Exact scaled-integer money/quantity sums stay integer; no binary `REAL` coercion. Exact scaled `AVG` fails closed until a ratio contract is designed.
6. AI/report catalog omits physical view/table/tenant/field names and exposes only business semantics.
7. `D1SemanticQueryService` requires a `SemanticAccessController` and awaits authorization before any D1 `prepare`; WS08 does not create a second RBAC engine.
8. Slice is lockfile-neutral: semantic sources compile under existing `server/tsconfig.json` `packages/**/*.ts`; no new workspace manifest/importer, migration or dependency.

## Verification evidence

Added regressions:
- `server/tests/semantic-layer.test.mjs`: tenant scope, SQL parameterization, declared-member/filter/order guards, exact scaled aggregation, AI-safe catalog, DocType source guard, invalid model rejection.
- `server/tests/semantic-service.test.mjs`: authorize-before-D1 and denied-access fail-closed behavior.

Exact GitHub structural evidence before handoff:
- branch `ahead 9 / behind 0` versus `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`;
- diff contains 5 files only: workstream + 2 semantic sources + 2 tests;
- no router/IAM/document-kernel/app-registry/frontend/migration/lockfile changes.

Executable evidence status:
- **NOT RUN / NOT CLAIMED**: exact `npm run build` and Node regressions, because this connector session has no repository checkout/dependency tree and shell checkout cannot resolve `github.com`.
- PR therefore remains **Draft**. Do not promote maturity above Foundation from source inspection alone.

## Risk

**STANDARD with security/data-contract sensitivity.** No authoritative write, ledger posting, migration or production mutation is introduced. Permission and exact numeric semantics are fail-closed boundaries and must be executable-tested before wiring/merge.

## Dependencies

WS00 query/contracts, WS11 permission/security, WS09 report/dashboard builders, domain agents for authoritative metric definitions, WS14 presentation.

## Dependency requests

None blocking Slice 1.

Next wiring requires:
- WS11: adapt existing `MetadataPermissionService.assert(... action: "report")` into `SemanticAccessController`, without changing IAM semantics.
- Domain owners: publish authoritative metric source/grain definitions before WS08 registers finance/stock/payroll/sales metrics.
- WS01/WS00: resolve canonical Daily Detailed Ledger contract/PR #199 before WS08 creates its trusted ledger semantic model.

## AI boundary

AI remains non-authoritative. Future path must be:
`user intent -> semantic catalog/query -> existing permission service -> deterministic data result -> answer/proposal -> preview/approval for any write-capable action`.

AI must not receive raw schema as a substitute for semantic definitions and must not write ledger/statutory records directly.

## Known gaps / next slices

1. Run exact server build + the two targeted regressions on a real checkout.
2. Wire semantic service into an API method through existing server permission context after executable contract verification.
3. Register first trusted cross-domain semantic models only with domain-owner source/grain agreement; Daily Ledger waits on WS01/WS00 canonical resolution.
4. Add query cost/prepared-report/performance budgeting to semantic execution.
5. Add forecast/scenario planning contracts after trusted actual metrics exist.
6. Only then add AI natural-language semantic query and tool proposals.

## Handoff

Workstream: WS08  
Branch: `agent/ent-08-bi-semantic-ai`  
Status: REVIEW  
PR: #311 Draft  
Capabilities: `A01-001`, `A01-002`, `A01-003`, `A01-004`; audit evidence for `A02-025`  
Migration: none  
Dependency requests: none blocking; wiring dependencies documented above  
Legacy PR: #199 REUSE as dependency/evidence only  
Merge/deploy: **NO** — backend contract; explicit user approval + executable validation required.
