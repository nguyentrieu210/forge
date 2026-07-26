# Frappe Core Beta Runbook — v0.7.0

## 1. Clean validation

Run on Linux/WSL2 with Node 22+:

```bash
npm ci
npm run check:frappe-core
npm run test:workers
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

Stop on any failure. Workerd must execute `platform.integration.test.mts`, including metadata envelope, partial CSV import, export and historical-version checks.

## 2. Database migration

Apply tenant migrations in order through `0006_frappe_core_beta.sql`.

Migration 0006 creates `user_permissions` and indexes document shares and versions. It is forward-compatible with worker rollback; do not drop the table during rollback. Back up a production-shaped tenant and rehearse migration before staging.

## 3. Tenant setup

1. provision standard metadata as System Manager;
2. verify metadata counts and hashes;
3. configure roles and User Permission records;
4. bind an R2 bucket as `FILES` only when attachment policy is approved;
5. configure private-object lifecycle and retention;
6. do not enable public attachment URLs.

## 4. Permission smoke matrix

Use at least these actors:

- System Manager;
- manager with full DocType rights;
- owner-only user;
- non-owner user with no share;
- user with read share;
- user with write share;
- user restricted by Company/Warehouse Link User Permission;
- user without a protected field permlevel.

Verify list/count, direct GET, save, workflow, timeline, print, export and files all produce the same document scope. A hidden document should return 404 on document-addressed read paths; denied DocType operations should fail before data access.

## 5. Import/export smoke

- preview malformed and valid CSV;
- apply one valid plus one invalid row and verify `207`, explicit counts and the committed row;
- verify formula-prefixed values export safely;
- verify owner/share/user-permission restrictions are preserved in export;
- keep imports below the documented synchronous limits.

## 6. R2 attachment smoke

- upload a private benign file to an authorized document;
- reject HTML, SVG, JavaScript and executable extensions/content types;
- deny download after document access is revoked;
- permit delete only to file owner or manager;
- verify DB/object consistency under failed upload/delete simulation;
- complete malware-scanning and retention decisions before external use.

## 7. Stop-ship conditions

Do not expose v0.7 beta features externally if:

- clean Workerd or Vite evidence is absent;
- any list/export/file route bypasses document scope;
- protected fields can be written by permlevel-zero actors;
- partial import commits are not reflected in the response;
- R2 lifecycle, backup or incident response is undefined;
- migration, rollback, restore or tenant-isolation drills fail;
- unsupported Frappe/ERPNext behavior is marketed as compatible.
