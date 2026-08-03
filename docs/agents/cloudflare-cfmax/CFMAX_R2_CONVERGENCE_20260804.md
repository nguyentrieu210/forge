# CFMAX R2 Convergence Evidence — 2026-08-04

Status: REVIEW READY — source convergence complete; provider/production evidence remains gated
Repository: `nguyentrieu210/forge`
Exact R2 baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Convergence branch: `cloudflare/cfmax-09-convergence-r2`
Draft PR: `#570` -> `main`
Risk mix: STANDARD + CRITICAL
Production mutation: NONE

## 1. Why R2 exists

The original CFMAX worker sessions stopped at mixed states. Exact GitHub state showed one worker (`CF02`) still at bootstrap `READY`, several workers on stale ancestry, and several workers with implementation but missing exact-head execution evidence.

The coordinator therefore took over rather than trusting chat-level "done" claims:

1. freeze exact then-current `main`;
2. create a fresh convergence branch from that SHA;
3. replay stale CRITICAL lanes onto current source instead of merging stale implementations over newer code;
4. finish CF02 from zero on a fresh R2 branch;
5. resynchronize reusable workers to current main before internal convergence;
6. run lane-level exact-head validation;
7. reconcile CF08 source-governance pins after all Cloudflare configs converged;
8. run one integrated convergence gate on the common candidate.

No CFMAX worker was merged to `main` and no Cloudflare production resource was changed during this takeover.

## 2. Converged lane truth

| Lane | Execution result | Current source maturity / decision | Evidence |
|---|---|---|---|
| CF01 | clean R2 replay on current Query Worker | Wired; remote replica proof pending | exact-head run `30853819015` PASS; 9 real-workerd D1 tests in integrated gate |
| CF02 | original branch superseded; R2 implemented durable route-index Workflow | Wired; remote Workflow proof pending | exact-head run `30852724589` PASS |
| CF03 | request usage telemetry seam converged | `O01-003` Wired; `T01-008` Foundation | integrated telemetry build/tests; Analytics Engine remains dormant |
| CF04 | clean R2 edge replay | Wired; provider activation pending | exact-head run `30853280402` PASS |
| CF05 | AI policy R2 converged | source review candidate; provider/cost dependencies remain | focused run `30849757932` PASS |
| CF06 | Browser Run render/export converged | Wired; remote Browser Run proof pending | exact-head run `30849817637` PASS |
| CF07 | optional runtime evaluation complete | DEFERRED by evidence | Dynamic Workers, Containers/Sandbox, Hyperdrive and Pipelines all deferred |
| CF08 | production governance source converged | source governance complete; remote observed state unverified | integrated governance validator PASS |

`REVIEW`/`Wired` does not mean production RC. Source presence, unit tests and dry-run bundle evidence are not substitutes for provider/live evidence.

## 3. CF01 takeover result

The stale CF01 branch could not be merged directly because current main had a newer Finance report compiler. R2 preserved that compiler and replayed only the D1 consistency contract.

Implemented:

- one D1 session-policy seam;
- authoritative command/status/reconciliation paths use `first-primary`;
- replica-safe report paths inherit a caller bookmark or start `first-unconstrained`;
- prepared-report queue payload carries the post-command bookmark;
- the existing client adapter bookmark interceptor remains the only client transport authority;
- non-sensitive `served_by_region` / `served_by_primary` observation seam;
- real-workerd D1 report/bookmark coverage.

Production read replication was not enabled.

## 4. CF02 takeover result

Exact GitHub state proved the original `cloudflare/cfmax-02-workflows` branch never left `READY`.

R2 selected the existing control-plane route-index rebuild as the first representative durable Workflow because it already has a canonical D1 -> KV projection authority and a paginated recovery contract.

Implemented:

```text
operator
  -> workflow-worker
     -> ROUTE_INDEX_REBUILD Workflow
        -> persisted step.do per page
           -> CONTROL service binding
              -> existing /v1/routes/rebuild-index
                 -> CONTROL_DB D1 authority
                 -> ROUTES KV projection
```

Workflow never writes D1/KV directly. Queue remains the independent fan-out/delivery primitive.

The repository's local Cloudflare runtime declaration was also extended with the Workflows type surface required by current Cloudflare Workers APIs.

No Workflow resource or secret was deployed.

## 5. CF04 takeover result

The stale CF04 branch had policy code but explicitly no executed test evidence. R2 replayed the evidence-backed source change on current main:

