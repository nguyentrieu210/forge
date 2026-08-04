# R6-01 — Provider + Exact Release Evidence Handoff

Date: 2026-08-04  
Branch: `agent/r6-01-provider-release`  
PR: #642  
Execution topology: **SINGLE**  
Risk: **CRITICAL evidence / production-boundary audit**  
Status: **BLOCKED — no production mutation performed**

## 1. Locked certification identity

R6-01 consumed the R6-00 lock without redefining it.

- exact certification candidate: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`;
- R6-01 control branch is newer only because it contains evidence tooling and this handoff;
- the evidence workflow checks out the locked candidate separately and runs source/runtime probes against that exact SHA;
- target: `PRODUCTION/PILOT_TARGET`, tenant `alu`, `https://alu.kairo.vn`;
- Gateway: `cloudforge-gateway`;
- tenant Worker: `cloudforge-tenant-alu`;
- app Worker: `cloudforge-app-alumdoor`;
- dispatch namespace: `cloudforge-production`.

No historical ALU production evidence was promoted into current R6 evidence.

## 2. Evidence execution

Canonical read-only run:

- workflow: `.github/workflows/r6-01-provider-release.yml`;
- run: `30907993199`;
- control head: `f5e20b53208a373f29424b9ffb79494072141a8b`;
- evidence artifact: `r6-01-provider-release-30907993199` / artifact `8891834985`;
- artifact digest: `sha256:82ccb81cb9c4adddb0c4925301eca1e181069b94094836d88b50c307b3b52f41`;
- provider observation: `2026-08-04T12:11:37.963Z`;
- public release observation: `2026-08-04T12:11:37.834Z`;
- mutation classification: `NONE`.

The first run exposed a harness parsing defect for Cloudflare's deployment response. R6-01 corrected the harness to consume the documented `result.deployments[]` shape and reran the evidence. The blocker set below is from the corrected run only.

## 3. R6-E01 — Cloudflare desired-state source governance

**PASS**

Exact candidate source passed the repository's canonical validators:

- `server/scripts/verify-cloudflare-governance.mjs --json`;
- `server/scripts/verify-observability-config.mjs`.

The governed source/config authority remained internally consistent. R6-01 did not reinterpret source presence as provider deployment proof.

## 4. R6-E02 — Remote desired-vs-observed provider inventory

**BLOCKED**

Read-only Cloudflare inventory successfully observed the pilot-used resource family:

- `cloudforge-gateway` readable with active deployment history;
- required Gateway bindings `ASSETS`, `ROUTES`, `DISPATCHER`, `CONTROL` present;
- `cloudforge-control-plane` readable;
- `cloudforge-production` dispatch namespace readable;
- `cloudforge-tenant-alu` readable;
- `cloudforge-app-alumdoor` readable;
- Alumdoor app bindings `PLATFORM` and `AI` present.

One exact desired-vs-observed binding drift remains:

- locked candidate generator `server/scripts/tenant-wrangler.mjs` requires tenant binding `BROWSER`;
- observed `cloudforge-tenant-alu` bindings do **not** contain `BROWSER`;
- other required observed tenant bindings include `DB`, `FILES`, `AGGREGATES`, `OUTBOX_QUEUE`, `SOCIAL_INGRESS`, `DISPATCHER`, `AI`.

R6-01 did not repair this drift. Re-deploying the tenant Worker or performing a full ALU release is a production mutation.

## 5. R6-E03 — Exact health/auth boundary

**PASS**

Fresh public observation against `https://alu.kairo.vn`:

- `/health` -> `200`, `ok=true`;
- `/` -> `200`;
- unauthenticated `/api/method/metaforge.api.get_boot` -> `403`.

The live service is healthy and retains the expected guest-boot boundary. This does not prove the locked release is deployed.

## 6. R6-E04 — Exact release marker

**BLOCKED**

Fresh `/release.json` observation:

