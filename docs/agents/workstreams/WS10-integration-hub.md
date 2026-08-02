# WS10 — Integration Hub / Connector Platform

Status: **ACTIVE**  
Owner: **chatgpt-ws10**  
Branch: `agent/ent-10-integration-hub`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Claimed from exact main head: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Implementation head before this handoff update: `1c050cf602f55495fbd6d913760f94ab24f1eb62`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation, this branch was compared with exact current `main`, found 18 commits behind with only the seeded workstream file ahead, then clean-synced to `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` before claim/implementation. GitHub exact branch/PR state remains authoritative over this snapshot.

## Mission

Chuẩn hóa API/event/connector platform để Forge nối bank, e-invoice, tax, BHXH, payment, shipping, email/SMS/Zalo/social/marketplace/Google/Microsoft mà không viết integration kiểu mỗi app một cục.

## Own

REST/API key/OAuth/service-account seam, webhook/event subscriptions, connector SDK, mapping/transformation, queues/retry/DLQ/idempotency, external sync cursor/status/error model và integration observability contract.

## Phase A audit — 2026-08-03

Exact code audit found reusable foundations but no generic connector lifecycle yet:

- `server/packages/outbox/src/publisher.ts`: tenant-scoped outbox lease/claim, publish retry state and queue handoff already exist.
- `server/apps/jobs-worker/src/index.ts`: domain-event shape validation, tenant routing, processed-event idempotency and bounded exponential queue retry already exist.
- `server/apps/tenant-worker/src/index-core.ts`: inbound platform events are durably deduplicated before app-hook/notification fan-out.
- `server/apps/social-ingress-worker/src/index.ts`: Facebook-specific OAuth, signed webhook verification, tenant/page routing and queue retry are already wired.
- `server/packages/social-commerce/src/tenant-handler.ts`: provider credentials are encrypted and Facebook event ingest is idempotent, but this is provider/domain-specific rather than a generic connector SDK.
- BRD `server/docs/spec/brd-screens/10-integration-hub.md` requires connector catalog, credential vault, mapping, delivery log, retry/DLQ, encrypted secrets, outbound allowlist and webhook signature verification.

Primary gap: retry/idempotency/security patterns exist in several paths but are duplicated by use-case. Forge does not yet have one reusable external subscription/delivery contract with mapping, outbound target policy, deterministic delivery identity and shared retry/dead-letter semantics.

## Capability snapshot

| Capability | Audit maturity | This slice |
|---|---|---|
| `I01-001` REST API | Wired | unchanged |
| `I01-002` API key | Missing/Foundation evidence only | dependency on WS11 credential/auth contract |
| `I01-003` OAuth | Foundation/Wired provider-specific | generic auth kind represented, credential flow not owned here yet |
| `I01-004` Service account | Missing/Foundation evidence only | generic auth kind represented, credential flow not owned here yet |
| `I01-005` Webhook | Foundation provider-specific | generic outbound webhook delivery contract added |
| `I01-006` Event subscription | Foundation | generic event-pattern subscription contract added |
| `I01-007` Connector SDK | Missing | **Foundation** via `@cloudforge/integration-hub` |
| `I01-008` Mapping/transformation | Missing | **Foundation** with bounded dotted-path mapping |
| `I01-009` Import API | existing platform surface, not deeply audited in this slice | unchanged |
| `I01-010` Export API | existing platform surface, not deeply audited in this slice | unchanged |
| `I01-011` Queue | Wired | reused conceptually, no WS12 queue ownership change |
| `I01-012` Retry | Wired but scattered | shared deterministic retry policy added |
| `I01-013` Dead-letter | Missing as generic lifecycle | decision semantics added; persistence/queue wiring still missing |
| `I01-014` Idempotency | Wired in kernel/jobs/event paths | deterministic connector delivery identity added |
| `I01-015` Connector audit | Missing | delivery/audit persistence still required |

No capability is promoted to RC/Hardened by this slice. The new package is a contract/runtime foundation, not a complete Integration Hub.

## Phase B slice implemented

New package: `server/packages/integration-hub/`.

Implemented primitives:

1. `WebhookSubscription` contract with tenant, event pattern, target URL, auth kind, `secret_ref`, explicit outbound host allowlist, mapping and retry policy.
2. HTTPS-only outbound target validation; URL credentials/fragments and localhost/private targets are rejected; hostname must be explicitly allowlisted.
3. Exact event, trailing `.*`, and all-event subscription matching.
4. Bounded mapping/transformation from canonical `DomainEvent` using dotted paths, required-source validation and prototype-pollution path rejection.
5. Deterministic webhook envelope and delivery ID derived from `subscription_id + event_id`.
6. Shared bounded exponential retry semantics; transport/408/425/429/5xx retry, permanent 4xx dead-letter, attempt exhaustion dead-letter.
7. Stable JSON serialization and HMAC-SHA256 signing headers; idempotency header is the deterministic delivery ID.
8. Secrets remain references only. This package does not store plaintext provider credentials or invent a competing vault.

