# Cloudflare Production Governance — Forge CFMAX-08

Date: 2026-08-04  
Owner: WS12 / CFMAX-08, with WS11 for SaaS governance  
Risk: CRITICAL  
Status: **source-governance RC candidate; remote production inventory/drift evidence pending**

This document governs Cloudflare infrastructure truth for Forge. It does **not** authorize a production mutation.

Canonical machine source:

- `server/config/cloudflare-governance.json`
- `server/scripts/verify-cloudflare-governance.mjs`

Provider facts and limits remain source-locked by:

- `docs/agents/cloudflare-cfmax/CLOUDFLARE_SOURCE_LOCK_20260804.md`
- `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`

Existing recovery/release implementation remains owned by:

- `docs/ops/SRE_RUNBOOK.md`
- `server/scripts/verify-release-safety.mjs`
- `server/scripts/verify-observability-config.mjs`
- `server/scripts/verify-queue-safety.mjs`
- D1 backup/verify/restore/PITR and Worker rollback tooling under `server/scripts/**`.

CF08 adds a governance layer over those controls. It does not build a second SRE stack.

## 1. Infrastructure truth model

Every non-secret Cloudflare production setting must land in exactly one class:

| Authority class | Meaning | Allowed use |
|---|---|---|
| `source-controlled-declarative` | Wrangler/config in Git is the desired state | normal first-party Worker/resource bindings |
| `source-controlled-template` | checked-in template used for development/reference | template only; not proof of every tenant deployment |
| `generated-from-source-controlled-template` | production config is generated from versioned source | per-tenant Worker config |
| `provisioned-by-script-api` | desired state is expressed by source-controlled provisioning code | resources that cannot be fully represented in Wrangler |
| `dashboard-manual-exception` | provider/dashboard state has no safe declarative path yet | must carry an explicit reason and observed evidence |
| `secret-runtime-state` | secret value is intentionally outside Git | identifiers/names may be documented; secret value may not |
| `production-evidence-only` | observed state proves deployment but is not desired-state authority | read-only inventory/release evidence |
| `source-controlled-test` | QA-only Wrangler/config | never interpreted as production authority |

A dashboard setting is not canonical merely because it exists in production. A checked-in config is not deployed merely because it exists in Git.

## 2. Current source inventory

The machine manifest covers the committed Wrangler surface discovered under `server/apps/**`, `server/apps-src/**` and `qa/browser-worker/**`, plus the production tenant generator.

| Source | Role | Declared env | Authority | Scope | Compatibility date | Owner / evidence state |
|---|---|---|---|---|---|---|
| `server/apps/gateway-worker/wrangler.jsonc` | Gateway + Assets + routes + dispatch + control service | production | declarative | shared | 2026-07-23 | WS12/CF08; observability required |
| `server/apps/jobs-worker/wrangler.jsonc` | jobs / outbox queue consumer / dispatcher | production | declarative | shared | 2026-07-23 | WS12/CF08; observability required |
| `server/apps/control-plane-worker/wrangler.jsonc` | SaaS control-plane storage/routing | production | declarative | shared | 2026-07-23 | WS11/WS12; observability required |
| `server/apps/social-ingress-worker/wrangler.jsonc` | social ingress / event queue | production | declarative | shared | 2026-07-27 | WS10/WS12; observability required |
| `server/apps/query-worker/wrangler.jsonc` | tenant query/report demo surface | production-demo | declarative | tenant demo | 2026-07-23 | WS12; observability required |
| `server/apps/tenant-worker/wrangler.jsonc` | local/demo tenant template | development-demo | template | tenant demo | 2026-07-23 | WS00/WS12 |
| `server/scripts/tenant-wrangler.mjs` | generated production tenant config | production | generated authority | per tenant | pins 2026-07-23 today | WS00/WS12 |
| `server/apps-src/alumdoor-worker/wrangler.jsonc` | Alumdoor app Worker | production-app | declarative | app shared | 2026-07-27 | WS17; observability owner dependency |
| `server/apps-src/center-worker/wrangler.jsonc` | Center app Worker | production-app | declarative | app shared | 2026-07-23 | app owner; observability owner dependency |
| `server/apps-src/ws07-worker/wrangler.jsonc` | WS07 app Worker | production-app | declarative | app shared | 2026-08-03 | WS07; observability owner dependency |
| `server/apps-src/vn-accounting-worker/wrangler.jsonc` | VN Accounting app Worker | production-app | declarative | app shared | 2026-08-03 | WS01; observability owner dependency |
| `server/apps/purchase-qa-callback/wrangler.jsonc` | purchase callback QA | QA | test | QA | 2026-07-27 | QA only |
| `server/apps/tenant-worker/wrangler.purchase-qa.jsonc` | purchase tenant QA | QA | test | QA | 2026-07-23 | QA only |
| `server/apps-src/alumdoor-worker/wrangler.purchase-qa.jsonc` | Alumdoor purchase QA | QA | test | QA | 2026-07-27 | QA only |
| `qa/browser-worker/wrangler.jsonc` | Browser Run preview QA | QA | test | QA | 2026-07-30 | QA / CF06 |

