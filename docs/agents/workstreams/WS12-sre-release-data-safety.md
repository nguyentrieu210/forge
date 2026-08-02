# WS12 — SRE / Release / Backup / Data Safety

Status: **REVIEW — autonomous implementation complete to merge/production gate**  
Owner: **ChatGPT-WS12**  
Branch: `agent/ent-12-sre-release-data-safety`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `6aae16ea994e2884fb0b5627d83f6a6bb090f0db`  
Latest exact main incorporated: `b63c9a7a07e63dd73f944f450618c0b92f10067c` via internal sync PR `#332`; sync merge on WS12 branch `041f1a38b371852cfb5908625268fa3697740aaa`  
Delivery PR checkpoint: `#320`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Làm production boring stuff đủ chắc: observability, release/rollback, backup/PITR/DR, migration verification, queue safety/recovery evidence, integrity checks, performance/load/cost và Cloudflare operational limits.

Risk: **CRITICAL**. Đây là non-UI workstream; implementation có thể tự chạy đến Definition of Done kỹ thuật nhưng merge/deploy/production mutation vẫn là explicit gate.

## Target architecture

WS12 giữ một operational control plane mỏng, source-controlled và fail-closed:

1. **Release target** là exact merged `main` commit, không phải working tree tùy ý.
2. **Release evidence** tách khỏi release target: deploy exact target nhưng verifier dùng current `main` SRE tooling để rollback revision cũ vẫn kiểm được.
3. **Data safety** = export có manifest/checksum + replay verification + provider PITR, không gọi một file `.sql` chưa replay là backup đã chứng minh.
4. **Rollback layers tách biệt**: Gateway/UI, regular Worker version, D1 state, KV/R2/external state không được giả định rollback cùng nhau.
5. **Observability** dùng Cloudflare native logs/traces/metrics làm provider source; Forge thêm structured metadata/correlation và repository guards, không dựng duplicate metric source of truth.
6. **Queue safety** = bounded retry + DLQ + structured retry evidence. Replay/quarantine chỉ được làm khi canonical event contract của WS10 chốt.
7. **Performance tools** mặc định localhost/read-only; remote phải explicit host confirmation và hard cap để test tool không biến thành outage tool.
8. **Provider limits/cost** được ghi source-bound, tách khỏi Forge engineering guard và customer SLA.
9. **Alert policy** định nghĩa actionable signal/severity/first-safe-action, nhưng không nhúng destination credential và không tự kích hoạt destructive recovery.

Authoritative operational docs:
- `docs/ops/SRE_RUNBOOK.md`
- `docs/ops/SRE_ALERT_POLICY.md`
- `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`

## Capability maturity (`O01-001` → `O01-021`)

