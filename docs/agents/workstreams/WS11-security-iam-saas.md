# WS11 — Security / IAM / Governance / SaaS Control Plane

Status: **CLAIMED**  
Owner: **GPT-WS11**  
Branch: `agent/ent-11-security-iam-saas`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Harden identity, permission, governance và SaaS control plane: RBAC/record/field/owner/share/user permission, MFA/SSO, tenant admin, plan/quota/feature lifecycle và audited support access.

## Own

session/auth/IAM/permission/security policy, SSO/OIDC/SAML/MFA/SCIM contracts, SoD/approval authority, PII/masking/retention, security audit/alerts, control-plane tenant provisioning/subscription/quota/feature/app lifecycle and audited impersonation/support access.

## Critical invariants

Trusted tenant/user context; deny by default; server-side permission; no client-asserted privilege; secret isolation; immutable security audit; tenant isolation; revocation/session epoch semantics.

## Audit plan

1. Audit cookie/JWT/session and gateway trusted identity boundaries.
2. Audit server-side permission service across role/DocPerm/owner/share/user permission/permlevel and deny-by-default behavior.
3. Audit control-plane tenant lifecycle, plans, quotas, feature/module/app lifecycle and support access.
4. Audit security/governance evidence: immutable audit, PII/masking/retention, privileged actions, alerts.
5. Audit substantive legacy PRs in scope and classify reuse/cherry-pick/superseded/reject.
6. Select the smallest CRITICAL vertical slice that strengthens a real permission/tenant boundary with regression evidence.

## Phase A audit

Audit current cookie/JWT/session, gateway trusted identity, permission service, control-plane worker, roles/shares/user permissions, admin surfaces and missing enterprise IAM/SaaS features. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

## Phase B priority

Permission edge hardening -> MFA/SSO seam -> SoD/governance -> tenant lifecycle/quota/feature flags -> audited support access -> privacy/retention.

## Dependencies

WS00 architecture, WS09 role/permission builder, WS10 OAuth/connectors, WS12 operational controls, all domain agents as permission consumers.

## First commit / handoff

Claim owner/head; cuối nhánh ghi threat model, capability IDs, auth/permission contracts, tenant-isolation tests, security migration impact, legacy PR disposition, blockers, PR.
