# WS11 Autonomous Handoff — 2026-08-03

Branch: `agent/ent-11-security-iam-saas`  
Checkpoint PR: `#317` (Draft)  
Scope: Security / IAM / Governance / SaaS Control Plane  
Risk: **CRITICAL** — backend/security, therefore no autonomous merge/deploy.

## Execution rule

This handoff records exact implemented evidence and known gaps. A PR is a checkpoint, not a completion claim. Missing executable CI is recorded as **NOT RUN**, never promoted to PASS.

## Capability maturity

| Capability | State | Evidence / boundary |
|---|---|---|
| G01-003 RBAC edge hardening | Wired | Frappe privileged IAM + platform metadata/app lifecycle recent-auth guard; existing RBAC remains authoritative |
| G01-008 User Permission | Wired | recent-auth on Frappe add/remove and native PUT/DELETE guard |
| G01-011 MFA | Foundation/Wired core | encrypted TOTP/recovery lifecycle, migration, self-service routes and login-enforcement helper exist; runtime login/keyring wiring still required before Operational |
| G01-012 OIDC auth-time seam | Wired | verified JWT `auth_time/amr/acr` can be bound into gateway trusted identity; `iat` is never reauth evidence |
| G01-014 SSO | Foundation | auth-strength seam exists; no complete OIDC/SAML provider lifecycle in repo |
| G01-016 Session management | Wired | signed cookie + epoch retained; new sessions can carry revocable opaque session ids |
| G01-017 Session/device revocation | Wired backend | registry, exact revoke, keep-current logout-others, self-service API, immutable revocation evidence; UI remains WS14 dependency |
| G01-018 IP/network policy | Foundation | strict IPv4/IPv6/CIDR evaluator for canonical `ip_allowlist_json`; request-boundary policy loader wiring remains |
| G02-001/G02-002 audit/evidence | Wired | existing document-version/RBAC authority reused; new route/session/MFA governance events remain append-only |
| G02-008 security alerts | Wired read model | derived from immutable audit; no duplicate mutable alerts table |
| G02-003..005 privacy classification/masking/retention | Dependency | canonical metadata taxonomy/round-trip is not present; do not create a second PII dialect |
| T01-001..005 signup/provision/route/plan | Wired foundation | existing control-plane foundations + governed route lifecycle / plan-change audit |
| T01-009 quota | Foundation | typed explicit quota policy + audited/versioned store; no commercial limits invented |
| T01-010/T01-011 feature/module lifecycle | Foundation | explicit feature entitlement evaluator/store; no implicit plan matrix invented |
| T01-018 suspend/reactivate | Wired | controlled route lifecycle with reason + immutable audit |
| T01-020 support impersonation | Dependency | control-plane auth is an opaque shared token, so human operator attribution is not yet trustworthy |

## Slice 1 — privileged recent authentication

Frappe recent-auth uses the signed session `authenticatedAt` value, preserved across sliding renewal.

15-minute maximum age, 60-second future-clock tolerance. Protected operations include:

- user create/enable/disable/role changes;
- User Permission add/remove;
- administrator password reset of another user;
- Customize Form save;
- app install/uninstall;
- POST/PUT/DELETE for `DocType`, `Custom Field`, `Property Setter`, `Workflow`, `Print Format`.

Read-only inspection and ordinary business document saves are not turned into a reauthentication treadmill.

## Slice 2 — governed control-plane route lifecycle

`server/migrations/control/0005_control_route_governance.sql` and route governance service add:

- controlled route create/update/move;
- provisioning/active/suspended transition rules;
- suspend/reactivate and plan-change classification;
- required reason for effective changes;
- monotonic routing version;
- immutable route-governance audit;
- permissioned audit read endpoint.

KV remains a routing projection; D1 governance state/audit is authoritative.

## Slice 3 — native authentication-strength propagation

`AuthenticationContext` carries issuer-authenticated `auth_time`, optional `amr` and `acr` through a gateway-signed trusted identity.

Invariants:

- JWT signature/issuer/audience are verified before claims are trusted;
- `iat` is never promoted to step-up evidence;
- app callbacks deliberately do not inherit human step-up evidence;
- malformed/null/array auth envelopes fail as authentication errors, not runtime TypeErrors;
- privileged native writes require recent trusted `auth_time`.

Protected native writes include user permissions, DocType metadata, Workflow, Print Format, standard-metadata provisioning and Facebook OAuth connect.

## Slice 4 — audit-derived security alerts

`server/packages/frappe-api/src/security-alerts.ts` derives alert decisions from existing immutable evidence instead of creating a second alert ledger.

Examples:

- critical: role replacement, administrator password reset;
- high: user create/enable/disable, User Permission changes, security policy/SoD/delegation changes;
- medium: session revocation;
- ordinary business document versions are not mislabeled security alerts.

Cursor and authorization stay delegated to the existing Organization Security audit reader.

## Slice 5 — per-session inventory and revocation

`server/migrations/tenant/0050_user_session_registry.sql` introduces opaque session ids for newly issued browser sessions. Legacy cookies remain valid until expiry, avoiding a forced global logout.

Key invariants:

- session identity immutable;
- revocation is one-way and bound to `revocation_event_id`;
- exact session can be revoked without bumping the account epoch;
- registered logout revokes only the current session;
- `logout_other_sessions` keeps the current registered session;
- legacy sessions fall back to the existing epoch kill switch;
- app callbacks cannot enumerate/revoke a user's browser sessions;
- revoke-one/revoke-others events reuse immutable RBAC audit and surface in security alerts.

## Slice 6 — TOTP MFA foundation