| Capability | Assessment after WS12 autonomous pass | Exact evidence / remaining gap |
|---|---|---|
| `O01-001` Health check | **Wired / RC candidate** | Gateway + tenant health already exist; `sre-health-snapshot.mjs` adds health/root/auth-boundary/release convergence evidence. Production observation still required for RC. |
| `O01-002` Release marker | **Wired / RC candidate** | `stage-client-bundle.mjs` writes exact gateway UI `releaseSha` + `bundleHash`; release workflow gates exact convergence. |
| `O01-003` Metrics | **Wired** | Cloudflare native Worker metrics remain provider metric source; operational envelope documents usage/cost inputs. No customer SLO claimed. |
| `O01-004` Structured logs | **Wired for platform + configured queues** | Gateway 5xx and Jobs/Query/Social retry paths emit structured metadata without body/token/raw external payload. Platform + generated tenant Workers have logs enabled. App Workers remain dependency. |
| `O01-005` Trace / correlation ID | **Wired for platform + generated tenant** | Gateway trace id flows to tenant; Cloudflare traces enabled at 5% in platform/generated configs. App Worker telemetry coverage remains dependency. |
| `O01-006` Alerts | **Foundation / policy wired** | `SRE_ALERT_POLICY.md` defines actionable signals/severity/first response; health/release gates fail closed. Protected delivery destination/escalation credentials remain WS11 dependency. |
| `O01-007` Error tracking | **Foundation / Wired source** | Provider logs/traces + structured 5xx/retry events exist; no separate error aggregation/notification product contract is claimed. |
| `O01-008` Queue monitoring | **Wired provider surface / Foundation Forge ops** | All configured consumers retain DLQ; Cloudflare queue metrics/backlog are provider monitoring surface. Alert policy defines DLQ/retry/backlog actions; delivery channel remains dependency. |
| `O01-009` Retry visibility | **Wired** | Outbox, prepared-report and social queue retries expose attempts/delay + safe IDs via structured logs. |
| `O01-010` Dead-letter recovery | **Foundation** | Distinct DLQ now required for every configured consumer, including newly added prepared-report DLQ; replay/quarantine is deliberately deferred to WS10 canonical event contract. |
| `O01-011` Integrity checks | **Wired** | Commercial reconciliation endpoint exists; backup/restore verification adds SQLite quick-check, FK and tenant-scope checks. |
| `O01-012` Ledger reconciliation jobs | **Foundation / dependency explicit** | Internal commercial reconciliation endpoint exists, but no safe scheduled cadence/state/idempotency/cost contract is present. Deliberately not run every minute; DR-WS12-06 targets WS01/WS08. |
| `O01-013` Backup verification | **RC candidate** | Strict manifest/checksum + isolated replay verification + remote restore drill checks; targeted 5/5 PASS. Production/off-account retention evidence remains. |
| `O01-014` PITR strategy | **Wired** | Guarded `d1-pitr.mjs` plans by timestamp/bookmark; execute path requires confirm/reason/fresh verified backup and verifies provider bookmarks. Destructive production rehearsal NOT RUN. |
| `O01-015` Disaster recovery | **Foundation / Wired tooling** | Restore drill, PITR, recovery matrix and duration evidence exist. RTO/RPO, off-account retention and rehearsal cadence remain unset. |
| `O01-016` Release rollback | **Foundation** | Exact regular-Worker rollback tool exists and verifies post-deployment version. Workers-for-Platforms tenant/app user-worker rollback is not provider-proven; full release rollback remains partial. |
| `O01-017` Migration verification | **Wired with critical dependency** | Clean worktree/tenant confirmation/schema-before-code gates exist; full release now backup-verifies before migrate. Crash window and applied-content checksum belong with WS13 migration ledger contract. |
| `O01-018` Performance test | **Wired** | Bounded HTTP perf/load smoke reports p50/p95/p99/error-rate/RPS; no production run performed. |
| `O01-019` Load test | **Wired** | Local/default and explicitly capped remote GET/HEAD load path exists; targeted helper tests PASS. |
| `O01-020` Rate limit | **Wired** | Login persistent tenant/IP+account rate limits + Gateway per-plan CPU/subrequest limits remain authoritative. |
| `O01-021` Abuse protection | **Foundation** | Login/resource limits + bounded operator/load tools exist; broader WAF/traffic/product-abuse policy is outside this slice. |

## Implemented slices

### A. Backup verification + restore proof

- `server/scripts/lib/tenant-backup-verification.mjs`
- `server/scripts/verify-tenant-backup.mjs`
- hardened `server/scripts/restore-tenant-drill.mjs`
- `server/tests/tenant-backup-verification.test.mjs`

Invariants:
- backup manifest binds format, tenant, database name, file name, byte count, SHA-256 and timestamp;
- missing manifest fails closed unless explicit legacy override;
- offline replay uses isolated temporary SQLite;
- corrupt/FK-invalid/empty/cross-tenant restore fails;
- remote drill accepts only fresh drill/restore D1 naming and changes no routes;
- plaintext SQL backup is never a GitHub artifact.

### B. Canonical release safety

- `.github/workflows/alu-build-deploy.yml`
- `server/scripts/verify-release-safety.mjs`
- `server/scripts/sre-health-snapshot.mjs`
- `server/scripts/lib/sre-health.mjs`

Full-release order is locked:

