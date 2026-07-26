# ERP Platform Alpha Runbook — v0.6.0

This runbook applies to the new metadata, P2P, Journal Entry and Stock Entry preview. It does not promote those features to commercial GA.

## 1. Clean validation

```bash
npm ci
npm run check:platform
npm run test:workers
npm --prefix apps/web run build
```

Stop if any command fails. The source archive intentionally excludes dependencies and build output.

## 2. Database migration

Apply migrations in order through `0005_erp_core.sql`.

- `0004_frappe_platform.sql` adds metadata, workflow, naming, collaboration, file, print, import and notification tables plus the immutable `__standard__` catalog.
- `0005_erp_core.sql` adds procurement progress, AP/GL/Trial Balance projections and ERP-core metadata.

Do not delete the `__standard__` tenant. It is a template catalog, not an executable customer tenant.

## 3. Tenant provisioning

After migrations, call as a System Manager through the authenticated Gateway:

```http
POST /api/v1/setup/provision-standard-metadata
Authorization: Bearer <system-manager-jwt>
```

The operation is idempotent through `INSERT OR IGNORE`. Verify the tenant has the expected metadata before exposing Meta Desk.

## 4. Optional file storage

The file routes require an R2 binding named `FILES` on the tenant Worker. Do not expose upload UI until:

- the binding is present;
- private attachment access is tested;
- object lifecycle/retention is configured;
- file size and content-type policy is accepted;
- malware-scanning policy is decided.

## 5. Preview smoke

Use synthetic data:

1. provision standard metadata;
2. create a custom submittable DocType with a child table;
3. exercise create/save/submit/cancel and naming;
4. render a safe print format;
5. preview and apply a small CSV import;
6. create balanced Journal Entry;
7. run PO → PR → PI → Supplier Payment;
8. run Material Receipt, Transfer and Issue;
9. verify AP, General Ledger and Trial Balance definitions;
10. verify tenant isolation and permissions for every route.

## 6. Preview stop-ship conditions

Do not onboard external production users to v0.6 preview modules when any of these is true:

- Workerd and web production build evidence is absent;
- metadata provisioning differs across tenants;
- generic permissions disclose hidden DocTypes/documents;
- procurement progress or payable can become negative;
- Journal Entry can post unbalanced lines;
- Stock Entry can overdraw stock outside configured policy;
- import can partially apply without an operator-visible result;
- share records are represented as enforced access grants;
- an unsupported Frappe behavior is marketed as compatible.

## 7. Rollback boundary

Migrations 0004 and 0005 are forward schema additions. A worker rollback must remain schema-compatible. Do not drop metadata/procurement tables to roll back application code. Export tenant data before migration and preserve the exact release hash, migration output and smoke evidence.
