# ALU UI deploy retrigger — 2026-08-05

Purpose: create a client-only GitHub-native merge event so the existing `ALU Build and Deploy` workflow can exercise its `push -> main -> client/**` production UI deployment path.

No runtime behavior, backend contract, schema, migration, permission, ledger, tax authority, tenant data, or package metadata is changed by this file.

Target UI already merged on main includes the MetaForge procurement operating workspace from PR #677.
