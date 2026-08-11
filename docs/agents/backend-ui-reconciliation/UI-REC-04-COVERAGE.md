# UI-REC-04 — PROJECT-WIDE COVERAGE SWEEP

Branch: `agent/ui-rec-04-project-coverage-20260811`
Fork point: `program/backend-ui-reconciliation-20260811@c4209b8318ac36110ca84094d905ce724ffae3d5`
Status: READY_FOR_ROUTING
Risk: audit/docs by default; implementation risk follows the owner-correct fix if later assigned.

## Result

Substantive audit completed in `PROJECT_UI_COVERAGE_SUMMARY.md`.

Key routed findings:

- P0 Procurement Source-to-Pay operator navigation gap;
- P1 first-party validation/pack coverage fragmentation;
- P1 server/client Experience allowlist drift filtering `daily-ledger` and `alumdoor-operations` from navigation;
- P1 Manufacturing/QMS execution reachability contract;
- P1 HRM Salary Component reachability proof request;
- P2 business-identity / vertical Experience leakage in the generic runtime;
- Dependency Requests recorded for UI-REC-01, Procurement/domain UI, shared runtime, UI-REC-05, Manufacturing/QMS and Grid.

No runtime, schema, migration, Grid, domain hotspot, merge or production mutation was performed by REC-04.

## Mission

Sweep all first-party apps/domains using the UI-REC-01 surface matrix, identify remaining projection gaps outside the initial AlumDoor fixes, and route each gap to the correct platform/domain/vertical owner without duplicating primitives.

## Read first

1. exact branch/main state;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` and capability map/status;
5. `docs/agents/backend-ui-reconciliation/PROGRAM.md`;
6. UI-REC-01 matrix/summary when available;
7. Grid program status for child-table dependency.

## Scope

At minimum sweep:

```text
CRM / Sales
Procurement
Inventory / WMS
Manufacturing / QMS
Finance / VN Accounting
HRM
Attendance / Payroll
Projects / Service
AlumDoor
other installed first-party apps discovered on exact source
```

## Deliverables

1. `PROJECT_UI_COVERAGE_SUMMARY.md` grouped by domain/app.
2. Prioritized P0/P1/P2 backlog with exact capability/DocType/surface and evidence.
3. Duplicate-primitive / legacy-special-case inventory.
4. Dependency Requests assigned to platform/domain/vertical owners.
5. Recommendation for which patterns should be lifted into shared metadata/runtime primitives.

## Rules

- do not implement every Missing capability merely to improve a score;
- prioritize real operator/release flows and authority correctness;
- if two apps need the same primitive, prefer shared platform/domain ownership;
- vertical apps consume generic authorities rather than copying them;
- historical branches are evidence only, not implementation baselines;
- source/config presence does not prove runtime usability or production state.

## Gap categories

Use the canonical classification from `PROGRAM.md` and record severity/evidence. Pay special attention to:

- backend masters with no maintenance surface;
- actions/workflows with no operator path;
- report/query capability without discoverable entry;
- stale/dead metadata after newer backend contracts;
- cross-app inconsistencies in the same generic DocType;
- business-specific branching still living in generic runtime;
- missing correction/cancel/report surfaces on transaction flows.

## Default ownership behavior

This branch is an auditor/router. Do not edit NAV/FORMS/GRID/domain hotspots by default. Record a Dependency Request and continue the independent sweep.

## Acceptance

- every first-party app discovered in scope is classified;
- P0/P1 gaps have concrete evidence and an owner;
- duplicate shared primitives are identified rather than copied;
- backlog is actionable and bounded;
- no production mutation and no unauthorized merge.

## Startup prompt

`Đọc docs/agents/backend-ui-reconciliation/UI-REC-04-COVERAGE.md, PROGRAM.md, North Star và Forge Enterprise Completion Skill. Dùng exact source + UI-REC-01 matrix để sweep toàn bộ first-party apps, phân loại projection/nav/form/action/report gaps, ưu tiên P0/P1, phát hiện duplicate primitive/legacy special case và route bằng Dependency Request. Mặc định không sửa hotspot của owner khác. Không merge/deploy.`
