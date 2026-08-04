# RC4-A23 — Performance / Scale / Cost Evidence

Date: 2026-08-04  
Agent: `RC4-A23`  
Branch: `agent/rc4-23-performance-scale-cost`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD with CRITICAL provider/production boundary**  
Status: **READY TO PR — no merge/deploy/provider mutation**

## 1. Outcome

A23 does not rebuild WS12's existing bounded HTTP load smoke. The residual work completed here adds:

1. deterministic performance-regression evaluation over `forge-http-load-smoke/v1` evidence;
2. bounded local large-data query-shape evidence for document list, ledger/report, reconciliation, queue backlog and batch paths;
3. source-locked Cloudflare Workers / Workers for Platforms / D1 / Queues / KV / R2 engineering cost projection;
4. explicit dependency requests for browser/mobile and live provider evidence.

No production endpoint was load-tested. No D1 replica, Queue, Worker, WAF, DNS, secret, billing resource or customer data was mutated.

## 2. Existing authority preserved

Existing WS12 authority remains canonical:

- `server/scripts/http-load-smoke.mjs` owns bounded HTTP GET/HEAD load generation;
- `server/scripts/lib/load-smoke.mjs` owns p50/p95/p99/error-rate/RPS summarization;
- `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md` remains the operational limits document;
- `O01-018 Performance test` and `O01-019 Load test` remain **Wired**, not RC/Hardened.

A23 adds evidence/gates around these seams rather than creating a second load-test authority.

## 3. Added tooling

### 3.1 Performance regression gate

Files:

- `server/scripts/lib/perf-regression.mjs`
- `server/scripts/perf-regression.mjs`
- `server/config/performance-regression-policy.json`
- `server/tests/perf-regression.test.mjs`

Supported gates:

- absolute p95/p99/error-rate/min-RPS when a path has an approved engineering budget;
- p95/p99 regression percentage against a baseline;
- error-rate delta;
- RPS drop percentage.

Default regression policy in this branch:

- p95 regression <= 15%;
- p99 regression <= 20%;
- error-rate increase <= 0.005;
- RPS drop <= 15%.

These are **engineering regression defaults**, not customer SLA/SLO commitments.

Example:

```bash
node server/scripts/perf-regression.mjs \
  --current evidence/current.json \
  --baseline evidence/baseline.json \
  --policy server/config/performance-regression-policy.json
```

The evaluator fails closed on unsupported evidence formats.

### 3.2 Bounded large-data benchmark

File: `server/scripts/sqlite-large-data-benchmark.py`.

Safety envelope:

- local temporary SQLite only;
- no network/provider target;
- row count bounded to 10,000..1,000,000;
- iterations bounded to 5..200;
- database is temporary and removed after execution.

The synthetic schema intentionally mirrors Forge physical/query shapes rather than claiming to reproduce D1 latency.

Reproduce the committed 100k class:

```bash
python3 server/scripts/sqlite-large-data-benchmark.py \
  --rows 100000 \
  --iterations 20 \
  --output /tmp/a23-large-data.json
```

Committed evidence: `docs/agents/rc4/evidence/a23-local-large-data-100k.json`.

### 3.3 Cloudflare cost projection

Files:

- `server/scripts/lib/cloudflare-cost.mjs`
- `server/scripts/cloudflare-cost-project.mjs`
- `server/config/cloudflare-cost-rates-20260804.json`
- `server/config/cloudflare-cost-scenarios.engineering.json`
- `server/tests/cloudflare-cost.test.mjs`

The model covers:

- Workers Standard request + CPU allowances/overage;
- Workers for Platforms base, request/CPU allowance and script overage;
- D1 rows read/written + storage;
- Queues operation units, including 64 KB message chunking and average retry/read attempts;
- KV reads/writes/deletes/lists/storage;
- R2 Standard storage/Class A/Class B and provider billing-unit round-up.

Run the checked-in scenario set:

```bash
node server/scripts/cloudflare-cost-project.mjs \
  --input server/config/cloudflare-cost-scenarios.engineering.json \
  --rates server/config/cloudflare-cost-rates-20260804.json
```

The output explicitly states that it is an engineering projection, not a customer price or provider invoice.

## 4. Local verification evidence

### 4.1 Node targeted tests

Command executed against the exact A23 tool/test contents before upload:

```bash
node --test server/tests/cloudflare-cost.test.mjs server/tests/perf-regression.test.mjs
```

Result: **8/8 PASS**.

Coverage includes:

- absolute performance budgets;
- baseline p95/p99/error/RPS regression gates;
- unsupported-evidence fail-closed behavior;
- Cloudflare allowance/overage calculation;
- Queue 64 KB chunk + retry operation derivation;
- Workers for Platforms script overage;
- R2 provider billing-unit round-up;
- negative-usage rejection.

### 4.2 Large-data 100k result

Environment:

- SQLite `3.46.1`;
- 100,000 rows per synthetic shape;
- 20 measured iterations;
- local query-shape evidence only.

