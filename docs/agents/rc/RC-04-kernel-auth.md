# RC-04 — Kernel / Auth Hardening

Status: **REVIEW / exact-head validation pending**  
Owner: **RC-04**  
Branch: `rc/w0-kernel-auth`  
Seed: `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`  
Scope: **RC-010 + RC-012**  
Risk: **CRITICAL / non-UI**

## 1. Scope and evidence policy

This lane audits and hardens the authoritative document mutation path plus authentication/session behavior. It does **not** change DocPerm/permlevel/share/User Permission semantics owned by RC-05.

Evidence rules used here:

- merged code is not by itself RC/Hardened evidence;
- exact source, migration, failure-path tests and runtime topology are treated separately;
- missing evidence is recorded as Missing/Unknown instead of inferred;
- no production deployment, production migration, secret/DNS change or destructive operation is performed.

Required source evidence read from the seed includes:

- `skills/forge-enterprise-completion/SKILL.md`;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `PROJECT_CONTEXT.md`;
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
- `server/docs/spec/technical/atomic-write-protocol.md`;
- `docs/agents/workstreams/WS00-architecture-kernel.md`;
- `docs/agents/workstreams/WS11-security-iam-saas.md`;
- document-kernel, Frappe command/router/session/auth/session-manager, auth user/session-registry/RBAC administration, tenant-worker trusted-identity/native-security paths, tests and auth migrations.

`docs/FORGE_RC_HARDENING_PLAN_20260803.md` is **Missing on the exact seed** and repository search returned no canonical replacement by that name or by `RC-010`/`RC-012`. The task contract supplied to RC-04 is therefore used as the RC scope authority; see `DR-RC04-01`.

## 2. RC-010 — authoritative mutation audit

### Canonical write topology

```text
Gateway verified identity / cookie session
-> Tenant Worker
-> aggregate Durable Object coordinator
-> DocumentKernel
   -> payload-hash / receipt replay
   -> server permission
   -> lifecycle + OCC/version check
   -> deterministic controller MutationPlan
-> D1 first-primary mutation store
   -> mutation_guard
   -> document / children / search
   -> immutable version snapshot
   -> ledger projections
   -> outbox
   -> mutation receipt
   -> one D1 batch + bookmark
```

### Audit matrix

| Invariant | Finding | Evidence / disposition |
|---|---|---|
| Authoritative create/save/submit/cancel | **PASS / RC evidence exists** | `DocumentKernel.execute`, Frappe `buildCommand`/`runCommand`, WS00 topology. |
| OCC/version | **PASS / RC evidence exists** | kernel pre-check plus D1 `mutation_guard`; `kernel.test.mjs` proves 100 concurrent writes at one expected version => 1 success / 99 conflicts. |
| Idempotency | **PASS / RC evidence exists** | receipt replay before planning, payload hash + actor binding, D1 receipt re-read after batch error; `kernel.test.mjs` covers exact replay, changed payload reuse and cross-actor reuse. |
| Atomic audit/outbox side effects | **PASS on canonical command path** | version, ledgers, outbox and receipt are in the same D1 batch. |
| Commit-before-response retry | **PASS on canonical command path** | D1 store re-reads committed receipt after batch/response ambiguity. |
| Preview/read-only | **PASS for audited purchase allocation preview** | `previewPurchaseReceiptSubmission` builds the same submit controller plan but never calls store execute; actual submit re-checks revision under the supplier coordinator. |
| Trusted tenant context | **PASS for audited paths** | gateway strips client platform headers; trusted envelope is tenant/signature/trace/expiry checked; tenant worker rejects deployed/routed tenant mismatch. |
| Shared-state serialization | **PASS for current WS00 evidence** | inventory/purchase coordination and fail-closed broad-scan hardening already exist on seed. |
| Direct document maintenance writes | **OPEN GAP** | Frappe delete/rename permission-check then call `deleteDraftDocument` / `renameDocument` directly; local D1 batch exists, but no canonical receipt/outbox/tombstone/name-reuse contract. `DR-RC04-02`. |
| Finance period-lock direct write | **OUTSIDE RC-04 AUTHORITY** | existing WS00 finding belongs finance ownership; no cross-lane patch here. |
| Production mutation evidence | **UNKNOWN / not claimed** | no production operation is permitted in this lane. |