Important: the committed tenant Worker file is **not** the production authority for all tenants. `server/scripts/tenant-wrangler.mjs` generates the production per-tenant config. A governance review that checks only the demo file is incomplete.

The manifest pins each governed source by Git blob SHA. A source change therefore fails governance until its compatibility/resource semantics are reviewed and the manifest is deliberately updated.

## 3. Read-only source drift validator

Run:

```text
node server/scripts/verify-cloudflare-governance.mjs
```

Machine-readable inventory:

```text
node server/scripts/verify-cloudflare-governance.mjs --json
```

The validator fails closed when:

- a committed `wrangler*.jsonc` is added without an authority classification;
- the manifest references a missing config;
- a governed config changes without an updated source pin;
- a compatibility date changes without an explicit policy update;
- a required platform Worker loses logs/traces policy;
- a secret-like key is placed in source-controlled `vars`;
- a generated production configuration authority changes without review;
- a dashboard-manual exception lacks a reason.

JSON output intentionally reports whether provider identifiers are present rather than printing D1/KV/Hyperdrive identifiers into inventory evidence.

The validator is **source drift**, not remote Cloudflare drift. It makes no network call and mutates nothing.

## 4. Remote desired-vs-observed drift

Remote production state is currently **UNVERIFIED in CF08**. No account/API read was performed in this lane, and absence of remote evidence is not a PASS.

A future read-only observation must compare the declared inventory against the provider for, as applicable:

- Worker script/version/config family;
- Workers Assets binding;
- custom domains/routes;
- service bindings;
- Workers for Platforms dispatch namespaces;
- D1 databases;
- Durable Object namespaces/classes/migrations;
- KV namespaces;
- R2 buckets;
- Queues and DLQs;
- cron triggers;
- Workflows introduced by CF02;
- Analytics Engine datasets introduced by CF03;
- AI/AI Gateway resources introduced by CF05;
- Browser Run bindings introduced by CF06;
- Dynamic Workers/Containers/Hyperdrive/Pipelines if CF07 adopts them.

Remote evidence must record observation timestamp, account/environment identity in a non-secret form, exact source SHA and mismatches. Read-only observation must not auto-correct drift. Repair remains a separately authorized production operation.

## 5. Compatibility-date policy

Current source intentionally contains multiple pinned dates: `2026-07-23`, `2026-07-27`, `2026-07-30` and `2026-08-03`.

That is a governance fact, not a reason to mass-bump every Worker.

A compatibility-date or compatibility-flag change requires:

1. exact affected Worker/service-family list;
2. Cloudflare source-lock re-check when the change crosses behavior-changing provider releases;
3. targeted unit/integration tests for the affected service family;
4. binding/config validation;
5. representative auth/tenant/queue/data path smoke where relevant;
6. a compatible redeploy/rollback plan;
7. separate production authorization if rollout mutates production.

Advance Workers together only when they depend on the same behavior contract. Otherwise keep independent service-family pins.

## 6. Cost model and attribution

Cost inputs are architecture constraints, not customer pricing promises.

