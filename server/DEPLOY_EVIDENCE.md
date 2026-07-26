# Deployment Evidence

## Live deployment — 2026-07-26

Deployed to Cloudflare and exercised over the public internet. Every line below is a
recorded result, not an intention.

Account `d4d5a24d…`, workers.dev subdomain `trieu-nt93`, wrangler 4.114.0.

| Worker | Where | Result |
| --- | --- | --- |
| `cloudforge-gateway` | workers.dev | deployed, routes by hostname |
| `cloudforge-tenant-demo` | dispatch namespace `cloudforge-production` | deployed |
| `cloudforge-query-demo` | workers.dev | deployed, cron + queue consumer |
| `cloudforge-jobs` | workers.dev | deployed, queue consumer + maintenance cron |
| `cloudforge-control-plane` | workers.dev | deployed, token-guarded |

- **D1 migrations applied to remote**: tenant `cloudforge-demo` 15/15, `cloudforge-control`
  1/1, `cloudforge-jobs` 1/1. `wrangler d1 migrations list --remote` reports
  "No migrations to apply!"; the tenant database went from 17 to 53 tables.
- **Secrets**: 8 installed across 5 Workers, three of them shared pairs
  (`INTERNAL_AUTH_SECRET`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`). See
  `scripts/bootstrap-remote-secrets.mjs`.
- **Tenant route**: provisioned through the Control Plane's own
  `PUT /v1/routes/<route_key>` — not by hand — reaching `routing_version` 2 and writing
  both the forward key and the `__tenant__:` reverse index.
- **HTTP smoke over the public internet: 24/24 PASS.** Session, cookie replay, CSRF
  refusal, optimistic concurrency, submit, delete refusal, metadata, list, CSV export,
  logout. Command in `docs/VERIFICATION.md`.
- **Asynchronous path verified end to end, from a cold backlog.** After the cron fix the
  tenant outbox went from 30 pending / 0 published to **0 pending / 30 published**;
  the jobs Worker recorded **30/30** in `processed_events`; the tenant recorded
  **30/30** in `inbound_events`; the dead-letter queue stayed empty. Observed in
  `wrangler tail`: `"*/1 * * * *" - Ok`, then
  `POST https://tenant.internal/internal/maintenance - Ok`, then
  `Queue cloudforge-outbox (18 messages) - Ok`. Some `/internal/events` subrequests
  showed as `Canceled` mid-flight and succeeded on retry, which is the fail-closed
  retry path doing its job rather than a defect — nothing was acknowledged without a
  durable confirmation.

### Two release-blocking defects that only a live deployment could find

**1. No account could ever log in — PBKDF2 above 100,000 iterations is rejected in
production.**

`PASSWORD_ITERATIONS` was 210,000. Production Workers refuse a single
`crypto.subtle.deriveBits` PBKDF2 call above 100,000 iterations, and the throw happens
before any password comparison — so every login answered a masked HTTP 500, including
wrong passwords, which is why it did not even look like an authentication problem.

Measured, not inferred: an account hashed at 100,000 iterations logged in (HTTP 200);
the same account at 210,000 answered 500.

Local workerd does not enforce the limit. 258 Node tests, 70 Workerd tests and a 24/24
**local** HTTP smoke were all green against a build whose login could not work once
deployed. The suite also hashed at 1,000 iterations for speed, so the production work
factor was never executed anywhere.

Fixed by deriving in chained rounds of at most 100,000 iterations, each round's output
feeding the next. The attacker still pays all 210,000 HMAC-SHA256 iterations. A count at
or below the ceiling derives in exactly one round and is bit-identical to the old form,
so hashes stored before the change still verify — pinned by test.

**2. The outbox was never drained — a Worker in a dispatch namespace does not run its
cron.**

The tenant Worker declares `triggers.crons`, and `scheduled()` drains the outbox into
the queue and retries failed app-hook deliveries. A Worker uploaded into a dispatch
namespace is only ever invoked through the dispatcher; its crons are accepted at deploy
time and silently never fire.

Nothing errors. Events simply accumulate at status `pending`. Found on the live
deployment holding 27 events two days old, with `processed_events` empty — the whole
asynchronous half of the system had never run.

Fixed by moving the schedule to the jobs Worker, which is deployed normally and whose
cron does fire, and which already holds the two bindings needed to reach every tenant
(the KV route index and the dispatcher). It calls a new token-guarded
`POST /internal/maintenance` on each active tenant. Both that endpoint and `scheduled()`
call the same `runMaintenance`, so they cannot drift. Suspended tenants are skipped, KV
listing is paginated, and one unreachable tenant does not stop the others.

`/internal/*` is not publicly reachable: the gateway rejects a non-JWT `Authorization`
header on non-Frappe paths, so these endpoints are only reachable through the
dispatcher.

### Two more, found by pointing a real browser at the deployment

The Desk's list view had never populated. Two façade defects, each a CLASS rather than a
one-off, and neither reachable from a server-side test.

**3. `getdoctype` and `getdoc` were wrapped in `message`, and must not be.**

Frappe's own handler does not return these payloads — `frappe/desk/form/load.py` does
`frappe.response.docs.extend(docs)` and `frappe.response["docinfo"] = docinfo`, so the
keys are top-level and unwrapped. Checked against the pinned v16.19.0 source, not from
memory.

The failure is silent. The Desk reads `r.docs` straight off the body, gets `undefined`,
and raises DoesNotExistError **on an HTTP 200**, logging nothing. Its list query is gated
on metadata having loaded, so no list request was ever issued — which is exactly why the
symptom read as "the client is choosing not to query".

`client-contract.test.mjs` could not catch it: it feeds `toFrappeMetaBundle` directly and
so bypasses the envelope. The HTTP smoke could not either — its `unwrap()` reads
`message`, so it asserted the bug rather than the contract.

**4. List projections were not translated, so `modified` was rejected.**

The Desk asks for `modified` on every list; the kernel column is `modified_at`. Filters
and sort went through `toKernelField`, projections did not, so the server answered
`Field is not allowed: modified` for every doctype. Four call sites: list, contextual
list, `get_value`, export.

`modified` is also not a column — it is a token packed from `modified_at` AND `version`,
so requesting it must pull both. Dropping `version` would have produced rows with no
`modified` at all, and the Desk's inline editing would then send an empty token, turning
every inline save into a refused stale write.

Both are now pinned: the smoke asserts `docs` is top-level **and** that no `message` key
exists (24 → 26 checks), and the Workerd suite covers both shapes and the projection
(70 → 72). The browser suite went from 4 passed + 1 fixme to **5 passed, 0 skipped**,
run against this deployment.

### Known limits of this deployment

- **Single hostname, therefore one tenant.** The gateway derives the tenant from the
  request host, and workers.dev serves exactly one hostname per Worker. Multi-tenant
  vhost routing needs a wildcard custom domain; the credential in use has `zone (read)`
  only and cannot create DNS records. `PLATFORM_SUFFIX` is left at its template value
  and the route key is the full gateway hostname.
- **No R2 bucket bound**, so file upload answers "File storage is not configured"
  (guarded, not a crash). The credential lacks R2 permission.
- **`wrangler d1 migrations apply --remote` cannot be used on this project** — it is not
  a preference. See `scripts/d1-migrate-remote.mjs` for the reason and the replacement.

### Not done

- Load, multi-tenant, rollback and tenant-restore drills.
- ERPNext differential capture for v0.8–v1.0 modules (needs a real bench).
- Country e-invoice/payroll legal certification: **not claimed**.

## v1.0.0 (as shipped in the RC, before the above)

- Business-suite source gate: **PASS — 109/109 Node tests, migrations 0001–0009, SQL/race/type/source/security/readiness gates**.
- Commercial code/promotion gate: **STOP-SHIP** because current-release web/Workerd execution and promotion evidence are absent.
- Current-release Workerd execution: **not run**; clean dependency installation was unavailable in the packaging environment.
- Current-release Vite production build: **not run**; `vite/client` was unavailable without target-OS dependencies.
- Cloudflare staging/live deployment: **not run**.
- ERPNext differential capture for v0.8–v1.0 modules: **not run**.
- Country e-invoice/payroll legal certification: **not claimed**.

Historical v0.3.x deployment evidence is not evidence that v1.0.0 has been promoted.
