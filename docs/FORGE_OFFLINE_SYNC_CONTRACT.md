# Forge Offline Read / Write / Sync Contract

Status: **RC-05 contract freeze; implementation not yet claimed**  
Owner boundary: RC-05 IAM/Tenant contract, consumed by Kernel/Auth (RC-04), Runtime/Mobile (WS14) and Release/SRE (RC-02).  
Baseline audited: `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`.

## 1. Purpose

This document freezes the minimum security and consistency contract required before Forge may promote:

- `U01-003` Offline read/cache;
- `U01-004` Offline write queue;
- `U01-005` Background sync;
- `U01-006` Conflict detection;
- `U01-007` Conflict resolution UX.

The current runtime is installable but these capabilities remain **Missing**. A service worker, IndexedDB table or retry button alone does not advance maturity.

## 2. Existing authoritative primitives

The offline layer MUST reuse rather than replace these current server contracts:

1. **Trusted tenant/user boundary** — gateway derives the tenant from the active route, strips client-supplied platform identity headers and signs the internal identity envelope.
2. **Live authorization** — Frappe cookie establishment re-reads the current user and current roles from D1 before constructing the actor. Cookie-embedded roles are not the online authority.
3. **Session revocation** — account `session_epoch` remains the all-session kill switch; new sessions also have revocable opaque session ids.
4. **Server-side permission** — Role/DocPerm, permlevel, owner, Share, User Permission, organization scope and published Role Policy are evaluated on the server.
5. **OCC** — canonical mutation commands carry `command_id`, `expected_version` and `payload_hash`; document `version` is server-owned.
6. **Idempotency** — a queued command MUST replay with its original stable `command_id` and payload hash, never mint a new command id per retry.
7. **Release evidence** — runtime release identity uses the existing release SHA/bundle marker contract. Offline caches must not invent a second client release identity.

Evidence paths include:

- `server/packages/contracts/src/index.ts`;
- `server/packages/frappe-api/src/session.ts`;
- `server/packages/frappe-api/src/auth-routes.ts`;
- `server/packages/frappe-model/src/permission.ts`;
- `server/packages/document-kernel/src/kernel.ts` and D1 store;
- `server/apps/gateway-worker/src/index.ts`;
- `CURRENT_STATUS.md` and `docs/agents/workstreams/WS14-frontend-runtime-mobile.md`.

## 3. Private offline context

Authenticated business data MUST NOT be cached under a tenant-only or user-only namespace.

Before private offline caching is enabled, an authenticated bootstrap response MUST expose an opaque **Offline Access Context** containing at least:

```text
tenant_id
user_id
access_revision
lease_expires_at
schema_revision
release_sha
bundle_hash
```

Rules:

- `tenant_id` and `user_id` are informational partition values from the authenticated server context, never privilege claims supplied by the client.
- `access_revision` is an opaque server-owned generation. It MUST change when a security change can reduce or reshape what the user may read/write, including roles, DocPerm/permlevel policy, User Permission, Share, organization scope or published Role Policy affecting that user.
- `lease_expires_at` is server policy. The client MUST stop exposing private offline data after the lease expires until it reauthenticates online. The contract intentionally does not invent a commercial/security TTL value.
- `schema_revision` changes when cached metadata/document shape becomes incompatible.
- `release_sha` and `bundle_hash` bind cached runtime assumptions to the release marker already used by Forge release verification.

Private cache namespace:

```text
forge-private/<tenant_id>/<user_id>/<access_revision>/<schema_revision>/<release_sha>/<bundle_hash>
```

The concrete storage engine may use a hashed form of this key, but every component above remains part of the logical partition.

## 4. Cache classes

### 4.1 Public shell/assets

Static hashed assets and explicitly public catalogue resources may use normal release-aware web caching. They MUST NOT share storage with authenticated business data.

### 4.2 Authenticated metadata/reference data

May be cached only inside the private namespace and only while the offline lease is valid.

### 4.3 Authenticated documents

May be cached only after the online response passed server permission/redaction. The offline layer stores the already-redacted representation; it never reconstructs hidden permlevels or masked fields from broader local data.

### 4.4 Never-cache material

The private offline store MUST NOT persist:

- `sid` cookie values;
- bearer/JWT tokens;
- trusted identity envelopes/signatures;
- password/MFA material or recovery codes;
- CSRF secrets as a substitute for obtaining fresh authenticated request context;
- server permission rows or hidden field values stripped from the response.

## 5. Purge and lock rules

Private offline data MUST be locked immediately and scheduled for purge when any of these are observed:

- explicit logout;
- login as a different user;
- tenant/origin change;
- 401 authentication failure;
- 403 permission failure that invalidates a cached operation;
- 423 tenant-not-active response;
- access revision change;
- schema incompatibility;
- expired offline lease.

When connectivity is absent, revocation cannot be discovered in real time. `lease_expires_at` is therefore mandatory before private offline reads can be promoted from Missing. An unlimited offline authorization lease is not permitted.

## 6. Offline write eligibility

Offline mutation is **deny by default**.

A metadata/app contract may opt an operation into offline queueing only when the operation is deterministic through the authoritative server mutation path. The UI must not infer eligibility from a visible Save button.

Until a capability explicitly opts in, the following remain online-only:

- IAM/security administration;
- tenant/app install, upgrade, rollback, provisioning and migration;
- workflow/security-policy publication;
- submitted/posting operations whose correctness depends on fresh financial, stock, payroll or approval state;
- any operation that bypasses the canonical Document Kernel or another domain authority with equivalent OCC/idempotency evidence.

Offline support for a CRITICAL domain may be added later, but it requires its own correction/reconciliation and failure-path evidence; this contract does not grant it automatically.

