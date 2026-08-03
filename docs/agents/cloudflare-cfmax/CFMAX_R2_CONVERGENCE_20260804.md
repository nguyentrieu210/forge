# CFMAX R2 Convergence Evidence — 2026-08-04

Status: **MERGED TO MAIN — SOURCE CONVERGENCE COMPLETE; PROVIDER/PRODUCTION EVIDENCE PENDING**
Repository: `nguyentrieu210/forge`
Exact R2 baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Convergence branch: `cloudflare/cfmax-09-convergence-r2`
Canonical PR: `#570` — MERGED
Merged PR head: `4705fe6c4f22ddaf1fe397d433f7361dd953f94b`
Canonical merge commit: `main@88a349e3f4267aa749d791b504cb7a7c13f3e9b5`
Final exact-head integrated run: `30854860156` — SUCCESS
Risk mix: STANDARD + CRITICAL
Production/provider mutation performed by merge: NONE

## 1. Why R2 existed

The original CFMAX worker sessions stopped at mixed GitHub states. Exact GitHub state showed CF02 still at bootstrap, stale CRITICAL branches, and reusable implementations with uneven verification. The coordinator therefore re-audited exact source, rebuilt stale lanes on current main, converged all eight outcomes, reconciled Cloudflare governance pins, and validated one common candidate before merge.

## 2. Canonical lane result

| Lane | Source result | Current maturity / decision |
|---|---|---|
| CF01 | merged | D1 Sessions/bookmark consistency **Wired**; real replica/latency proof pending |
| CF02 | merged | durable route-index Workflow **Wired**; deployed recovery proof pending |
| CF03 | merged | `O01-003` Wired; `T01-008` Foundation; Analytics Engine dormant |
| CF04 | merged | perimeter source contract **Wired**; provider activation proof pending |
| CF05 | merged | AI policy/Gateway source seam merged; provider/spend-policy proof pending |
| CF06 | merged | Browser Run render/export source **Wired**; live execution proof pending |
| CF07 | no runtime adoption | **DEFERRED** for Dynamic Workers, Containers/Sandbox, Hyperdrive and Pipelines |
| CF08 | merged | source/config governance merged; remote desired-vs-observed state unverified |

Merged source does not imply production RC or Hardened maturity.

## 3. CF01 result

The stale CF01 branch would have overwritten newer Finance report code. R2 preserved current Query Worker behavior and replayed only the consistency contract:

- authoritative command/status/reconciliation paths use `first-primary`;
- replica-safe report paths inherit caller bookmark or start `first-unconstrained`;
- prepared-report queue payload carries the post-command bookmark;
- existing client bookmark transport remains the only client consistency state;
- non-sensitive D1 routing observations are available;
- real-workerd D1/bookmark regressions pass.

Production read replication was not enabled.

## 4. CF02 result

The original CF02 branch never left bootstrap. R2 implemented the first durable Workflow vertical around the existing route-index rebuild authority:

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

Workflow does not write D1/KV directly. Queue remains the separate delivery/fan-out primitive. No Workflow resource or secret was deployed by this program.

## 5. CF04 result

R2 replayed only evidence-backed perimeter source changes:

- `workers_dev=false`;
- `preview_urls=false`;
- machine-readable perimeter policy;
- no invented numeric rate thresholds;
- no generic Turnstile challenge on machine/API traffic;
- Forge auth remains authoritative;
- Access is defense-in-depth only for selected operator/service surfaces;
- CF08 owns provider apply/drift/rollback.

No WAF/Rulesets/Access/Turnstile/DNS/secret mutation occurred.

## 6. CF08 governance reconciliation

The convergence candidate deliberately reconciled source-governance pins after CF02/CF04/CF06 changed Cloudflare configs. The final validator reported:

```text
CLOUDFLARE_GOVERNANCE_PASS
configs=15
generated_authorities=1
resources=46
compatibility_dates=2026-07-23,2026-07-27,2026-07-30,2026-08-03,2026-08-04
remote_observation=unverified
owner_dependencies=4
```

The validator was satisfied by updating source truth, not by weakening drift checks.

## 7. Final exact-head validation

PR head `4705fe6c4f22ddaf1fe397d433f7361dd953f94b` ran GitHub Actions `30854860156` and finished **SUCCESS** before merge.

Passed in one candidate:

1. locked dependency install;
2. focused CF01 TypeScript;
3. focused CF02 Workflow build;
4. focused CF03 telemetry build;
5. focused CF05 AI build;
6. CF06 charts/visual/views build chain;
7. Query Worker real-workerd D1 suite: 9/9;
8. combined CFMAX Node regressions: 28/28;
9. CF08 source/blob/config governance validation;
10. canonical Gateway runtime + warehouse PWA build/stage/check;
11. Gateway Wrangler dry-run bundle;
12. Tenant Worker Wrangler dry-run bundle;
13. Query Worker binding/type parse;
14. Workflow Worker Wrangler dry-run bundle.

## 8. Baseline-wide TypeScript debt

An earlier convergence attempt intentionally ran the repository-wide server TypeScript build. It failed in pre-existing Manufacturing, CRM, App Factory, QMS and Frappe-model exact-optional-property errors outside the CFMAX diff.

CFMAX did not edit unrelated ERP modules merely to manufacture a global PASS. The final gate therefore used blast-radius compilation plus actual Worker bundle/dry-run validation. The baseline debt remains unresolved and separately owned.

## 9. Post-merge state

PR `#570` merged at `88a349e3f4267aa749d791b504cb7a7c13f3e9b5`.

All declared CFMAX source lanes are therefore closed as merged source work except CF07, whose correct outcome is DEFERRED. Post-merge canonical status is recorded in `CFMAX_R2_POST_MERGE_20260804.md` and `AGENT_BOARD.md`.

## 10. Remaining provider / production gates

Still open:

- D1 real read-replica enablement, observed serving region/primary behavior and APAC correctness/latency benchmark;
- deployed Workflow instance with retry/resume/restart/terminate/recovery proof;
- Analytics Engine live binding/query/reconciliation evidence if adopted;
- WAF/rate-limit/Turnstile/Access provider activation and measured false-positive/client-compatibility evidence where adopted;
- AI Gateway resource/config/spend-policy/privacy evidence;
- Browser Run live execution evidence;
- read-only Cloudflare desired-vs-observed inventory;
- controlled rollback/restore/PITR exercise with RTO/RPO evidence;
- RC/Hardened promotion only after matching provider/production evidence exists.

## 11. Production boundary

The merge to `main` did not deploy Workers, enable D1 replicas, create Workflow/Analytics/AI Gateway resources, modify WAF/Access/Turnstile/DNS/secrets, run PITR or mutate customer data.

Those remain separate CRITICAL operations requiring explicit authorization and environment evidence.