- expected candidate: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`;
- observed release SHA: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`;
- observed bundle hash: `0f569841cc0ff19c`;
- marker returned `200` and a canonical non-empty 16-hex bundle hash;
- exact SHA convergence fails because the live release SHA is not the R6 candidate.

Therefore the currently served ALU release is operational history, not current-candidate certification evidence.

## 7. R6-E05 — Provider observability

**BLOCKED**

Provider-observed state:

- Gateway observability: enabled; logs enabled; traces enabled;
- ALU tenant Worker observability: enabled; logs enabled; traces enabled;
- Alumdoor app Worker observability: **not observed / absent**.

This is consistent with the locked candidate source: `server/apps-src/alumdoor-worker/wrangler.jsonc` contains the `PLATFORM` service and `AI` bindings but no `observability` block, while `server/config/cloudflare-governance.json` classifies Alumdoor app observability as an owner dependency.

This cannot be truthfully certified as E05 PASS.

## 8. Evidence table

| ID | Result | Level | Mutation | Exact blocker / proof |
|---|---|---|---|---|
| R6-E01 | **PASS** | `SOURCE` | `NONE` | canonical source-governance validators pass on locked candidate |
| R6-E02 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | `NONE` | live `cloudforge-tenant-alu` lacks candidate-required `BROWSER` binding |
| R6-E03 | **PASS** | `PILOT_TARGET_OBSERVED` | `NONE` | health 200/ok, root 200, guest boot 403 |
| R6-E04 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | `NONE` | live SHA `cf5dd0...` != locked candidate `4149af...` |
| R6-E05 | **BLOCKED** | `PILOT_TARGET_OBSERVED` | `NONE` | Alumdoor app Worker logs/traces observability not observed |

## 9. Dependency Requests

### DR-R6-01-01 — Exact live release convergence

**Dependency:** explicit production mutation authorization.

Exact release action already defined by R6-00:

`ALU Build and Deploy -> scope=full -> confirm=alu -> target_sha=4149af7c3e49b25fb1f43a50b62f99d7c04e6488`

Why required:

- E04 cannot PASS until production serves the exact locked candidate;
- the full release would also regenerate/redeploy the tenant Worker and is the canonical path capable of closing the observed `BROWSER` drift if no provider/runtime incompatibility intervenes.

Boundary:

- R6-01 does **not** execute this workflow without explicit production authorization;
- after any authorized deployment, rerun E02-E05 fresh; do not reuse this artifact as post-deploy proof.

### DR-R6-01-02 — Alumdoor app observability source gap

**Dependency:** bounded source/config owner fix + R6-00 candidate reissue.

Required condition:

- the Alumdoor app Worker must expose the logs/traces observability expected by R6-E05 without leaking secrets/request bodies.

Reason this is not repaired inside the locked candidate:

- adding the missing observability configuration changes Worker/runtime config source;
- the R6 evidence invalidation contract therefore requires a new candidate identity and affected evidence rerun;
- silently changing the candidate from R6-01 would violate the R6-00 lock.

## 10. Merge/deploy boundary

R6-01 adds certification tooling and evidence documentation only. These are non-UI changes.

- PR #642 is the review/convergence vehicle;
- do not merge/deploy #642 without explicit approval;
- no production deploy/redeploy/rollback was performed;
- no resource/binding/DNS/domain/route/secret mutation was performed;
- no customer data was written;
- no drift was auto-repaired.

## 11. Verdict

The provider account and live target were observable read-only, so R6-01 is not blocked by missing credentials. The actual blockers are now exact and reproducible: one tenant binding drift, one release-SHA mismatch, and one app-worker observability source/provider gap.

R6-01-BLOCKED: E02 live ALU tenant Worker lacks candidate-required BROWSER binding; E04 production release SHA is cf5dd0da5b0154374a4ce371d7b122cd059a0bb2 instead of locked candidate 4149af7c3e49b25fb1f43a50b62f99d7c04e6488; E05 Alumdoor app Worker observability is absent and requires a source/config fix plus candidate reissue.