`merged target -> build -> migration plan -> fresh backup -> offline replay verify -> migrate -> tenant -> app -> gateway -> exact convergence`

UI-only lane deploys Gateway only after merged-main client changes. Manual UI/full targets must already be merged into main.

The final verifier checks out **current `main`**, independent of deployment target, then validates:
- `/health` = 200 + `ok=true`;
- `/` = 200;
- unauthenticated boot remains 403;
- `release.json` exists with bundle hash;
- expected gateway UI SHA matches exactly.

### C. PITR / restore safety

- `server/scripts/d1-pitr.mjs`
- `server/scripts/lib/pitr-guard.mjs`
- `server/tests/sre-destructive-guards.test.mjs`

Dry-run is default. Destructive PITR requires exact tenant confirmation, reason, secure backup directory, fresh export + replay verification. Provider JSON bookmark/previous-bookmark and post-restore current bookmark are checked; undo bookmark is recorded.

No production PITR was executed.

### D. Regular Worker rollback

- `server/scripts/rollback-worker.mjs`
- `server/scripts/lib/worker-rollback-guard.mjs`

Plan mode validates exact regular Worker + version ID. Execute requires exact worker confirm + reason and verifies post-rollback deployment contains the requested version.

Important boundary: this tool does **not** pretend normal Worker version rollback applies to Workers-for-Platforms tenant/app user Workers.

### E. Observability convergence

Observability block enabled with logs 100% + traces 5% for:
- Gateway;
- Tenant canonical/generated config;
- Query;
- Jobs;
- Control Plane config;
- Social Ingress.

`server/scripts/verify-observability-config.mjs` guards config plus structured source invariants.

Structured retry/error evidence:
- Gateway 5xx: code/status/retryable/trace id;
- Jobs: tenant/event/attempt/delay;
- Query prepared report: tenant/job/code/attempt/delay;
- Social ingress: tenant/event/attempt/delay, never Facebook `raw_body`.

### F. Queue safety

- `cloudforge-outbox` -> `cloudforge-outbox-dlq`;
- `cloudforge-social-events` -> `cloudforge-social-events-dlq`;
- `cloudforge-prepared-reports` -> new configured `cloudforge-prepared-reports-dlq`.

`server/scripts/verify-queue-safety.mjs` requires every configured consumer to have bounded retry and a distinct DLQ.

Actual creation/provisioning of a newly referenced production queue is **NOT RUN**; production resource operations remain a production gate.

### G. Performance/load + provider envelope

- `server/scripts/http-load-smoke.mjs`
- `server/scripts/lib/load-smoke.mjs`
- `server/tests/load-smoke.test.mjs`
- `docs/ops/CLOUDFLARE_OPERATIONAL_ENVELOPE.md`

Load tool permits GET/HEAD only, defaults localhost, requires exact host confirmation for remote, and hard-caps remote at 500 requests / concurrency 10.

Provider envelope checked 2026-08-03 covers Workers, D1, Queues and cost inputs. Engineering warning/budget values are explicitly not customer SLA.

### H. Alert policy

- `docs/ops/SRE_ALERT_POLICY.md`

Actionable fail-closed signals now cover auth-boundary drift, exact release mismatch, backup/PITR verification failure, DLQ/retry pressure, maintenance sweep failure, Worker server faults, storage headroom and queue-retention risk.

Alert policy explicitly forbids auto-PITR, blind DLQ replay, automatic production rollback, secret/DNS mutation or customer-data migration. Delivery destination/credential remains WS11-owned.

## Data/API/state/invariant contract

### Data safety contract

- D1 remains authoritative store; recovery scripts do not create a competing datastore.
- SQL export is portable recovery material, not authoritative runtime state.
- Time Travel is provider-local PITR and affects D1 only.
- Worker rollback never claims to revert D1/KV/R2/external side effects.
- No backup/restore route switch occurs silently.

### Evidence contract

Machine evidence must distinguish:
- `local/tested`;
- `remote drill`;
- `production`.

No document may upgrade maturity to production-proven from local helper tests alone.

### Release contract

