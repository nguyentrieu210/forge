# D1 Physical Schema Contract

## Core tables

- `documents`: stable identity, doctype, name, owner, docstatus, version, timestamps, title/search columns, JSON payload.
- `document_children`: parent key, fieldname, child doctype, row ID, idx, payload.
- `links`: normalized outbound links for permission/link traversal.
- `shares`, `user_permissions`, `role_permissions`, `field_permissions`.
- `versions`, `comments`, `communications`, `files` metadata.
- `outbox`, `mutation_guard`, `mutation_receipt`.
- Dedicated typed ledger tables: `gl_entries`, `stock_ledger_entries`, `payment_ledger_entries`.

## Dynamic field strategy

- Canonical dynamic fields remain JSON.
- Query compiler maintains field usage telemetry.
- Hot/filter/sort/group fields may be promoted to generated/materialized column or side index table.
- Promotion is schema-versioned and backfilled by Workflow.
- Correctness must not depend on promoted index; index can be rebuilt.

## D1 limits reflected in design

- Keep row under 2 MB; attachments always R2.
- No more than 100 columns per table; do not create one physical column per DocField.
- Bound parameters max 100 → batch/chunk large filters/imports.
- Query max 30 seconds → prepared report/Container for heavy jobs.
