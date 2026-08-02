# WS14 — MetaForge Frontend Runtime / Mobile / Offline / A11y

Status: **CLAIMED**  
Owner: **gpt-ws14**  
Branch: `agent/ent-14-frontend-runtime-mobile`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes, including UI fixes merged after the seed baseline. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Harden shared MetaForge runtime thay vì mỗi domain tự làm UI: form/list/report/action/workspace consistency, mobile/offline, accessibility, performance, shared controls và UX architecture.

## Own

`client/apps/runtime/**`, shared `client/packages/core|ui|controls|views|shell/**` architecture, routing/renderers, generic forms/lists/tables/actions, PWA/mobile/offline contracts, accessibility/performance/design-system primitives.

## Audit plan

1. Audit exact runtime/router/fallback renderers and metadata resolver on current main.
2. Audit form/list/child-grid dirty/save/close semantics, table/mobile ergonomics and shared shell navigation.
3. Audit PWA/offline feasibility, a11y primitives and bundle/performance hotspots.
4. Audit substantive legacy PRs touching shared frontend and classify `reuse / cherry-pick / superseded / reject`.
5. Map findings to capability IDs/maturity and implement the highest-value independent UI slice that does not cross WS00/WS09/WS11 ownership.
6. Verify targeted frontend tests/build plus visual/browser evidence where available.

## Phase A audit

Audit fallback pages/renderers, metadata resolver, form/list/child-grid, dirty/save/close semantics, mobile nav, large tables, bundle/perf, accessibility, offline feasibility, collaboration surfaces and app-specific leakage into shared runtime. Audit substantive legacy/UI PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

## Phase B priority

Eliminate critical fallback -> renderer consistency -> mobile/table ergonomics -> offline queue/sync contract where justified -> accessibility -> performance/bundle -> visual system hardening.

## Dependencies

WS00 API/contracts, WS09 builders/metadata, WS11 permission/auth, domain agents as consumers. Domain agents request shared renderer change here instead of each patching core.

## Guard

UI state không trở thành source of truth cho permission/business rules. Không hard-code Alumdoor/domain schema vào generic runtime.

## Legacy PR disposition

- Pending exact diff audit: #269, #267, #216, #208 and any other substantive frontend/runtime PR discovered in GitHub.

## First commit / handoff

Claim owner/head; cuối nhánh ghi affected shared APIs, screenshots/E2E, a11y/perf evidence, backward compatibility, legacy PR disposition, dependency requests, PR.
