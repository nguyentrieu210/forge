# WS12 — SRE / Release / Backup / Data Safety

Status: **REVIEW**  
Owner: **ChatGPT-WS12**  
Branch: `agent/ent-12-sre-release-data-safety`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `6aae16ea994e2884fb0b5627d83f6a6bb090f0db`  
Synced current main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` via PR `#303`; workstream sync merge `a42a529394593d5adcc84cd1369ccb42e0169460`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Làm production boring stuff đủ chắc: observability, release/rollback, backup/PITR/DR, migration verification, queue recovery, integrity checks, performance/load/cost và Cloudflare operational limits.

## Exact-state audit

### Capability maturity (`O01-001` → `O01-021`)

| Capability | Current assessment | Evidence / gap |
|---|---|---|
| `O01-001` Health check | **Wired** | Gateway `/health`; tenant `/health` additionally reports maintenance state. Gateway health is still shallow and does not prove all dependencies. |
| `O01-002` Release marker | **Wired** | `stage-client-bundle.mjs` creates public `release.json` with exact release SHA + bundle hash when release SHA is supplied. |
| `O01-003` Metrics | **Missing** | No canonical metric surface / SLI collection found in exact source audit. |
| `O01-004` Structured logs | **Foundation** | Some JSON `console.error` records exist around app hooks/notifications; coverage is not systematic across workers/queue/release. |
| `O01-005` Trace / correlation ID | **Wired** | Gateway creates/forwards `x-cloudforge-trace-id`; tenant APIs reuse it. Queue path correlates by event id rather than a full distributed trace. |
| `O01-006` Alerts | **Missing** | No canonical alert policy/runbook integration found. |
| `O01-007` Error tracking | **Missing** | No canonical error aggregation/tracking backend found. |
| `O01-008` Queue monitoring | **Foundation** | Jobs Worker has retry/DLQ configuration, but no operator monitoring surface. |
| `O01-009` Retry visibility | **Foundation** | Exponential retry exists; retry attempts are not yet surfaced as durable/operator evidence. |
| `O01-010` Dead-letter recovery | **Missing** | `cloudforge-outbox-dlq` is configured, but no canonical replay/quarantine/recovery tool was found. |
| `O01-011` Integrity checks | **Wired** | Commercial reconciliation endpoint exists; WS12 adds restore integrity/FK/tenant-scope verification. |
| `O01-012` Ledger reconciliation jobs | **Foundation** | Internal reconciliation path exists; no dedicated scheduled reconciliation evidence found in this audit. |
| `O01-013` Backup verification | **Wired / RC candidate** | Backup export already had SHA manifest; WS12 adds strict manifest validation plus isolated local replay verification. Production evidence still required before RC claim. |
| `O01-014` PITR strategy | **Foundation** | Remote isolated restore drill exists, but no documented point-in-time selection/restore contract or production rehearsal evidence. |
| `O01-015` Disaster recovery | **Foundation** | Restore drill is route-isolated; RTO/RPO targets, rehearsal cadence and off-account retention are not defined. |
| `O01-016` Release rollback | **Missing** | Exact release marker exists, but no canonical rollback automation/evidence found. |
| `O01-017` Migration verification | **Wired with critical gap** | `migrate-tenant.mjs` confirms tenant + clean worktree; deploy refuses schema-behind tenant. `d1-migrate-remote.mjs` still has a crash window between SQL apply and `d1_migrations` bookkeeping and does not checksum applied migration contents. |
| `O01-018` Performance test | **Missing** | No canonical performance gate/evidence found. |
| `O01-019` Load test | **Missing** | No canonical load-test suite/budget found. |
| `O01-020` Rate limit | **Wired** | Login uses persistent tenant/IP and account buckets; dispatch plan CPU/subrequest limits are explicit. |
| `O01-021` Abuse protection | **Foundation** | Login protection/resource limits exist; no broader abuse/traffic policy evidence found. |

### Release source drift

- `CURRENT_STATUS.md` says one canonical workflow `ALU Build and Deploy` exists.
- Exact `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` does **not** contain the historical `.github/workflows/manual-release-alu.yml`.
- Historical release logic still exists in Git history, but status and source had drifted apart.
- WS12 restores a canonical `.github/workflows/alu-build-deploy.yml` on this branch. UI auto-deploy is intentionally changed to **after merge to `main`**, not from an unmerged UI branch. Full release remains manual + `confirm=alu` and refuses a target SHA that is not merged into `main`.

