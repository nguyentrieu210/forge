# RC3-A3 — SRE, Cloudflare & Production Evidence

Date: 2026-08-04  
Agent: `RC3-A3`  
Branch: `agent/rc3-03-sre-cloudflare-evidence`  
Exact program seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Program branch: `program/rc3-exact-main-release-confidence-20260804`  
Risk: **CRITICAL audit boundary**  
Owned scope: release/recovery/observability/cost evidence and CFMAX provider-closure classification.

## 1. Result

**A3 audit complete to worker PR gate. No provider or production mutation was performed.**

The exact-current-main source materially supports the existing RC-01 `O01` maturity profile but does not justify a release-confidence promotion by itself. RC3-A3 therefore recommends **no O01 maturity promotions or demotions** from the current registry and keeps `T01-008 Usage metering` at **Foundation**.

Why:

- current source contains meaningful release, backup, restore, PITR, rollback, observability, queue-safety and performance tooling;
- CFMAX source convergence has executable exact-head evidence from run `30854860156` on `4705fe6c4f22ddaf1fe397d433f7361dd953f94b`;
- exact current `main@98b5e1b...` has no workflow run/status that independently re-proves the whole SRE surface;
- current production evidence is historical release `69b94ac1fe29a2ab39175e5442975a9197a0d39e`, not exact current main;
- D1 replicas, Workflows, Analytics Engine, edge-security provider state, AI Gateway, Browser Run and remote Cloudflare desired-vs-observed state remain unproven in a live provider environment;
- production restore/PITR/rollback/RTO/RPO evidence is absent.

No capability is marked `Hardened` from this lane.

## 2. Execution boundary

This lane is evidence/governance only. It did **not**:

- enable D1 read replication;
- create/deploy a Workflow, Analytics Engine dataset, AI Gateway resource or Browser Run production binding;
- modify WAF, rate-limit, Turnstile, Access, DNS or secrets;
- run production backup/restore/PITR/rollback/migration;
- mutate tenant/customer data;
- treat a dry-run, source validator or historical release as current provider PASS.

## 3. Exact evidence audited

### 3.1 Canonical release control plane

Exact source: `.github/workflows/alu-build-deploy.yml`.

Current invariants:

- automatic production UI release triggers only on `push` to `main` with `client/**` changes;
- automatic UI path performs an additional changed-file guard and refuses non-UI paths except explicit documentation companions;
- manual UI/full release requires `confirm=alu`;
- manual target must already be merged into `main`;
- full release order is `build -> migration plan -> fresh backup -> offline replay verification -> migration -> tenant Worker -> app Worker -> Gateway`;
- final convergence checks out current `main` SRE tooling and probes `/health`, `/`, unauthenticated boot and `/release.json` against the exact target SHA;
- plaintext SQL backup is not uploaded as a GitHub artifact.

Assessment: strong source-level release safety. This does not prove exact-current-main deployment.

### 3.2 Exact production marker truth

`deploy-evidence/alu-full-sync.json` records production convergence only for:

- release/deployed SHA `69b94ac1fe29a2ab39175e5442975a9197a0d39e`;
- bundle hash `ed328d88ad8242f5`;
- completion time `2026-08-02T21:10:08.285Z`.

That evidence is valid for that release only. It is not evidence that `main@98b5e1b...` is deployed.

### 3.3 Backup / restore / PITR

Canonical runbook: `docs/ops/SRE_RUNBOOK.md`.

Source state:

- backup export has manifest/checksum identity and isolated replay verification;
- restore drill targets a new empty `cloudforge-drill-*` / `cloudforge-restore-*` database and does not switch tenant routes;
- `server/scripts/d1-pitr.mjs` is plan/read-only by default;
- PITR execute requires exact tenant confirmation, operator reason, secure backup directory, fresh SQL export and successful offline replay verification;
- PITR verifies provider bookmark/previous bookmark and records an undo bookmark;
- D1 recovery explicitly does not claim to restore KV/R2/queues/external systems.

Gap: no approved remote restore/PITR exercise on exact current release, no measured RTO/RPO, no encrypted off-account retention contract.

