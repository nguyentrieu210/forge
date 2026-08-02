# WS08 — BI Semantic Layer + Planning + AI Data

Status: **ACTIVE**  
Owner: **ChatGPT-WS08**  
Branch: `agent/ent-08-bi-semantic-ai`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `191e1c9de156898ea397c21b9bae5196b5b35b2a`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Xây lớp metric/semantic/query có quyền làm nguồn tin cậy cho dashboard, planning và AI. AI không được tự đoán raw schema rồi tuyên bố doanh thu như một nhà tiên tri bảng tính.

## Own

semantic metric definitions, dimensions/measures, permission-aware query, KPI/dashboard/pivot/report planning, drilldown, scheduled report contracts, forecast/scenario planning, data feed/warehouse seam, AI query/data context/tool proposal layer.

## Phase A audit

Audit report/query packages, current dashboards/charts, AI ask implementation/context, permission propagation, cross-module metric duplication, large-data limits. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit result — 2026-08-03

- Exact branch was rebased by ref reset onto `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`; only the WS08 handoff file was branch-owned before claim.
- `server/packages/query/src/index.ts` already has tenant-bound report compilation, server-owned SQL/view definitions, field/filter/order allowlists and prepared-report budgeting. This is report infrastructure, not yet a reusable semantic metric layer.
- App reports are constrained to one tenant + one manifest-owned DocType and parameterized values. Current aggregate implementation uses `CAST(... AS REAL)` for `sum/avg`, so it cannot be the authoritative money/decimal semantic contract.
- `server/packages/frappe-api/src/router.ts` asserts `action: "report"` on app-report DocTypes and applies user-permission filters before `AppReportService.run`; this permission seam should be reused rather than duplicated by WS08.
- `client/packages/views/src/report/ReportView.tsx` is presentational and already supports locale formatting, sorting, pinning and Excel/CSV export. Shared renderer ownership remains WS14; WS08 will not edit it for the semantic slice.
- `server/apps/tenant-worker/src/ai-assistant.ts` is read-only, context-bounded and audit-logs successful answers. It does not yet provide natural-language semantic query; AI currently receives client-supplied visible context only.
- `A01-001..004` are the immediate foundation target. Existing report UI/export features provide partial evidence for `A01-008`, `A01-015`; they do not by themselves make the semantic layer Wired.
- Legacy PR `#199` remains owned by WS01/WS00/WS14 surfaces. WS08 disposition: **REUSE as dependency/evidence only**, no code cherry-pick into WS08. Daily Ledger semantic definitions must consume the authoritative ledger contract after its owner resolves the PR.

### Current maturity

- `A01-001` Metric definition: **Missing** as reusable platform contract.
- `A01-002` Dimension definition: **Missing** as reusable platform contract.
- `A01-003` Measure definition: **Foundation** only inside report-specific column/aggregate metadata.
- `A01-004` Permission-aware semantic query: **Foundation** via report permission + tenant/user filters, but no semantic model compiler yet.
- `A01-005..020`: mixed Missing/Foundation; do not promote without capability-specific evidence.
- `A02-004..006`, `A02-012..024`: **Missing/Foundation**; current AI is context assistant, not semantic query/tool execution.
- `A02-025` AI audit log: **Wired** for current assistant answer path only.

### Slice 1

Implement a server-only semantic model/query contract under WS08 ownership:
1. no raw SQL expressions in model definitions;
2. explicit source/grain/dimension/metric/value-scale metadata;
3. exact tenant binding and allowlisted dimension/metric/filter/order compilation;
4. permission requirement carried as part of the compiled contract for the existing server permission service to enforce;
5. scaled-integer money/quantity semantics must not be coerced through binary `REAL` aggregation;
6. no WS00/WS09/WS11/WS14 hotspot changes in this slice.

## Phase B priority

1. semantic metric contract;
2. permission-aware query execution;
3. trusted cross-domain KPI/report definitions;
4. planning/forecast seam;
5. AI -> semantic -> permission -> tool/action path;
6. anomaly/recommendation only after trusted data contract.

## Dependencies

WS00 query/contracts, WS11 permission/security, WS09 report/dashboard builders, domain agents for authoritative metric definitions, WS14 presentation.

## Dependency requests

None blocking Slice 1. Wiring semantic execution into the Frappe API must reuse WS11 permission service and will be proposed after the model/compiler contract is verified.

## Guard

AI không authoritative-write ledger/statutory records; action phải preview/validate/approve qua deterministic tools.

## Handoff checklist

Cuối nhánh ghi capability IDs, semantic schema, permission model, query performance evidence, AI boundaries, tests, legacy PR disposition, dependency requests, PR/head SHA.
