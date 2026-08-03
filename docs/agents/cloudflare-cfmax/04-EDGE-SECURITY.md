# CF04 — Edge Security / WAF / Rate Limit / Turnstile / Access

Status: **REVIEW — source implementation complete; provider activation pending**  
Branch: `cloudflare/cfmax-04-edge-security`  
Program baseline: `3b4c5c75bce315d03989d7fc05db721ff2668a4e`  
Primary Forge authority: WS11 security/IAM/SaaS  
Risk: **CRITICAL**

## Mission

Harden Forge's Cloudflare perimeter using WAF, rate limiting, Turnstile, Access/service credentials and related edge controls where they reduce attack/abuse risk, without replacing Forge authentication/authorization or breaking PWA/API/service traffic.

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

## Required reading completed

CFMAX common docs, Forge gateway/control-plane/auth evidence, current-main release evidence, and official Cloudflare references for:

- WAF / custom rules / rate-limiting rules;
- Wrangler `workers_dev` / Preview URLs;
- Turnstile server-side validation;
- Cloudflare Access service tokens.

Detailed audit: `docs/ops/CLOUDFLARE_EDGE_SECURITY_CF4.md`.

## Capability mapping

- `G01-016` Session management — compatibility boundary.
- `G01-018` IP/network policy — perimeter/network defense-in-depth.
- `G02-007` Privileged action audit — credential lifecycle/audited admin access boundary.
- `G02-008` Security alerts — edge events remain operational evidence, not canonical audit.
- `T01-001` Signup/onboarding — Turnstile candidate.
- `T01-003` Domain/subdomain — production ingress boundary.
- `T01-004` Tenant routing — route/custom-domain bypass boundary.

No capability is promoted to RC/Hardened by this branch alone.

## Exact findings and implementation

### 1. Gateway alternate-origin bypass — FIXED IN SOURCE

`server/apps/gateway-worker/wrangler.jsonc` exposed both `workers_dev:true` and `preview_urls:true` while also serving production custom domains.

CF4 changes both to `false` and documents custom domains as the production ingress authority. This prevents a future zone WAF/Access posture from being bypassed through an alternate Worker hostname after the configuration is deployed.

**Production mutation: none.**

### 2. Source-controlled policy contract — ADDED

`server/config/cloudflare/edge-security-policy.json` now records:

- exposure inventory;
- browser/API/machine classification;
- WAF compatibility stance;
- rate-limit rollout mode;
- existing application guards;
- Turnstile fit;
- Access fit;
- origin-bypass invariants;
- no-unmeasured-threshold rule;
- explicit production-approval gate.

It is a policy/evidence contract, **not** a second Cloudflare infrastructure authority. CF08 still owns the eventual provider config/drift mechanism.

### 3. Regression contract — ADDED

`server/tests/edge-security-policy.test.mjs` checks:

- production activation cannot happen from CF4 policy alone;
- perimeter never replaces Forge authentication/authorization;
- numeric edge thresholds remain absent without evidence;
- machine traffic cannot receive generic Turnstile enforcement;
- public signup retains application anti-abuse authority;
- login edge policy does not weaken its persistent application rate guard;
- Access remains defense-in-depth for control-plane routes;
- `workers_dev`/Preview URL bypass cannot regress in Gateway config.

Execution in this connector session: **NOT RUN**. No test is promoted to PASS without executable evidence.

## Exposure inventory

| Surface | Actor | Public | Machine? | Cost/abuse risk | Edge stance |
|---|---|---:|---:|---|---|
| health | probe | yes | yes | low | managed WAF compatible; observe only |
| SPA/client shell | browser | yes | no | low | no Turnstile on shell |
| login | browser/API | yes | yes | high | keep app guard; edge observe/calibrate |
| public signup | anonymous browser | yes | no | high | best Turnstile candidate; not wired yet |
| password/MFA/session | browser/API | yes | yes | high | route-specific observation; no generic challenge |
| Frappe API | browser/API/app | yes | yes | variable | no generic challenge/rate rule |
| files | browser/API | yes | yes | bandwidth/storage | observe expensive writes |
| reports/exports/print | browser/API | yes | yes | compute/I/O | observe; later tenant/user-aware quota |
| webhook/OAuth/app callbacks | provider/app | yes | yes | medium-high | never interactive challenge |
| control-plane/admin | operator/service | should be restricted | yes | critical | Access recommended in front of existing auth |
| domain/route governance | operator/service | should be restricted | yes | critical | Access recommended; preserve route audit/auth |

Machine-readable matrix: `server/config/cloudflare/edge-security-policy.json`.

## Rate-limit policy

Existing evidence:

- login application guard: 30 attempts/client IP/15 minutes;
- public signup: honeypot + 3/email/hour + 10/IP/hour using keyed lookup hashes.

