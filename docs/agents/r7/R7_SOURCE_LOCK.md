# R7-A Source Lock

R7-A reuses the canonical source lock at `server/source-lock.json`.

## Frappe baseline

- App: `frappe`
- Tag: `v16.19.0`
- Full commit: `ba18090b141740e75d52aa97bfc525ff2f831f6c`
- License: MIT
- Role: framework/kernel behavioral baseline.

## Forge branch baseline

- Base branch: `main`
- Seed commit: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`

The source-exact tooling already verifies the immutable upstream tree. R7 must not introduce another lock file with a competing Frappe version.

## Drift policy

Any change to the Frappe tag/SHA is an explicit baseline upgrade and requires a new source-exact acquisition, artifact diff, oracle refresh and R7 matrix review. Floating `develop`, `version-16` or `latest` references cannot satisfy R7 certification.
