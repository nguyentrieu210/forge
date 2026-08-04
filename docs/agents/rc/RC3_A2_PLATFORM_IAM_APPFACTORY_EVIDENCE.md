# RC3-A2 — Platform, IAM, App Factory, Integration & Migration Evidence

Date: 2026-08-04  
Agent: **RC3-A2**  
Branch: `agent/rc3-02-platform-evidence`  
Program: `program/rc3-exact-main-release-confidence-20260804`  
Exact seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Risk: **CRITICAL audit boundary**  
Scope: platform/kernel-adjacent capability evidence, IAM/security/SaaS, BPM/App Factory, Integration Hub, implementation/migration tooling.  
Mutation boundary: **evidence/docs only; no runtime/schema/provider/production mutation.**

## 1. Mission result

This pass re-audits the RC-01 capability snapshot against exact current `main` after WS11, WS09 Batch Productization, Integration Hub, WS13 migration work and later RC hardening source landed.

The primary result is deliberately conservative:

- several RC-01 `Missing`/`Foundation` classifications are stale and can now be promoted based on connected exact-main source;
- three privacy capabilities are over-stated in RC-01 and should be demoted because no canonical privacy taxonomy/runtime lifecycle exists;
- WS09 Batch Productization materially strengthens App Factory action/input-table and replay evidence but does **not** justify broad App Factory RC promotion;
- Integration Hub and migration have substantial foundations but still lack shared runtime/provider/cutover evidence needed for RC;
- no capability in this lane is recommended `Hardened`;
- no provider or production PASS is manufactured from source/test-file existence.

This file is an A2 evidence input for RC3-A0. It does not edit the canonical 956-ID registry directly.

## 2. Evidence policy

Maturity vocabulary is restricted to `Missing / Foundation / Wired / RC / Hardened`.

For this audit:

- **Foundation** requires a real source/schema/service seam, not prose alone;
- **Wired** requires a connected runtime path with server-trusted identity/tenant/permission boundaries preserved;
- **RC** additionally requires focused executable regression evidence for the declared scope, including failure/retry/correction where material;
- **Hardened** requires production-grade/provider/exact-release evidence where material.

Historical branch handoffs are provenance, not current truth. Exact source on `main`, canonical migrations and exact executable evidence win.

## 3. Exact-main and legacy disposition

### Seed / drift

- RC3 exact seed: `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`.
- Current `main` was re-checked before this report and remained at the same SHA.
- Worker branch was created directly from that seed as required by the RC3 program.

### Historical branches / PRs

- `agent/ent-11-security-iam-saas`: compared with exact current main as **ahead 0 / behind 475**. Treat as historical evidence only; current-main source is authoritative.
- WS09 Batch Productization is already converged into current main through final PR `#553`; old A2 executor PR `#549` is not a live work item.
- Integration Hub `#308`, WS13 migration `#313`, WS11 `#317` and WS09/App Factory history are used only to explain provenance and old evidence boundaries; maturity decisions below are re-checked against current-main source.
- Stale RC/WS handoff statements such as “MFA runtime wiring still required” are superseded where exact current source now proves the wiring exists.

## 4. Capability delta recommended to RC3-A0

