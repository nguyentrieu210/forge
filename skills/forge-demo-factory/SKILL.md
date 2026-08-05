---
name: forge-demo-factory
description: Operating skill for turning a customer brief into an isolated live Forge demo tenant without forking runtime or bypassing platform authority.
---

# Forge Demo Factory

## Purpose

Use this skill when the user wants a customer-specific demo URL such as `thuy.kairo.vn` quickly.
The objective is not "make a screen that looks right". The objective is the smallest complete,
real Forge slice that can be opened, authenticated, exercised and explained without creating a
customer-specific runtime fork.

## Authority and boundaries

1. First resolve live phase from exact GitHub state, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, the
   enterprise operating Skill and the relevant pilot/release authority.
2. A demo tenant is isolated from frozen pilot/customer tenants. Never install demo data into a
   certified or controlled-pilot tenant.
3. Business writes still go through the authoritative tenant runtime/Document Kernel. Demo is not
   permission to bypass lifecycle, tenant isolation, audit, OCC/idempotency or server permission.
4. Customer customization should be brief/app metadata, domain rules, terminology, synthetic seed
   manifests and integrations. Do not fork the shared React/runtime or create
   `customer-X-api`/`customer-X-ui` merely for a demo.
5. Shared DNS/Worker routes and security-generation bootstrap are production provider state. They
   are changed only through source-controlled, explicitly authorized production workflows.
6. Never put customer production/master/opening data into a sales demo unless the user explicitly
   opens the real-data migration/cutover boundary. Default to synthetic data.
7. App `fixtures` are for installation/setup master records. Do not use a fixture and a canonical
   document as two authorities for the same business entity. Transactional/customer-facing demo
   records belong in `server/demo-seeds/<app-id>.json` and are written through the canonical API.

## Standard flow

```text
customer brief
 -> normalize/reserve slug
 -> compile + validate app brief (no mutation)
 -> validate matching synthetic seed manifest when present (no mutation)
 -> resolve the unique Cloudflare account containing cloudforge-gateway
 -> create/reuse isolated D1
 -> migrate + deploy isolated tenant Worker
 -> Control Plane derives and installs tenant-scoped Security Generation V2 credentials
 -> create demo administrator
 -> publish active route LAST
 -> wait for tenant origin
 -> install app through forge-app browser credential path
 -> verify client manifest/context
 -> seed synthetic documents through Frappe API / Document Kernel
 -> run one Golden Flow when the app has a domain scenario runner
 -> return LIVE https://<slug>.kairo.vn
```

Use `server/scripts/create-demo-tenant.mjs` as the orchestrator and
`server/scripts/provision-tenant-v2.mjs` as the new-demo provisioning authority. They compose
existing migration, route governance, App Factory installation and canonical document-write paths;
they must not duplicate those authorities. If `server/demo-seeds/<brief-id>.json` exists, the
orchestrator automatically requires that seed to PASS before it prints `LIVE`.

## Inputs

Minimum:

- customer name;
- optional explicit slug;
- existing source-controlled app brief/package;
- administrator identity;
- tenant plan;
- exact merged-main source SHA for a live run.

Derive a Vietnamese customer name deterministically to an ASCII slug when the user does not name
one. Collision/resource ownership must fail closed or reuse only an exact same tenant resource;
never overwrite another tenant merely because the requested slug is similar.

## Provider identity and Security Generation V2

`CLOUDFLARE_ACCOUNT_ID` is an optional hint, not a required operator input. When absent, Demo Factory
must enumerate only accounts visible to `CLOUDFLARE_API_TOKEN` and select the unique account in which
`cloudforge-gateway` is readable. Zero or multiple matches are failures; never pick the first account.

Legacy production credentials `INTERNAL_AUTH_SECRET`, `INTERNAL_SERVICE_TOKEN` and `CONTROL_TOKEN`
are write-only provider state and may be unavailable to new automation. Do **not** generate a
replacement for one legacy tenant and do not require those plaintext values for new demos.

Security Generation V2 is the authority for newly provisioned demo tenants:

- `INTERNAL_AUTH_SECRET_V2` is a platform master held only by Gateway + Control Plane;
- `INTERNAL_SERVICE_TOKEN_V2` is a platform master held only by Jobs + Control Plane;
- Control Plane derives a tenant-scoped auth root and tenant-scoped service token;
- the tenant receives only its own derived values plus a fresh `SESSION_SECRET`;
- Gateway derives the same tenant auth root before delegating to the existing trusted-identity and
  app-call machinery;
- Jobs derives the tenant service token before dispatching internal maintenance/event requests;
- a tenant with no `__security__:<tenant>` projection remains Security Generation 1 and follows the
  existing certified legacy path unchanged;
- V2 profile authority lives in Control D1 (`tenant_security_profiles`) and is projected to ROUTES
  KV only after the tenant credentials were installed successfully.

The Cloudflare API token is transported transiently from the production execution environment to the
Control Plane provider broker. It is never persisted in D1/KV/Worker secrets, emitted to logs or
returned to callers. The broker accepts only the account initialized by the owner-authorized V2
bootstrap and re-verifies the provider token against the canonical gateway.

### V2 bootstrap

`.github/workflows/security-v2-bootstrap.yml` is the only standard bootstrap/deploy lane. It must:

1. require repository-owner issue command + `environment: production`;
2. require an exact merged-main SHA and `confirm=security-v2`;
3. backup Control D1 before the append-only migration;
4. apply the Control security migration;
5. coordinate both copies of each V2 master only while zero V2 tenant profiles exist;
6. deploy Control Plane, Jobs and Gateway wrappers;
7. initialize the immutable Cloudflare account authority through the Control provider broker;
8. prove an existing Generation-1 tenant such as `alu.kairo.vn` still passes production health.

Once any V2 tenant exists, bootstrap must never rotate a V2 master automatically. Missing V2 master
bindings after that point are a fail-closed incident requiring an explicit security recovery plan.

## Synthetic seed contract

`server/scripts/seed-demo-data.mjs` is the shared seed runner. A seed manifest is ordered and
source-controlled. Each record declares:

- local seed `id`;
- target `doctype`;
- exact idempotency lookup key;
- document `data`.

`@ref:<seed-id>` resolves to the actual server-issued document name of an earlier record. Relative
`@date:N` / `@datetime:N`, `@today` and `@now` keep demos current without putting clock logic into
business schemas.

Rules:

- lookup is exact and fail-closed; more than one match is an invariant failure;
- a retry reuses the exact existing record instead of creating a duplicate;
- creates use `/api/resource/<DocType>` after normal browser-session login and CSRF acquisition;
- no seed script may write business rows with SQL, D1 CLI or direct table access;
- do not force workflow state/docstatus in seed data; let canonical creation establish the initial
  state and use the normal workflow API for any later transition;
- real customer data is migration/pilot input, not demo seed material.

## Demo definition of done

A run is `READY` only when:

- brief compiles and validates before provider mutation;
- matching seed manifest, when present, validates before provider mutation;
- provider account resolves unambiguously;
- tenant D1 exists exactly once;
- migrations and tenant Worker provisioning pass;
- V2 tenant-scoped auth/service/session bindings exist before route publication;
- Control D1 security profile and ROUTES projection agree on generation/key/worker;
- Control Plane route maps the full hostname to the intended tenant Worker and was published last;
- browser-path `/login` resolves on the customer hostname;
- App Factory install passes using the same session/CSRF path as the real client;
- client manifest/context verification passes;
- synthetic seed PASSes through canonical readback when configured;
- URL, source SHA, tenant slug, app/brief, security generation and administrator identity are recorded as evidence;
- no secret/password/provider token is written to Git, artifacts or job summary.

For a richer customer demo, add a deterministic seed profile and one Golden Flow; do not weaken this
infrastructure DoD or fake dashboard values outside canonical documents.

## Failure and retry

Fail closed. Route publication is the final provisioning mutation. Before a route is active, partial
D1/Worker/secret state remains unreachable and may be retried idempotently. Do not automatically
delete D1/Worker/profile after a partial failure because that destroys forensic evidence and can turn
a recoverable retry into an ambiguous state. Destructive cleanup is a separate explicitly authorized
operation.

If a V2 security profile already exists and all required tenant secret bindings are present, retry must
reuse them; it must not rotate the tenant session secret. If an active V2 tenant is missing a required
binding, fail instead of silently re-keying it.

## GitHub workflows

`.github/workflows/demo-provision.yml` is the manual operator entry point. It requires an exact
merged-main SHA and `confirm=demo`, runs in the `production` environment, validates/compiles before
mutation, then provisions through Security Generation V2 and reports the live URL.

When the connected automation surface cannot invoke `workflow_dispatch`, use the governed issue
command lane instead of weakening the manual workflow or adding a push-trigger bypass:

```text
/forge-demo-provision
{"customer_name":"Thúy","slug":"thuy","brief":"marketplace-demo","admin_user":"admin","plan":"pro","provision_standard":false,"target_sha":"<40-char merged main SHA>","confirm":"demo"}
```

`.github/workflows/demo-provision-issue-command.yml` may act on that command only when all of these
are true:

- it is a normal issue comment, not a pull-request comment;
- comment author is the repository owner and GitHub reports `author_association=OWNER`;
- the first line is exactly `/forge-demo-provision` and the following JSON passes the strict parser;
- `confirm` is exactly `demo`;
- `target_sha` is an exact 40-character commit SHA already merged into `main`;
- the job still runs under the `production` environment and uses the same Demo Factory orchestrator.

Security V2 bootstrap uses the analogous owner-only command:

```text
/forge-security-v2-bootstrap
{"target_sha":"<40-char merged main SHA>","confirm":"security-v2"}
```

Both issue-command workflows must comment the run result back to the source issue. Do not accept
free-form shell arguments, comments from collaborators, PR comments, mutable branch names as target
authority or secrets in the issue body.

Before dispatching any live run, record the user's explicit production authorization together with the
exact merged-main SHA and intended mutation in execution evidence; a dry-run PASS alone is not
authorization to mutate production provider state.

## Required runtime credentials

New-demo automation requires only:

- `CLOUDFLARE_API_TOKEN` with the narrow Workers Scripts + D1 permissions already required by
  provisioning;
- optional `CLOUDFLARE_ACCOUNT_ID` hint; otherwise auto-discover the unique account containing the gateway;
- `FORGE_DEMO_ADMIN_PASSWORD` or the existing production demo-admin password secret.

Security Generation V2 masters are generated and stored directly as Cloudflare Worker secrets by the
owner-authorized bootstrap. They are not GitHub secrets and are never printed. Legacy shared platform
secrets remain untouched for Generation-1 tenants.