| Primitive | Billing/pressure unit | Current locked allowance/input | Tenant attribution | Main driver | Forge guardrail / telemetry |
|---|---|---|---|---|---|
| Workers | requests, CPU and subrequests | provider contract is external; re-check before plan commitment | strong at gateway/tenant/app dimensions | expensive handlers, loops, fan-out | existing per-plan CPU/subrequest dispatch guards; Worker metrics |
| D1 reads | rows read | paid: first 25B rows/month included; then `$0.001 / million rows` | strong per tenant DB | scans, report fan-out | indexing/query-shape review; rows-read telemetry when exposed |
| D1 writes | rows written | paid: first 50M rows/month included; then `$1.00 / million rows` | strong per tenant DB | imports/reconciliation/write amplification | idempotency, batching, write-loop controls |
| D1 storage | GB-month | paid: first 5 GB included; then `$0.75 / GB-month` | strong per tenant DB | document/ledger growth | warning at 70%, critical at 85% of applicable plan DB ceiling |
| Queues | 64 KB operation units | first 1M ops/month included; then `$0.40 / million`; normal delivery is roughly write+read+delete | strong if tenant metadata is retained in safe telemetry | message count/size/retries | target normal payload <=64 KB, bounded retries, DLQ |
| Durable Objects | request/compute/storage pressure | provider contract external; re-check | strong when object identity is tenant-scoped | hot aggregate serialization | queue-wait/latency/error evidence; never singleton all tenants |
| R2 | storage/operations/egress model | external provider contract; re-check | key prefix/object ownership can attribute tenant usage | files, exports, retained artifacts | retention/lifecycle and deletion/export policy |
| Workflows | instance/step/compute model | CF02 must source-lock current pricing/limits | strong via workflow tenant context | long-running orchestration/retry | bounded step/retry design, stuck/failure telemetry |
| Analytics Engine | data points / read queries | current source lock says billing not yet active while future pricing is published | designed for per-customer usage telemetry | high-cardinality/event volume | 250 points/invocation provider limit; three-month retention; never billing ledger |
| Workers AI / AI Gateway | model requests/tokens/provider spend | external/model-dependent | strong if tenant metadata policy is preserved | model/token volume | AI Gateway spend/rate policy; burst enforcement may be eventually consistent |
| Browser Run | render/browser duration and invocation model | external provider contract; re-check | report/export job can carry tenant identity | long/failed renders | allowlisted/controlled inputs, duration/failure budget, artifact cleanup |
| Dynamic Workers / Containers / Hyperdrive / Pipelines | product-specific | not adopted as generic production baseline by CF08 | must be explicit before adoption | workload-specific | CF07 adoption decision + cost/recovery evidence first |

Do not derive a monthly tenant price from these numbers in CF08. WS11/product governance owns customer plan quotas and commercial packaging.

### Representative tenant pressure classes

| Class | Expected pressure | Primary guard |
|---|---|---|
| idle/small | low request/data baseline | keep fixed shared resource count low; no resource-per-tenant pattern unless isolation requires it |
| typical SMB | balanced CRUD/report/file traffic | normal per-plan CPU/subrequest limits, D1 headroom, queue retry visibility |
| busy/large | high concurrency/data/report volume | D1 query/index evidence, async orchestration, storage/queue age alerts |
| pathological/noisy | loops, burst imports, abusive API traffic | tenant-scoped CPU/subrequest/rate/quota boundaries; fail without harming other tenants |
| AI-heavy | high token/model spend | per-tenant purpose metadata, AI Gateway spend/rate controls, provider fallback policy |
| import/report-heavy | write amplification, queue/workflow/R2/browser pressure | idempotency, chunking, progress, bounded retry, artifact lifecycle, reconciliation |

These are engineering workload classes, not customer plan names.

## 7. Three different limit types

Never collapse these into one number:

1. **Provider hard limit** — Cloudflare contract. Crossing it fails or throttles infrastructure.
2. **Forge engineering guard** — deliberately lower threshold protecting latency/cost/isolation.
3. **Customer product quota** — contractual product entitlement owned by WS11/product policy.

Example: D1 provider maximum database size is not a customer storage entitlement; the 70%/85% engineering thresholds are not an SLA; a future tenant plan quota is a third policy.

## 8. Capacity evidence gates

Before a primitive is production-hardened, measure the relevant pressure instead of quoting only the provider maximum:

- Worker CPU and subrequests by route/tenant class;
- D1 database size, rows scanned/written, long queries and statement pressure;
- Durable Object queue wait/contention on hot aggregates;
- Queue backlog age, retry count, DLQ growth and retention risk;
- Workflow failed/stuck duration and retry/step cost after CF02 lands;
- R2 bytes, object counts, export/render retention and cleanup;
- AI request/token/spend dimensions after CF05 convergence;
- Analytics Engine data-point/query volume after CF03 convergence;
- Browser Run render duration/failure after CF06 convergence.

Customer availability SLA, p95/p99 latency SLO, RTO and RPO remain **UNSET** until approved from measured evidence.

## 9. Recovery matrix

| Surface | Canonical recovery | Existing evidence | Remaining boundary |
|---|---|---|---|
| D1 | verified portable SQL export + isolated replay; authorized provider Time Travel/PITR when state rewind is required | WS12 backup verifier, restore drill and guarded PITR | destructive production PITR not rehearsed in CF08; off-account encrypted retention is WS11 dependency |
| regular Worker | exact version rollback when schema is backward-compatible | `rollback-worker.mjs` | does not roll back D1/KV/R2/external side effects |
| Workers-for-Platforms tenant/app Worker | verified compatible source redeploy today | source deployment path exists | provider-proven canonical version rollback remains open |
| Queues/DLQ | bounded retry, preserve exhausted messages, inspect/quarantine/replay only through typed idempotent contract | distinct DLQs + queue-safety validator | replay/quarantine contract belongs to WS10 |
| Workflows | inspect state, bounded retry/cancel/operator recovery through CF02 contract | not yet converged | CF02 owns exact state/retry/cancel/version semantics |
| R2 | object lifecycle, tenant export/deletion and generated artifact cleanup | shared files bucket architecture exists | retention/lifecycle policy must converge with CF06/WS11 |
| AI/Analytics telemetry | rebuild/recompute where derived; retain only evidence that product policy requires | source-lock boundaries documented | provider telemetry is not canonical business backup |