## Security assumptions / guard

- External callback target must be HTTPS and explicitly outbound-allowlisted.
- Connector credential material is **not** owned by WS10. `secret_ref` is the seam; encrypted storage/rotation/access policy belongs to WS11.
- Tenant is bound in subscription + event and validated before envelope creation.
- Delivery identity is deterministic per subscription/event so retries do not create a new logical delivery.
- Signed body uses canonical stable JSON; future executor must sign the exact bytes it sends.
- No external provider is called by this slice; no production secret/DNS/customer data is touched.

## Retry semantics

Default policy: `max_attempts=8`, `base_delay_seconds=2`, `max_delay_seconds=300`.

- 2xx -> delivered.
- transport error / unknown status / 408 / 425 / 429 / 5xx -> retry while attempts remain.
- permanent non-retryable HTTP -> dead-letter decision.
- attempt limit exhausted -> dead-letter decision.
- provider retry-after may extend delay but is still capped by configured max.

Persistence of delivery attempts, replay authorization and physical DLQ bindings remain follow-up work coordinated with WS12.

## Tests / evidence

Added `server/tests/integration-hub.test.mjs` covering:

- outbound URL allowlist/security rejection;
- secret reference requirement;
- event subscription matching/tenant filtering;
- mapping + required source + prototype-pollution rejection;
- bounded retry/dead-letter decisions;
- deterministic delivery ID, canonical JSON and HMAC headers.

Validation status in this connector session:

- exact GitHub diff reviewed;
- branch was `ahead 4 / behind 0` against `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` before this handoff update;
- GitHub development workflow runs for implementation head: none, consistent with the repository build/deploy-only Actions policy;
- executable build/tests: **NOT RUN** because this environment has no repository checkout/dependency tree and direct GitHub clone/DNS is unavailable. Do not treat added tests as PASS until run on an exact checkout.

Required review evidence before merge:

- `server`: TypeScript build/typecheck for exact PR head;
- targeted `node --test tests/integration-hub.test.mjs` after build;
- relevant existing jobs/outbox regression to ensure no contract collision;
- security review of outbound-target and signing semantics.

## Changed zones

- `server/packages/integration-hub/package.json`
- `server/packages/integration-hub/src/index.ts`
- `server/tests/integration-hub.test.mjs`
- this workstream handoff file

No migration, shared document-kernel code, auth/IAM implementation, SRE deploy config, client runtime or production configuration changed.

## Legacy PR disposition

- PR `#286` — TT99 localization + tax/e-invoice controls, primary owner WS01, WS10 secondary: **REUSE as downstream domain contract; no WS10 cherry-pick**. Exact diff contains E-Invoice evidence metadata/workflow and explicitly leaves provider/tax-authority integration to a later integration path. WS01 remains owner of legal/accounting semantics; future WS10 provider adapter should populate its provider/status/hash boundary rather than duplicate the E-Invoice domain model.
- Search of legacy PRs for generic `integration`, `webhook` and `outbox` found no substantive WS10-primary connector-platform implementation to reuse/cherry-pick.

## Dependency requests / blockers

- **WS00**: preserve/version the canonical `DomainEvent` contract before external subscription persistence/wiring is considered stable.
- **WS11**: define credential reference/vault lifecycle, rotation, API-key/OAuth/service-account access contract. WS10 must not create a parallel secret store.
- **WS12**: define generic delivery-attempt persistence/observability, queue retry/DLQ/replay ownership and metrics/recovery contract.
- **WS01**: e-invoice/bank/tax domain owns legal state and reconciliation; WS10 supplies transport/provider seams only.
- **WS16**: Facebook/social provider implementation is useful evidence/consumer, but generic connector primitive stays in WS10.
- Tenant migration slot intentionally not consumed in this slice while accounting work is active; generic subscription/delivery persistence requires exact-main migration coordination later.

## Next slice

After dependency contracts are reviewed: persist tenant-scoped connector/subscription + delivery attempt/audit records, expose permission-enforced Integration Hub APIs, wire outbox event -> subscription -> delivery queue -> signed executor -> retry/DLQ/replay, then migrate Facebook/provider-specific seams incrementally instead of rewriting them wholesale.

## Merge / deploy boundary

This is backend/platform behavior, not UI-only. Open PR for review but **do not merge or deploy without explicit user approval**.
