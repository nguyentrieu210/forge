# WS10 — Integration Hub / Connector Platform

Status: **REVIEW**  
Owner: **chatgpt-ws10**  
Branch: `agent/ent-10-integration-hub`  
Checkpoint PR: **#308** `feat(ws10): establish integration delivery foundation`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Claimed from exact main head: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Latest pre-handoff compare: `main@b63c9a7a07e63dd73f944f450618c0b92f10067c`, branch ahead 71 / behind 11; audited main drift is WS14/client + coordination/status and does not overlap WS10 server source.  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

GitHub exact branch/PR state always wins this snapshot. PR `#308` is a checkpoint, not a reason to stop implementation; WS10 continued until the remaining executable wiring was owned by WS00/WS11/WS12.

## Mission

Chuẩn hóa API/event/connector platform để Forge nối bank, e-invoice, tax, BHXH, payment, shipping, email/SMS/Zalo/social/marketplace/Google/Microsoft mà không viết integration kiểu mỗi app một cục.

## Ownership boundary

WS10 owns connector/event/subscription/mapping/provider-adapter/delivery/retry/DLQ/idempotency/external-sync contracts and provider-facing integration seams.

WS10 does **not** own:

- document-kernel / AggregateCoordinator composition — WS00;
- credential vault, API-key/OAuth/service-account secret lifecycle and authorization — WS11;
- physical queue/DLQ/recovery/metrics/release operational persistence — WS12;
- legal/accounting state for bank/e-invoice/tax — WS01;
- Facebook/social business behavior — WS16.

## Phase A audit summary

Reusable Forge foundations found:

- `server/packages/outbox/src/publisher.ts`: tenant-scoped outbox lease/claim and queue handoff.
- `server/apps/jobs-worker/src/index.ts`: DomainEvent shape guard, processed-event idempotency, tenant routing and bounded exponential retry.
- `server/apps/tenant-worker/src/index-core.ts`: inbound event durable dedupe before downstream fan-out.
- `server/apps/social-ingress-worker/src/index.ts`: Facebook OAuth, signed webhook verification, tenant/page routing and queue retry.
- `server/packages/social-commerce/src/tenant-handler.ts`: encrypted Facebook credentials and idempotent provider-event ingest.
- `server/packages/frappe-api/src/router.ts`: existing permission-scoped import and CSV export paths; export has an explicit `export` permission check rather than inheriting ordinary read.
- MetaForge maps `fieldtype: JSON` to `TextAreaControl`; browser JSON values therefore arrive as strings and must be parsed server-side before authoritative persistence.
- Generic `listDocumentsByDoctype()` is intentionally not used for dispatch because its broad 5,000-row bound can truncate a large doctype scan; WS10 uses a targeted active-subscription reader instead.

Primary gap at claim time was duplicated provider-specific retry/signature/idempotency behavior without one reusable connector lifecycle. This branch now supplies that generic seam.

## Capability snapshot at handoff

| Capability | Current maturity | Evidence / boundary |
|---|---|---|
| `I01-001` REST API | **Wired** | existing Frappe/native API surface; unchanged |
| `I01-002` API key | **Foundation** | connector auth kind + secret-safe connection seam; vault/auth lifecycle belongs WS11 |
| `I01-003` OAuth | **Foundation/Wired provider-specific** | Facebook OAuth exists; generic adapter/auth contract added; shared vault lifecycle still WS11 |
| `I01-004` Service account | **Foundation** | generic auth/connection contract only; shared credential lifecycle still WS11 |
| `I01-005` Webhook | **Foundation** | generic outbound executor + inbound HMAC policy/verification + target policy; production queue wiring pending |
| `I01-006` Event subscription | **Foundation** | canonical `Integration Subscription` metadata/controller/store/service; registry composition pending WS00 |
| `I01-007` Connector SDK | **Foundation** | `@cloudforge/integration-hub` catalog, adapter, registry, connection, sync, delivery contracts |
| `I01-008` Mapping/transformation | **Foundation** | bounded dotted-path mapping, versioned mapping spec + SHA-256 fingerprint |
| `I01-009` Import API | **Wired** | existing permission-aware Frappe import path; no duplicate WS10 API created |
| `I01-010` Export API | **Wired** | existing permission-aware CSV export path; explicit export permission |
| `I01-011` Queue | **Wired** | existing Cloudflare Queue/outbox/jobs path; WS10 does not replace it |
| `I01-012` Retry | **Wired / generic semantics added** | existing queue retry + shared delivery retry/Retry-After decision contract |
| `I01-013` Dead-letter | **Foundation** | explicit delivery lifecycle + deterministic DLQ/replay message contract; physical quarantine/recovery belongs WS12 |
| `I01-014` Idempotency | **Wired / connector identity added** | kernel/jobs existing idempotency + deterministic delivery/inbound IDs |
| `I01-015` Connector audit | **Foundation** | lifecycle audit + health evidence + replay actor/reason contracts; durable operational persistence belongs WS12 |

No capability is claimed RC/Hardened. RC requires exact-head executable evidence plus shared production-shaped wiring.

## Implemented provider-agnostic platform primitives

