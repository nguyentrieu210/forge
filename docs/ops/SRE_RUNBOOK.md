# Forge SRE / Release / Data Safety Runbook

> Canonical implementation lives in `server/scripts/**`, Worker `wrangler.jsonc` files and `.github/workflows/alu-build-deploy.yml`. This runbook explains operator intent; it is not permission to mutate production.

## 1. Safety model

Forge separates four things that are often carelessly called “rollback”:

1. **Gateway/UI release** — static runtime bundle + Gateway Worker version.
2. **Worker code/config release** — a Cloudflare Worker version and its bindings/config.
3. **D1 state** — authoritative database state, restored independently through Time Travel/PITR.
4. **R2/KV/external state** — not rolled back by Worker version rollback or D1 Time Travel.

Never assume rolling a Worker version backwards also rolls business data backwards.

Production mutation requires explicit authorization. Every destructive operator script defaults to plan/read-only mode and requires an exact target plus confirmation for execution.

## 2. Release lanes

### UI-only lane

Canonical workflow: `.github/workflows/alu-build-deploy.yml`, scope `ui`.

Invariant:
- source revision must be merged into `main`;
- automatic push lane accepts `client/**` plus documentation-only companions and refuses backend/schema files;
- build runtime + warehouse mobile bundle;
- stage a public `release.json` with exact `releaseSha` and bundle hash;
- deploy Gateway only;
- converge through `server/scripts/sre-health-snapshot.mjs`;
- evidence contains health/boundary/release marker only, no credentials.

`release.json` identifies the **gateway UI bundle revision**. It does not claim Tenant/App Workers or storage were deployed at the same SHA.

### Full ALU lane

Canonical workflow scope `full`, manual only with `confirm=alu`.

Order is mandatory:

`merged target -> build -> migration plan -> fresh backup -> offline replay verify -> migrate -> tenant worker -> app worker -> gateway -> exact release health snapshot`

Do not reorder migration after code deployment. A schema-behind tenant has caused live login failure before.

The deployment target and the verification control plane are intentionally separated. The release jobs build/deploy the exact target SHA; the final read-only convergence job checks out current `main` and uses the newest SRE probe. This keeps rollback to an older source revision verifiable even when that old revision predates the current SRE tooling.

Repository guard:

```text
npm --prefix server run verify:release-safety
```

It locks merged-main targeting, backup-before-migration ordering, current-main convergence verification and the rule that plaintext SQL backups never enter GitHub artifacts.

## 3. Backup verification

Create export:

```text
node server/scripts/backup-tenant.mjs --tenant <tenant> --execute --output-dir <secure-dir>
```

Verify without touching Cloudflare:

```text
node server/scripts/verify-tenant-backup.mjs --tenant <tenant> --file <backup.sql> --output <evidence.json>
```

Default verification requires the adjacent `forge-d1-backup/v1` manifest and validates tenant/database/file/byte-count/SHA/timestamp. It replays SQL in isolated SQLite, runs integrity + foreign-key checks and refuses core cross-tenant rows.

A backup that has not replayed successfully is not considered proven restorable.

Plaintext SQL exports must not be committed or uploaded as GitHub artifacts. The current repository does not yet define encrypted durable off-account retention; see dependency request to WS11.

## 4. Restore drill

Remote restore rehearsal targets a **new empty database only**:

```text
node server/scripts/restore-tenant-drill.mjs \
  --tenant <tenant> \
  --target cloudforge-drill-<name> \
  --file <backup.sql>
```

Dry-run is default. Execution additionally requires the script's explicit confirm. The drill never changes tenant routing and rejects live database naming. Evidence records checksum, table/migration counts, integrity/FK/tenant-scope checks and restore duration.

## 5. D1 Time Travel / PITR

Read-only plan:

```text
node server/scripts/d1-pitr.mjs --tenant <tenant> --timestamp <RFC3339-or-unix>
```

or:

```text
node server/scripts/d1-pitr.mjs --tenant <tenant> --bookmark <bookmark>
```

Execution is destructive and requires all of:
- exact tenant confirmation;
- operator reason;
- secure backup directory;
- fresh SQL export;
- successful offline replay verification.

The tool validates the provider JSON response, verifies the resulting current bookmark and records the provider/preflight previous bookmark as `undo_bookmark`. PITR affects D1 only; it does not revert KV, R2, queues or external systems.

## 6. Worker rollback

Read-only plan for **regular first-party Workers**:

```text
node server/scripts/rollback-worker.mjs --worker <worker> --version <exact-version-id>
```