### Backup / restore findings

Existing good foundations:

- `backup-tenant.mjs` resolves the tenant D1 by convention, exports to `.partial`, atomically renames, and writes a SHA-256 manifest.
- `restore-tenant-drill.mjs` restores only into names prefixed `cloudforge-drill-` / `cloudforge-restore-`, refuses the live tenant DB name and changes no routes.
- D1 oversized `installed_apps.manifest_json` rows already have a restore rewrite path and regression coverage.

Gaps closed in this branch:

1. New `tenant-backup-verification.mjs` strictly binds backup manifest format, tenant, database name, file name, byte length, checksum and creation timestamp.
2. New `verify-tenant-backup.mjs` replays the SQL into an isolated temporary SQLite DB without touching Cloudflare.
3. Verification fails closed on `PRAGMA quick_check`, foreign-key violations, zero application tables and cross-tenant rows in core tenant-scoped tables.
4. Verification evidence records local restore duration, table/migration counts, rewrite statistics and no production resource id.
5. `restore-tenant-drill.mjs` now requires a valid manifest by default; legacy unmanifested backups need explicit `--allow-unmanifested`.
6. Remote drill now actually **fails** if `quick_check` is not `ok`, checks FK integrity and tenant scope, records migration count and restore duration.
7. Restored ALU release workflow performs migration dry-run, backup, offline replay verification, then migration/deploy; plaintext SQL backup is not uploaded as a GitHub artifact.

### RTO / RPO

- **RTO target: UNSET.** This branch measures `local_restore_duration_ms` and remote `restore_duration_ms`; measurement is evidence, not an invented SLA.
- **RPO target: UNSET.** Current backup export is point-in-time-at-export only. PITR/off-account retention policy needs an explicit platform decision.
- No production/customer-data restore drill was executed in WS12. Production evidence remains distinct from local tested evidence.

### Legacy PR disposition

- PR `#199` (`feat/daily-ledger-hardening-20260802`) is **250 commits behind current main** and spans WS01/WS08 plus shared backend/UI ownership.
- WS12 disposition as secondary owner: **CHERRY-PICK evidence concepts only; do not merge/reuse the stale branch as a whole.** Stale-freeze/reconciliation correctness remains for WS01/WS08 canonical ownership; WS12 only consumes its acceptance/recovery ideas where relevant.

## Verification evidence

Local isolated Node 22 regression for the new backup verifier: **5/5 PASS**.

Covered:

- manifest tenant/file/bytes/checksum binding;
- fail-closed missing manifest + explicit legacy override;
- corrupt/FK-invalid/empty restore rejection;
- successful offline replay + immutable verification evidence;
- cross-tenant core-row rejection.

No Cloudflare deploy, production migration, production restore, secret/DNS change or customer-data mutation was performed.

## Remaining failure modes / blockers

1. **Migration bookkeeping crash window:** migration SQL can apply successfully and process can die before `d1_migrations` insert; rerun may replay non-idempotent SQL. Coordinate WS13 before changing migration ledger semantics.
2. **No applied-migration content checksum:** changing an already-applied SQL file is policy-forbidden but not mechanically detected by the remote migration runner.
3. **No encrypted durable off-account backup retention:** current export is plaintext and runner-local unless an operator moves it. Storage/key/retention design needs WS11 security/secrets ownership.
4. **No canonical DLQ recovery tool:** queue has `max_retries=8` + `cloudforge-outbox-dlq`, but no replay/quarantine operator path; coordinate WS10 on event contract.
5. **No formal RTO/RPO/DR rehearsal cadence.**
6. **No metrics/alerts/error-tracking/load/perf budget yet.**
7. **Release rollback remains unimplemented.** Full release is safer, but failure after migration still needs an explicit compatible rollback strategy rather than blind code rollback.

## Files changed

- `.github/workflows/alu-build-deploy.yml`
- `server/scripts/lib/tenant-backup-verification.mjs`
- `server/scripts/verify-tenant-backup.mjs`
- `server/scripts/restore-tenant-drill.mjs`
- `server/tests/tenant-backup-verification.test.mjs`
- this handoff file

## Guard / merge state

This is a **CRITICAL non-UI** workstream. Branch is ready for review, but per project policy it must stop before merge/deploy until explicit user approval. Production release workflow cannot run from this branch because its automatic UI trigger is restricted to `main`; the manual production job is not invoked here.
