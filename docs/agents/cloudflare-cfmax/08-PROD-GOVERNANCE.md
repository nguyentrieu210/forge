# CF08 — Cloudflare Production Governance / Cost / Drift / Recovery

Status: **REVIEW — source-governance implementation complete; remote production evidence pending**  
Branch: `cloudflare/cfmax-08-prod-governance`  
Primary Forge authority: WS12 SRE  
SaaS governance authority: WS11  
Risk: CRITICAL

## Mission

Make Cloudflare infrastructure an auditable, reproducible and cost-governed production substrate for Forge: exact resource inventory, source/config authority, drift detection, compatibility governance, capacity/cost taxonomy, recovery, rollout and per-tenant economics.

CF08 governs infrastructure truth. It does not take over sibling implementation hotspots and it does not treat source presence as production deployment proof.

## Exact execution state

- Worker branch was stale by 127 main commits at start.
- Internal sync PR `#526` merged exact then-current `main@d651a3c43a7841cb82cf47561cfae7a89a276b88` into CF08 as `65f1804e1fddf8a57e9be3949d47449ae625d7f8`.
- Main advanced later by UI-only work; CF08 must re-sync exact current main before convergence if it advances again.
- No production Cloudflare API mutation, DNS/route mutation, secret rotation, PITR, migration, queue replay, rollback or customer-data mutation was performed.

## Required reading

- `skills/forge-enterprise-completion/SKILL.md`
- `docs/agents/cloudflare-cfmax/CFMAX_PROGRAM_SPEC.md`
- `docs/agents/cloudflare-cfmax/CLOUDFLARE_SOURCE_LOCK_20260804.md`
- `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`
- `docs/ops/SRE_RUNBOOK.md`
- every governed `wrangler*.jsonc`
- `server/scripts/tenant-wrangler.mjs`
- release/backup/PITR/rollback/queue/observability verification code

## Owned scope

- Cloudflare resource inventory by environment;
- configuration source-of-truth classification;
- source/config drift detection;
- remote desired-vs-observed drift evidence contract;
- compatibility-date/flags policy;
- resource naming/ownership and generated-config authority;
- limits/quota/capacity separation;
- cost attribution model by primitive/tenant pressure class;
- release dependency order and resource-before-binding rule;
- backup/PITR/export/restore safety convergence;
- Queue/DLQ/Workflow/R2 recovery governance;
- AI/Analytics/Browser/optional-runtime cost/recovery integration;
- emergency disable/rollback seams;
- exact production evidence contract for CFMAX.

## Forbidden zone

Do not:

- perform production PITR or restore;
- mutate DNS/routes/secrets/resources in production without explicit approval;
- rotate credentials;
- invent customer SLA/RTO/RPO from provider limits;
- move business logic into infrastructure scripts;
- duplicate worker-owned implementation just to centralize it;
- commit secrets, backup data, tokens or private production exports;
- call remote drift clean without a read-only observed inventory.

## Implemented slice A — governance source manifest

`server/config/cloudflare-governance.json`

The manifest currently classifies:

- 14 committed Wrangler configs across platform/app/QA surfaces;
- exact Git blob identity for every governed config;
- environment, role, authority class, tenant scope, owner and compatibility date;
- required/owner-dependent/not-required observability status;
- `server/scripts/tenant-wrangler.mjs` as the production generated-tenant config authority.

Important architecture result: the committed demo tenant Wrangler is not treated as the source of truth for every production tenant. The generator is explicitly governed separately.

## Implemented slice B — read-only governance validator

`server/scripts/verify-cloudflare-governance.mjs`

It:

- discovers committed `wrangler*.jsonc` under governed roots;
- fails on unclassified or missing config;
- verifies exact Git blob pins;
- verifies explicit compatibility-date pins;
- checks authority-class validity;
- fails secret-like source-controlled `vars`;
- enforces existing platform observability policy where CF08 owns/consumes it;
- verifies the tenant-config generator source pin;
- emits a machine-readable resource inventory with sensitive provider identifiers represented only as presence flags;
- records remote observation as `unverified` rather than fabricating remote PASS.

Run directly:

```text
node server/scripts/verify-cloudflare-governance.mjs
node server/scripts/verify-cloudflare-governance.mjs --json
```

## Implemented slice C — governance/cost/recovery contract

`docs/ops/CLOUDFLARE_PRODUCTION_GOVERNANCE.md`

It defines:

- authority classes and source-vs-observed truth;
- current configuration inventory;
- three drift layers: source, release/control, remote observed;
- compatibility-date update policy;
- primitive cost dimensions and attribution seams;
- representative tenant pressure classes;
- provider hard limit vs Forge engineering guard vs customer product quota;
- capacity evidence gates;
- D1/Worker/Queue/Workflow/R2/AI/Analytics recovery matrix;
- resource-before-dependent-code release topology;
- emergency disable/rollback boundaries;
- CFMAX production evidence contract.

## Audit findings

### Compatibility dates are heterogeneous

Exact source contains at least:

- `2026-07-23` — gateway, jobs, control plane, query/demo tenant family;
- `2026-07-27` — social ingress and some app/QA configs;
- `2026-07-30` — Browser Run QA;
- `2026-08-03` — newer app Workers.

Decision: **do not mass-bump**. Each governed config is pinned. A date/flag change requires owner tests, source-lock review when behavior changes, and a compatible redeploy/rollback plan.

### Platform/app observability ownership remains split

Platform Workers already carry the WS12 logs/traces policy. Several app Workers remain owner dependencies. CF08 records that gap instead of editing vertical hotspots across ownership boundaries.

