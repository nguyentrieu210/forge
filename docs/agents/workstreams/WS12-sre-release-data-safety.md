# WS12 — SRE / Release / Backup / Data Safety

Status: **READY**  
Owner: **—**  
Branch: `agent/ent-12-sre-release-data-safety`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Làm production boring stuff đủ chắc: observability, release/rollback, backup/PITR/DR, migration verification, queue recovery, integrity checks, performance/load/cost và Cloudflare operational limits.

## Own

release/deploy scripts/workflows, health/release evidence, backup/restore/PITR/DR, migration runner safety, logs/metrics/traces/alerts, queue monitoring/recovery, rate limiting/abuse operational layer, load/perf/cost evidence.

## Phase A audit

Audit exact current release pipeline, worktree/migration behavior, backup evidence, restore path, release marker, observability blind spots, D1/DO/Queue/R2 operational limits and cost. Main có thể tiến nhanh bởi ops/deploy-evidence commits, nên phải phân biệt source change với operational evidence. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

## Phase B priority

Restore proof -> migration safety/rollback strategy -> release convergence -> observability -> queue recovery -> load/perf/cost budgets -> DR rehearsal.

## Dependencies

WS00 architecture, WS11 security/secrets, WS10 queue/integration contracts, WS13 migration tooling.

## Guard

Không mutate production/customer data hay secret/DNS nếu user chưa cho phép rõ. Evidence phải phân biệt tested/local/staging/production.

## First commit / handoff

Claim owner/head; cuối nhánh ghi failure modes, RTO/RPO assumptions, scripts/tests, release/restore evidence, cost/perf numbers, legacy PR disposition, blockers, PR.