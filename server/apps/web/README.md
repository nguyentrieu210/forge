# CloudForge O2C — Phase 1 web app

A small, bespoke React app that proves the Order-to-Cash slice end-to-end against the
**live CloudForge backend**. It is intentionally NOT metadata-driven and does not use
the MetaForge shell or FrappeAdapter. UI primitives are vendored from `@metaforge/ui`
(shadcn/Radix) into `src/ui`; the API client (`src/lib/cloudforge.ts`) is self-contained.

## Run locally

```bash
# from apps/web
npm install        # or run `npm install` at the repo root (workspaces)
npm run dev        # http://localhost:5173
```

## Auth flow (Phase 1)

There is **no login / token-minting** in the app (that stays external). On first load the
app asks for a **bearer JWT** (HS256, tenant `demo`) and stores it in `localStorage`.
Mint one out-of-band with the gateway's `JWT_SECRET` / `JWT_ISSUER` / `JWT_AUDIENCE`, e.g.
a Sales-Manager token, then paste it into the token gate.

## Connectivity (no CORS in dev)

The browser calls **same-origin `/api/*`**; the Vite dev proxy (`vite.config.ts`) forwards:

- `/api/v1/reports/*` → the query-worker (`cloudforge-query-demo…workers.dev`)
- `/api/*`            → the gateway (`cloudforge-gateway…workers.dev`)

So there is no CORS/preflight in development. For a real deployment set
`VITE_GATEWAY_URL` / `VITE_REPORT_URL` to the live origins (which then need CORS or a
same-origin/BFF deployment) and `VITE_TENANT_ID` for the tenant.

## What it does

- **whoami** — shows the gateway-verified identity (`actor_id`, roles).
- **Sales Order** — create / save / submit / cancel / reload; threads `expected_version`;
  a client-owned `command_id` is kept across retries so a lost response replays
  idempotently; 409 shows a conflict banner (reload, no silent overwrite), 422 shows the
  business error and keeps your input.
- **Reports** — runs a prepared (`limit>1000`) Accounts Receivable / Stock Balance report,
  polls the job to `completed`/`failed`, and renders rows or a safe `{code, message}` error.

## Not in Phase 1

No metadata/getMeta, generic list/form/workflow engine, FrappeAdapter, MetaForge shell,
print/PDF, import, file attachments, realtime, or the other three O2C doctypes (Phase 2).