- exact merged main target only;
- backup replay verification before destructive migration;
- code deploy never runs ahead of known pending schema;
- final release marker proves Gateway UI SHA/hash only, not every worker/storage component SHA.

### Observability privacy contract

Operational logs may include stable technical IDs, code/status/attempt/delay/trace fields. They must not include passwords, auth tokens, cookies, customer request bodies, raw social payloads or secrets.

## Verification evidence

Targeted isolated Node 22 suites executed outside repository checkout:

- backup verification: **5/5 PASS**;
- load-smoke helper: **5/5 PASS**;
- health evaluator: **4/4 PASS**;
- PITR/Worker destructive guards: **7/7 PASS**.

Total targeted isolated evidence: **21/21 PASS**.

Repository/source guards committed and wired into `server/package.json -> verify`:
- `verify:observability`;
- `verify:queue-safety`;
- `verify:release-safety`.

**NOT RUN:** full repository install/build/typecheck/test because the available execution container could not resolve `github.com` and did not have a usable checkout/dependency graph. This is recorded, not substituted with fabricated CI evidence. GitHub exposes no pull-request workflow run for current PR head under the build/deploy-only policy.

**NOT RUN:** production health observation, remote load test, production backup, production restore drill, PITR, Worker rollback, migration, queue provisioning, secret/DNS change or customer-data mutation.

## Dependency requests

### Dependency request DR-WS12-01
- Target stream: **WS13**
- Need: close remote migration ledger crash window and add applied-migration content identity/checksum.
- Why generic: migration bookkeeping is shared implementation/migration infrastructure, not an SRE-only tenant script concern.
- Contract proposed: applied migration record must be tied to immutable file identity/content hash; rerun after partial failure must fail deterministically or prove safe replay rather than re-executing an unknown partially-applied file.
- Blocking: **no** for completed WS12 slices; **yes** before calling `O01-017` Hardened.
- Temporary workaround: release always creates + replay-verifies a fresh backup before migration; schema-before-code deploy gate remains.

### Dependency request DR-WS12-02
- Target stream: **WS11**
- Need: encrypted durable off-account backup retention + key/retention ownership; alert delivery destination/secrets/escalation boundary.
- Why generic: encryption keys, retention and alert destinations are security/governance/control-plane concerns.
- Contract proposed: backup object encryption/retention policy separated from plaintext runner export; SRE produces evidence/health events while WS11 owns destination credentials and governance.
- Blocking: **no** for verifier/PITR tooling; **yes** before `O01-015` Hardened and full alert delivery.
- Temporary workaround: plaintext backup remains runner-local/secure operator path and is never uploaded to GitHub artifacts; GitHub/provider failures remain visible in their native surfaces.

### Dependency request DR-WS12-03
- Target stream: **WS10**
- Need: canonical DLQ inspect/quarantine/replay contract for outbox, social and prepared-report messages.
- Why generic: replay correctness depends on event schema, tenant binding, idempotency key and poison-message semantics owned by Integration Hub.
- Contract proposed: typed envelope validation + dry-run inspect + quarantine + replay preserving original tenant/idempotency identity; no arbitrary raw-message resend command.
- Blocking: **no** for bounded retry/DLQ retention; **yes** before `O01-010` Hardened.
- Temporary workaround: retain exhausted messages in DLQs and diagnose via structured retry evidence/provider queue metrics.

### Dependency request DR-WS12-04
- Target stream: **WS17 for Alumdoor; coordinator assign current Center app-worker owner**
- Need: converge app-worker Wrangler observability with platform policy.
- Why generic: WS12 owns observability contract but must not edit vertical/app implementation across workstream ownership merely to improve coverage numbers.
- Contract proposed: `observability.enabled=true`, logs 100%, traces 5% unless owner documents a justified app-specific sampling deviation.
- Blocking: **no** for platform SRE; **yes** before claiming all production app Workers have trace/log coverage.
- Temporary workaround: none; platform/generic tenant telemetry remains active.

