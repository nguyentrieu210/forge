# CFMAX-04 — Cloudflare Edge Security Audit & Policy

Date: 2026-08-04  
Branch: `cloudflare/cfmax-04-edge-security`  
Risk: **CRITICAL**  
State: **source implementation ready for review; no production WAF/Access/DNS/secret mutation**

## 1. Capability mapping

CF4 is defense-in-depth for existing Forge capabilities; it does not create a parallel permission system.

- `G01-016` Session management — edge policy must preserve browser/session and bearer API behavior.
- `G01-018` IP/network policy — Cloudflare client/network signals may reduce attack surface, but Forge's server policy remains authoritative.
- `G02-007` Privileged action audit — Access/service-token changes require attributable lifecycle evidence.
- `G02-008` Security alerts — perimeter events are operational evidence, not the canonical security audit ledger.
- `T01-001` Signup/onboarding — public signup is the strongest Turnstile candidate.
- `T01-003` Domain/subdomain and `T01-004` tenant routing — every production hostname must enter through the same governed perimeter.

Maturity is **not** promoted to RC/Hardened by this branch. Provider-side activation and compatibility evidence remain outstanding.

## 2. Security separation

```text
Cloudflare perimeter
  -> managed WAF / custom rules / rate limiting / Access / optional Turnstile
Forge authentication
  -> cookie, bearer JWT, app-callback credential, CONTROL_TOKEN today
Forge authorization
  -> tenant, role, DocPerm, owner/share/User Permission, record/field/business policy
```

A perimeter allow is never authorization. A perimeter deny/challenge must not destroy legitimate browser/API/provider traffic.

## 3. Exact findings

### F-01 — alternate Gateway hostnames could bypass zone controls

`server/apps/gateway-worker/wrangler.jsonc` had both:

- `workers_dev: true`;
- `preview_urls: true`.

The same Worker also owns production custom domains (`edu/hrm/chotdon/alu/phanbon.kairo.vn`). A WAF/Access policy attached to the production zone can therefore be weaker than intended if the same Worker remains reachable through an alternate `workers.dev`/Preview URL.

**CF4 source fix:** both switches are now `false`. This is source only; no deploy has been performed.

Current-main release evidence inspected during the audit uses `https://alu.kairo.vn` as the Gateway smoke base URL, not a `workers.dev` URL. The CF4 branch was intentionally seeded from the CFMAX program baseline and is behind current `main`, so release-workflow compatibility must be rechecked again at convergence.

### F-02 — login already has an application-side persistent guard

Forge's auth QA evidence records the production login guard as **30 attempts / client IP / 15 minutes** and explicitly avoids weakening it for CI.

Decision:

- keep that application guard authoritative;
- do **not** copy the same number into Cloudflare automatically;
- start edge rate-limit work in observe/log mode;
- choose an edge threshold only after real traffic, shared-NAT/mobile behavior, false-positive rate and PBKDF2 cost evidence are available.

### F-03 — public signup already has application anti-abuse

`server/apps/control-plane-worker/src/index.ts` implements:

- honeypot field;
- keyed/HMAC email and IP lookup hashes;
- 3 requests/email/hour;
- 10 requests/IP/hour;
- 429 response after the application limit;
- slug uniqueness and pending-verification controls.

Decision: public signup is the best Turnstile candidate, but CF4 does **not** wire it yet because a complete adoption requires client token acquisition, server Siteverify verification, action/hostname validation, failure semantics and test keys.

### F-04 — generic API and app callbacks are mixed human/machine traffic

Gateway routes include Frappe API and `/_app/*` callback traffic. App callbacks use an app-specific derived credential plus a verified trusted identity. Social webhook/OAuth traffic is also machine/provider traffic.

Decision:

- no generic Turnstile on API routes;
- no interactive WAF challenge on webhook/OAuth/app-callback paths;
- rate limits for these paths must be provider/route specific and begin as observation;
- Forge authentication and authorization continue to decide whether a request may act.

### F-05 — control-plane Access is useful but cannot replace current application auth

Control-plane privileged routes currently require an opaque `CONTROL_TOKEN`. Existing WS11 evidence already records that this does not provide trustworthy human operator attribution.

Decision:

- Cloudflare Access is **recommended** in front of staff/admin/support surfaces once CF08 selects the infrastructure authority;
- service-token `Service Auth` is appropriate only for selected machine-to-machine administrative integrations;
- Access must sit **in front of**, not replace, the existing application authentication until Forge has an attributable operator contract;
- service-token secrets never enter Git/browser code and require expiry/rotation/revocation evidence.

## 4. Exposure / threat matrix

| Surface | Actor | Public | Machine traffic | Existing Forge authority | Cost/abuse risk | WAF | Edge rate limit | Turnstile | Access |
|---|---|---:|---:|---|---|---|---|---|---|
| `/health` | probes | yes | yes | none | low | managed compatible | observe | never | no |
| SPA/client shell | browser | yes | no | auth after shell load | low | managed compatible | none | no shell challenge | no |
| `/api/method/login` | browser/API | yes | yes | login + persistent app rate guard | high | managed compatible | observe/calibrate | deferred | no |
| public signup | anonymous browser | yes | no | honeypot + hashed app limits | high | managed compatible | observe/calibrate | candidate | no |
| password/MFA/session APIs | browser/API | yes | yes | signed session/bearer + recent-auth/MFA | high | managed compatible | route-specific observe | never generic | no |
| Frappe API | browser/API/app | yes | yes | tenant-worker authz | variable | compatibility exclusions | no generic limit | never generic | no |
| `/files/*` | browser/API | yes | yes | tenant-worker public/private decision | bandwidth/storage | managed compatible | write-focused observe | never | no |
| report/export/print | browser/API | yes | yes | Forge permission | compute/I/O | managed compatible | observe then app quota | never | no |
| webhook/OAuth/`/_app/*` | provider/app | yes | yes | signature/OAuth/app credential | medium-high | explicit compatibility | provider-specific observe | **never** | no |
| control-plane routes | operator/service | should be restricted | yes | `CONTROL_TOKEN` + governance | critical | managed compatible | low-volume observe | never | recommended |
| domain/route governance | operator/service | should be restricted | yes | governed route mutation + audit | critical | managed compatible | observe | never | recommended |

