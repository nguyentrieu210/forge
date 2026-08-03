# CFMAX Primitive Decision Matrix

Date: 2026-08-04
Purpose: give workers a common decision frame before implementation.

`Initial stance` is a program hypothesis, not canonical Forge maturity. Each worker must audit exact code/config/tests and map the work to canonical Forge capability IDs.

| Area | Primitive / capability | Initial stance | Why for Forge | Authority warning | Primary worker |
|---|---|---|---|---|---|
| Compute | Workers | ALREADY-CORE | HTTP/API/gateway/app compute | Do not fragment services without measurable reason | CF08 audit |
| Compute | Workers Assets | ALREADY-CORE | same-origin SPA/static delivery | API fallback/routing must remain explicit | CF08 audit |
| Multi-tenant | Workers for Platforms / dispatch namespace | ALREADY-CORE | isolated per-tenant compute and app workers | platform must own bindings/limits | CF08 + CF07 |
| Compute | Service Bindings | ALREADY-CORE | low-latency internal worker calls | internal identity still required | CF08 audit |
| Data | D1 per tenant | ALREADY-CORE | tenant isolation + horizontal scale unit | size/query/statement limits; single-DB hotspot | CF01 |
| Data | D1 Sessions | REQUIRED | sequential consistency and read replication | command reads must not use unconstrained replica | CF01 |
| Data | D1 read replication | REQUIRED-EVIDENCE | global read latency/throughput | enable only with explicit session policy | CF01 |
| Data | D1 Time Travel / PITR | ALREADY/POLICY | provider-local recovery | destructive restore needs explicit authorization | CF08 |
| Coordination | Durable Objects | ALREADY-CORE | shared invariant serialization | do not assume arbitrary awaited I/O is magically atomic | CF01 audit |
| Async | Queues | ALREADY-CORE | post-commit event delivery/fan-out | at-least-once requires idempotent consumers | CF02/CF08 audit |
| Async | DLQ | ALREADY-CORE | poison-message containment | DLQ is not a replay policy by itself | CF08 |
| Orchestration | Workflows | REQUIRED-CANDIDATE | durable multi-step provisioning/import/migration/export | orchestration is not business ledger | CF02 |
| Orchestration | Dynamic Workflows | CONDITIONAL | tenant-defined BPM/App Factory automation | requires Dynamic Worker sandbox + version policy | CF02 + CF07 |
| Routing/cache | KV routes | ALREADY-CORE | low-latency route/config lookup | stale tolerant only; never ledger/permission authority | CF01/CF08 |
| Cache | Cache API / HTTP caching | CONDITIONAL | public/static/stale-tolerant reads | avoid user/permission leakage and stale write decisions | CF01 |
| Storage | R2 files | ALREADY-CORE | attachments/blob payloads | File metadata/permission stays in Forge | CF06/CF08 |
| Storage | R2 export/archive lifecycle | RECOMMENDED | generated PDFs/exports/snapshots | retention and permission-aware facade required | CF06/CF08 |
| Telemetry | Workers observability logs/traces | ALREADY-CORE | request tracing/runtime errors | logs cannot contain secrets/sensitive payloads | CF03/CF08 |
| Telemetry | Analytics Engine | RECOMMENDED | tenant usage/cost/SRE dimensions | approximate telemetry, not canonical audit | CF03 |
| Data pipeline | Pipelines | CONDITIONAL/EXPERIMENTAL | high-volume event/telemetry -> R2 Iceberg/Parquet | open beta; not transaction path | CF07 |
| AI | Workers AI | ALREADY-PARTIAL | OCR/inference close to Workers | app-specific direct calls should converge on policy seam | CF05 |
| AI | AI Gateway | RECOMMENDED-HIGH | unified providers, spend/rate limits, logs/fallback | metadata limits; eventual consistency of spend enforcement | CF05 |
| AI | Vectorize | CONDITIONAL | semantic search/retrieval/recommendation | derived index; re-check canonical permission | CF05 |
| AI | AI Search / managed RAG | CONDITIONAL | managed knowledge retrieval | tenant freshness/deletion/source control first | CF05 |
| Rendering | Browser Run PDF | RECOMMENDED-HIGH | server-side invoice/report/PDF | SSRF/authorization/retention controls | CF06 |
| Security | WAF managed/custom rules | REQUIRED-AUDIT | reduce web/API exploit surface | perimeter != Forge authz | CF04 |
| Security | WAF rate limiting | RECOMMENDED-HIGH | login/API/expensive endpoint abuse control | client/API compatibility and plan limits | CF04 |
| Security | Turnstile | CONDITIONAL-HIGH | anonymous abuse-prone forms/login defense | accessibility/API flows; server verification required | CF04 |
| Security | Access | CONDITIONAL | staff/support/admin perimeter | not suitable as tenant ERP authorization replacement | CF04 |
| Security | Access service tokens | CONDITIONAL | machine-to-machine admin/internal perimeter | secret lifecycle/revocation required | CF04 |
| Security | mTLS | CONDITIONAL | high-assurance machine integrations | certificate lifecycle operational cost | CF04 |
| Extensibility | Dynamic Workers | CONDITIONAL-HIGH | tenant/AI generated code sandbox | strict bindings/network/resource policy | CF07 |
| Heavy runtime | Containers/Sandbox | CONDITIONAL | Python/DuckDB/heavy transforms/code interpreter | ordinary ERP API stays on Workers | CF07 |
| External DB | Hyperdrive | CONDITIONAL | MISA/legacy/Odoo/custom Postgres/MySQL adapters | external DB does not become Forge authority by accident | CF07 |
| Deployment | compatibility date/flags discipline | REQUIRED | predictable Worker runtime behavior | coordinated rollout/testing before date bumps | CF08 |
| Resource governance | config/source inventory | REQUIRED | detect drift between Git and Cloudflare resources | do not put secrets in source | CF08 |
| Cost | per-tenant quota/budget attribution | REQUIRED | SaaS economics/abuse isolation | provider telemetry may require reconciliation | CF03/CF08 |
| Recovery | release/rollback/PITR/DLQ runbooks | REQUIRED | production resilience | destructive actions need explicit approval | CF08 |

## Immediate Wave A

The following are expected to deliver the highest value before optional expansion:

1. D1 Sessions/read-replica end-to-end evidence.
2. Workflows orchestration contract and one representative platform flow.
3. Analytics Engine tenant usage schema.
4. WAF/rate-limit/Turnstile/Access exact-state security audit and policy proposal.
5. AI Gateway central policy seam.
6. Browser Run PDF proof preserving Print Format authority.
7. Cloudflare resource inventory/config drift/cost/recovery governance.

## Wave B

Only after Wave A contracts stabilize:

1. Dynamic Workflows for App Factory/BPM.
2. Vectorize/AI Search permission-aware retrieval.
3. Dynamic Workers for controlled tenant/runtime-defined code.
4. Containers/Sandbox for heavy data/code workloads.
5. Hyperdrive for concrete external SQL adapter.
6. Pipelines for analytical streaming/event lake use.

## Rejection tests

A primitive should be rejected/deferred if any are true:

- no Forge capability outcome;
- duplicates a current source of truth;
- requires weakening tenant/permission guarantees;
- provider beta/plan/cost risk exceeds current need;
- adds operational burden without measurable latency/reliability/economic value;
- can be implemented more simply with an existing Forge primitive while preserving the same guarantees.