## 7. Queue item contract

A queued document mutation MUST retain the canonical server command semantics:

```text
queue_id                 local opaque identifier
context                   exact Offline Access Context identity
command_id                stable across every retry
aggregate.doctype
aggregate.name
action
expected_version          version seen when the offline edit began
payload_hash              hash of the exact submitted payload
document                  intended document payload
created_at
attempt_count
last_error_code           diagnostic only
```

Rules:

- `command_id`, `expected_version` and `payload_hash` are immutable after enqueue.
- Retry never rewrites the base version to "make it pass".
- The queue never stores or trusts client-asserted roles.
- The server still resolves tenant/user from the authenticated route/session and must reject disagreement with any command tenant field.
- Queue records from one private namespace are never replayed under another user, tenant, access revision or incompatible schema/release context.

## 8. Sync preconditions

A background/foreground sync attempt may send a queued write only after all are true:

1. network is online;
2. tenant route is active;
3. current authenticated user/tenant matches the queued context;
4. current access revision is compatible with the queued context;
5. offline lease is valid or a fresh online bootstrap replaced it;
6. schema/release compatibility check passes;
7. the runtime has fresh request-side CSRF/authentication context required by the existing Frappe boundary.

If any precondition fails, the queue pauses. It does not silently drop or retarget commands.

Execution order is FIFO **per aggregate**. Independent aggregates may sync concurrently only when their domain authority permits it.

## 9. OCC and conflict detection

The server is the conflict authority.

For an update created offline:

- `expected_version` is the server document version observed when editing began;
- if the live server version no longer matches, sync records a conflict and stops that aggregate's queue;
- the client MUST NOT auto-increment or retry with the new version without user/domain resolution;
- an idempotent replay of an already-accepted `command_id` returns the original authoritative result rather than creating a second mutation.

A conflict record must retain:

```text
doctype / name
base_version
server_version
base_snapshot or fields required for diff
local_intent
server_current
conflicting_fields
```

The exact HTTP status is an adapter concern; the semantic condition is authoritative OCC rejection.

## 10. Conflict resolution

Generic resolution supports only three safe outcomes:

1. **Discard local** — accept server current state and remove the blocked command after explicit user action.
2. **Rebase/edit** — show server current plus local intent, let the user create a NEW mutation with a NEW `command_id` and `expected_version = server_version`.
3. **Domain resolver** — invoke a domain-owned correction/merge workflow when simple field rebase is unsafe.

There is no generic last-write-wins mode for business documents.

Submitted, cancelled, ledger-producing or otherwise immutable business states must use domain correction/reversal semantics rather than client-side merging.

## 11. Background sync boundary

Background Sync is an execution convenience, not an authentication bypass.

- A service worker may replay only while the browser can satisfy the same authenticated/CSRF boundary as a foreground request.
- No long-lived bearer token is introduced merely to make service-worker replay easier.
- If browser/session platform constraints prevent fresh CSRF/auth context, the queue remains pending until the app is foregrounded and re-establishes it.

Therefore `U01-005` stays Missing until this path is proven in a real browser.

## 12. Release/schema freshness

On application boot and before queue replay, the runtime compares current release/schema markers with the queued/cache context.

- New bundle with compatible schema: a migration routine may migrate the local cache/queue deterministically.
- Incompatible schema with no local migration: private cache is invalidated; queued writes are preserved but blocked/exportable for recovery, never coerced into the new schema.
- Rollback to an older runtime does not replay queue records created against a newer incompatible schema.

## 13. Required executable evidence before maturity promotion

`U01-003 Offline read/cache` requires at least:

- two-tenant and two-user cache isolation;
- logout/login-switch purge;
- permission/access-revision change invalidation;
- lease-expiry lock;
- no hidden/Password field persistence;
- release/schema invalidation tests.

`U01-004 Offline write queue` requires at least:

- stable idempotency key across retries;
- tenant/user mismatch refusal;
- no online-only capability enqueue;
- queued payload survives reload without storing credentials.

`U01-005 Background sync` requires real-browser evidence for authenticated replay, session expiry/revocation, CSRF refresh/foreground fallback and retry.

`U01-006 Conflict detection` requires concurrent edit/OCC regression and retry-after-timeout/idempotency evidence.

`U01-007 Conflict resolution UX` requires browser/mobile evidence for discard, rebase/new command and a blocked non-mergeable domain case.

## 14. Dependency Requests created by this contract

### DR-RC05-OFFLINE-01 -> RC-04 / shared auth boundary

Expose one authoritative authenticated Offline Access Context, including access revision and bounded offline lease. Do not expose secrets or make client roles authoritative.

### DR-RC05-OFFLINE-02 -> IAM/metadata authorities

Define/bump the server-owned access revision on permission-narrowing mutations (Role/DocPerm/permlevel/User Permission/Share/organization scope/Role Policy). This may be implemented as tenant + user security generations; exact storage is an implementation choice.

### DR-RC05-OFFLINE-03 -> WS14 runtime

Implement private IndexedDB/service-worker namespaces, purge/lock behavior, queue and conflict UX only after DR-RC05-OFFLINE-01/02 are wired.

### DR-RC05-OFFLINE-04 -> RC-02 release/SRE

Keep release SHA/bundle marker observable and stable enough for cache/queue freshness checks. Offline code must consume that canonical marker rather than invent another release id.

## 15. Maturity recommendation

- `U01-001`: existing Wired evidence unchanged.
- `U01-002`: existing Wired evidence unchanged.
- `U01-003..007`: remain **Missing** on this branch. Contract is frozen, implementation/evidence is not.

That distinction is intentional. A frozen contract prevents unsafe implementation; it is not implementation itself.
