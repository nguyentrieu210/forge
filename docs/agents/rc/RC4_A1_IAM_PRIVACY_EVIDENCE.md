# RC4-A1 — IAM / Privacy Release-Confidence Closure

Date: **2026-08-04**  
Agent: **RC4-A1**  
Branch: `agent/rc4-01-iam-privacy`  
Draft PR: `#597`  
Exact seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **CRITICAL**  
Production deploy/provider mutation: **NONE**

## Mission

Close the highest-priority IAM release-confidence gaps without rebuilding security authority or claiming maturity from source presence alone.

Owned capability families for this lane:

- `G01-001..G01-018` Identity & Access;
- `G02-001..G02-009` Governance & Privacy where the authority is IAM/security;
- `T01-020` audited support access / impersonation;
- directly coupled tenant/session/authentication-strength evidence.

A1 does not own SRE/provider recovery (RC4-A2), migration/cutover (A3), Finance/VN (A4), payroll statutory (A5), shared browser/mobile/offline runtime (A6), App Factory/shared metadata compiler (A7), or integration-provider runtime (A8).

## Exact-main audit

### G01-011 MFA — source/runtime is already wired

The old WS11 handoff is stale on runtime wiring. Exact current main already contains all of the following:

- encrypted TOTP factor/recovery-code authority in `server/packages/auth/src/mfa.ts`;
- login enforcement in `server/packages/frappe-api/src/auth-routes.ts` after password proof and before successful-login recording/session issuance;
- self-service MFA status/enroll/confirm/disable routes in `server/packages/frappe-api/src/mfa-routes.ts`;
- production MFA keyring construction in Tenant Worker;
- Tenant Worker routing of MFA management methods;
- tenant migration `0051_user_mfa_totp.sql` and focused service/route/config/login tests.

Security invariants retained:

- password is proven before MFA is evaluated;
- enabled MFA fails closed when the second factor is missing;
- no session cookie is issued before second-factor verification;
- TOTP replay is rejected by monotonic `last_used_step`;
- recovery codes are hashed and single-use;
- MFA management is self-scoped to a browser session;
- begin/confirm/disable require recent password authentication;
- disable also requires factor possession;
- MFA enable/disable/recovery use immutable security audit authority rather than a second ledger.

RC4-A1 adds `server/tests/rc4-iam-auth-integration.test.mjs` to prove the actual login ordering across password -> MFA -> login evidence -> revocable session registration, including recovery login and password-only compatibility for users without an enabled factor.

**Global maturity remains Wired until exact executable evidence is green and A6 supplies browser/login/enrollment/recovery evidence.** A1 does not manufacture an RC promotion from backend source alone.

### G01-016 / G01-017 session management and revocation

Exact current main includes:

- signed tenant-bound HttpOnly/Secure/SameSite cookie sessions;
- epoch/global revocation semantics;
- opaque per-session registry for newly issued sessions;
- exact-session revoke and keep-current logout-others behavior;
- session inventory/revoke API;
- sliding renewal preserving original authentication time;
- immutable revocation audit/security-alert evidence.

RC4-A1 validation runs session-registry + Frappe session + recent-auth tests together with the new MFA/login integration regression. This is intended to prove that MFA and revocable session issuance are one ordered authority rather than independent source fragments.

**Global maturity stays Wired until exact workflow evidence is green and browser/session UX evidence is consumed from A6.**

### G01-012 / G01-014 OIDC / SSO

Current main has an authentication-strength seam, not a complete OIDC login/provider lifecycle:

- verified bearer JWT claims may carry issuer-authenticated `auth_time`, `amr`, `acr`;
- gateway trusted identity can cryptographically carry that authentication context;
- privileged native writes use recent `auth_time` and never treat JWT `iat` as password/MFA proof.

Missing for complete OIDC/SSO:

- provider registration/discovery authority;
- authorization-code + PKCE browser lifecycle;
- nonce/state transaction persistence;
- JWKS/key rotation and issuer/audience/provider lifecycle;
- account linking/provisioning policy;
- logout/session-provider semantics;
- exact browser/provider evidence.

Keep `G01-012` and `G01-014` at Foundation until an actual provider-neutral lifecycle is implemented and tested.

### G01-013 SAML / G01-015 SCIM

No canonical SAML login lifecycle or SCIM provisioning protocol implementation is present on exact current main. These remain Missing. A1 will not relabel the OIDC auth-strength seam as SAML/SCIM support.