### RC-010 maturity recommendation

- `I01-014` idempotency: **RC evidence retained**, not promoted.
- `G02-001` audit trail: **RC evidence retained on canonical command path**, not promoted.
- `G02-002` immutable audit evidence: **Wired/RC boundary**, blocked from Hardened by delete/rename maintenance semantics.
- `O01-011` integrity checks: **RC evidence retained**, not promoted.
- RC-010 overall: **RC for canonical create/save/submit/cancel; not Hardened**. Maintenance delete/rename remains an explicit exception rather than being disguised as complete coverage.

## 3. RC-012 — auth/session audit and fixes

### Existing foundation confirmed

- HMAC-signed tenant-bound `sid` cookie, `HttpOnly; Secure; SameSite=Lax`;
- signed CSRF nonce bound to the session;
- live user existence/enabled/session epoch checked on every established browser session;
- per-session opaque registry id with individual revoke, plus `session_epoch` global kill switch;
- first-primary reads for authentication/session registry;
- login password verification uses a dummy hash for unknown users;
- account + IP login limits are tenant-scoped fixed windows; identifiers are stored as salted hashes;
- successful account rate-limit clearing occurs only after password + MFA success;
- sliding renewal preserves the original `authenticatedAt` and session id;
- privileged native writes consume issuer-authenticated `auth_time`, not trusted-envelope/JWT issue time;
- gateway strips caller-supplied trusted platform headers before signing internal identity.

### RC04-F01 — CRITICAL — logout swallowed security-state failures

**Regression first:** `server/tests/logout-failure-contract.test.mjs`.

Previous behavior wrapped `verifySession`, CSRF validation and registry revoke in one broad `catch`. A valid signed session could therefore:

1. omit/mismatch CSRF and still receive `200 Logged Out`; or
2. hit a registry/D1 revoke failure and still receive `200 Logged Out` with a cleared browser cookie while the server-side session remained active; or
3. carry a new-style registered session while the registry dependency was absent and silently skip server revoke.

**Fix:**

- only an invalid/expired/malformed cookie is treated as idempotent already-logged-out;
- after successful signature/session verification, CSRF failures propagate;
- a registered session requires the registry fail-closed;
- registry revoke errors propagate instead of being converted to success;
- cookie clearing occurs only after successful valid-session revocation, or for an already-invalid cookie.

### RC04-F02 — HIGH — duplicate current-session revoke caused commit/response ambiguity

**Regression first:** `server/apps/tenant-worker/test/session-current-revoke.integration.test.mts`.

`metaforge.api.revoke_session` could target the current browser session. The registry mutation committed, then the tenant wrapper attempted sliding renewal of that now-revoked session. The client could receive an auth failure after the revoke had actually committed, making retry/result semantics ambiguous.

**Fix:**

- `logout` is now the sole authority for revoking the current browser session because it owns CSRF + registry revoke + cookie clearing;
- `revoke_session` rejects `currentSessionId` before mutation and remains the authority for other sessions;
- the integration regression asserts the current registry row remains active when this duplicate surface is rejected.

No IAM role/DocPerm/permlevel/share/User Permission contract was changed.

### RC-012 maturity recommendation

| Area | Recommendation |
|---|---|
| Login/password/MFA ordering | **RC candidate**, existing integration evidence; no new maturity promotion until exact-head validation. |
| CSRF/session cookie | **RC candidate** after RC04-F01 regression passes. |
| Individual session revocation | **RC candidate** after unit + Worker integration regression passes. |
| `session_epoch` global revocation | **RC evidence retained** from current administration/session tests. |
| Login rate limiting | **RC evidence retained** from real D1 Worker integration test; no Hardened claim. |
| Trusted tenant / privileged `auth_time` | **RC evidence retained** from current source/tests; no Hardened claim. |
| Production auth evidence | **Missing in RC-04**; production operations prohibited. |