- `workers_dev=false`;
- `preview_urls=false`;
- source-controlled perimeter policy;
- no arbitrary numeric rate thresholds;
- no generic Turnstile on machine/API traffic;
- tenant login remains Forge auth, not Cloudflare Access;
- Access remains only defense-in-depth for selected operator/service surfaces;
- CF08 remains provider apply/drift authority.

No WAF, Rulesets, Access, Turnstile, DNS or secret mutation occurred.

## 6. CF08 governance reconciliation

After convergence, the original CF08 manifest was intentionally stale because CF02/CF04/CF06 changed Cloudflare configuration sources.

The convergence branch updated `server/config/cloudflare-governance.json` to:

- pin the new Gateway Wrangler blob;
- pin the new tenant-worker Wrangler blob;
- pin the changed tenant Wrangler generator blob;
- classify the new Workflow Worker Wrangler source;
- keep remote Cloudflare observation explicitly `unverified`.

Integrated validation returned:

```text
CLOUDFLARE_GOVERNANCE_PASS
configs=15
generated_authorities=1
resources=46
compatibility_dates=2026-07-23,2026-07-27,2026-07-30,2026-08-03,2026-08-04
remote_observation=unverified
owner_dependencies=4
```

The validator was fixed by reconciling source truth, not by weakening or disabling drift checks.

## 7. Integrated validation evidence

Source-equivalent convergence head before this evidence-document update:

`1d7a4adb8eafd3d2f49b39ce87314f871d267395`

GitHub Actions run:

`30854610958` — **SUCCESS**

Exact-head integrated steps passed:

1. locked dependency install;
2. focused CF01 TypeScript;
3. focused CF02 Workflow build;
4. focused CF03 telemetry build;
5. focused CF05 AI build;
6. CF06 charts/visual/views build chain;
7. Query Worker real-workerd D1 suite: 2 files / 9 tests;
8. combined CFMAX Node regressions: 28/28 PASS;
9. CF08 source/blob/config governance validation;
10. build and stage canonical Gateway runtime + warehouse PWA assets;
11. Gateway Wrangler dry-run bundle with telemetry + edge source;
12. Tenant Worker Wrangler dry-run bundle with Browser Run + AI policy;
13. Query Wrangler binding/type parse;
14. Workflow Worker Wrangler dry-run bundle.

This is the integrated source/convergence gate. It is not a production Cloudflare test.

## 8. Baseline-wide TypeScript debt discovered, not hidden

The first integrated gate attempted the repository-wide server TypeScript build and failed in files outside the CFMAX diff, including existing Manufacturing, CRM, App Factory, QMS and Frappe-model exact-optional-property errors.

`main -> CFMAX R2` diff was audited and those failure files are not modified by CFMAX.

The convergence gate was therefore corrected to blast-radius validation instead of making CFMAX silently repair unrelated ERP debt. The failed baseline-wide build remains evidence and is not represented as PASS.

## 9. What is complete

Complete to the non-production REVIEW boundary:

- all eight worker outcomes are resolved;
- original stale/bootstrap branches have a clear R2/superseded interpretation;
- CF01/02/04 missing execution gaps were closed with exact-head CI;
- reusable CF03/05/06/07/08 work is converged on one exact-main ancestry;
- shared Cloudflare config governance is reconciled;
- one common integrated gate passes;
- no duplicate D1/document/permission authority was introduced;
- no optional Cloudflare primitive was adopted merely to increase product count.

## 10. What is deliberately not complete

Still gated behind provider/non-production/production authorization and evidence:

- actual D1 read-replica enablement, observed replica serving and APAC latency benchmark;
- deployed Cloudflare Workflow instance with retry/restart/terminate recovery proof;
- Analytics Engine dataset/binding and live tenant-separated query evidence;
- WAF/rate-limit/Turnstile/Access provider activation and measured false-positive evidence;
- AI Gateway provider resource/config/spend-policy activation;
- live Browser Run execution evidence if not already available in an approved non-production environment;
- remote Cloudflare desired-vs-observed inventory;
- production rollback/PITR/recovery exercise;
- canonical RC/Hardened maturity promotion.

These are not source TODOs that an autonomous agent should fake. They are provider/production evidence gates.

## 11. Merge boundary

Draft PR `#570` is the current convergence candidate.

Do not merge it to `main` and do not deploy/provider-apply from it without explicit user approval. Backend/shared/infrastructure policy remains in force.