| Scenario | p95 | p99 | Plan/finding |
|---|---:|---:|---|
| document list 50 | 0.105 ms | 0.137 ms | `idx_documents_tenant_doctype_modified` |
| document list + status 50 | 0.058 ms | 0.080 ms | covering index |
| ledger report 28d | 18.292 ms | 19.692 ms | indexed range + temp B-tree GROUP BY |
| payment reconciliation | 18.925 ms | 19.021 ms | indexed range + temp B-tree GROUP BY |
| queue backlog oldest | 0.009 ms | 0.011 ms | tenant/status/available index |
| batch upsert 1,000 | 2.941 ms | 2.964 ms | transaction + PK upsert |

Interpretation:

- document-list and queue-backlog query shapes use the intended index classes;
- ledger/report and reconciliation retain a temporary GROUP BY B-tree, so live D1 row-read/duration evidence is still required before any RC promotion;
- these milliseconds must **not** be compared directly to provider/global SLO values.

### 4.3 Engineering cost scenarios

The checked-in scenarios are capacity models, not Forge plans:

| Scenario | Projected monthly provider cost |
|---|---:|
| 100 tenants | $60.60 |
| 1,000 tenants | $769.38 |
| 5,000 tenants | $6,078.80 |

In the 1,000-tenant model D1 storage contributes about 68% of projected total; in the 5,000-tenant model it contributes about 62%. This is a useful design signal: large retained per-tenant D1 footprints dominate the modeled envelope more than Worker request charges.

The inputs are synthetic. They are not a forecast until measured usage telemetry supplies request CPU, D1 row counts/storage, queue retry/chunk behavior, KV operations and R2 usage.

## 5. Cloudflare source lock — checked 2026-08-04

The rates file points to current public Cloudflare documentation for:

- Workers pricing;
- Workers for Platforms pricing;
- D1 pricing;
- Queues pricing;
- Workers KV pricing;
- R2 pricing.

R2 explicitly rounds usage up to the next billing unit. A23 models this for Standard storage, Class A and Class B overage rather than using an optimistic fractional-unit estimate.

Provider prices/limits are external contracts. Re-check them before production capacity planning, customer pricing or contractual commitments.

## 6. Maturity recommendation

No maturity promotion from this branch alone.

| Capability | Before | A23 recommendation | Why |
|---|---|---|---|
| `O01-018` Performance test | Wired | **Keep Wired** | regression gate + local large-data evidence improved, but representative provider/browser evidence missing |
| `O01-019` Load test | Wired | **Keep Wired** | bounded HTTP authority already exists; no approved representative remote benchmark |
| `O01-008` Queue monitoring | Wired | **Keep Wired** | local backlog query/cost modeling is not live provider backlog/retention evidence |
| `T01-008` Usage metering | Foundation | **Keep Foundation** | cost projection consumes usage; it does not create authoritative/live metering or billing reconciliation |

No capability is marked Hardened.

## 7. Dependency Requests

### DR-A23-01 — Browser/mobile performance evidence

- Target: **A6 / WS14 frontend-runtime owner**.
- Need: current V2 desktop/tablet/Android/360px browser evidence for shell/navigation/list/large-grid behavior, including cold/warm measurements where practical.
- Contract: return exact release SHA, device/browser profile, route/scenario, p50/p95/p99 or Web Vitals-equivalent evidence and failure notes; do not invent a second frontend performance policy.
- Blocking: **no** for A23 tooling; **yes** before claiming representative browser performance RC evidence.

### DR-A23-02 — Non-production D1 / Queue provider evidence

- Target: **WS12 / provider-evidence lane**.
- Need: approved non-production D1 and Queue measurements using representative list/report/reconciliation/backlog workloads.
- Evidence: exact source SHA, environment identifier, request count/concurrency, D1 rows read/written/query duration/region where available, queue operations/backlog age/retry behavior and cost observations.
- Safety: bounded non-production only. No production stress, replica enablement, queue provisioning or provider mutation merely to satisfy A23.
- Blocking: **yes** before promoting `O01-018/019` beyond Wired on provider evidence.

### DR-A23-03 — Product pricing / tenant-tier mapping

- Target: **product/business owner** only if customer plans are to be designed from this model.
- Need: approved product assumptions for included usage, gross-margin target, overage policy, support/AI/third-party cost allocation and tax/currency treatment.
- Blocking: **no** for engineering capacity modeling; **yes** before turning the scenario names or projected infrastructure cost into customer pricing.

## 8. Verification limitations

The available execution container could not resolve `github.com`, so a full repository clone/install/build/test was not available in this session. Targeted Node and Python evidence was executed against isolated exact A23 file contents and recorded above. This limitation is explicit; it is not replaced with fabricated CI evidence.

No production/provider execution was performed.

## 9. Merge/deploy gate

This is non-UI operational/tooling work. A23 may open a PR after exact diff audit, but **must stop before merge/deploy** pending explicit approval under the Forge completion skill.