| Capability | RC-01 | RC3-A2 recommendation | Reason |
|---|---|---|---|
| `G01-011` MFA | Missing | **Wired** | TOTP/recovery storage + routes are present and login invokes `assertLoginSecondFactor()` after password proof and before successful-login clearing/session minting. Tenant worker also wires MFA keyring/routes. No exact-current-main browser/executable promotion suite is claimed here, so not RC. |
| `G01-012` OIDC | Missing | **Foundation** | Exact auth layer has issuer/audience-verified bearer JWT plus OIDC-style `auth_time/amr/acr` propagation. No complete user-facing OIDC provider discovery/JWK/login lifecycle is evidenced, so the auth-strength seam is not enough for Wired OIDC capability. |
| `G01-014` SSO | Missing | **Foundation** | Trusted external-auth strength/context seam exists, but no complete OIDC/SAML provider lifecycle, account linking/provisioning/logout/rotation evidence exists. |
| `G02-003` PII classification | Foundation | **Missing** | No canonical PII classification metadata taxonomy with compiler/install/runtime round-trip was found. Permission metadata is not PII classification. |
| `G02-004` Data masking | Foundation | **Missing** | Field permission/redaction protects authorization boundaries but no canonical privacy-classification-driven masking lifecycle is evidenced. |
| `G02-005` Data retention | Foundation | **Missing** | No canonical privacy retention taxonomy + enforceable lifecycle is evidenced. Domain-specific retention prose is not a platform retention capability. |
| `G02-008` Security alerts | Foundation | **Wired** | `security-alerts.ts` derives tenant-authorized alerts directly from immutable RBAC/document-version evidence; MFA/session/access/policy event classification is current and no second mutable alert ledger is invented. |
| `B02-006` App rollback | Missing | **Foundation** | `AppRevisionStore.rollbackPresentation()` provides a real, optimistic, audited presentation-only rollback and refuses materialized metadata rollback without an explicit reverse-migration contract. This is intentionally narrower than generic app rollback. |
| `T01-014` App rollback | Missing | **Foundation** | Same tenant-scoped presentation rollback is a real SaaS lifecycle seam; general schema/data rollback remains unsupported. |
| `T01-018` Suspend/reactivate | Foundation | **Wired** | Control-plane route governance explicitly supports audited `active <-> suspended` transitions with required reason and monotonic routing version; gateway rejects non-active tenants before application dispatch. |

No other A2-owned capability receives a maturity change in this pass.

## 5. IAM / authentication / authorization audit

### 5.1 Server-authoritative identity and permission boundary

Exact current source retains the expected authority model:

- browser session is cryptographically signed and tenant-bound;
- request establishment re-reads live user/session validity and current roles rather than trusting stale cookie role data as authorization authority;
- per-session registry supports exact revocation and `session_epoch` remains the global invalidation mechanism;
- CSRF remains session-bound;
- gateway-created trusted identity is signed, tenant-bound, trace-bound and expiry-bound;
- privileged bearer paths validate issuer/audience/signature before accepting identity/authentication context;
- `auth_time`, not JWT `iat`, is the recent-authentication evidence;
- app callbacks do not silently inherit human step-up evidence;
- role/DocPerm, owner, share, User Permission and field permlevel enforcement remain server-side.

RC-01 statuses `G01-001..010`, `G01-016`, `G01-017` therefore remain **Wired**. A2 does not promote them to RC because this lane did not execute an exact-current-main IAM regression matrix and no production auth evidence is claimed.

### 5.2 MFA — `G01-011`: Missing -> Wired

Current `server/packages/frappe-api/src/auth-routes.ts` proves the old WS11 wiring blocker is stale:

1. password is verified;
2. disabled user is rejected;
3. `assertLoginSecondFactor()` is called with the authenticated tenant/user and MFA store;
4. only after MFA success is the successful-login rate-limit state cleared;
5. only after that are login state/session registry/session cookie created.

The endpoint accepts canonical `mfa_code` with `otp` compatibility alias. Tenant worker source also contains MFA keyring/config and route wiring. `server/packages/frappe-api/src/security-alerts.ts` classifies `mfa.enable`, `mfa.disable` and recovery-code use from immutable audit evidence.

This is a connected backend flow and warrants **Wired**. It is **not RC** here because exact-current-main end-to-end login/enrollment/recovery/browser evidence was not executed by RC3-A2.

### 5.3 OIDC / SSO — conservative provider boundary

`server/packages/auth/src/index.ts` has a meaningful authentication-context seam:

- verified HS256 bearer signature;
- optional issuer and audience checks;
- expiry/nbf checks;
- validated OIDC-style `auth_time`, `amr`, `acr`;
- authentication context can be carried in the signed trusted identity;
- privileged writes can require recent issuer-authenticated `auth_time`.

This justifies **Foundation** for `G01-012` OIDC and `G01-014` SSO, replacing RC-01 `Missing`.

It does **not** prove a complete enterprise SSO lifecycle. Missing evidence includes provider discovery/key rotation, provider configuration lifecycle, authorization-code/login flow, account linking/provisioning/deprovisioning, SAML runtime, logout, operational provider regression and production/provider evidence.

`G01-013` SAML and `G01-015` SCIM remain **Missing**.