### 3.4 Worker rollback

`server/scripts/rollback-worker.mjs` is plan/read-only by default and executes only with exact Worker confirmation + reason. It verifies the requested version after rollback and explicitly records that D1/KV/R2 are outside Worker version rollback.

Gap: this contract covers regular Workers. A provider-proven canonical rollback path for Workers-for-Platforms tenant/app user Workers remains open; current safe fallback is a verified compatible source/forward redeploy.

### 3.5 Observability

`server/scripts/verify-observability-config.mjs` guards Gateway, Tenant template/generated tenant, Query, Jobs, Control Plane and Social Ingress configs, requiring:

- observability enabled;
- logs enabled at 100% head sampling;
- traces enabled with positive sampling;
- structured source invariants for Gateway 5xx and Jobs/Query/Social retry events.

`server/config/cloudflare-governance.json` also includes the Workflow Worker as `observability=required`.

Gap: production app Workers remain owner dependencies in the governance manifest (`alumdoor`, `center`, `ws07`, `vn-accounting`). Therefore platform observability is Wired, but universal app-worker coverage is not proven.

### 3.6 Queue safety

`server/scripts/verify-queue-safety.mjs` requires every configured consumer under Jobs, Query and Social Ingress to have:

- bounded `max_retries`;
- a distinct dead-letter queue;
- positive batch sizing;
- non-negative batch timeout.

This proves retention/safety contract at source level. It does **not** prove dead-letter recovery. Typed inspect/quarantine/replay remains a separate Integration Hub contract.

### 3.7 D1 Sessions / read-replication seam

`server/packages/core/src/d1-session-policy.ts` defines one policy seam:

- authoritative paths -> `first-primary`;
- replica-safe paths -> inherited bookmark or `first-unconstrained`;
- opaque bookmark transport normalization;
- read-only routing evidence through `served_by_region`, `served_by_primary` and bookmark headers.

`server/apps/query-worker/test/d1-session-policy.integration.test.mts` locks the policy and bounded observation-header behavior.

CFMAX integrated validation included real-workerd D1 coverage, but production/non-production read replication was not enabled by CFMAX. Therefore CF01 remains source/executable **Wired**, provider proof pending.

### 3.8 Workflow orchestration

`server/apps/workflow-worker/wrangler.jsonc` declares `cloudforge-route-index-rebuild`, class `RouteIndexRebuildWorkflow`, with a `CONTROL` service binding and observability enabled.

CFMAX exact-head validation built/dry-ran the Workflow Worker. No live Workflow resource/recovery exercise is evidenced. The Workflow remains orchestration around control-plane authority, not a replacement D1/KV writer.

### 3.9 Cloudflare governance / remote drift

`server/config/cloudflare-governance.json` currently pins the governed Wrangler/config surface and explicitly states:

`remote_observation.status = unverified`.

The manifest distinguishes source-controlled declarations/templates/generated tenant authority/test configs and records owner-dependency app-worker observability. It also includes the new Workflow Worker.

`docs/ops/CLOUDFLARE_PRODUCTION_GOVERNANCE.md` defines a future desired-vs-observed inventory but correctly treats source validation as different from remote provider drift.

Result: CF08 source governance is done; production desired-vs-observed state is not proven.

### 3.10 Provider source lock

`docs/agents/cloudflare-cfmax/CLOUDFLARE_SOURCE_LOCK_20260804.md` was verified on 2026-08-04 and remains the program's provider-fact boundary. It explicitly requires re-check before production capacity/pricing/plan commitments.

Relevant architecture constraints retained:

- D1 replicas only through explicit Sessions policy;
- Workflow state is orchestration state, not ERP authority;
- Analytics Engine is telemetry, not legal/audit or authoritative billing truth;
- AI Gateway burst spend enforcement is not a mathematically exact hard ceiling;
- Browser Run must preserve authorization and avoid arbitrary URL/SSRF exposure;
- WAF/Access/Turnstile never replace Forge authentication/authorization.

## 4. Capability-level recommendation

