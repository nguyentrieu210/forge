# CFMAX R2 Post-Merge Evidence — 2026-08-04

Status: SOURCE MERGED / PROVIDER EVIDENCE PENDING
Repository: `nguyentrieu210/forge`
Canonical merge PR: `#570`
Canonical merge commit: `main@88a349e3f4267aa749d791b504cb7a7c13f3e9b5`
Merged PR head: `4705fe6c4f22ddaf1fe397d433f7361dd953f94b`
Final exact-head integrated run before merge: `30854860156` — SUCCESS
Production/provider mutation performed by this merge: NONE

## Canonical result

CFMAX R2 source convergence is now merged to `main`.

The merge contains the resolved outcome of all eight lanes:

| Lane | Source delivery state | Maturity / decision after merge |
|---|---|---|
| CF01 | DONE | D1 Sessions/bookmark consistency is Wired; real replica-serving/latency proof pending |
| CF02 | DONE | route-index durable Workflow vertical is Wired; deployed Workflow/recovery proof pending |
| CF03 | DONE | `O01-003` Wired; `T01-008` Foundation; Analytics Engine remains dormant until live adoption evidence |
| CF04 | DONE | edge-security source contract is Wired; provider rule activation/false-positive proof pending |
| CF05 | DONE | AI policy/Gateway source seam merged; provider resource/spend-policy evidence pending |
| CF06 | DONE | Browser Run render/export source is Wired; live provider execution evidence pending |
| CF07 | DEFERRED | Dynamic Workers, Containers/Sandbox, Hyperdrive and Pipelines remain deferred by workload evidence |
| CF08 | DONE | source/config governance merged; remote desired-vs-observed state remains unverified |

`DONE` here means the declared source scope reached canonical `main` with verification. It does not imply production RC or Hardened maturity.

## Exact verification inherited by the merge

PR `#570` was merged only after exact-head integrated run `30854860156` succeeded on head `4705fe6c4f22ddaf1fe397d433f7361dd953f94b`.

The common candidate passed:

- locked monorepo install;
- focused CF01 TypeScript;
- focused CF02 Workflow build;
- focused CF03 telemetry build;
- focused CF05 AI build;
- CF06 charts/visual/views dependency build;
- Query Worker real-workerd D1 suite: 9/9;
- combined CFMAX Node regressions: 28/28;
- CF08 source/blob/config governance validation;
- canonical Gateway runtime + warehouse PWA build/stage/check;
- Gateway Wrangler dry-run bundle;
- Tenant Worker Wrangler dry-run bundle;
- Query Worker binding/type parse;
- Workflow Worker Wrangler dry-run bundle.

## Baseline debt deliberately not reclassified

A repository-wide server TypeScript attempt failed in pre-existing Manufacturing, CRM, App Factory, QMS and Frappe-model exact-optional-property errors outside the CFMAX diff.

CFMAX did not alter those files merely to make a global badge green. The final gate therefore used blast-radius compilation plus actual Worker bundle/dry-run validation. This baseline debt remains separate and unresolved.

## Remaining provider / production gates

The next CFMAX phase is evidence and controlled rollout, not another source-convergence wave:

1. D1 read-replica enablement in an approved non-production environment, observed `served_by_region` / primary behavior and APAC correctness/latency measurements.
2. Deployed Workflow Worker with retry, resume/restart, terminate and recovery evidence for route-index rebuild.
3. Analytics Engine dataset/binding only if operational usage/cost telemetry is actually adopted; prove tenant separation and reconciliation before billing/quota authority.
4. WAF/rate-limit/Turnstile/Access proof where adopted, with machine-client compatibility and measured false-positive behavior.
5. AI Gateway resource/config/spend-policy activation and privacy/cost evidence before relying on gateway enforcement.
6. Browser Run live execution proof in an approved environment.
7. Read-only Cloudflare desired-vs-observed resource inventory and drift report.
8. Controlled rollback/restore/PITR exercise with RTO/RPO evidence before any Hardened claim.

## Production boundary

The merge itself did not deploy Workers, enable D1 replicas, create Workflow/Analytics/AI Gateway resources, modify WAF/Access/Turnstile/DNS/secrets, run PITR or mutate customer data.

Those operations remain separate CRITICAL actions and require explicit authorization plus environment/provider evidence.
