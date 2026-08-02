# WS11 — Security / IAM / Governance / SaaS Control Plane

Status: **IN PROGRESS — first CRITICAL slice implemented, validation/PR pending**  
Owner: **GPT-WS11**  
Branch: `agent/ent-11-security-iam-saas`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation the branch was reset from its stale seed onto exact current `main`; compare then showed `behind_by=0`. Backend/security scope is CRITICAL, therefore this workstream does not self-merge or deploy.

## Mission

Harden identity, permission, governance và SaaS control plane: RBAC/record/field/owner/share/user permission, MFA/SSO, tenant admin, plan/quota/feature lifecycle và audited support access.

## Own

session/auth/IAM/permission/security policy, SSO/OIDC/SAML/MFA/SCIM contracts, SoD/approval authority, PII/masking/retention, security audit/alerts, control-plane tenant provisioning/subscription/quota/feature/app lifecycle and audited impersonation/support access.

## Critical invariants

Trusted tenant/user context; deny by default; server-side permission; no client-asserted privilege; secret isolation; immutable security audit; tenant isolation; revocation/session epoch semantics; privileged IAM changes require stronger evidence than possession of an old browser session.

## Capability IDs touched by first slice

- `G01-003` RBAC — strengthens the privileged mutation edge; does not replace existing RBAC evaluation.
- `G01-004` Record-level access / `G01-008` User permission — step-up now applies when administrators add/remove user scope through the Frappe IAM API.
- `G01-015` Session management — reuses the signed `authenticatedAt` password-login timestamp already present in the session contract.
- `G01-016` Session/device revocation — existing epoch/revocation behavior is reused; no new revocation store is introduced.
- `G02-001` Audit log — existing atomic RBAC administration audit remains authoritative; no second security ledger is introduced.

## Phase A audit findings

### Identity/session boundary — existing foundation

- Cookie sessions are HMAC-signed with tenant-derived keys and bind tenant/user/roles/session epoch/expiry/CSRF plus `authenticatedAt`.
- Session verification checks signature before trust, tenant match and expiry; live user/session epoch is re-read on authenticated Frappe requests.
- Sliding session renewal deliberately preserves `authenticatedAt`, so refreshing a cookie does not manufacture a fresh password-login event.
- Gateway strips client-supplied trusted identity and signs tenant/user context for internal routing; tenant worker rejects routed/deployed tenant disagreement.
- JWT/trusted-identity and cookie-session paths are distinct trust boundaries. They must not silently substitute for one another on privileged writes.

### Permission/RBAC — existing foundation

- Server permission service already covers role/DocPerm, owner, share, User Permission, organization policy and field permlevel with deny-by-default behavior.
- Atomic RBAC administration service already protects last-admin/self-demotion cases, bumps session epoch on role/enable/password changes and appends redacted audit events.
- Organization Security already provides Role Policy, SoD/four-eyes, delegation and approval/security policy foundation.

### Gap found and implemented — Frappe privileged IAM step-up

The session already carried the last real password-login time, and organization-security policy publishing already had one inline 15-minute recent-auth check. However the Frappe IAM mutation methods did not use that signal.

Implemented at the Frappe API edge:

- `metaforge.api.add_user_permission`
- `metaforge.api.remove_user_permission`
- `metaforge.api.set_user_roles`
- `metaforge.api.create_user`
- `metaforge.api.set_user_enabled`
- admin reset of another user's password through `frappe.core.doctype.user.user.update_password`

Contract:

- maximum password-auth age: 15 minutes;
- tolerate at most 60 seconds future clock skew;
- stale/absent/implausibly future auth time fails closed with Frappe `AuthenticationError` / HTTP 401;
- read-only access inspection is not forced through step-up;
- self password change is not double-gated here because the core route already requires the current password;
- app callbacks/development actors have no password-login timestamp and therefore cannot use these protected Frappe IAM mutation edges as an administrator;
- role/permission checks and atomic mutation semantics remain in the core router/RBAC service; the edge adds only the recent-auth invariant.

Files:

- `server/packages/frappe-api/src/website-router.ts`
- `server/tests/security-recent-auth.test.mjs`
- `server/tests/rbac-contract.test.mjs` test fixture updated with explicit recent-auth evidence.

### Important blocker — native privileged control surface is a separate auth path

The tenant worker still exposes privileged native routes such as `/api/v1/user-permissions` and other System Manager metadata/workflow mutations after `authenticate()` using gateway trusted identity. That identity currently has actor/tenant context but no trustworthy password `auth_time` equivalent.

