# FORGE ENTERPRISE AGENT BOARD

> Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**  
> North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`  
> Capability truth: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`  
> RC execution: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`

Ngày sync: **2026-08-03**.

## Current board state

**WS00–WS17: PHASE CLOSED / HISTORICAL OWNERSHIP MAP.**

RC Hardening hiện là execution model canonical. Không dùng 18 historical workstream branch như 18 task đang chạy.

Wave 0 RC-01..RC-05 đã hoàn tất và hội tụ vào `main`:

| RC lane | Scope | Result |
|---|---|---|
| RC-01 | Capability Truth | DONE — 956/956 registry/evidence baseline |
| RC-02 | Release/SRE | DONE — release topology/workflow/data-safety hardening |
| RC-03 | Validation Gates | DONE — executable FAST/STANDARD/CRITICAL gates |
| RC-04 | Kernel/Auth | DONE — auth failure/retry boundaries; shared gaps recorded |
| RC-05 | IAM/Tenant/Offline contract | DONE — app lifecycle guard + offline contract freeze |

Next active program slice is Finance/Inventory authority hardening (`RC-020..025`). Exact task/branch state must be read from GitHub; this board does not hardcode an open-PR count.

`Exact GitHub state > CURRENT_STATUS/NEXT_TASKS > this ownership map > historical handoff.`

## Status vocabulary

- `IDLE`: no active RC task using that historical ownership area.
- `ACTIVE`: a current-main RC task is being implemented.
- `BLOCKED`: only the blocked dependency is waiting; independent scope continues.
- `REVIEW`: current RC PR is awaiting required review/merge gate.
- `DONE`: task/phase delivered to canonical main for its declared scope.
- `SUPERSEDED`: delivery path replaced by a newer current-main branch/PR.

## Historical WS ownership map

| ID | Historical branch | State | Primary ownership |
|---|---|---|---|
| WS00 | `agent/ent-00-architecture-kernel` | IDLE | platform architecture, contracts, kernel/data model |
| WS01 | `agent/ent-01-finance-vn` | IDLE | finance, AR/AP, treasury, VN accounting/statutory |
| WS02 | `agent/ent-02-crm-revenue` | IDLE | CRM 360, revenue ops, sales lifecycle |
| WS03 | `agent/ent-03-procurement` | IDLE | source-to-pay, supplier, RFQ, 3-way match |
| WS04 | `agent/ent-04-inventory-wms` | IDLE | inventory valuation, WMS, reconciliation |
| WS05 | `agent/ent-05-manufacturing-qms` | IDLE | MRP II, manufacturing costing, QMS |
| WS06 | `agent/ent-06-hcm-payroll` | IDLE | HCM, payroll, statutory payroll rules |
| WS07 | `agent/ent-07-project-service-field` | IDLE | project/PSA, helpdesk, field service, warranty |
| WS08 | `agent/ent-08-bi-semantic-ai` | IDLE | semantic metrics, BI, planning, permission-aware AI |
| WS09 | `agent/ent-09-bpm-app-factory` | IDLE | workflow/BPM, metadata compiler, App Factory |
| WS10 | `agent/ent-10-integration-hub` | IDLE | API/event/connectors, queues, retry/DLQ |
| WS11 | `agent/ent-11-security-iam-saas` | IDLE | auth/IAM/permission, SaaS governance |
| WS12 | `agent/ent-12-sre-release-data-safety` | IDLE | observability, backup/DR, release/migration safety |
| WS13 | `agent/ent-13-migration-implementation` | IDLE | import/migration/onboarding/reconciliation tooling |
| WS14 | `agent/ent-14-frontend-runtime-mobile` | IDLE | MetaForge runtime, mobile/offline/a11y/performance |
| WS15 | `agent/ent-15-workplace-dms-collab` | IDLE | workplace, DMS/CLM, collaboration/search/notifications |
| WS16 | `agent/ent-16-logistics-pos-commerce` | IDLE | logistics, POS, retail, omnichannel/social commerce |
| WS17 | `agent/ent-17-alumdoor-reference-vertical` | IDLE | Alumdoor reference vertical and generic extraction |

These branches are history/reference only. RC task ownership is derived from capability/domain scope on exact current main.

## RC concurrency model

- Maximum **5 worker lanes** plus one coordinator.
- Do not open a sixth worker merely because one exists in the UI.
- Shared authority freezes before upper-domain expansion.
- Finance/Inventory authority lane precedes Procurement/CRM/HCM/Manufacturing expansion where those domains depend on posting/stock semantics.
- One shared hotspot gets one active owner at a time unless the dependency can be cleanly isolated.

## Shared ownership boundaries

- `server/packages/document-kernel/**`: platform/kernel authority.
- auth/session/permission/control-plane security: IAM/security authority.
- app-registry/compiler/builder contracts: App Factory authority.
- release/deploy/backup/observability: SRE authority.
- shared React runtime/core/views/shell: frontend runtime authority.
- Finance/stock/payroll ledgers remain domain authorities; verticals do not fork them.
- migrations append-only; inspect exact main before choosing a new number.
- Alumdoor generated metadata: modify generator/source, not a one-off generated output.

## New-task rule

1. Read Skill, North Star, Capability Status and RC Hardening Plan.
2. Audit exact current main.
3. Select capability IDs and risk class.
4. Create a fresh RC branch.
5. Historical branch/PR may be used only as evidence/reuse source after exact diff.
6. Record Dependency Request for real cross-lane blockers and continue independent work.
7. Apply non-UI merge/deploy approval boundary; UI-only follows current UI policy.

## Historical references

- WS convergence: `docs/agents/WS00_17_CONVERGENCE_20260803.md`.
- Legacy PR archive: `docs/agents/LEGACY_PR_INBOX.md`.
- RC agent lane template: `docs/agents/RC_AGENT_LANES_20260803.md`.
- Current state: `CURRENT_STATUS.md`.
- Next work: `NEXT_TASKS.md`.