### Core webhook/event contract

`server/packages/integration-hub/src/index.ts`

- tenant-bound `WebhookSubscription` contract;
- exact / trailing wildcard / all-event subscription matching;
- HTTPS-only outbound targets;
- explicit outbound host allowlist;
- reject URL credentials/fragments, localhost/private targets;
- bounded mapping with required-source checks and prototype-pollution path rejection;
- deterministic connector delivery ID;
- canonical stable JSON;
- HMAC-SHA256 body signing;
- shared bounded exponential retry/dead-letter decision semantics.

### Connector catalog + provider SDK

- `catalog.ts`: versioned connector manifest, categories/capabilities, auth/event compatibility, same-major upgrade rules.
- `adapter.ts`: provider adapter conformance for inbound normalization, polling/page fetch and health checks.
- `provider-registry.ts`: exact `connector_key@version` runtime registry with compatible upgrade resolution.
- `connection.ts`: tenant-bound connector connection contract with non-secret config + `secret_ref` only.
- connection config recursively rejects plaintext `password`, `secret`, `client_secret`, `access_token`, `refresh_token`, `api_key`, `private_key`, `service_account_key` fields.

### Outbound execution

`executor.ts`

- injected credential resolver and transport; WS10 does not own vault storage;
- exact canonical bytes are signed and sent;
- provider credential headers cannot override Forge delivery/idempotency/signature headers;
- CR/LF header injection rejected;
- redirect mode is `manual`; any 3xx is dead-lettered so an allowlisted endpoint cannot redirect execution to localhost/private targets;
- `credentials: omit`, `cache: no-store`;
- bounded Retry-After parsing;
- returned execution result contains no credential material.

### Inbound webhook contract

`inbound.ts`

- bounded provider/endpoint/signature policy;
- generic constant-time HMAC-SHA256 verification;
- byte-based payload limits;
- JSON parse fail-closed;
- deterministic inbound identity scoped to provider + endpoint + exact raw bytes.

Facebook conformance regression verifies the generic HMAC contract matches the existing provider-specific implementation without moving WS16 code into WS10.

### Mapping and external sync

- `mapping.ts`: versioned mapping spec, event scope, apply/fingerprint/upgrade guard.
- `sync.ts`: optimistic external cursor checkpoint, bounded page contract, idle/running/retry/succeeded/error/disabled lifecycle, explicit retry timing.

### Delivery lifecycle, queue snapshot and recovery contract

- `delivery-planner.ts`: immutable `WebhookDeliveryTask` snapshot freezes target, allowlist, mapped envelope and retry policy at enqueue planning time; only `secret_ref` is retained so credential rotation can apply during later execution.
- `lifecycle.ts`: queued -> in_flight -> retry_scheduled -> delivered/dead_letter state machine with attempt audit and actor/reason replay semantics.
- `dlq.ts`: deterministic dead-letter identity, immutable quarantined task, audited replay request preserving logical delivery ID.
- physical delivery-attempt rows, queue/DLQ bindings, replay worker/tooling and metrics remain WS12 ownership.

### Connection health evidence

`health.ts`

- health evidence is bound to tenant, connection, connector/version and exact connection fingerprint;
- stale evidence from changed config/secret reference is rejected;
- unhealthy/expired/future evidence fails closed.

This provides a deterministic activation prerequisite seam without inventing the credential vault or provider network orchestration in WS10.

## Canonical subscription configuration

First-party metadata app: `server/apps-src/integration-hub/`.

- role: `Integration Admin` plus `System Manager`;
- current nav surfaces canonical `Integration Subscription` only;
- no fake delivery-log/retry-queue UI is exposed before physical WS12 persistence exists;
- no plaintext credential field exists; metadata contains only `secret_ref`;
- JSON form fields are normalized from MetaForge TextArea strings before validation/persistence.

`IntegrationSubscriptionController` enforces:

- create always starts `draft`;
- submit/cancel lifecycle is forbidden; this is a configuration state machine, not a submittable business document;
- active target/auth/mapping/retry config cannot be edited;
- config changes must be saved while inactive before a separate activation mutation;
- status transitions require explicit reason and expected-state semantics;
- target/auth/allowlist/mapping/retry invariants are validated server-side;
- mutation remains inside `DocumentKernel` and emits normal DomainEvent/outbox evidence.

`subscription-store.ts` reads active subscriptions from canonical `documents`; it does not create a second configuration source of truth. Its D1 reader is tenant + doctype + `status='active'` scoped, reads at most 5,001 rows and fails closed above 5,000 instead of silently truncating dispatch coverage. Non-draft docstatus/cross-tenant/inactive/status-mismatched data fails closed.

### Shared registry composition intentionally not taken

WS10 briefly identified the required registration point in `server/apps/tenant-worker/src/aggregate-do.ts`, then reverted that source change after auditing WS00 PR `#306`, which actively owns the AggregateCoordinator/document-kernel hotspot.

Dependency Request was posted to **WS00 PR #306**: compose `registerIntegrationHubControllers(...)` into the canonical registry before `GenericMetadataController` fallback after WS00 coordination lands. WS10 does not modify that hotspot in this checkpoint.