### G01-018 IP/network policy

A strict IPv4/IPv6/CIDR evaluator exists in `organization-security`, including fail-closed parsing once configured. The authoritative request-boundary policy loader and Cloudflare-authenticated client-address consumption are not yet proven end-to-end. Keep Foundation.

### G02-001 / G02-002 / G02-007 / G02-008 security evidence

Current main has reusable immutable RBAC/security audit evidence, privileged-action audit and an audit-derived security-alert read model. A1 validation includes recent-auth, trusted authentication context, native-security and security-alert regressions. No duplicate mutable alert ledger is introduced.

### G02-003..G02-005 privacy taxonomy / masking / retention

Still Missing at the canonical-contract level. `permlevel`, field hiding and existing redaction are authorization/presentation controls, not a durable privacy classification and retention taxonomy.

A valid implementation must round-trip through source metadata -> pack/install -> server parser -> runtime and remain one contract. A1 must not create a competing privacy dialect in an auth-only package.

### T01-020 support access / impersonation

Still Missing. Current control-plane `CONTROL_TOKEN` proves possession of an operator channel secret but does not identify a human operator strongly enough for attributable impersonation. An impersonation feature built on that identity would produce misleading audit attribution.

## New exact evidence gate

Workflow: `.github/workflows/rc4-a1-iam-validation.yml`

The gate executes on the exact PR head and covers:

1. focused IAM TypeScript emit with failures inside A1-owned auth/security files treated as blocking;
2. MFA service/routes/config/login tests;
3. new MFA -> revocable-session integration tests;
4. session registry and Frappe session regressions;
5. recent-auth, JWT/trusted auth context, native-security, security-alert and network-policy regressions;
6. session-registry and MFA migration replay/constraints;
7. repository SQL validation;
8. `git diff --check`.

A green run is executable evidence only. It is not provider/browser/production evidence and does not justify Hardened.

### Validation observation

- Draft PR: `#597`.
- Initial PR head: `9980abe89648b715eb450bca7a031c1394ffeb65`.
- Immediately after PR creation, GitHub exposed no workflow run/check for that head.
- Direct local checkout could not be used because the execution environment could not resolve `github.com`.
- No PASS is inferred from either absence. This evidence document update creates a new PR synchronization event so the branch-local exact-head gate can be observed if GitHub accepts the newly introduced workflow.

## Dependency Requests

### DR-RC4-A1-01 -> A6 UI/mobile/offline

Provide browser evidence and presentation for:

- login second-factor input/challenge handling;
- MFA TOTP enrollment confirmation and one-time recovery-code presentation;
- MFA disable flow;
- session inventory, exact revoke and logout-other-sessions;
- desktop/tablet/Android/360px/a11y behavior.

Server remains authoritative. A6 must not implement client-side security authority.

### DR-RC4-A1-02 -> A7 App Factory/shared metadata + A6 runtime

Define one canonical privacy metadata contract for `G02-003..005` that survives source compiler -> package/install -> server metadata -> client runtime. Required concepts include classification, masking policy and retention/legal-hold semantics. Existing `permlevel` is not the substitute.

A1 can own enforcement once the shared contract exists; it will not invent a parallel field taxonomy.

### DR-RC4-A1-03 -> A0/shared control-plane architecture

Select an attributable human-operator authentication contract before implementing `T01-020`. The existing opaque shared `CONTROL_TOKEN` is insufficient for honest per-human support impersonation audit. Production/provider mutation is not required to document the contract, but the identity source must be explicit.

## Maturity decision before CI

No capability is promoted by this commit set yet.

- `G01-011`: Wired, pending exact CI + A6 browser evidence.
- `G01-012`: Foundation.
- `G01-013`: Missing.
- `G01-014`: Foundation.
- `G01-015`: Missing.
- `G01-016..017`: Wired, pending exact CI + A6 browser/session evidence.
- `G01-018`: Foundation.
- `G02-003..005`: Missing.
- `T01-020`: Missing.

## Safety boundary

This A1 branch introduces tests, validation tooling and evidence only. No tenant/customer data mutation, production migration, secret, DNS, WAF/Access, identity-provider resource, production deploy or main merge is performed. Because this is CRITICAL non-UI IAM work, stop at a draft PR until explicit merge approval.
