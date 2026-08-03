# CF04 — Edge Security / WAF / Rate Limit / Turnstile / Access

Status: READY
Branch: `cloudflare/cfmax-04-edge-security`
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`
Primary Forge authority: WS11 security/IAM/SaaS
Risk: CRITICAL

## Mission

Harden Forge's Cloudflare perimeter using WAF, rate limiting, Turnstile, Access/service credentials and related edge controls where they reduce attack/abuse risk, without replacing Forge authentication/authorization or breaking PWA/API/service traffic.

## Required reading

Common CFMAX docs plus:

- gateway auth/trusted identity implementation;
- session/login/JWT/MFA packages;
- social ingress/webhook auth;
- control-plane/admin/support surfaces;
- custom domain provisioning;
- current rate-limit/auth tables and tests;
- SRE/security alert docs;
- production route/domain configs checked into source.

Provider references:

- `https://developers.cloudflare.com/waf/`
- `https://developers.cloudflare.com/waf/custom-rules/`
- `https://developers.cloudflare.com/waf/rate-limiting-rules/`
- `https://developers.cloudflare.com/cloudflare-one/`
- `https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/`

## Security separation

```text
Cloudflare perimeter
    -> blocks/challenges/rate-limits obvious abuse
Forge authentication
    -> establishes user/service identity
Forge authorization
    -> enforces tenant/role/record/field/business permission
```

No layer substitutes for the next.

## Owned scope

- exact perimeter exposure inventory;
- WAF/custom rule policy proposal;
- login/public API/webhook expensive-route rate-limit matrix;
- Turnstile fit for anonymous human-facing abuse-prone flows;
- Access fit for admin/support/internal tools;
- service token/mTLS fit for selected machine-to-machine administrative integrations;
- origin-bypass and custom-domain security audit;
- edge security event/rollback/compatibility evidence plan.

## Forbidden zone

Do not:

- weaken server permissions because Access/WAF exists;
- put Turnstile in generic API flows without client contract;
- challenge webhooks/service bindings accidentally;
- change production WAF/Access/DNS/secrets without explicit user approval;
- expose service-token secrets in Git/logs;
- use IP geolocation as a substitute for tenant/user authorization.

## Exposure inventory

Build matrix:

```text
surface | hostname/path | actor | public? | auth mechanism | machine traffic? | cost/abuse risk | WAF fit | rate-limit key | Turnstile fit | Access fit | evidence
```

Must cover:

- login/logout/password/MFA;
- public website/CMS pages/forms;
- generic Frappe-shaped API;
- file upload/download;
- report/export/print;
- social webhook/OAuth ingress;
- app callbacks;
- control-plane/admin/support routes;
- custom domain provisioning endpoints;
- health/release markers;
- any public signup/invite/onboarding route.

## Rate-limit policy

For each protected operation define:

- match expression/path family;
- counting characteristic where plan supports it;
- window/threshold rationale;
- action: log/challenge/block;
- trusted service bypass mechanism;
- tenant/user/IP interplay;
- failure response compatibility;
- rollback/disable switch.

Do not copy provider example numbers as Forge limits.

## Turnstile policy

Use only when all are true:

1. human-facing anonymous or high-abuse interaction;
2. client can obtain token accessibly;
3. server verifies token;
4. API/service clients have a separate authenticated path;
5. failure/degraded behavior is defined.

Candidate audit: login, signup/invite acceptance, public contact/lead form, password recovery. Adoption must be evidence-based.

## Access/service credential policy

Prefer Access for staff/admin/support perimeter, not tenant product login.

If using service tokens:

- define secret storage/rotation/revocation;
- short/appropriate expiry;
- least-privilege Access policy;
- application audience validation;
- logs/alert for expiry/revocation;
- no service token embedded in browser code.

## Origin bypass

Audit whether any production Worker/custom-domain endpoint can bypass expected gateway/security/auth path through `workers.dev`, preview URL, alternate hostname or direct app worker route. Propose safe disable/restriction strategy compatible with release QA.

## Implementation slices

### A — exact exposure/threat matrix

No production mutations.

### B — source-controlled policy representation

Determine whether repo should own Terraform/API declarative config, documented dashboard policy, or another current project mechanism. Coordinate with CF08; do not create a second infrastructure authority.

### C — application seams

Implement only application-side verification/metadata seams required for Turnstile/Access identity if the adoption decision is positive.

### D — tests

Include browser/API/service compatibility, bypass negatives and authorization invariants.

### E — staged rollout plan

Log-only/challenge/block sequence where appropriate; exact production mutation waits for approval.

## Acceptance gates

Before RC:

- canonical capability mapping;
- attack-surface inventory;
- rate-limit matrix with no arbitrary borrowed thresholds;
- API/PWA/webhook compatibility tests;
- server permission regression;
- cross-tenant security negative tests;
- origin-bypass assessment;
- secret lifecycle policy for any Access service credentials;
- emergency rollback path;
- plan/cost/feature availability called out;
- no production rule activation claim without evidence.

## Dependencies

- CF08 for infrastructure source/drift/production rollout;
- CF03 for privacy-safe security telemetry;
- CF05 for AI abuse/data policy;
- CF06 for Browser Run SSRF/download perimeter;
- WS11 for canonical auth/IAM changes.

## Completion record

Owner: —
Started from: —
Head: —
Status: READY
Capabilities: —
Exposure inventory: —
Policy decisions: —
Tests: —
Production changes: none unless explicitly authorized
Dependency requests: —
Gaps: —

## Startup prompt

Đọc handoff, Skill, CFMAX source-lock và exact Forge auth/gateway code. Lập exposure/threat matrix trước khi đề xuất WAF/rate limit/Turnstile/Access. Giữ ba lớp perimeter-authentication-authorization tách biệt. Không dùng threshold mẫu của Cloudflare như policy Forge. Blocker ghi Dependency Request và tiếp tục. Không thay production DNS/WAF/Access/secret khi chưa được user duyệt.
