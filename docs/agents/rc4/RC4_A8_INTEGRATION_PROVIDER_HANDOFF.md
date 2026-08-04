# RC4-A8 — Integration / Provider / DLQ Closure

Status: **BOOTSTRAPPED**
Branch: `agent/rc4-08-integration-provider`
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`
Risk: **CRITICAL**
Owner stream: **WS10**

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

## Forbidden / avoid

- No direct write to GL/Stock/Payroll/business tables from connector/provider code; use canonical controllers/kernel.
- No provider output may mutate business authority directly without validation/permission/idempotency.
- No blind DLQ replay.
- No production secret/DNS/provider resource/customer-data mutation merely to close a checklist.

## Dependencies

- A1/WS11: secret governance, support/admin access and security policy.
- A2/WS12: queue/provider observability, recovery and approved non-production environment.
- A4/WS01: canonical e-invoice evidence/status contract.
- A3/WS13 where migration/cutover integrations need durable source checkpoints.

Record Dependency Requests and continue all independent adapter/event-contract/test work.

## Acceptance

RC requires executable retry/idempotency/failure/permission/tenant evidence for the declared provider/event scope. Provider/live and production evidence must be labelled separately; source config alone cannot promote Hardened.

## Merge/deploy boundary

Non-UI CRITICAL. Commit, test and open PR. **Stop before merge/deploy/provider mutation** until explicit user approval.