RC-012 overall remains **Wired pending exact-head CI for this branch**. If targeted unit + Worker integration + build/typecheck pass at the PR head, recommendation is **RC**, not Hardened.

## 4. Regression and validation evidence

### New regressions

`server/tests/logout-failure-contract.test.mjs`:

- valid registered logout without CSRF -> reject, do not revoke;
- registry write failure -> do not report logout success;
- new-style registered session without registry -> fail closed;
- normal successful logout -> revoke exact current session then clear cookie.

`server/apps/tenant-worker/test/session-current-revoke.integration.test.mts`:

- real workerd + D1 session login/list path;
- duplicate current-session `revoke_session` is rejected before mutation;
- current registry row remains non-revoked so no commit-before-response ambiguity is created.

### Existing evidence reused from exact seed

- `server/tests/kernel.test.mjs`: idempotency, payload/key reuse, cross-actor reuse, 100-way OCC race;
- `server/tests/session-registry.test.mjs`: registration, exact revoke, self-scoped session inventory, audited revoke, logout-others, legacy epoch fallback;
- `server/apps/tenant-worker/test/frappe-facade.integration.test.mts`: real password login, unknown/wrong-user equivalence, CSRF, hashed tenant/account rate limiting and broader Frappe facade;
- `server/tests/authentication-context.test.mjs` + `server/tests/native-security.test.mjs`: issuer-authenticated `auth_time` / privileged native step-up;
- SQL migration/concurrency validators in the existing `npm test` / `test:sql` lanes.

### Commands required at exact PR head

```bash
cd server
npm run build
node --test tests/logout-failure-contract.test.mjs tests/session-registry.test.mjs tests/frappe-session.test.mjs tests/kernel.test.mjs tests/authentication-context.test.mjs tests/native-security.test.mjs
npm run typecheck:workers
npm run test:workers
```

Full repository validation may additionally run through the canonical CI lane. Failures unrelated to RC-04 must be classified as inherited debt rather than hidden.

### Local execution limitation

This session attempted an exact branch checkout, but the execution environment cannot resolve `github.com`; therefore no local build/test result is claimed. PR CI / GitHub check runs are the executable evidence source for the exact head.

## 5. Dependencies / unresolved gaps

### DR-RC04-01 — canonical RC hardening plan missing

Target: RC coordination/docs lane.  
Need: restore or identify the canonical `FORGE_RC_HARDENING_PLAN_20260803.md` containing RC task definitions.  
Impact: does **not** block the source audit/fixes; blocks claiming conformance to a missing file beyond the user-supplied RC-04 contract.

### DR-RC04-02 — maintenance delete/rename command contract

Target: shared Kernel/contract convergence.  
Current exception: draft delete + rename bypass normal MutationCommand receipt/outbox lifecycle.  
Required contract before implementation:

- idempotent retry/result semantics;
- tombstone and name reuse after delete;
- immutable audit preservation;
- rename identity and historical receipt/version semantics;
- reference refusal/rewrites;
- event/outbox contract;
- OCC/permission behavior.

This touches shared mutation contracts and multiple domain consumers. RC-04 does not casually extend `MutationAction` and destabilize other lanes merely to make a checklist green. It blocks a Hardened claim for the complete mutation surface, but does not block independent auth hardening.

### DR-RC04-03 — finance period lock direct-write envelope

Target: finance owner / existing WS00-WS01 dependency.  
The period-lock store has event audit but not the generic command receipt/outbox/OCC envelope. No finance business-rule change is made by RC-04.

## 6. Migration / production safety

- schema migration: **none**;
- customer data mutation: **none**;
- secret/DNS change: **none**;
- production deploy: **none**;
- merge: **not performed**;
- branch is CRITICAL/non-UI and must stop at PR review.

## 7. Handoff

RC-04 delivers two auth failure/retry regressions and fixes while preserving the existing kernel authority. The canonical document path is strong enough for RC-level evidence, but delete/rename maintenance semantics remain an explicit shared-contract gap. Auth/session should be promoted from Wired to RC only after exact-head PR validation passes; neither RC-010 nor RC-012 is claimed Hardened by this lane.
