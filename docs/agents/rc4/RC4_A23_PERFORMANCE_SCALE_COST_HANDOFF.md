# RC4-A23 — Performance / Scale / Cost

Status: **READY**  
Branch: `agent/rc4-23-performance-scale-cost`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD/CRITICAL depending on provider operation**

## Mission

Measure release-confidence under realistic scale and Cloudflare operational limits without turning load tooling into a production risk.

## Own

- bounded performance/load tests;
- p50/p95/p99/error-rate/RPS evidence;
- large-data query/list/report behavior;
- Workers/D1/Queues/KV/R2 cost and limit envelope;
- performance regression thresholds and cost-risk findings.

## Safety

- localhost/non-production by default;
- remote tests require explicit safe target and hard caps;
- no destructive stress against production;
- no provider resource mutation merely to improve evidence.

## Priority

1. document/list/report large-data paths;
2. batch/import/reconciliation workloads;
3. queue/backlog behavior;
4. D1 read/write/query envelope;
5. browser/mobile performance evidence with A6;
6. cost projection by tenant/load tier.

## Output

PR with reproducible perf tooling/evidence and Dependency Requests. Provider/production execution remains an explicit gate.

## Completion

A23 residual implementation is complete to PR gate:

- performance-regression evaluator + CLI over existing `forge-http-load-smoke/v1` evidence;
- bounded local SQLite benchmark for document list, ledger/report, reconciliation, queue backlog and batch upsert;
- Cloudflare Workers / Workers for Platforms / D1 / Queues / KV / R2 cost projection with current source lock and R2 billing-unit rounding;
- 100k-row local evidence committed under `docs/agents/rc4/evidence/`;
- targeted Node validation **8/8 PASS**;
- Dependency Requests recorded for A6/WS14 browser evidence, WS12 non-production provider evidence and product pricing assumptions.

Canonical evidence: `docs/agents/rc4/RC4_A23_PERFORMANCE_SCALE_COST_EVIDENCE.md`.

No capability maturity promotion is claimed. `O01-018` and `O01-019` remain **Wired** until representative provider/browser evidence exists. No production/provider mutation, merge or deploy was performed.