CF4 **does not copy these numbers into Cloudflare**. Existing application values are references, not provider thresholds.

A numeric edge limit is blocked until backed by Forge-specific traffic/abuse/cost/SLA evidence. Rollout order is:

```text
inventory -> log/observe -> compatible challenge if justified -> block after false-positive review
```

Shared-NAT/mobile behavior and webhook/provider compatibility are explicit gates.

## Turnstile decision

Adopt now: **NO**.

Candidate: **public signup**.

Required before adoption:

1. accessible client token acquisition;
2. mandatory server Siteverify;
3. action/hostname validation;
4. provider timeout/degraded behavior;
5. replay/expired-token tests;
6. separate authenticated machine path where required;
7. test sitekey/secret regression.

Login and generic APIs remain deferred because they support API/machine clients.

## Access/service credential decision

Tenant product login: **REJECTED** as an Access use case.

Staff/admin/support perimeter: **RECOMMENDED**, but Access must remain in front of Forge application auth.

Selected machine-to-machine admin integrations: **CONDITIONAL** service-token fit when secret storage, expiry, renewal, revocation, least privilege, audience validation and audit ownership exist.

No service-token secret may appear in Git or browser code.

## Origin bypass

Production invariant now encoded in Gateway source:

- custom domains are the intended ingress authority;
- `workers_dev=false`;
- `preview_urls=false`;
- newly provisioned domains must receive equivalent perimeter posture;
- no direct app/tenant Worker hostname may become alternate product ingress.

Current-main release evidence inspected during this audit uses `https://alu.kairo.vn` as Gateway smoke base URL. Because CF4 is on the program baseline and current `main` has continued moving, this must be rechecked during convergence.

## Provider / cost / plan boundary

Cloudflare rate-limit expression fields/counting characteristics vary by plan. Actual Forge account/zone feature availability is not evidenced in repo.

CF4 therefore does not claim provider deployability or cost until CF08 inventories:

- zone/account plan;
- WAF/rate-limit feature availability;
- Access/Zero Trust ownership;
- rule/ruleset identifiers;
- configuration source of truth;
- drift/recovery mechanism.

## Dependency Request

Dependency Request  
ID: `DR-CF04-01`  
Owner: `CF08`  
Need: choose provider configuration authority (Terraform vs Rulesets API/dashboard-managed evidence), inventory actual zone/account feature availability, and own production drift/rollback evidence.  
Why: CF08 owns production resource/config/cost/drift/release governance; CF04 must not create a competing infrastructure authority.  
Blocked scope: production WAF/rate-limit/Access/Turnstile activation and provider-side proof.  
Can continue independently: yes  
Next independent work: source policy, origin-bypass fix, compatibility matrix and regression contract are complete.

## Acceptance gates status

- canonical capability mapping: **DONE**;
- attack-surface inventory: **DONE**;
- rate-limit matrix with no arbitrary borrowed thresholds: **DONE**;
- API/PWA/webhook compatibility policy: **DONE at contract level; executable provider test pending**;
- server permission regression: **UNCHANGED by CF4; full suite pending**;
- cross-tenant security negative tests: **existing Forge authority unchanged; full suite pending**;
- origin-bypass assessment: **DONE; source fix added**;
- secret lifecycle policy for Access service credentials: **DONE at policy level**;
- emergency rollback path: **DOCUMENTED**;
- plan/cost/feature availability: **BLOCKED on DR-CF04-01**;
- production activation evidence: **NONE / NOT CLAIMED**.

## Completion record

Owner: `GPT-CF04`  
Started from: CFMAX program baseline `3b4c5c75bce315d03989d7fc05db721ff2668a4e`  
Implementation head before this completion-record commit: `97964161bf90121deb2136a42fe510d4760cb659`  
Status: **REVIEW**  
Capabilities: `G01-016`, `G01-018`, `G02-007`, `G02-008`, `T01-001`, `T01-003`, `T01-004`  
Exposure inventory: `docs/ops/CLOUDFLARE_EDGE_SECURITY_CF4.md` + machine-readable JSON policy  
Policy decisions: origin bypass fixed in source; WAF/rate limiting observe-first; Turnstile signup-only candidate; Access admin/service defense-in-depth  
Tests: `server/tests/edge-security-policy.test.mjs` added, **NOT RUN**  
Production changes: **none**  
Dependency requests: `DR-CF04-01 -> CF08`  
Gaps: current-main convergence, executable tests, provider plan/config evidence, measured edge thresholds, optional Turnstile/Access application seams if approved

## Merge/deploy boundary

This lane is **CRITICAL**. Open/review the worker PR, but do not merge/deploy or mutate production WAF/Access/DNS/secrets until the user explicitly approves and the control/CF08 convergence gates are satisfied.
