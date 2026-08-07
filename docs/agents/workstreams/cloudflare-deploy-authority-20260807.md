# ALU deploy authority — 2026-08-07

GitHub Actions `ALU Build and Deploy` is restored as the canonical ALU production deploy workflow.

- GitHub remains source/review authority and owns the guarded ALU production deploy workflow at `.github/workflows/alu-build-deploy.yml`.
- Merged `client/**` changes may use the workflow's guarded UI-only main-push lane.
- Full production release remains explicit `workflow_dispatch`, requires `scope=full`, `confirm=alu`, an exact SHA already merged into `main`, frozen-install/source guards, tenant backup verification, migration, Worker deploy and post-release convergence evidence.
- Security V2 production bootstrap remains owner-only through the canonical workflow's guarded issue command.
- `server/scripts/cloudflare-alu-full-release.sh` remains repository tooling for Cloudflare Workers Builds, but it is not the canonical automatic ALU deploy authority while this GitHub workflow is active. Do not configure both systems to auto-deploy the same `main` change.
- Production DNS/routes/secrets and customer business data remain separate explicit mutation boundaries.

This restores the release topology expected by `server/scripts/verify-release-safety.mjs` and removes the temporary Cloudflare-only authority declaration.