RC3-A3 recommends retaining the current registry values below until the listed missing evidence lands.

| Capability | Current | A3 recommendation | Evidence state / blocker to RC |
|---|---|---|---|
| `O01-001` Health check | Wired | **Keep Wired** | probe source + historical prod proof; exact-current-main production observation missing |
| `O01-002` Release marker | Wired | **Keep Wired** | exact SHA/hash mechanism exists; current main not proven deployed |
| `O01-003` Metrics | Wired | **Keep Wired** | native/provider metrics + CF03 telemetry seam; live usage/provider reconciliation incomplete |
| `O01-004` Structured logs | Wired | **Keep Wired** | platform/generator source guarded; app-worker coverage owner-dependent |
| `O01-005` Trace/correlation | Wired | **Keep Wired** | platform trace policy exists; complete app-worker/provider coverage not proven |
| `O01-006` Alerts | Foundation | **Keep Foundation** | policy exists; durable delivery/escalation ownership/credential evidence missing |
| `O01-007` Error tracking | Foundation | **Keep Foundation** | provider log/trace seam exists; no complete error aggregation/notification operating contract |
| `O01-008` Queue monitoring | Wired | **Keep Wired** | provider surface + source queue safety; live provider alert evidence incomplete |
| `O01-009` Retry visibility | Wired | **Keep Wired** | structured attempts/delay source exists |
| `O01-010` Dead-letter recovery | Foundation | **Keep Foundation** | DLQ retention exists; typed inspect/quarantine/replay authority missing |
| `O01-011` Integrity checks | Wired | **Keep Wired** | backup/integrity/reconciliation seams exist; production breadth not enough for RC promotion |
| `O01-012` Ledger reconciliation jobs | Foundation | **Keep Foundation** | no safe scheduled cadence/state/idempotency/cost contract across ledgers |
| `O01-013` Backup verification | Wired | **Keep Wired** | strong verifier and prior isolated tests; exact-current-main/current-environment backup proof + off-account retention missing |
| `O01-014` PITR strategy | Wired | **Keep Wired** | guarded source is credible; no approved operational rehearsal |
| `O01-015` Disaster recovery | Foundation | **Keep Foundation** | tooling/runbook exists; RTO/RPO, cadence, off-account retention, remote drill missing |
| `O01-016` Release rollback | Foundation | **Keep Foundation** | regular Worker path exists; tenant/app WfP rollback + data/schema compatibility proof incomplete |
| `O01-017` Migration verification | Wired | **Keep Wired** | release preflight exists; applied-content identity/crash-window contract still open |
| `O01-018` Performance test | Wired | **Keep Wired** | bounded source tool exists; no production SLO claim |
| `O01-019` Load test | Wired | **Keep Wired** | bounded GET/HEAD tool exists; no approved representative production benchmark |
| `O01-020` Rate limit | Wired | **Keep Wired** | Forge login/resource limits + perimeter source policy; provider WAF rate-limit proof pending |
| `O01-021` Abuse protection | Foundation | **Keep Foundation** | source controls partial; broad provider/product abuse posture not live-proven |
| `T01-008` Usage metering | Foundation | **Keep Foundation** | typed telemetry seam exists; Analytics Engine dormant, tenant/billing reconciliation/provider evidence absent |

A3 promotion delta: **0**.  
A3 demotion delta: **0**.

## 5. CFMAX provider-closure classification

| Lane | Current source state | Required next evidence class | A3 classification |
|---|---|---|---|
| CF01 D1 Sessions/replication | merged + executable source evidence | replica serving, bookmark correctness, APAC latency | **non-production proof required** |
| CF02 Workflows | merged + build/dry-run evidence | deployed retry/resume/restart/terminate/idempotency/recovery | **non-production proof required** |
| CF03 Usage/Analytics | telemetry seam merged; AE dormant | adoption policy, dataset/binding, tenant separation/reconciliation | **business decision required**, then non-production proof |
| CF04 Edge security | source contract merged | actual WAF/rate-limit/Turnstile/Access state + compatibility/false-positive evidence | **business policy where route/threshold not inferable**, then non-production/provider proof; production activation requires authorization |
| CF05 AI Gateway | provider-neutral policy seam merged | provider resource, model/provider policy, spend/rate/privacy evidence | **business decision required**, then non-production proof |
| CF06 Browser Run | controlled render source merged | live authorized HTML→PDF + tenant artifact handling | **non-production proof required** |
| CF07 optional runtime | intentionally deferred | workload evidence before adoption | **deferred — no action** |
| CF08 governance | source/config governance merged | remote desired-vs-observed inventory and recovery drills | **provider account evidence required**; production observation/recovery requires appropriate authorization |