### 5.4 Session revocation / recent-auth

`G01-016` Session management and `G01-017` session/device revocation remain **Wired**.

Current source includes per-session identifiers/registry checks and exact logout revocation behavior. The older RC-04 audit also identifies the correct failure contract: after a signed session is established, CSRF/registry failures are not swallowed as successful logout. However RC3-A2 does not convert historical RC-04 branch-test claims into a current-main PASS without an exact-current-main run.

### 5.5 Network policy

`G01-018` remains **Foundation**. A strict IPv4/IPv6/CIDR policy evaluator exists, but A2 found no sufficient exact-main evidence to claim the authoritative request-boundary policy-loader lifecycle is fully wired and operational.

## 6. Governance / privacy audit

### 6.1 Audit authority

`G02-001` remains **RC** and `G02-002` remains **Wired** under the canonical registry baseline. A2 found no reason to demote the immutable command/audit paths, but does not broaden the claim to every maintenance/provider surface.

### 6.2 Security alerts — `G02-008`: Foundation -> Wired

`server/packages/frappe-api/src/security-alerts.ts` is not merely a data model. It:

- consumes an authorized immutable audit reader;
- classifies critical/high/medium security events;
- covers role changes, administrator password reset, user enable/disable/create, session revocation, MFA lifecycle and User Permission changes;
- classifies organization-security policy/delegation document evidence;
- derives alert IDs from immutable audit event IDs;
- deliberately avoids a second mutable alert ledger and reuses the source audit cursor.

That is a connected read model and warrants **Wired**, not RC. Exact-current-main route/regression execution and operational notification/alert handling remain unproven in this lane.

### 6.3 Privacy overclaim correction — `G02-003..005`: Foundation -> Missing

Repository search and WS11 dependency evidence agree that Forge does not yet have one canonical privacy metadata taxonomy surviving source compiler -> app package/install -> server parser -> client/runtime enforcement.

Therefore:

- `permlevel`, field authorization and response redaction are **authorization controls**, not `G02-003` PII classification;
- permission-driven omission is not a general `G02-004` data-masking policy;
- domain retention statements are not an enforceable platform `G02-005` data-retention lifecycle.

RC3 should demote all three to **Missing** until the shared contract exists. `G02-006` consent, `G02-007` privileged action audit and `G02-009` export/access audit retain their RC-01 classifications pending their owning evidence.

## 7. SaaS control-plane audit

### 7.1 Lifecycle / routing

`T01-001..005` remain **Wired**. Exact control-plane/gateway source continues to represent tenant route, plan and lifecycle state as server-owned platform state rather than client input.

### 7.2 Suspend/reactivate — `T01-018`: Foundation -> Wired

`server/apps/control-plane-worker/src/route-governance.ts` has explicit allowed transitions:

- `provisioning -> active`;
- `provisioning -> suspended`;
- `active -> suspended`;
- `suspended -> active`.

Effective changes require a reason, action is classified as `tenant.suspend` / `tenant.reactivate`, and routing version advances monotonically. Current gateway behavior rejects a route that is not active before normal client/API dispatch.

This is enough for **Wired**. It is not RC without exact-current-main lifecycle regression plus non-production/provider routing evidence.

### 7.3 Entitlement / quota

`T01-009` quota and `T01-010..011` feature/module lifecycle remain **Foundation**.

Mechanism exists for typed/versioned/audited entitlement policy, but no repository-approved commercial limits or Free/Pro/Enterprise matrix are inferable. A2 does not invent product policy to promote these capabilities.

`T01-006` subscription and `T01-007` billing also remain Foundation. There is no evidence here for a complete commercial billing lifecycle.

### 7.4 Support access

`T01-020` remains **Missing**. A shared/opaque control-plane credential can authenticate a platform channel but does not provide trustworthy human operator attribution required for audited support impersonation.

### 7.5 App lifecycle mapping

- `T01-012` install per tenant: **Wired retained**;
- `T01-013` upgrade per tenant: **Wired retained**;
- `T01-014` rollback: **Foundation promoted from Missing** due narrow presentation rollback;
- generic materialized rollback remains blocked by reverse-migration/schema-data semantics.

## 8. BPM / App Factory audit

### 8.1 Workflow/BPM