## Security boundary

- External targets require explicit HTTPS allowlist and manual-redirect handling.
- Client cannot select tenant in WS10 API contracts; tenant is trusted server context.
- `Integration Admin` / `System Manager` permission contract is server-side, not merely nav visibility.
- Authenticated connectors require a credential reference; provider secrets are never stored in subscription/connection config.
- Delivery/replay objects contain `secret_ref`, never secret values.
- Replay requires actor + reason and keeps immutable delivery payload/target semantics.
- No production secret, DNS, customer data or provider endpoint was touched.

## Dependency Requests recorded

### WS00 — architecture/kernel

PR **#306** comment recorded. Requested only the controller-registry composition seam after WS00 lands. No kernel contract or AggregateCoordinator ownership transfer requested.

### WS11 — security/IAM/SaaS

PR **#317** comment recorded. Required shared contract: tenant-bound credential vault for API-key/OAuth2/service-account material with authorized create/read-for-use/rotate/revoke/audit semantics. WS10 consumes `secret_ref` / resolver only and will not create parallel storage.

### WS12 — SRE/release/data safety

PR **#320** comment recorded. WS10 now supplies task/lifecycle/DLQ/replay contracts. Required WS12 implementation: physical attempt persistence, queue/DLQ binding, quarantine/replay tooling, metrics/alerts and operational recovery observability.

### WS01 / WS16

- WS01 owns bank/e-invoice/tax legal/accounting state; WS10 provider adapters must populate those domain boundaries rather than duplicate them.
- WS16 owns Facebook/social business flow; current Facebook implementation is conformance evidence and a future consumer of the generic adapter seam.

## Legacy PR disposition

- PR `#286` TT99 + tax/e-invoice: **REUSE as downstream domain contract; no WS10 cherry-pick**. Its E-Invoice record is legal/accounting evidence owned by WS01 and explicitly leaves provider/tax-authority transport for integration wiring.
- Search of generic integration/webhook/outbox legacy PRs found no substantive WS10-primary connector-platform implementation worth reusing wholesale.

## Validation / evidence

Added targeted regressions under `server/tests/integration-hub*.test.mjs` covering:

- target allowlist / SSRF-oriented target guards / manual redirect block;
- mapping safety/version/fingerprint;
- deterministic delivery and inbound identity;
- HMAC signing and Facebook signature conformance;
- retry / Retry-After / dead-letter / replay semantics;
- catalog/version/provider adapter conformance;
- external sync cursor/state transitions;
- trusted-tenant API and role boundary;
- connection plaintext-secret rejection and health fingerprint freshness;
- subscription controller lifecycle and separate activation;
- MetaForge JSON TextArea string normalization;
- targeted active-subscription read, scan bound, tenant/status/docstatus fail-closed behavior;
- first-party app metadata and secret-field absence.

`server/package.json` now includes `apps-src/integration-hub --check` in the first-party app pack gate.

### Executable validation boundary

- Exact branch checkout from the connector shell was retried and still fails because `github.com` DNS cannot resolve.
- Full `server` TypeScript build/test/app-pack and existing jobs/outbox regression: **NOT RUN** in this environment.
- Static exact-source audit did catch and fix:
  - `exactOptionalPropertyTypes` optional-field handling in external sync state;
  - `JsonObject` mapping type compatibility;
  - MetaForge JSON TextArea string-vs-array mismatch;
  - active subscription broad-scan truncation risk;
  - invalid docstatus cast;
  - Retry-After HTTP-date fixture date label.
- Do not promote RC/Hardened or merge from test existence alone.

## Changed zones

- `server/packages/integration-hub/**`
- `server/apps-src/integration-hub/**`
- `server/tests/integration-hub*.test.mjs`
- one `server/package.json` first-party app pack-gate entry
- this workstream handoff

No migration, document-kernel source, auth/IAM implementation, WS12 operational worker/config, shared frontend runtime, production config or provider-specific business code remains changed in the final WS10 diff.

## Remaining work after autonomous convergence

No further meaningful independent WS10 wiring remains without taking another workstream's shared contract:

1. **WS00 dependency**: controller registry composition into canonical AggregateCoordinator.
2. **WS11 dependency**: real credential vault/resolver lifecycle for API key/OAuth/service account.
3. **WS12 dependency**: physical delivery-attempt/audit persistence + queue/DLQ/replay/observability implementation.
4. After 1–3 land, WS10 can wire the production-shaped path:
   `outbox DomainEvent -> active subscription reader -> immutable delivery task -> queue -> credential resolver -> signed executor -> attempt audit -> retry/DLQ/replay`.
5. Then migrate Facebook and future bank/e-invoice/shipping providers incrementally through the adapter contract and add end-to-end exact-head evidence.

These are shared-dependency integrations, not ordinary unfinished local TODOs. The independent provider-agnostic WS10 contract/runtime scope is now handed off for review.

## Merge / deploy boundary

Backend/platform CRITICAL. PR `#308` remains Draft/review checkpoint. **Do not merge or deploy without explicit user approval after exact-head executable validation and dependency reconciliation.**