## 6. Provider-evidence queue

The queue below is deliberately split from implementation work. `PASS` may only be written after the expected evidence artifact exists.

### PE-A3-01 — D1 replica / APAC consistency

**Prerequisite**
- approved non-production tenant/database;
- D1 read replication enabled only in that environment;
- current CF01 Sessions policy deployed;
- representative APAC caller location.

**Probe**
- execute an authoritative write/read sequence using `first-primary`;
- carry returned `x-d1-bookmark` into dependent replica-safe reads;
- capture `x-d1-served-by-region`, `x-d1-served-by-primary`, bookmark continuity, latency and returned business identity;
- exercise stale/invalid/no-bookmark cases without weakening tenant selection.

**Expected evidence**
- exact source/release SHA;
- environment/database non-secret identifier;
- region/primary observations;
- dependent read-after-write correctness;
- latency sample distribution;
- failure cases.

**Safety**: non-production only until correctness is demonstrated. No production replica enablement from RC3.

### PE-A3-02 — Workflow recovery

**Prerequisite**
- approved non-production Workflow resource + control-plane service binding;
- exact `workflow-worker` source deployed;
- disposable route-index test scope.

**Probe**
- create route-index rebuild instance;
- force/reproduce retryable failure;
- verify persisted-step retry/resume;
- verify duplicate/idempotent invocation behavior;
- verify operator terminate/cancel/restart semantics supported by the adopted provider contract;
- confirm the Workflow calls the existing control-plane route-index authority rather than writing D1/KV directly.

**Expected evidence**
- exact source SHA + Workflow instance IDs;
- step/retry state timeline;
- control-plane mutation/audit evidence;
- duplicate/recovery outcome;
- no competing authority.

**Safety**: disposable non-production state only.

### PE-A3-03 — Analytics Engine adoption / usage metering

**Prerequisite**
- explicit product decision that Analytics Engine will be used;
- approved usage dimensions and privacy/cardinality policy;
- explicit statement that telemetry is not the accounting/billing ledger.

**Probe after adoption decision**
- create non-production dataset/binding;
- write representative per-tenant usage points;
- query tenant-isolated aggregates;
- reconcile sampled/provider usage against a deterministic Forge fixture/source;
- test missing/duplicate/late telemetry handling before any quota/invoice enforcement.

**Expected evidence**
- schema/version, exact SHA, provider dataset identity in non-secret form;
- tenant separation;
- reconciliation delta;
- cost/cardinality observations.

**Safety**: no customer billing authority from Analytics Engine alone.

### PE-A3-04 — Edge security provider proof

**Prerequisite**
- approved threat-route matrix;
- business/security decision for any route-specific numeric thresholds/challenge posture that cannot be inferred from source;
- non-production hostname with browser + API/machine clients.

**Probe**
- apply candidate WAF/rate-limit/Turnstile/Access controls only to approved non-production scope;
- replay normal browser, PWA, API and machine traffic;
- exercise malicious/abusive fixtures;
- record false positives, blocked/challenged decisions and Forge-auth behavior.

**Expected evidence**
- desired ruleset vs observed ruleset;
- request matrix and false-positive rate;
- proof that Forge auth/permission remains authoritative.

**Safety**: no production WAF/Access/Turnstile/DNS mutation without explicit authorization.

### PE-A3-05 — AI Gateway provider policy

**Prerequisite**
- business decision for allowed providers/models/fallbacks;
- privacy/data-residency policy;
- per-tenant metadata encoding policy;
- spend/rate budget policy.