RC-01 B01 maturity is retained:

- `B01-001..004`, `B01-008`: **Wired**;
- `B01-006`, `B01-007`, `B01-012..015`, `B01-018`: **Foundation**;
- `B01-005`, `B01-009..011`, `B01-016`, `B01-017`: **Missing**.

No new exact-main evidence closes parallel/quorum approval, escalation/timer/scheduled-action or process-analytics state machines. Approval Policy/Delegation seams must not be relabeled as a full persisted BPM instance engine.

### 8.2 AppAction / Batch Productization

WS09 final convergence is material current-main evidence. It contains:

- canonical `BatchAction` / `BatchTransaction` contract;
- `itemization=row|table` support;
- first-class `AppAction.input_tables` on server and client;
- generic server batch executor;
- durable tenant-scoped D1 replay/idempotency claims through migration `0110_batch_replay_claims.sql`;
- deterministic replay/result mapping;
- Stock Reconciliation and BOM whole-table consumers through domain authority;
- final WS09 convergence workflow `30860236052` reported SUCCESS on the exact pre-merge control candidate.

The final gate covered locked install, changed-source TypeScript guard, shared BatchAction/executor regressions, inventory/manufacturing regressions, replay migration/repository SQL checks, client dependency builds, input-table view regression and production runtime build.

This materially strengthens `B02-016` Action builder/runtime evidence, but `B02-016` remains **Wired** because the capability is broader than one repeatable-input/batch contract and RC3-A2 lacks complete authoring/browser/permission/correction evidence for the builder lifecycle.

### 8.3 App install / upgrade / rollback

Retain:

- `B02-001..005`: **Wired**;
- `B02-007..013`, `B02-017..023`: **Foundation**;
- `B02-014`, `B02-015`: **Missing**.

Change only `B02-006` from Missing -> **Foundation**.

`server/packages/app-registry/src/app-revision-store.ts` provides version history plus `rollbackPresentation()` with:

- older-revision-only activation;
- fail-closed planner check;
- refusal when materialized metadata differs and reverse migration is absent;
- optimistic update against the previously observed active content;
- activation audit inserted only if target revision actually becomes active;
- failure when concurrent revision change wins.

This is real rollback machinery, but intentionally presentation-only. It must not be presented as generic schema/data rollback.

### 8.4 Remaining App Factory blockers

- generic materialized app rollback/reverse migration;
- same-app concurrent install/upgrade OCC/serialization evidence across the canonical installer path;
- parallel/quorum BPM state;
- persisted approval-step instances;
- escalation/timer/scheduled-action primitive;
- versioned generic rule/formula lifecycle;
- marketplace trust/signing;
- complete builder/browser acceptance evidence.

## 9. Integration Hub audit

RC-01 Integration classifications remain conservative and are retained.

### Current real foundations

Current-main source/provenance includes:

- connector catalog/manifest and adapter registry;
- tenant-bound connection contracts;
- webhook/event-subscription contracts;
- versioned mapping/transformation;
- external sync cursor/page/status model;
- deterministic outbound execution;
- delivery/retry/DLQ/replay contracts;
- secret-reference-only configuration rules;
- HTTPS/outbound-target restrictions and redirect fail-closed behavior;
- existing canonical import/export endpoints;
- existing outbox/jobs/tenant inbound dedupe reused instead of duplicated.

### Maturity retained

- `I01-014` idempotency: **RC retained**;
- `I01-001`, `I01-009..012`: **Wired retained**;
- `I01-002..008`, `I01-013`, `I01-015`: **Foundation retained**;
- `I02-011`: **Wired retained**;
- `I02-001..003`, `I02-006`, `I02-008..010`: **Foundation retained**;
- `I02-004`, `I02-005`, `I02-007`, `I02-012..016`: **Missing retained**.

### Why no promotion

The generic Hub still lacks sufficient exact-current evidence for:

- one canonical tenant-bound API-key/OAuth/service-account credential-vault lifecycle with create/use/rotate/revoke/audit;
- physical attempt persistence + queue/DLQ/quarantine/replay tooling in the generic connector runtime;
- exact failure/retry observability and recovery evidence;
- provider lifecycle/conformance evidence for many `I02` connectors.