`server/migrations/tenant/0051_user_mfa_totp.sql` + `server/packages/auth/src/mfa.ts` implement opt-in TOTP MFA without plaintext seeds.

Security contract:

- TOTP seed encrypted using AES-GCM under dedicated `MFA_KEK` generation id;
- previous key generation supported for rotation/decryption window;
- 30-second RFC6238-style TOTP, six digits, ±1 timestep;
- `last_used_step` prevents TOTP replay;
- enrollment confirmation consumes its timestep;
- ten recovery codes generated from 120 random bits each;
- only normalized SHA-256 recovery-code digests persist;
- recovery codes are single-use with immutable use-event linkage;
- enable/disable/recovery events reuse RBAC audit;
- self-service routes are fixed to the authenticated user and require a browser session;
- begin/confirm/disable require recent primary authentication; disable additionally proves factor possession;
- login enforcement is factored into `login-mfa.ts` and fails closed when an enabled factor cannot be verified.

### MFA runtime wiring still required

The connector stopped exposing current blob SHAs for already-existing files during this run. Existing-file force updates are intentionally not attempted. Remaining thin wiring before claiming G01-011 Operational:

1. call `assertLoginSecondFactor()` after password verification and before clearing login rate-limit/session issuance;
2. construct production `D1UserStore` with `mfaKeyRingFromEnv(env)`;
3. export/wire `mfa-routes.ts` through the authenticated tenant/Frappe entrypoint;
4. add MFA audit event names to the central security-alert classifier;
5. add login/settings UX in WS14.

This is a connector/write-boundary blocker, not a business-decision blocker. The core implementation/tests remain isolated and reviewable.

## Slice 7 — IP/network policy foundation

`server/packages/organization-security/src/network-policy.ts` provides strict evaluator semantics for Security Policy `ip_allowlist_json`:

- IPv4 and IPv6 exact/CIDR support;
- canonical network normalization and duplicate removal;
- maximum 256 entries;
- empty policy means unrestricted;
- once configured, invalid JSON/rules fail closed;
- malformed client address is denied under a configured policy.

Runtime wiring must consume only Cloudflare-authenticated client address metadata and the authoritative Security Policy loader. Do not trust `X-Forwarded-For` supplied by clients and do not bypass the existing policy source with a direct ad-hoc document query.

## Slice 8 — explicit SaaS entitlements without invented pricing

Forge has `free/pro/enterprise` plan identities but no repository-approved commercial quota values. WS11 therefore adds mechanism, not fictional business policy:

- typed feature/quota evaluator;
- `managed:false` legacy behavior when no explicit rule exists;
- once configured, a rule is authoritative;
- safe-integer quota math;
- versioned control-plane entitlement store;
- required change reason;
- immutable entitlement audit;
- no default rows seeded in migration `0006_plan_entitlements.sql`.

Actual Free/Pro/Enterprise limits and feature matrix remain a business-policy input.

## Dependency Requests

### DR-WS11-01 — native step-up issuer contract

**Code path implemented. Rollout dependency remains.** Production bearer issuer must emit signed OIDC-style `auth_time` for privileged native control operations. Token `iat` is not acceptable evidence.

### DR-WS11-02 — finance/ledger organization scope

Owner: WS00/WS01. Daily Detailed Ledger role-gates operators, but company selection needs explicit confirmation against User Permission / Organization Scope at its authoritative read boundary. WS11 does not patch the finance/kernel hotspot blindly.

### DR-WS11-04 — canonical privacy taxonomy

Owner: shared metadata / WS09 / WS14. PII classification and retention require one canonical metadata contract surviving source compiler → pack/install → server parser → client runtime. Existing `permlevel`/masked fields are authorization controls, not a privacy taxonomy.

### DR-WS11-05 — commercial entitlement policy

Owner: product/business. Exact Free/Pro/Enterprise feature and quota values are not inferable from current repo evidence. Mechanism exists; no limits are invented.

### DR-WS11-06 — attributable support access

Owner: control-plane auth/shared architecture. Current `CONTROL_TOKEN` authenticates the platform/operator channel but does not identify a human operator. Audited support impersonation cannot honestly claim individual attribution until that contract changes.

### DR-WS11-07 — MFA/session frontend

Owner: WS14. Runtime needs login second-factor input/challenge, MFA enrollment/recovery presentation and session inventory/revoke UI. Server remains authoritative; UI must not become the enforcement boundary.

## Validation added

Node regressions include:

- `security-recent-auth.test.mjs`;
- `authentication-context.test.mjs`;
- `native-security.test.mjs`;
- `security-alerts.test.mjs`;
- `session-registry.test.mjs`;
- `mfa-service.test.mjs`;
- `mfa-routes.test.mjs`;
- `mfa-config.test.mjs`;
- `login-mfa.test.mjs`;
- `network-policy.test.mjs`;
- `plan-entitlements.test.mjs`.

Migration regressions include:

- control route governance;
- user session registry;
- TOTP MFA lifecycle;
- plan entitlement governance.

### Execution evidence

- Full repository checkout/build/test in this connector session: **NOT RUN**.
- Exact-head GitHub workflow run observed for the latest WS11 head: **NOT RUN / none attached when checked**.
- No production migration, secret change, DNS change, customer-data mutation, merge or deploy performed.

## Before merge review

1. Re-compare exact current `main` and reconcile any shared auth/gateway/tenant-worker/migration-number drift.
2. Complete thin MFA runtime wiring and G01-018 policy-loader wiring when exact existing-file writes are available.
3. Run root test/typecheck/build and migration suite on exact head.
4. Review all CRITICAL auth/tenant/security changes for fail-open paths and concurrency/audit races.
5. Do not merge/deploy until explicit approval; this workstream is not UI-only.