**Probe**
- create approved non-production Gateway/resource;
- route representative Forge AI calls through the existing provider-neutral seam;
- test allowed/denied provider/model cases, fallback policy, rate limit, spend limit and metadata attribution;
- verify business mutation still requires canonical Forge command authority.

**Expected evidence**
- exact source/config SHA;
- provider policy snapshot;
- attributable tenant/app/purpose observations;
- spend/rate behavior including burst caveat;
- privacy/logging review.

**Safety**: no production resource or provider credential mutation from RC3.

### PE-A3-06 — Browser Run live render

**Prerequisite**
- approved non-production Browser Run binding;
- authorized tenant fixture;
- controlled HTML or allowlisted origin;
- tenant-scoped artifact storage/access path.

**Probe**
- render representative invoice/report HTML to PDF;
- verify permission before source retrieval and artifact download;
- reject unapproved external URL/SSRF cases;
- verify cleanup/retention behavior and render failure evidence.

**Expected evidence**
- exact SHA;
- render duration/result metadata;
- permission/tenant evidence;
- artifact identity/retention outcome;
- security negative cases.

**Safety**: no arbitrary user URL rendering and no production rollout from this lane.

### PE-A3-07 — Desired-vs-observed Cloudflare inventory

**Prerequisite**
- read-only Cloudflare account access for the target environment;
- exact source SHA + `server/config/cloudflare-governance.json`;
- approved account/environment identity.

**Probe**
- collect read-only inventory for Workers/versions/config, routes/domains, service bindings, dispatch namespaces, D1, DO, KV, R2, Queues/DLQs, cron, Workflows and any adopted Analytics/AI/Browser resources;
- compare with declared authority classes and resource expectations;
- report mismatches without auto-repair.

**Expected evidence**
- observation timestamp;
- target account/environment in non-secret form;
- exact source SHA;
- desired/observed mismatch list;
- no mutation log.

**Safety**: read-only. Any repair is a separate CRITICAL production/provider operation.

### PE-A3-08 — Restore/PITR/rollback exercise + RTO/RPO inputs

**Prerequisite**
- approved disposable non-production tenant/database and Worker;
- verified backup fixture;
- incident scenario and stop conditions;
- business owner later chooses formal RTO/RPO targets from measured evidence.

**Probe**
- remote restore drill into a new empty database;
- D1 PITR rehearsal with pre-restore backup + bookmark evidence;
- regular Worker rollback rehearsal;
- compatible tenant/app source redeploy rehearsal until WfP rollback contract is proven;
- measure time and recovery-point loss for each surface independently.

**Expected evidence**
- backup checksum + replay result;
- restore/PITR/rollback durations;
- pre/post bookmarks/version IDs;
- tenant/data integrity/reconciliation checks;
- measured RTO/RPO inputs and residual surfaces (KV/R2/queues/external state).

**Safety**: non-production rehearsal first. Production restore/PITR/rollback requires explicit authorization.

### PE-A3-09 — Exact-current-main production release proof

**Prerequisite**
- separate authorization to release a chosen exact merged-main SHA;
- all schema/resource prerequisites satisfied;
- current release workflow green.

**Probe**
- use the canonical release workflow;
- capture final `/health` + `/release.json` exact SHA/hash evidence;
- for full release, additionally preserve backup/migration/tenant/app/Gateway evidence appropriate to the release.

**Expected evidence**
- exact target SHA;
- workflow run ID;
- exact release SHA + bundle hash;
- component/resource evidence appropriate to the release type.

**Safety**: this is a production operation. RC3-A3 does not execute it.

## 7. Dependency Requests

### DR-RC3-A3-01 — migration immutable identity / crash-window closure

Owner: WS13 / RC3-A2 migration tooling owner.  
Need: bind applied migration journal entries to immutable content identity/checksum and define deterministic partial-apply/crash replay semantics.  
Blocks: promotion of `O01-017` beyond Wired/Hardened claims.  
Status: **OPEN, non-blocking for A3 audit**.

### DR-RC3-A3-02 — backup retention + alert delivery governance

