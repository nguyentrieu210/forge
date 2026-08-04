# Pilot-01 Source Batch Handoff Checklist

Use this checklist when the approved Alumdoor source extracts become available.

## Required secure inputs

- one immutable source batch directory outside Git;
- `manifest.json` copied from `PILOT_01_BATCH_MANIFEST_TEMPLATE.json` and fully resolved;
- canonical JSON-array files for every required dataset;
- exact SHA-256 for each file after normalization;
- source-system owner/extractor identity;
- RFC3339 UTC `cutoff_at` and `extract_at`;
- source-authoritative opening totals;
- named pilot accounts including exactly one active `Giám đốc` account.

## Required datasets

- `customers.json`
- `contacts.json`
- `suppliers.json`
- `items.json`
- `boms.json`
- `work_centers.json`
- `warehouses.json`
- `opening_stock.json`
- `opening_ar.json`
- `opening_ap.json`
- `employees.json`
- `pilot_users.json`

When the source has zero rows, use `[]` and record the exact file hash. Do not omit the dataset.

`opening_cash_bank.json` is added only when `manifest.scope.opening_cash_bank=true`.

## Preview command

```bash
node docs/pilot/alumdoor/tools/validate-pilot-batch.mjs \
  --batch-dir /approved/secure/alu-pilot-batch \
  --output /approved/evidence/alu-pilot-01-preview.json
```

## Acceptance

Only `PREVIEW_PASS` with zero errors and zero unexplained reconciliation variance can be proposed as `PILOT-01-READY`.

`PREVIEW_PASS` remains read-only evidence. It is not production import authorization.
