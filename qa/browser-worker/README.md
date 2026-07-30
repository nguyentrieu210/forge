# CloudForge Preview QA

This Worker runs browser checks inside Cloudflare Browser Run. GitHub Actions deploys a gateway preview version, calls this Worker with an ephemeral bearer token, and stores desktop/mobile screenshots plus a JSON report as a workflow artifact.

The endpoint is intentionally minimal:

- `GET /health` — deployment health check.
- `POST /run` — authenticated preview QA request with `{ "url": "https://...", "paths": ["/"] }`.

`QA_TOKEN` is generated and rotated by the GitHub workflow. Do not commit it.
