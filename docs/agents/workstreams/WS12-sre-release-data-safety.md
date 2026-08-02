# WS12 — SRE / Release / Backup / Data Safety

Status: **CLAIMED**  
Owner: **ChatGPT-WS12**  
Branch: `agent/ent-12-sre-release-data-safety`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `6aae16ea994e2884fb0b5627d83f6a6bb090f0db`  
Synced current main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` via PR `#303`; workstream sync merge `a42a529394593d5adcc84cd1369ccb42e0169460`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Làm production boring stuff đủ chắc: observability, release/rollback, backup/PITR/DR, migration verification, queue recovery, integrity checks, performance/load/cost và Cloudflare operational limits.

## Own

release/deploy scripts/workflows, health/release evidence, backup/restore/PITR/DR, migration runner safety, logs/metrics/traces/alerts, queue monitoring/recovery, rate limiting/abuse operational layer, load/perf/cost evidence.

## Phase A audit

Audit exact current release pipeline, worktree/migration behavior, backup evidence, restore path, release marker, observability blind spots, D1/DO/Queue/R2 operational limits and cost. Main có thể tiến nhanh bởi ops/deploy-evidence commits, nên phải phân biệt source change với operational evidence. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit plan

1. Map `O01-001` → `O01-021` against exact source, workflows, scripts, migrations, tests and production evidence.
2. Trace release path end-to-end: build → backup → migration → Worker/App/Gateway deploy → convergence proof → rollback boundary.
3. Prove whether backup is restorable, not merely creatable; document RPO/RTO assumptions and failure modes.
4. Audit structured logs/metrics/correlation/alerts, queue retry/DLQ recovery, integrity/reconciliation jobs and Cloudflare operational limits.
5. Audit substantive legacy PR `#199` as WS12 secondary owner and record disposition.
6. Implement the highest-value independent WS12 slice without crossing WS00/WS10/WS11/WS13 ownership; open dependency requests instead of patching foreign hotspots.

## Phase B priority

Restore proof -> migration safety/rollback strategy -> release convergence -> observability -> queue recovery -> load/perf/cost budgets -> DR rehearsal.

## Dependencies

WS00 architecture, WS11 security/secrets, WS10 queue/integration contracts, WS13 migration tooling.

## Guard

Không mutate production/customer data hay secret/DNS nếu user chưa cho phép rõ. Evidence phải phân biệt tested/local/staging/production.

## First commit / handoff

Claim owner/head; cuối nhánh ghi failure modes, RTO/RPO assumptions, scripts/tests, release/restore evidence, cost/perf numbers, legacy PR disposition, blockers, PR.
