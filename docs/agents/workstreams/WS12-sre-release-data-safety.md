# WS12 — SRE / Release / Backup / Data Safety

Status: **READY**  
Owner: **—**  
Branch: `agent/ent-12-sre-release-data-safety`  
Base: `b15378be7c036204f92a6e4c289038aa84d6f286`

## Mission

Làm production boring stuff đủ chắc: observability, release/rollback, backup/PITR/DR, migration verification, queue recovery, integrity checks, performance/load/cost và Cloudflare operational limits.

## Own

release/deploy scripts/workflows, health/release evidence, backup/restore/PITR/DR, migration runner safety, logs/metrics/traces/alerts, queue monitoring/recovery, rate limiting/abuse operational layer, load/perf/cost evidence.

## Phase A audit

Audit exact current release pipeline (đang có ALU full-sync failures), worktree/migration behavior, backup evidence, restore path, release marker, observability blind spots, D1/DO/Queue/R2 operational limits and cost.

## Phase B priority

Restore proof -> migration safety/rollback strategy -> release convergence -> observability -> queue recovery -> load/perf/cost budgets -> DR rehearsal.

## Dependencies

WS00 architecture, WS11 security/secrets, WS10 queue/integration contracts, WS13 migration tooling.

## Guard

Không mutate production/customer data hay secret/DNS nếu user chưa cho phép rõ. Evidence phải phân biệt tested/local/staging/production.

## First commit / handoff

Claim owner/head; cuối nhánh ghi failure modes, RTO/RPO assumptions, scripts/tests, release/restore evidence, cost/perf numbers, blockers, PR.