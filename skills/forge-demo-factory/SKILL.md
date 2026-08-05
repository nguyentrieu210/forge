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
5. Shared DNS/Worker routes are production provider state. They are bootstrapped separately under
   Cloudflare governance and explicit production authorization. Per-demo provisioning must not
   silently repair or replace shared DNS.
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
 -> create/reuse isolated D1
 -> canonical tenant provision
 -> route registration through Control Plane
 -> create demo administrator
 -> wait for tenant origin
 -> install app through forge-app browser credential path
 -> verify client manifest/context
 -> seed synthetic documents through Frappe API / Document Kernel
 -> run one Golden Flow when the app has a domain scenario runner
 -> return LIVE https://<slug>.kairo.vn
```

Use `server/scripts/create-demo-tenant.mjs` as the orchestrator. It composes existing authorities;
it must not duplicate migration, route governance, App Factory installation or document-write logic.
If `server/demo-seeds/<brief-id>.json` exists, the orchestrator automatically requires that seed to
PASS before it prints `LIVE`.

## Inputs

Minimum:

- customer name;
- optional explicit slug;
- existing source-controlled app brief/package;
- administrator identity;
- tenant plan.

Derive a Vietnamese customer name deterministically to an ASCII slug when the user does not name
one. Collision/resource ownership must fail closed or reuse only an exact same tenant resource;
never overwrite another tenant merely because the requested slug is similar.

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
- tenant D1 exists exactly once;
- migrations and tenant Worker provisioning pass;
- Control Plane route maps the full hostname to the intended tenant Worker;
- browser-path `/login` resolves on the customer hostname;
- App Factory install passes using the same session/CSRF path as the real client;
- client manifest/context verification passes;
- synthetic seed PASSes through canonical readback when configured;
- URL, source SHA, tenant slug, app/brief and administrator identity are recorded as evidence;
- no secret/password is written to Git, artifacts or job summary.

For a richer customer demo, add a deterministic seed profile and one Golden Flow; do not weaken this
infrastructure DoD or fake dashboard values outside canonical documents.

## Failure and retry

Fail closed. Do not automatically delete D1/Worker/route after a partial failure because that destroys
forensic evidence and can turn a recoverable retry into an ambiguous state. Keep the resource,
record the failed stage, fix the cause and rerun idempotently. Destructive cleanup is a separate
explicitly authorized operation.

## GitHub workflow

`.github/workflows/demo-provision.yml` is the operator entry point. It requires an exact merged-main
SHA and `confirm=demo`, runs in the `production` environment, validates/compiles before mutation,
then provisions and reports the live URL. Secrets stay in GitHub Actions/Cloudflare runtime state.

## Required runtime credentials

- `CLOUDFLARE_API_TOKEN` with the narrow provider permissions needed by tenant provisioning;
- `CLOUDFLARE_ACCOUNT_ID` as a non-secret repository variable or secret;
- `FORGE_INTERNAL_AUTH_SECRET`;
- `FORGE_INTERNAL_SERVICE_TOKEN`;
- `FORGE_CONTROL_TOKEN`;
- `FORGE_DEMO_ADMIN_PASSWORD` or the existing production demo-admin password secret.

Do not rotate shared platform secrets just to create a demo tenant.
