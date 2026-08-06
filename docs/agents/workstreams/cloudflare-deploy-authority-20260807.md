# Cloudflare deploy authority — 2026-08-07

Cloudflare Workers Builds is the active ALU deploy path. The legacy GitHub Actions `ALU Build and Deploy` workflow is retired to prevent duplicate or competing production triggers.

- GitHub remains source/review authority.
- Cloudflare owns ALU build/deploy triggering.
- No GitHub push, issue-comment, or workflow-dispatch ALU deploy trigger remains after this change.