### Dependency request DR-WS12-05
- Target stream: **WS00 + WS17 / app-worker owner**
- Need: canonical rollback/redeploy contract for Workers-for-Platforms tenant/app user Workers.
- Why generic: regular Worker version rollback is provider-supported, but dispatch-namespace user-worker rollback semantics differ and affect release architecture.
- Contract proposed: exact source/version identity + compatible source redeploy or provider-supported version rollback with post-deploy proof; must explicitly state storage/schema compatibility boundary.
- Blocking: **no** for regular Worker rollback; **yes** before `O01-016` Hardened for full ALU release.
- Temporary workaround: verified compatible forward/source redeploy; never claim D1 state rollback from Worker redeploy.

### Dependency request DR-WS12-06
- Target stream: **WS01 + WS08**
- Need: canonical scheduled commercial/ledger reconciliation job contract: scope, cadence, idempotency/state marker, acceptable cost/runtime and failure semantics.
- Why generic: the authoritative reconciliation service/ledger semantics belong to Finance/BI; blindly running a potentially heavy full reconciliation every Jobs cron tick would create load without proving correctness.
- Contract proposed: read-only deterministic reconciliation invocation with durable last-run/result evidence, tenant isolation, bounded scope and explicit cadence suitable for data volume; WS12 can then wire monitoring/alerting around it.
- Blocking: **no** for existing on-demand integrity endpoint and WS12 recovery tooling; **yes** before `O01-012` Hardened.
- Temporary workaround: keep `/internal/reconciliation` on-demand and do not create an unbounded every-minute scheduled scan.

## RTO / RPO / policy state

- **RTO target: UNSET.** Restore/rollback tooling records duration so a future target can be evidence-based.
- **RPO target: UNSET.** D1 Time Travel/provider history exists; customer/business RPO is still an operating-policy decision.
- **DR rehearsal cadence: UNSET.**
- **Customer SLA: UNSET.**
- Engineering smoke thresholds/provider quotas are not relabeled as customer commitments.

## Legacy PR disposition

PR `#199` (`feat/daily-ledger-hardening-20260802`): **CHERRY-PICK evidence concepts only; do not reuse stale branch wholesale.** Ledger stale-freeze/reconciliation correctness remains WS01/WS08 ownership; WS12 consumes recovery/evidence patterns only.

## Known gaps that remain real

1. Migration ledger atomicity/content checksum: DR-WS12-01.
2. Encrypted off-account retention + alert delivery destinations: DR-WS12-02.
3. DLQ replay/quarantine: DR-WS12-03.
4. App-worker observability coverage: DR-WS12-04.
5. Workers-for-Platforms user-worker rollback: DR-WS12-05.
6. Scheduled ledger reconciliation contract: DR-WS12-06.
7. Production evidence is deliberately absent until an authorized production operation occurs.
8. RTO/RPO/SLA/rehearsal cadence remain explicit policy gaps rather than invented numbers.

## Handoff

Workstream: `WS12`  
Branch: `agent/ent-12-sre-release-data-safety`  
Status: `REVIEW`  
Capabilities: `O01-001..O01-021`  
Changed zones: release workflow; SRE scripts/tests/docs; platform Worker observability configs; safe structured retry/error telemetry  
Tests: targeted isolated `21/21 PASS`; full repository verification `NOT RUN` due unavailable checkout/dependencies/network; PR workflow runs none under build/deploy-only policy  
Migration: no migration files changed; no production migration executed  
Dependency requests: `DR-WS12-01..06`  
Known gaps: see above  
Recommended merge order: WS12 is Phase-C tier 1 with WS00/WS11; resolve conflicts against exact current main before merge  
Delivery PR: `#320` — ready for review, mergeable at last exact check

## Merge / production gate

All independent WS12 engineering work identified in this autonomous pass is complete. Remaining actions now cross explicit gates:

- merging PR `#320` into `main` is a **non-UI CRITICAL merge**;
- enabling/referencing new production queue resources, running release workflow, production backup/migration/deploy, remote load, restore drill, PITR or rollback are **production operations**.

Do not perform those operations without explicit authorization. PR is a checkpoint, but the merge/production boundaries are real safety gates rather than workflow ceremony.