A retry or DLQ **contract** is not the same as a proven physical DLQ/recovery path.

## 10. Migration / implementation audit

WS13 created substantial core machinery, but its own dependency boundary remains current.

### Exact capability recommendations retained

`IM01`:

- `IM01-001..006`, `IM01-008..015`: **Foundation retained**;
- `IM01-007` Guided tour: **Missing retained**.

`IM02`:

- `IM02-001` CSV import and `IM02-004` validation preview: **Wired retained**;
- `IM02-002`, `IM02-003`, `IM02-005..012`, `IM02-016`: **Foundation retained**;
- `IM02-013..015`: **Missing retained**.

### Durable migration source is real

Current source includes or documents:

- deterministic migration plan / source fingerprint / row identity;
- tabular adapters and mapping/validation preview;
- tenant migration journal migration `0053_migration_run_journal.sql` in current numbering;
- durable row reservation and command identity before authoritative apply;
- kernel receipt recovery after ambiguous response;
- checkpoint/retry/quarantine semantics;
- decimal-safe reconciliation metrics;
- implementation/go-live/customer-success evidence contracts.

### Why `IM02-005/006/008/009` are not promoted

Search of exact current runtime did not establish that the shared Frappe Data Import endpoints now compose `D1MigrationJournal + KernelMigrationApplyPort + executeDurableMigrationPlan`. The existing Data Import path remains kernel-safe, but the durable WS13 journal/retry path is still a separate platform core seam rather than the authoritative end-to-end Data Import runtime.

Concrete opening-data providers and domain reconciliation metrics also remain owned by Finance/Stock/HCM. Production cutover remains a separate WS12/provider/authorization boundary.

Therefore source richness is **not** converted into Wired/RC without connected runtime evidence.

## 11. Developer platform audit

`X01-001..009` remain **Wired** and `X01-010..015` remain **Foundation**.

Current app/compiler/migration/test/source-lock tooling strengthens the evidence bundle but does not close preview-environment, explorer/debugger, extension registry/trust and full compatibility lifecycle enough for promotion in this lane.

## 12. Promotion/demotion count for A0 ingestion

Recommended A2 deltas against RC-01:

### Promotions

- Missing -> Wired: **1** (`G01-011`).
- Missing -> Foundation: **4** (`G01-012`, `G01-014`, `B02-006`, `T01-014`).
- Foundation -> Wired: **2** (`G02-008`, `T01-018`).

### Demotions

- Foundation -> Missing: **3** (`G02-003`, `G02-004`, `G02-005`).

### Net effect inside A2 recommendations

- Hardened: no change;
- RC: no change;
- Wired: +3 net IDs;
- Foundation: -1 net ID;
- Missing: -2 net IDs.

These arithmetic deltas are **not** the final RC3 maturity report because A0 must combine A1/A3/A4 findings and A5 independent validation over all 956 IDs.

## 13. Dependency Requests

### DR-RC3-A2-01 — enterprise identity-provider lifecycle

Owners: IAM/control-plane architecture.  
Capabilities: `G01-012..015`, `G01-014`.  
Need: canonical OIDC provider discovery/JWK rotation/login/account-link/logout lifecycle, SAML if adopted, SCIM lifecycle and exact provider regression. Preserve issuer-authenticated `auth_time` as the privileged-step-up contract; do not use token `iat` as substitute.

### DR-RC3-A2-02 — canonical privacy taxonomy

Owners: shared metadata/App Factory + IAM + frontend/runtime.  
Capabilities: `G02-003..006`.  
Need: one versioned classification/masking/retention/consent contract that round-trips source compiler -> package/install -> server metadata -> runtime/query/export enforcement. Do not repurpose `permlevel` as privacy classification.

### DR-RC3-A2-03 — commercial entitlement policy

Owner: product/business.  
Capabilities: `T01-006..011`.  
Need: approved Free/Pro/Enterprise feature/quota/subscription/billing policy and limits. Mechanism may exist; values cannot be invented from engineering evidence.

### DR-RC3-A2-04 — attributable support access

Owner: control-plane auth/shared architecture.  
Capability: `T01-020`.  
Need: cryptographically attributable human/operator identity and reason-bound support session/access audit. A shared opaque operator token is insufficient.