Therefore **this slice must not be described as system-wide recent-auth coverage**. Applying the browser-session timestamp only to the Frappe façade while pretending the native surface does not exist would be security theatre with extra paperwork.

`DR-WS11-01 -> WS00/WS11 architecture boundary`:

Choose and implement one authoritative contract before claiming `G01-014/G01-015` hardened:

1. carry a cryptographically bound, source-authenticated `auth_time`/authentication-strength claim through gateway trusted identity and fail closed for privileged native writes; or
2. retire/consolidate duplicated privileged native mutation routes behind the cookie-session/IAM administration path.

Do not infer recent password authentication from JWT `iat`; token issue time is not proof of a password/MFA step-up.

### Cross-stream permission finding

`DR-WS11-02 -> WS00/WS01`:

Daily Detailed Ledger correctly role-gates accounting operators, but its company filter is accepted at the ledger service boundary without visible User Permission / Organization Scope enforcement in that service. The ledger kernel is a WS00/finance hotspot, so WS11 records the finding instead of patching another stream's authoritative read model blindly.

### SaaS control-plane maturity

Current control plane has authenticated management, tenant signup/provisioning foundations and plan identities (`free/pro/enterprise`). Enterprise T01 remains incomplete: durable subscription lifecycle, quotas/usage enforcement, feature/module/app lifecycle policy, suspension/deletion workflow and audited support/impersonation are still later WS11 slices.

### MFA / SSO / SCIM maturity

No production MFA, OIDC/SAML SSO or SCIM implementation was found in current code or substantive legacy PR search. These remain `Missing/Foundation` rather than being promoted by documentation alone.

## Threat model for first slice

Primary threat: attacker obtains a still-valid administrator browser session and uses it after the original password login is no longer recent to create/disable identities, widen roles/record scope or reset another user's password.

Defence: recent-auth is checked at the API edge from a timestamp sealed into the signed session and preserved across sliding renewal. The check occurs before the core mutation handler, while the core continues to enforce role authorization and atomic/audited persistence.

Out of scope for this slice: MFA itself, native trusted-identity step-up, phishing-resistant authenticators, device inventory, IP policy and SaaS support impersonation.

## Legacy PR disposition

- PR `#45` **REUSE / already integrated** — atomic RBAC administration, last-admin guards, session epoch changes and redacted RBAC audit are current authoritative foundation. Do not cherry-pick stale history.
- PR `#48` **REUSE as regression evidence / already integrated** — post-merge RBAC auth and tenant-isolation QA.
- PR `#161` **REUSE / already integrated** — Organization Security foundation for Role Policy, SoD/four-eyes, delegation and security audit/query surfaces.
- PR `#164` **REUSE as metadata boundary evidence** — canonical first-party app security metadata contract; no code transplant needed for this slice.
- MFA/SSO search: **no substantive legacy implementation found** to cherry-pick.

## Validation added

`server/tests/security-recent-auth.test.mjs` covers:

- current and exact-window authentication accepted;
- stale, absent and implausibly future authentication rejected;
- exact protected IAM method set;
- self password change vs administrator reset distinction;
- stale administrator IAM mutation rejected at the Frappe edge before core mutation;
- administrator reset of another user's password rejected without recent auth.

Existing `rbac-contract.test.mjs` now makes recent password authentication explicit in its IAM mutation fixture, preserving the atomic administration/audit regression instead of accidentally bypassing the new invariant.

Exact full repository build/test evidence is not yet claimed from this connector session because the execution shell cannot resolve GitHub for a checkout. PR CI is the validation source once the branch is opened.

## Security migration impact

None in this slice. No D1 migration, tenant data mutation, secret change, DNS change or production deploy.

## Phase B priority after this slice

1. Close `DR-WS11-01`: one step-up contract across native + Frappe privileged control surfaces.
2. MFA/SSO seam and authentication-strength/session claims.
3. SoD/governance hardening and privileged audit/security alerts.
4. Tenant lifecycle/quota/feature/module/app policy.
5. Audited support access/impersonation.
6. Privacy classification/masking/retention.

## Dependencies

WS00 architecture/shared tenant-worker hotspots, WS09 role/permission builder, WS10 OAuth/connectors, WS12 operational controls, WS01 finance read scopes, and all domain agents as permission consumers.

## Merge / deploy gate

This is backend/security CRITICAL work. Open PR and stop. Merge/deploy require explicit user approval after exact-head validation and review. UI-only fast-path rules do not apply.
