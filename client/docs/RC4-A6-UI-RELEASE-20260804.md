# RC4-A6 UI production release marker

Date: 2026-08-04

Purpose: trigger the canonical UI-only production release lane after RC4-A6 browser/mobile/PWA evidence merged into `main`.

Exact A6 merge already present before this marker:
- `main@834da8cf8fbf496f6c58cb0d8ba2119c40a6b66c`
- current V2 browser matrix PASS: 50 passed / 6 intentionally skipped
- runtime/login/PWA matrix PASS: 19 passed / 11 intentionally skipped
- browser evidence artifact `8878084897`

This marker changes no runtime, backend, schema, migration, permission, tenant, session, OCC, storage, ledger, or business-rule behavior.