### Remote drift is not yet observed

Source/config governance is implemented, but CF08 did not receive/run a read-only Cloudflare account inventory. Therefore:

- remote desired-vs-observed drift: **UNVERIFIED**;
- production resource existence: only prior evidence where separately recorded, not re-proven by CF08;
- `Hardened`: **not claimable**.

## Cost and capacity evidence

CF08 reuses the provider facts locked in `CLOUDFLARE_OPERATIONAL_ENVELOPE.md` instead of copying speculative prices.

Current numeric cost inputs used by the governance model include:

- D1 paid reads: first 25B rows/month included, then `$0.001 / million rows`;
- D1 paid writes: first 50M rows/month included, then `$1.00 / million rows`;
- D1 storage: first 5 GB included, then `$0.75 / GB-month`;
- Queues: first 1M operations/month included, then `$0.40 / million operations`; normal delivery is roughly write + read + delete and retries add cost.

Workers/R2/Workflow/AI/Browser/optional-runtime pricing remains an external provider contract and must be re-checked before commercial plan commitments.

CF08 does not invent tenant monthly prices. WS11/product policy owns customer-facing quotas and commercial packaging.

## Recovery convergence

CF08 reuses WS12 tooling/evidence:

- D1 export + manifest/checksum + isolated replay verification;
- guarded restore drill;
- guarded destructive PITR with explicit confirmation/reason/fresh verified backup;
- regular Worker rollback tooling;
- bounded Queue retry + distinct DLQ enforcement;
- exact release safety and production health/release marker checks.

Open recovery boundaries remain:

- Workers-for-Platforms tenant/app user-worker canonical version rollback is not provider-proven;
- DLQ typed inspect/quarantine/replay belongs to WS10;
- encrypted off-account backup retention belongs to WS11;
- Workflow recovery waits for CF02 semantics;
- R2 generated-artifact retention/deletion converges with CF06/WS11;
- RTO/RPO/DR cadence remain unset.

## Release topology

Current full release authority remains:

```text
exact merged main target
 -> build
 -> migration plan
 -> fresh backup
 -> offline replay verify
 -> migration
 -> tenant Worker
 -> app Worker
 -> gateway/assets
 -> exact health/release marker convergence
```

Any CFMAX primitive must provision/verify its required resource or binding before dependent Worker deployment.

## Dependency Requests

### DR-CF08-01
Owner: CF03 / WS11  
Need: converge usage/cost dimension taxonomy with CF08 resource/cost taxonomy and preserve a reconciliation seam before telemetry is used for monetary billing.  
Blocked scope: production per-tenant cost reconciliation.  
Can continue independently: yes.

### DR-CF08-02
Owner: CF02 / WS12  
Need: Workflow resource authority, stuck/failure/retry/cancel/operator-recovery evidence contract.  
Blocked scope: Workflow recovery row in remote inventory/recovery evidence.  
Can continue independently: yes.

### DR-CF08-03
Owner: CF04 / WS11  
Need: desired-state authority and read-only drift evidence for WAF/rate-limit/Access/Turnstile production configuration.  
Blocked scope: edge-security resource inventory.  
Can continue independently: yes.

### DR-CF08-04
Owner: CF05 / CF03 / WS11  
Need: AI Gateway resource/spend/rate metadata and tenant attribution contract.  
Blocked scope: measured AI cost governance.  
Can continue independently: yes.

### DR-CF08-05
Owner: CF06 / WS12 / WS11  
Need: Browser Run/R2 export retention, generated-artifact cleanup and evidence contract.  
Blocked scope: render/export recovery/cost proof.  
Can continue independently: yes.

### DR-CF08-06
Owner: CF07 / WS00  
Need: every optional primitive actually adopted must supply naming, authority, cost, recovery and rollback classification before production convergence.  
Blocked scope: optional runtime inventory.  
Can continue independently: yes.

## Acceptance state

| Gate | State |
|---|---|
| source resource/config inventory | IMPLEMENTED |
| config authority classification | IMPLEMENTED |
| source drift validator | IMPLEMENTED |
| compatibility-date policy | IMPLEMENTED |
| cost/capacity taxonomy | IMPLEMENTED |
| provider-hard vs engineering-guard vs product-quota separation | IMPLEMENTED |
| recovery matrix | IMPLEMENTED using WS12 evidence + explicit dependencies |
| release dependency graph | IMPLEMENTED |
| emergency disable/rollback boundary | IMPLEMENTED |
| secrets committed by CF08 | NONE |
| destructive production action | NONE |
| remote production inventory | NOT RUN / UNVERIFIED |
| desired-vs-observed production drift | NOT PROVEN |
| measured production capacity/alerts | dependency / not proven by CF08 |
| Hardened | NO |

## Completion record

Owner: `ChatGPT-CF08`  
Started from: stale CFMAX baseline, then exact-main sync through PR `#526`  
Implementation checkpoint before final resync: `f4414cb9a9131a9d95a5d89db95f30a1b8b3beb8`  
Status: REVIEW  
Capability family: SRE/resource governance and CFMAX cross-cutting infrastructure; no maturity promotion beyond evidence  
Resource inventory: 14 committed configs + generated tenant authority classified  
Drift checks: source validator implemented; remote provider drift unverified  
Cost model: implemented as dimensions/guardrails, no invented customer pricing  
Recovery evidence: consumes WS12; no destructive recovery executed  
Release topology: defined and preserves backup-before-migration/exact convergence  
Production mutations: **none**  
Remaining promotion blocker: read-only production inventory/drift + dependent CF lanes + measured recovery/capacity evidence.
