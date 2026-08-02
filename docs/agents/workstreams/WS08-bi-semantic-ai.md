# WS08 — BI Semantic Layer + Planning + AI Data

Status: **CLAIMED**  
Owner: **ChatGPT-WS08**  
Branch: `agent/ent-08-bi-semantic-ai`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Xây lớp metric/semantic/query có quyền làm nguồn tin cậy cho dashboard, planning và AI. AI không được tự đoán raw schema rồi tuyên bố doanh thu như một nhà tiên tri bảng tính.

## Own

semantic metric definitions, dimensions/measures, permission-aware query, KPI/dashboard/pivot/report planning, drilldown, scheduled report contracts, forecast/scenario planning, data feed/warehouse seam, AI query/data context/tool proposal layer.

## Phase A audit

Audit report/query packages, current dashboards/charts, AI ask implementation/context, permission propagation, cross-module metric duplication, large-data limits. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit plan

1. Map `A01-*` and relevant `A02-*` capability IDs to exact code/tests/evidence.
2. Inspect query/report packages, Frappe report APIs, dashboard/chart metadata and current client rendering seams.
3. Trace permission and tenant propagation from trusted request context into report/query execution.
4. Trace current AI ask/context/tool path and identify any raw-schema or authority bypass risk.
5. Audit legacy PR `#199` and other BI/AI/report PRs against current main.
6. Propose thin implementation slices and dependency requests without modifying WS00/WS09/WS11/WS14 hotspots.

## Phase B priority

1. semantic metric contract;
2. permission-aware query execution;
3. trusted cross-domain KPI/report definitions;
4. planning/forecast seam;
5. AI -> semantic -> permission -> tool/action path;
6. anomaly/recommendation only after trusted data contract.

## Dependencies

WS00 query/contracts, WS11 permission/security, WS09 report/dashboard builders, domain agents for authoritative metric definitions, WS14 presentation.

## Guard

AI không authoritative-write ledger/statutory records; action phải preview/validate/approve qua deterministic tools.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability IDs, semantic schema, permission model, query performance evidence, AI boundaries, tests, legacy PR disposition, dependency requests, PR.