The machine-readable version is `server/config/cloudflare/edge-security-policy.json`.

## 5. Rate-limit policy

CF4 intentionally does not invent production thresholds.

For each route family the policy contract records:

1. path/method/host match;
2. actor and whether machine traffic exists;
3. existing application guard;
4. abuse/cost risk;
5. intended counting characteristic;
6. rollout mode;
7. compatibility reason;
8. whether Turnstile/Access is forbidden, deferred or recommended.

A numeric edge threshold may be introduced only when one of these evidence sources exists:

- production traffic histogram / percentile;
- confirmed abuse/incident volume;
- per-request compute/cost budget;
- provider contractual limit;
- tested application SLA with false-positive envelope.

Existing Forge limits are references, not values to copy blindly into Cloudflare.

## 6. Turnstile decision

**Adopt now: no.**

Candidate: public signup.

Required before adoption:

- accessible client token acquisition;
- Siteverify on the server for every protected submission;
- expected action/hostname validation;
- provider timeout/error/degraded behavior;
- replay/expired-token tests;
- separate authenticated machine/API path where needed;
- test sitekey/secret in regression.

Login remains deferred because Forge supports browser and API clients and a generic challenge would change the API contract.

## 7. Access / service-credential decision

### Tenant product login

**Rejected.** Tenant users continue to use Forge authentication. Access is not an ERP permission system.

### Staff/admin/support perimeter

**Recommended after CF08 infrastructure authority is selected.** The application must still enforce its own authentication/authorization.

### Machine-to-machine administration

Service token may be used when all are true:

- route is administrative/internal;
- least-privilege Access policy exists;
- secret is stored in an approved secret store;
- expiry/renewal/revocation owner is named;
- application audience/auth is still checked;
- token is never embedded in browser code;
- logs can identify the credential and its lifecycle.

## 8. WAF policy shape

Proposed staged policy; **not activated by CF4**:

1. managed WAF rules with telemetry first;
2. explicit compatibility exclusions for webhook/OAuth/app callbacks where a managed rule produces false positives;
3. narrow custom rules only for evidence-backed abusive patterns;
4. route-specific rate limiting, log first;
5. challenge only human-compatible flows;
6. block only after false-positive review and rollback rehearsal.

CF04 does not create Terraform/API/dashboard configuration because CF08 owns provider source/drift/production rollout. Creating a second provider authority here would violate the program boundary.

## 9. Origin-bypass policy

Production invariants:

- Gateway custom domains are the ingress authority;
- `workers_dev=false`;
- `preview_urls=false`;
- no direct tenant/app Worker hostname may become an alternative product ingress;
- every newly provisioned custom domain must receive the same intended perimeter posture;
- local `wrangler dev` remains a development path and is not production exposure.

## 10. Regression evidence added

`server/tests/edge-security-policy.test.mjs` locks these invariants:

- CF4 policy cannot self-activate production changes;
- perimeter never replaces Forge auth/authz;
- unmeasured edge thresholds remain `null`;
- machine traffic is not forced through generic Turnstile;
- public signup keeps current application anti-abuse authority;
- login edge policy does not weaken the persistent application guard;
- Access remains defense-in-depth for control-plane routes;
- Gateway config cannot regress to `workers_dev:true` or `preview_urls:true`.

Execution in this connector session: **NOT RUN**. No repository checkout/runtime executor was available through the GitHub connector. This is not claimed as PASS.

## 11. Provider facts rechecked 2026-08-04

Official Cloudflare documentation was rechecked for:

- Wrangler `workers_dev` and `preview_urls` behavior;
- WAF rate-limiting rule semantics and plan-dependent matching/counting fields;
- Turnstile mandatory server-side Siteverify behavior;
- Access service-token issuance, expiry, revocation and Service Auth behavior.

Provider plan/zone availability for the actual Forge account is **not evidenced in repo** and remains a CF08 rollout gate.

## 12. Rollback / emergency path

Source rollback:

1. revert the CF4 commit before deployment if release validation proves a legitimate dependency on an alternate hostname;
2. do not re-enable alternate production ingress as a permanent workaround;
3. restore a dedicated, explicitly protected staging hostname instead;
4. provider-side WAF/rate-limit/Access rollout must retain a disable/rollback action and exact rule/ruleset identifiers in release evidence.

## 13. Remaining gates before RC

- rebase/converge onto exact current `main` and re-run gateway/release diff;
- run `server/tests/edge-security-policy.test.mjs` plus relevant auth/gateway tests;
- verify current production release/smoke uses only custom domains;
- collect provider account/zone plan and feature availability;
- collect baseline traffic/abuse/cost telemetry before numeric rate thresholds;
- if Turnstile is adopted, implement client + server Siteverify seam and tests;
- if Access is adopted, define application/audience, operator/service identity, secret lifecycle and rollback;
- CF08 chooses and owns the provider configuration mechanism;
- explicit user approval before merge/deploy/provider mutation.

## 14. Production changes

**None.**

No WAF rule, rate-limit rule, Access application/policy, service token, Turnstile secret/sitekey, DNS record, Worker deployment, or customer-data mutation was executed by CF4.