Execution requires exact Worker confirmation + reason. Post-rollback deployment state must contain the requested version or the tool fails.

Worker rollback restores Worker code/config version only. It must not be used to pretend a non-backward-compatible schema migration has been undone.

Current `rollback-worker.mjs` intentionally covers regular Workers such as Gateway, Jobs, Control Plane, Social Ingress and Query. It does **not** claim equivalent version rollback for Workers-for-Platforms user Workers deployed into a dispatch namespace (tenant/app Workers). Until a canonical provider/source-redeploy contract is proven for those workers, full-release rollback remains partial: prefer a verified compatible forward/source redeploy and never invent a version rollback command that the platform does not expose.

## 7. Health / release evidence

Read-only local probe:

```text
node server/scripts/sre-health-snapshot.mjs --base http://127.0.0.1:8787
```

Remote probing requires explicit `--allow-remote --confirm-host <host>`.

The probe checks:
- `/health` returns `200` + `{ok:true}`;
- `/` is served;
- unauthenticated boot remains `403`;
- `/release.json` exists and contains a bundle hash;
- optional expected release SHA matches exactly.

It supports bounded retry for deploy convergence and writes machine-readable evidence.

## 8. Performance / load smoke

Default target is localhost and only GET/HEAD are permitted:

```text
node server/scripts/http-load-smoke.mjs \
  --url http://127.0.0.1:8787/health \
  --requests 100 \
  --concurrency 5
```

Remote load smoke is deliberately harder to invoke:
- requires `--allow-remote`;
- exact `--confirm-host`;
- maximum 500 requests;
- maximum concurrency 10;
- never permits mutating HTTP methods.

Default p95/error budgets are **engineering smoke gates**, not contractual SLA. Formal production SLO/RTO/RPO remain unset until approved as an operating-policy decision.

## 9. Observability

All first-party **platform Workers** and generated tenant Workers must keep Cloudflare Workers Logs and traces enabled. Repository guard:

```text
npm --prefix server run verify:observability
```

Current source policy:
- logs enabled, 100% head sampling for complete error evidence;
- traces enabled, 5% sampling in committed/generated configuration;
- Gateway 5xx and all three configured queue retry flows emit structured operational metadata without request bodies, tokens, cookies or raw external payloads.

Cloudflare native Worker metrics remain the provider metric source for request success/error/invocation status. Forge should not create a second authoritative metric store merely to duplicate provider counters.

App Workers under `server/apps-src/**` are separate ownership. Exact audit found current Alumdoor and Center Worker configs without the platform observability block. WS12 records this as a dependency rather than modifying vertical/app-owner configs across ownership boundaries. Do not claim full app-worker telemetry coverage until those configs converge.

## 10. Queue safety

Repository guard:

```text
npm --prefix server run verify:queue-safety
```

Every configured consumer must have bounded retries and a distinct DLQ. This prevents exhausted retries from being silently discarded. Current source config retains failed outbox, prepared-report and social-ingress messages in distinct DLQs.

Cloudflare's queue metrics/backlog remain the provider monitoring surface; Forge adds structured attempt/delay metadata for retry diagnosis. A DLQ is retention, not recovery. Replay/quarantine/poison-message semantics require the canonical event contracts owned with WS10; do not blindly replay arbitrary bodies from an operator script.

## 11. Failure decision matrix

| Failure | First action | Data action |
|---|---|---|
| UI bundle bad, backend/storage healthy | identify previous Gateway version; Worker rollback | none |
| Regular Worker code regression, schema backward-compatible | exact Worker version rollback | none |
| Tenant/app user Worker regression | verified compatible source redeploy; provider rollback contract still pending | none by default |
| Migration deploy failed before schema mutation | stop release; fix/retry | none |
| Migration applied, code deploy failed | restore compatible code forward or verified previous compatible version | do not PITR by reflex |
| Migration/data corruption requires state rewind | capture fresh backup + current bookmark first | authorized D1 PITR |
| Queue transient failure | allow bounded retry | inspect structured retry evidence |
| Queue exhausted retries | preserve in DLQ | use WS10-approved replay/quarantine contract |
| Release marker does not converge | stop promotion | no data mutation |
| Health auth boundary changes (`guest boot != 403`) | treat as security/release failure | no data mutation |

## 12. RTO / RPO / retention

- RTO target: **UNSET**.
- RPO target: **UNSET**.
- DR rehearsal cadence: **UNSET**.
- encrypted off-account backup retention: **NOT IMPLEMENTED**.

The scripts measure restore/rollback duration so an eventual SLO can be based on evidence instead of decorative numbers.
