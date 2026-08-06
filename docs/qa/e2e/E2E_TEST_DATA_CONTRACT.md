# E2E Test Data and Readiness Contract

Date: 2026-08-06  
Program: PILOT-UX-E2E

## 1. Purpose

Operator E2E must distinguish product failure from unavailable source data or configuration. Missing setup must never be silently treated as zero/default, and test setup must not bypass the business action being validated.

## 2. Readiness states

Every flow preflight returns exactly one:

- `READY` — declared prerequisites are present and internally valid.
- `BLOCKED_DATA` — required source/fixture data is absent.
- `INVALID_CONFIG` — configuration exists but violates the declared contract.
- `BLOCKED_ENVIRONMENT` — target/environment is unavailable or identity cannot be verified.

Preflight state is recorded in the evidence manifest.

## 3. Classification rule

`BLOCKED_DATA` is valid only when the missing value is outside the operator task under test. If the product is supposed to create, infer, guide or recover the prerequisite within the workflow, failure to do so is application `FAIL`.

Examples:

- Sales test expects an existing Company: missing Company may be `BLOCKED_DATA` for a transaction-flow fixture.
- Sales screen promises to auto-resolve selling currency but crashes because currency is missing: application/configuration failure according to the exact declaration, not a false PASS.
- Insufficient inventory when testing a successful fulfillment fixture: `BLOCKED_DATA` if the fixture contract requires stock.
- Insufficient inventory when testing the negative stock-rejection path: expected test condition, not a blocker.

## 4. Common fixture identity

Every test fixture set should declare stable non-secret aliases rather than relying on arbitrary production names:

- tenant alias;
- company alias;
- user/persona alias;
- customer alias;
- supplier alias;
- warehouse aliases;
- item/profile aliases;
- price list/policy aliases;
- BOM/routing/workstation aliases where applicable;
- opening/stock lot aliases;
- accounting/cash-bank aliases where applicable.

Secrets/passwords are never committed in specs or test source.

## 5. Core preflight families

### E2E-00 Login/context

- named enabled user;
- expected role/profile;
- company/context membership;
- tenant identity;
- expected primary navigation availability.

### E2E-01 Sales

At minimum, as required by the exact package/declaration:

- Company and currency;
- Sales User persona;
- Customer and Customer Group;
- selling Price List/pricing policy;
- warehouse;
- sellable item/product declaration;
- door/cutting policy inputs where required;
- BOM/material mapping where required;
- aluminium/profile stock lot with sufficient ATP for happy path;
- UOM/conversion required for pricing/stock.

### E2E-02 Procurement

- Purchase User persona;
- Company;
- Supplier;
- purchase item/profile;
- purchase UOM/conversion;
- buying price or valid direct-entry rule;
- target warehouse;
- any order/receipt linkage required by selected subflow.

### E2E-03 Inventory

- Stock User persona;
- source/target warehouses according to operation;
- item/profile;
- lot/batch/serial where required;
- sufficient source stock for happy path;
- UOM/conversion;
- stock/cutting policy required by Alumdoor operations.

### E2E-04 Manufacturing

- Manufacturing User persona;
- Company;
- demand/Sales Order where flow starts from demand;
- Item/BOM/version;
- warehouse/material stock;
- routing/workstation where required;
- UOM and material conversion;
- valid manufacturing policy/state.

### E2E-05 Finance/debt/cash

- Accounts User persona;
- Company and currency;
- customer/supplier counterparty;
- authoritative receivable/payable/open transaction state;
- cash/bank/account configuration;
- posting period/date allowed;
- payment mode/account mapping.

### E2E-06 Warranty/service

- Service persona;
- delivered/source document eligible for warranty/service;
- customer;
- warranty/service policy where applicable;
- assignment/status values.

### E2E-07 HR/payroll

- HR persona;
- Company/department;
- Employee;
- employment/contract status;
- shift/attendance/payroll period as required;
- salary structure/assignment and statutory configuration when payroll calculation is in scope.

### E2E-08 Report/history

- Manager persona;
- permission scope;
- known transaction created by an upstream flow in the same run where feasible.

### E2E-09 Correction/retry

- source transaction created by an earlier accepted flow;
- state eligible for the correction/cancel/return action;
- expected correction semantics;
- deterministic idempotency/retry identifier where applicable.

## 6. Fixture strategy by environment

### E0_LOCAL / E1_DISPOSABLE

Synthetic fixture generation is allowed. Fixtures must be deterministic and reproducible from source-controlled non-secret definitions.

### E2_PRODUCTION_LIKE

Use controlled fixtures seeded through supported import/setup contracts. Record fixture version/hash when material.

### E3_PILOT_OBSERVED

Read-only by default. Tests may validate readiness/navigation/read surfaces without creating business records.

### E4_PILOT_AUTHORIZED_WRITE

Use named pilot users and authorized business data only under explicit authorization. Never synthesize missing real opening values or mutate production merely to make a test pass.

## 7. Preflight output contract

Minimum structured output:

```json
{
  "flow": "E2E-01",
  "readiness": "READY",
  "environment": "E1_DISPOSABLE",
  "persona": "sales-user",
  "requirements": [
    {"id":"company","status":"PASS","ref":"TEST-COMPANY"},
    {"id":"customer","status":"PASS","ref":"TEST-CUSTOMER"},
    {"id":"atp","status":"PASS","detail":"sufficient for declared order fixture"}
  ],
  "blockers": []
}
```

No secret, password, session token or sensitive customer payload is stored in evidence.

## 8. No developer-intervention rule

Once a flow begins after `READY`, a developer may not manually fix DB rows/configuration midway and still call the run `PASS`. Any such intervention invalidates the run; fix the fixture/configuration authority and rerun from a known state.
