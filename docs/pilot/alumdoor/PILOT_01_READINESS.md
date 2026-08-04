# Alumdoor Pilot-01 — Master + Opening Data Readiness

Status: **PILOT-01-WAITING-SOURCE-BATCH**  
Certified product baseline: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` / `https://alu.kairo.vn`  
Production write authorization: **NO**

## 1. What is complete

Pilot-01 now has a deterministic preview-only intake gate bound to the frozen Pilot-00 identity.

Durable controls:

- mapping authority: `PILOT_DATA_MAPPING_V1.json`;
- immutable manifest template: `PILOT_01_BATCH_MANIFEST_TEMPLATE.json`;
- validator: `tools/validate-pilot-batch.mjs`;
- fail-closed tests: `tools/validate-pilot-batch.test.mjs`;
- identity/contract verifier: `tools/verify-pilot-01-contract.mjs`;
- CI: `.github/workflows/pilot-01-data-readiness.yml`;
- machine state: `PILOT_01_STATUS.json`.

No runtime deploy/migration/import/write is implemented by this Pilot-01 control plane.

## 2. Source-data truth

At this execution checkpoint there is no approved immutable Alumdoor customer/master/opening source batch available in the repository or an approved secure batch path consumed by the validator.

That is not converted into synthetic data or a fake PASS.

Application fixtures, demo records, R6 Golden Flow data and package metadata are **not** accepted as opening/customer migration evidence.

Real source files should not be committed to Git. They should be exported to an approved secure directory, normalized to the frozen mapping and referenced by SHA-256 in `manifest.json`.

## 3. Required batch coverage

Every real Pilot-01 batch must contain one JSON-array file for each dataset below, even when the approved source has zero rows:

1. `customers`
2. `contacts`
3. `suppliers`
4. `items`
5. `boms`
6. `work_centers`
7. `warehouses`
8. `opening_stock`
9. `opening_ar`
10. `opening_ap`
11. `employees`
12. `pilot_users`

`opening_cash_bank` is optional only when `manifest.scope.opening_cash_bank=false`. If included, the scope flag must be `true` and exact opening totals must reconcile.

## 4. Manifest contract

`manifest.json` binds one immutable batch to:

- `pilot_batch_id`;
- tenant `alu`;
- exact certified release SHA;
- source system;
- RFC3339 UTC cutoff timestamp;
- extraction timestamp at/after cutoff;
- `Asia/Ho_Chi_Minh` local display timezone;
- mapping version `1`;
- extractor identity;
- dataset scope;
- source file name, SHA-256, row count and source-authoritative totals.

Re-extraction creates a new batch. Do not silently replace files under an existing batch ID.

## 5. Fail-closed validation

The preview validator rejects at least:

- missing required dataset files;
- path traversal or missing files;
- SHA-256 mismatch/tampering;
- invalid JSON or non-array data;
- row-count mismatch;
- missing required fields;
- duplicate source keys;
- duplicate item codes or pilot accounts;
- pilot persona outside the frozen Pilot-00 set;
- empty/invalid role assignment;
- non-integer monetary minor-unit values;
- negative/invalid opening stock quantity or valuation rate;
- unknown Customer/Supplier/Item/Warehouse/Employee references;
- opening source totals that differ from mapped totals;
- missing or multiple active named `Giám đốc` cutover-approver accounts.

Any failed invariant yields `PREVIEW_FAIL`. There is no auto-fix and no hidden default remap.

## 6. Reconciliation contract

Opening datasets use exact source-authoritative totals:

- Stock: `stock_qty_total`, `stock_value_total`;
- AR: `total_amount_vnd`;
- AP: `total_amount_vnd`;
- Cash/bank when in scope: `total_balance_vnd`.

Default tolerance is **zero unexplained variance**.

A non-zero difference must be resolved at source/mapping level or explicitly dispositioned outside the immutable batch, followed by a new extraction/batch and a fresh preview. Pilot-01 does not hide discrepancies through balancing entries.

## 7. Named-account gate

The real batch must contain named pilot accounts only. Before Pilot-02 progresses:

- every account has one frozen Pilot-00 persona;
- role assignment is explicit;
- disabled accounts are marked inactive;
- exactly one active named account carries persona `Giám đốc` as accountable cutover approver.

This is a readiness identity, not cutover approval itself. Actual cutover acceptance remains Pilot-04.

## 8. How to run the real preview

From repository root:

```bash
node docs/pilot/alumdoor/tools/validate-pilot-batch.mjs \
  --batch-dir /approved/secure/alu-pilot-batch \
  --output /approved/evidence/alu-pilot-01-preview.json
```

A successful process returns `PREVIEW_PASS` and exit code `0`.

The preview output explicitly keeps:

```json
{
  "production_write_authorized": false,
  "production_data_mutated": false
}
```

## 9. Pilot-01 READY definition

Pilot-01 becomes `PILOT-01-READY` only when a **real approved batch** produces `PREVIEW_PASS` with all of the following true:

- exact file hashes match;
- all required datasets are present;
- all required fields are valid;
- source identities are unique/unambiguous;
- all references resolve;
- exactly one active named `Giám đốc` account exists;
- all opening totals reconcile at zero unexplained variance;
- any data-quality exception has an explicit source-owner disposition;
- no real production write was required to obtain readiness evidence.

Until then the truthful status is:

`PILOT-01-WAITING-SOURCE-BATCH`

## 10. Production boundary

A `PREVIEW_PASS` is **not** authorization to import or write customer/master/opening data to `alu` production.

The next live mutation must be separately authorized and should use the exact accepted Pilot-01 batch plus a fresh verified backup and deterministic import/reconciliation procedure.
