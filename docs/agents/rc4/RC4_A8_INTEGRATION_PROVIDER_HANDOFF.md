# RC4-A8 — Integration / Provider / DLQ Closure

Status: **READY — independent source/test scope complete; dependency-bound live/physical recovery remains**
Branch: `agent/rc4-08-integration-provider`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **CRITICAL**
Owner stream: **WS10**
Canonical execution evidence: `docs/agents/rc4/RC4_A8_INTEGRATION_PROVIDER.md`

## Mission

Close Integration Hub/provider release-confidence gaps without bypassing Forge domain authority or creating unsafe replay/provider paths.

## Read first

- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/agents/workstreams/WS10-integration-hub.md`
- `docs/agents/rc/RC3_A2_PLATFORM_IAM_APPFACTORY_EVIDENCE.md`
- `docs/agents/rc/RC3_A3_SRE_CLOUDFLARE_EVIDENCE.md` if present; otherwise use current RC3 SRE evidence files under `docs/agents/rc/`.
- `docs/agents/rc/RC3_A5_INDEPENDENT_QA.md`

## Primary scope

1. Typed DLQ inspect/quarantine/replay contract for outbox/social/prepared-report messages, preserving tenant binding, event schema and original idempotency identity.
2. Retry/dead-letter recovery evidence; no arbitrary raw-message resend command.
3. E-invoice provider transport/signing/status-sync adapter that populates canonical Finance evidence fields rather than creating a competing e-invoice document.
4. Provider credential/secret boundary, callback authenticity and replay/idempotency protections.
5. Connector/provider lifecycle and failure evidence needed to move integration capabilities toward RC.
6. Exact targeted tests and provider-safe non-production evidence where available.

## Completed in A8

- Added typed queue quarantine/inspection/replay contracts for outbox DomainEvent, social Facebook event and prepared-report queue messages.
- Replay is bound to immutable quarantine record + tenant + original idempotency identity + payload SHA-256 + actor/reason; raw caller-supplied resend is not exposed.
- Added provider-neutral e-invoice submit/sign/status-sync transport seam that returns canonical Finance evidence patches only.
- Added credential-ref resolver, injected signer boundary, deterministic provider idempotency, redirect fail-closed behavior and timestamped HMAC callback verification.
- Registered `IntegrationSubscriptionController` into the tenant `AggregateCoordinator` DocumentKernel registry before generic metadata fallback.
- Added package exports and three targeted regression files.
- Isolated strict TypeScript PASS after fixing one `exactOptionalPropertyTypes` defect.
- Exact queue-recovery + e-invoice test logic on compiled isolated modules: **9/9 PASS**.

## Remaining Dependency Requests

- **DR-RC4-A8-01 -> A2/WS12:** physical quarantine storage, DLQ bindings, permissioned inspect/re-enqueue tooling and operational observability consuming the A8 typed contract.
- **DR-RC4-A8-02 -> A1/WS11:** canonical tenant-bound API-key/OAuth/service-account credential create/use/rotate/revoke/audit lifecycle. A8 consumes `credential_ref` only.
- **DR-RC4-A8-03 -> A4/WS01:** canonical permissioned/idempotent command for applying provider evidence patch to Finance `E-Invoice Submission` through DocumentKernel.
- **DR-RC4-A8-04 -> approved provider environment:** real vendor non-production endpoint/auth/signature/callback fixtures and submit/retry/status-sync evidence.

Generic `/internal/events -> Integration Hub external delivery` fan-out remains deliberately deferred until credential + physical attempt/DLQ recovery are concrete; A8 does not install a half-wired production path.

## Forbidden / avoid

- No direct write to GL/Stock/Payroll/business tables from connector/provider code; use canonical controllers/kernel.
- No provider output may mutate business authority directly without validation/permission/idempotency.
- No blind DLQ replay.
- No production secret/DNS/provider resource/customer-data mutation merely to close a checklist.

## Acceptance

RC requires executable retry/idempotency/failure/permission/tenant evidence for the declared provider/event scope. Provider/live and production evidence must be labelled separately; source config alone cannot promote Hardened.

A8 recommends **no maturity promotion yet**: `I01-002..008`, `I01-013`, `I01-015` and `I02-002` retain their seed maturity; `I01-014` remains RC. Source closure materially reduces the blockers but physical/provider evidence is still required.

## Merge/deploy boundary

Non-UI CRITICAL. Commit, test and open PR. **Stop before merge/deploy/provider mutation** until explicit user approval.