### DR-RC3-A2-05 — complete app lifecycle concurrency/rollback

Owner: App Factory/app-registry shared authority.  
Capabilities: `B02-004..006`, `T01-012..014`.  
Need: same-app install/upgrade authoritative OCC/serialization evidence and an explicit reverse-migration contract for materialized metadata/data rollback. Presentation rollback is not schema rollback.

### DR-RC3-A2-06 — Integration Hub credential + physical recovery runtime

Owners: IAM/secret lifecycle + SRE/queue runtime.  
Capabilities: `I01-002..004`, `I01-011..015`, affected `I02-*`.  
Need: canonical tenant-bound secret lifecycle plus physical attempt persistence, DLQ/quarantine/replay, metrics/alerts and exact retry/recovery evidence.

### DR-RC3-A2-07 — migration runtime convergence

Owners: shared Frappe API/kernel integration + Finance/Stock/HCM opening providers + SRE cutover.  
Capabilities: `IM02-005..009` primarily.  
Need: compose durable WS13 journal/orchestrator into canonical Data Import execution; provide domain opening/reconciliation providers; execute non-production cutover/recovery evidence before RC promotion.

## 14. Release blockers from this lane

Highest A2-owned release-confidence blockers, ordered by authority breadth:

1. `G02-003..005` — privacy governance is genuinely missing, not Foundation.
2. `G01-012..015` — no complete enterprise external identity-provider lifecycle.
3. `T01-020` — support access lacks attributable human operator identity.
4. `I01-002..004` + `I01-013/015` — connector credential lifecycle / physical recovery / audit incomplete.
5. `IM02-005/006/008/009` — durable migration core not yet the canonical import runtime and domain reconciliation/cutover evidence is incomplete.
6. `B02-006` / `T01-014` — rollback is presentation-only; materialized schema/data rollback is unresolved.
7. `B01-005`, `B01-009..011`, `B01-016/017` — enterprise BPM quorum/timer/escalation/process facts absent.
8. `T01-009..011` — entitlement mechanism lacks business-approved commercial policy and operational enforcement evidence.
9. `G01-018` — network policy request-boundary wiring/evidence remains incomplete.
10. `B02-014/015` — no canonical generic versioned rule/formula builder lifecycle.

## 15. Validation / evidence executed

### PASS

- exact GitHub `main` seed re-check;
- exact branch creation from `98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`;
- exact-source audit for MFA login/session path, authentication-context seam, security-alert derivation, control-plane route governance, app revision rollback, App Factory/WS09 convergence, Integration Hub and WS13 migration boundaries;
- historical branch disposition check for WS11 (`ahead 0 / behind 475` against current main);
- capability-registry baseline comparison for B01/B02/I01/I02/G01/G02/T01/X01/IM01/IM02.

### Reused executable evidence

WS09 final convergence workflow `30860236052` is accepted only for the exact Batch Productization candidate it tested. It is not reused as a blanket IAM/Integration/Migration PASS.

### NOT RUN / UNPROVEN

- full repository build/unit/worker/SQL suite on exact `main` by RC3-A2;
- exact-current-main IAM browser/E2E;
- external identity-provider lifecycle;
- generic Integration Hub physical DLQ/provider recovery;
- durable migration Data Import end-to-end/cutover;
- provider/non-production mutation;
- production release/deploy evidence.

This report changes no runtime source, so RC3-A2 does not introduce a new executable behavior requiring a branch-local code regression suite.

## 16. Completion record

Agent: `RC3-A2`  
Branch: `agent/rc3-02-platform-evidence`  
Seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Owned output: `docs/agents/rc/RC3_A2_PLATFORM_IAM_APPFACTORY_EVIDENCE.md`  
Runtime/schema changes: **NONE**  
Migrations added/changed: **NONE**  
Provider/production mutation: **NONE**  
Recommended Hardened promotions: **0**  
Recommended RC promotions: **0**  
Recommended status deltas: **7 promotions / 3 demotions**  
Dependency Requests: **7**  
Merge/deploy: **NOT PERFORMED** — RC3 is non-UI evidence/governance; worker may converge into program control after review, but program -> `main` requires explicit user approval and production deploy is out of scope.
