# CF04 R2 — Cloudflare Edge Security

Date: 2026-08-04
Status: ACTIVE — clean current-main replay; exact-head CI pending
Branch: `cloudflare/cfmax-04-edge-security-r2`
Baseline: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`
Risk: CRITICAL
Primary authority: WS11 security/IAM; CF08 owns provider apply/drift/rollback

## Takeover decision

The original CF04 had useful policy work but remained on stale ancestry and its regression was explicitly never executed. R2 replays only the evidence-backed source changes onto exact current main.

## Implemented source changes

1. `server/apps/gateway-worker/wrangler.jsonc`
   - `workers_dev=false`;
   - `preview_urls=false`.

Custom domains remain the intended production ingress. This closes alternate Worker hostnames that could bypass future zone-level perimeter rules after the source is deployed.

2. `server/config/cloudflare/edge-security-policy.json`
   - machine-readable separation between Cloudflare perimeter, Forge authentication and Forge authorization;
   - no generic interactive challenge for machine ingress;
   - no numeric edge threshold without Forge traffic/abuse/compatibility/cost evidence;
   - Turnstile remains deferred, with public signup the only current candidate after server-side Siteverify and replay/expiry behavior exist;
   - Access is rejected for tenant product login and recommended only as defense-in-depth for control/admin surfaces;
   - CF08 remains provider configuration/apply/drift authority.

3. `server/tests/edge-security-policy.test.mjs`
   - source cannot self-activate production;
   - Forge auth remains authoritative;
   - no unmeasured numeric thresholds;
   - machine traffic never receives generic Turnstile;
   - signup candidate still requires Siteverify;
   - Access remains defense-in-depth;
   - workers.dev/Preview URL source bypass cannot regress.

4. `.github/workflows/cf04-validation.yml`
   - exact PR-head checkout;
   - locked dependency install;
   - policy regression execution;
   - Wrangler type/config parse for Gateway.

## Explicit non-actions

R2 does **not**:

- create or modify WAF/rate-limit Rulesets;
- create Turnstile widgets/secrets;
- create Access applications/service tokens;
- alter DNS/custom domains;
- deploy Gateway;
- invent numeric thresholds;
- weaken Forge authentication/authorization.

Those are provider/production operations and remain behind explicit approval plus CF08 evidence.

## Maturity

After exact-head CI green, source evidence supports **Wired** for the CF04 perimeter contract. RC requires non-production provider rule/application proof with compatibility tests. Hardened requires production activation, measured false-positive/abuse behavior, rollback and alert evidence.

## Completion record

Owner: coordinator takeover / CF04 R2
Original branch: `cloudflare/cfmax-04-edge-security` — superseded for convergence
Changed zones: Gateway Wrangler source, edge policy JSON, focused regression, focused CI, this handoff
Migration: none
Production mutation: none
Exact-head CI: pending
Remaining RC gaps: provider feature/plan inventory, measured thresholds, non-production WAF/Turnstile/Access proof where adopted, production rollback evidence
Merge boundary: do not merge to main or deploy/provider-apply without explicit approval