No automatic incident response may run PITR, replay a DLQ, rotate a secret, change DNS/routes, migrate customer data or roll back production code without an explicitly authorized operating path.

## 10. Release dependency topology

Current authoritative full-release order remains:

```text
exact merged main target
 -> build
 -> migration plan
 -> fresh tenant backup
 -> offline replay verification
 -> migration
 -> tenant Worker
 -> app Worker
 -> gateway/assets
 -> exact health + release marker convergence
```

CFMAX resource additions must be inserted **before** code that requires the new binding/resource. For example:

```text
validate resource declaration
 -> provision/observe resource under explicit production gate
 -> verify binding exists
 -> deploy dependent Worker
 -> smoke exact path
 -> capture production evidence
```

A Worker deploy that references an unprovisioned queue/dataset/workflow/bucket is a failed release design even if source tests pass.

## 11. Emergency disable and rollback seams

Prefer the least destructive reversible control:

- disable a feature/entitlement path before touching data when product semantics allow it;
- stop promotion when exact release marker/health/binding evidence does not converge;
- rollback a regular Worker version only when data/schema remains compatible;
- for tenant/app Workers, use a verified compatible source redeploy until a provider-proven rollback contract exists;
- quarantine async poison work rather than blind replay;
- capture fresh backup/current state before authorized destructive recovery.

Feature flags, entitlement changes, route changes, WAF rules and AI spend controls are still production mutations when changed in production. CF08 documents the seam; it does not authorize activation.

## 12. CFMAX production evidence contract

A lane may claim **source-ready** from repository evidence. It may claim **production-deployed** only when production evidence includes the parts relevant to its primitive:

1. exact merged source SHA/release target;
2. governed source/config blob identity;
3. desired resource/binding inventory version;
4. read-only observed resource/binding identity and timestamp;
5. provisioning evidence for newly required resources, without secret values;
6. exact deployed Worker/version or release marker where provider surface exposes it;
7. `/health` and `/release.json` convergence for Gateway/UI release paths;
8. queue/DLQ/workflow/dataset/bucket binding existence for dependent workers;
9. recovery/rollback path applicable to the changed surface;
10. cost/capacity counters or a declared evidence gap for newly material spend dimensions;
11. no unresolved tenant/isolation/security mismatch.

`Merged` is not `Deployed`. Source manifest equality is not remote drift proof. A healthy Gateway is not proof that every tenant/app Worker/storage resource is at the same source SHA.

## 13. Current gaps and dependencies

- **CF01:** D1 Sessions/read-replica rollout configuration and evidence must enter the inventory when adopted.
- **CF02:** Workflow resource/recovery semantics, stuck/failure evidence and operator recovery.
- **CF03:** Analytics Engine usage/cost telemetry and dataset authority.
- **CF04:** WAF/rate-limit/Access/Turnstile desired-state authority and read-only drift evidence.
- **CF05:** AI Gateway/Workers AI spend, rate, model/provider and fallback policy.
- **CF06:** Browser Run/R2 export resource lifecycle and evidence.
- **CF07:** governance/cost/recovery classification for every optional primitive actually adopted.
- **WS10:** typed DLQ inspect/quarantine/replay contract.
- **WS11:** customer plan quotas, off-account encrypted backup retention, entitlement/emergency-disable governance and protected alert destinations.
- **WS13:** remote migration ledger crash-window/content-identity closure.
- **WS12/provider evidence:** Workers-for-Platforms tenant/app rollback remains partial.
- **Production observation:** remote inventory and desired-vs-observed drift check have not been run by CF08.

## 14. Promotion boundary

CF08 source implementation may be reviewed and tested without production access.

Before `RC` for production governance:

- source inventory must validate;
- each config must have one authority classification;
- compatibility policy must remain explicit;
- cost/capacity/recovery/release model must be current;
- source secret guard must pass;
- remote evidence gaps must remain visible.

Before `Hardened`:

- remote production inventory must be observed read-only;
- desired-vs-observed drift must be clean or explicitly dispositioned;
- recovery must have rehearsed evidence appropriate to the surface;
- capacity/alert behavior must be measured;
- customer SLO/SLA/RTO/RPO may only be stated if separately approved.

No production DNS, secret, route, resource, PITR, migration, replay, rollback or customer-data operation was performed by CF08 source-governance work.
