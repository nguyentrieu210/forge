# CF02 R2 — Cloudflare Workflows / Durable Orchestration

Date: 2026-08-04
Status: REVIEW — source implementation and exact-head CI complete; remote Workflow proof pending
Branch: `cloudflare/cfmax-02-workflows-r2`
Exact replay baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: CRITICAL
Primary authority: WS09 orchestration/BPM; control-plane route authority remains unchanged

## Takeover decision

The original `cloudflare/cfmax-02-workflows` branch never moved beyond `READY`. R2 is a clean replay from exact current main rather than continuing the stale bootstrap branch.

## Representative vertical

Selected: **control-plane tenant route-index rebuild**.

Why this is the first Workflow:

- current control-plane already owns the authoritative D1 route registry and KV routing projection;
- `/v1/routes/rebuild-index` is paginated and recovery-oriented;
- without a durable orchestrator, an operator/client must repeatedly call the endpoint and retain the cursor;
- each page is already idempotent projection work and does not invent business-domain mutation semantics;
- the use case is long-running/retryable and therefore materially better suited to Workflows than a single Queue fan-out.

Not selected yet:

- tenant provisioning: current authoritative provisioning command surface is not complete enough to wrap without inventing new lifecycle authority;
- prepared reports: existing Queue semantics are already appropriate for independent asynchronous report delivery;
- finance/stock repost: domain correction/reversal authority belongs to domain controllers and is not a CF02-owned first slice.

## Architecture

```text
operator/control API
  -> workflow-worker
     -> ROUTE_INDEX_REBUILD Workflow binding
        -> durable step.do per page
           -> CONTROL service binding
              -> existing /v1/routes/rebuild-index
                 -> CONTROL_DB authoritative D1
                 -> ROUTES KV projection
```

Workflow never writes D1/KV directly.

## Implemented

### Workflow authority

Added `server/apps/workflow-worker/src/index.ts` with exported `RouteIndexRebuildWorkflow`.

- current Cloudflare `WorkflowEntrypoint<Env, Params>` contract;
- each page runs inside `step.do`;
- page retries: 5, exponential backoff from 2 seconds;
- per-step timeout: 2 minutes;
- state advances only from persisted step output;
- no random/time-dependent branch controls workflow replay;
- control-plane errors fail the step and enter provider retry behavior.

### Idempotent start

`POST /v1/workflows/route-index-rebuild` requires a caller `request_id` and maps it deterministically to `route-index:<request_id>`.

The trigger uses `Workflow.createBatch()` with one instance because current Cloudflare Workers API documents this method as idempotent for an already-used instance ID. A replay retrieves the existing instance rather than launching duplicate route rebuild work.

### Operator lifecycle

Implemented authenticated:

- start;
- status;
- restart;
- terminate.

The workflow-worker uses a separate `WORKFLOW_TOKEN` operator secret. Calls to control-plane use the existing `CONTROL_TOKEN` via a service binding. No secret value is committed.

### Provider configuration

`server/apps/workflow-worker/wrangler.jsonc` declares:

- `CONTROL` service binding to `cloudforge-control-plane`;
- `ROUTE_INDEX_REBUILD` Workflow binding;
- `RouteIndexRebuildWorkflow` class;
- 10,000-step provider limit;
- observability enabled.

No Workflow resource was deployed by this branch.

### Forge runtime typing

The repository's own `server/types/cloudflare-runtime.d.ts` previously shadowed `cloudflare:workers` with Durable Object declarations only, so current Workflows runtime types could not compile even though Wrangler supported the feature. CF02 extends that canonical Forge runtime declaration with the minimum current Workflows contracts used by the implementation: `WorkflowEntrypoint`, `WorkflowEvent`, `WorkflowStep`, `Workflow`, instance lifecycle and status types. This is a type-surface update only; it does not create a second runtime authority.

## Contract / correctness guards

`contracts.ts` enforces:

- request IDs safe and bounded so provider instance ID remains <=100 chars;
- trace transport safety;
- page size reuses the existing control-plane contract `1..1000`;
- cursor transport safety;
- control-plane page count cannot exceed the requested endpoint page limit;
- continuation cursor must advance;
- an empty page cannot claim a continuation cursor.

## Queue vs Workflow decision

- Queue remains correct for independent fan-out/delivery such as prepared-report jobs/outbox delivery.
- Workflow is used for durable, ordered, persisted multi-step orchestration and operator lifecycle.
- Durable Objects remain coordination/serialization.
- D1/document/domain commands remain authoritative.

## Validation

Added:

- `server/tests/cfmax-workflow-orchestration.test.mjs`;
- `.github/workflows/cf02-validation.yml`.

Focused CI gates:

1. frozen-lock install;
2. focused TypeScript check;
3. focused build;
4. contract/idempotency/cursor regressions;
5. Wrangler Workflow config dry-run.

Validation history:

- run `30852510948`: **FAIL** at TypeScript because Forge's local `cloudflare:workers` declaration did not yet contain Workflows types; no later step was claimed as passed;
- fix `a9c0b0367584ed51286fa3d1f6fb8e580e86a795`: extend canonical Forge runtime declarations from current provider contract;
- exact-head run `30852724589`: **PASS** for locked install, focused TypeScript, focused build, Workflow regressions and Wrangler dry-run.

The documentation-only completion update after that green code head must preserve the same source tree; convergence will run an integrated exact-head gate again.

## Production / provider truth

Not claimed:

- deployed Workflow resource;
- remote route-index execution;
- production token configuration;
- production recovery exercise;
- cost/step measurements from live workload.

No DNS, secret, D1, KV, tenant, migration or production resource was mutated.

## Maturity

Current evidence supports **Wired**.

RC additionally requires a remote non-production Workflow instance showing persisted page steps, retry/restart/terminate behavior and expected D1->KV convergence. Hardened additionally requires production recovery/alerting/usage evidence.

## Completion record

Owner: coordinator takeover / CF02 R2
Original branch: `cloudflare/cfmax-02-workflows` — superseded, bootstrap-only
R2 branch: `cloudflare/cfmax-02-workflows-r2`
Baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
PR: `#555` draft -> `main`
Validated code head: `a9c0b0367584ed51286fa3d1f6fb8e580e86a795`
Exact-head CI: run `30852724589` **PASS**
Changed zones: workflow-worker app; canonical Cloudflare runtime type declarations; focused test; focused CI; this handoff
Migration: none
Production mutation: none
Dependencies for later RC: CF03 workflow telemetry; CF08 deployed-resource/drift/cost evidence
Remaining gap: remote non-production Workflow/recovery proof only; not required to claim source completion/Wired
Merge boundary: do not merge to main or deploy without explicit approval