Owner: WS11 / RC3-A2 IAM/SaaS governance.  
Need: encrypted durable off-account backup retention/key ownership and protected alert delivery/escalation credentials.  
Blocks: DR/Hardened and complete alert operation.  
Status: **OPEN, non-blocking for A3 audit**.

### DR-RC3-A3-03 — typed DLQ recovery contract

Owner: WS10 Integration Hub / RC3-A2 integration owner.  
Need: typed inspect/quarantine/replay preserving tenant and idempotency identity; reject arbitrary raw resend.  
Blocks: `O01-010` RC/Hardened.  
Status: **OPEN, non-blocking for bounded-retry/DLQ evidence**.

### DR-RC3-A3-04 — app-worker observability convergence

Owners: WS17 Alumdoor, WS07, WS01 and Center app owner.  
Need: converge app-worker observability with platform policy or document justified deviations.  
Blocks: claiming universal worker telemetry coverage.  
Status: **OPEN, non-blocking for platform observability**.

### DR-RC3-A3-05 — operational objectives

Owner: product/SRE governance coordinator.  
Need: approve formal RTO, RPO, DR rehearsal cadence and customer-facing SLO/SLA only after representative measurements exist.  
Blocks: DR `Hardened`; does not block source tooling.  
Status: **BUSINESS DECISION REQUIRED**.

## 8. Stale / superseded evidence disposition

- `AI_HANDOFF.md` still names historical release workflow `manual-release-alu.yml`; exact source `.github/workflows/alu-build-deploy.yml` + `docs/ops/SRE_RUNBOOK.md` are authoritative.
- historical WS12 branch/PR references remain useful provenance but do not override exact current-main scripts/config.
- historical production `69b94ac...` remains valid evidence for that exact deployment only.
- CFMAX worker branches are history after canonical merge `#570`; provider closure must start from exact current main/approved environment, not stale worker branches.
- CF07 Dynamic Workers, Containers/Sandbox, Hyperdrive and Pipelines remain intentionally **DEFERRED** until workload evidence justifies adoption.

## 9. Validation truth for this A3 execution

### GitHub state

- exact program seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`;
- combined status on that exact main commit: no statuses returned;
- workflow runs on that exact main commit: none returned;
- CFMAX convergence head `4705fe6c4f22ddaf1fe397d433f7361dd953f94b`: integrated run `30854860156` = **SUCCESS**.

### Source checks reviewed

Audited exact current-main release workflow, SRE runbook, capability registry, WS12/RC-02 evidence, CFMAX convergence/source lock/governance, D1 session policy/test, Workflow Wrangler, PITR/rollback scripts, observability validator and queue-safety validator.

### Not run

- repository checkout/build/typecheck/test in the local execution container — checkout was unavailable because the container could not resolve `github.com`;
- provider API inventory;
- non-production provider exercise;
- production health/release probe;
- backup/restore/PITR/rollback/migration;
- Cloudflare resource mutation.

No NOT RUN item is reported as PASS.

## 10. Coordinator handoff

A0 should ingest the following A3 conclusions:

1. retain all current `O01` maturity values and `T01-008=Foundation`;
2. record **0 A3 promotions / 0 A3 demotions**;
3. preserve CFMAX source convergence as executable source evidence, not provider/production evidence;
4. prioritize provider-evidence queue `PE-A3-01`, `02`, `06`, `07`, `08` after approved non-production/account access;
5. route business decisions before `PE-A3-03`, `04`, `05` where policy cannot be inferred;
6. keep exact-current-main production proof separate as `PE-A3-09` and production-authorized;
7. keep `Hardened=0` for this lane unless later convergence receives exact matching production-grade evidence;
8. retain Dependency Requests DR-RC3-A3-01..05 in final blocker ranking.

## 11. Merge/deploy boundary

This is non-UI governance/evidence work.

- Worker branch may be reviewed through the RC3 program PR flow.
- Do **not** merge the RC3 program into `main` without explicit user approval.
- Do **not** deploy production or mutate Cloudflare provider state from this A3 lane.
