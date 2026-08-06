# E2E Flow Matrix

Date: 2026-08-06  
Program: PILOT-UX-E2E

## 1. Rule

The denominator is the number of operator jobs, not routes/screens/components. Each row must end as `UNKNOWN`, `BLOCKED`, `FAIL`, `PARTIAL` or `PASS` based on exact browser evidence.

## 2. Canonical matrix

| ID | Persona | Business job | Entry surface | Required exit condition | Initial status | Core? |
|---|---|---|---|---|---|---|
| E2E-00 | Named employee/operator | Login and obtain valid operating context | Login | Correct workspace, company/context and allowed navigation usable | UNKNOWN | Yes |
| E2E-01 | Sales User | Create and confirm a customer order using door dimensions/pricing/ATP | Bán hàng | Authoritative Sales Order + correct derived values + stock/reservation status + history | UNKNOWN | Yes |
| E2E-02 | Purchase User | Create purchase order and receive supplier goods | Mua hàng | Purchase document/receipt authoritative, stock/readback/history correct | UNKNOWN | Yes |
| E2E-03 | Stock User | Execute stock receipt/issue/transfer/cutting operation | Kho | Stock state/ledger reflects operation once and accurately | UNKNOWN | Yes |
| E2E-04 | Manufacturing User | Create/execute manufacturing requirement from demand | Sản xuất | Work/manufacturing state and material/FG readback correct | UNKNOWN | Yes |
| E2E-05 | Accounts User | Inspect debt and record collection/payment | Công nợ / Finance | AR/AP/cash-bank/payment state and readback reconcile | UNKNOWN | Yes |
| E2E-06 | Service User | Receive and progress a warranty/service case | Bảo hành | Case linked to source document and lifecycle state/history correct | UNKNOWN | No |
| E2E-07 | HR User | Progress employee/time/payroll operator flow | Nhân sự & tiền lương | Employee/time/payroll result created/read back with correct permission | UNKNOWN | No |
| E2E-08 | Manager | Read operational reports and transaction history | Báo cáo / Lịch sử | Newly created transaction is visible and drillable under correct scope | UNKNOWN | Yes-supporting |
| E2E-09 | Relevant operator | Correct/cancel/retry a prior transaction safely | Existing transaction | Supported correction/retry completes with no duplicate authority | UNKNOWN | Yes-supporting |

## 3. Core task completion denominator

Core usability denominator initially consists of:

- E2E-00
- E2E-01
- E2E-02
- E2E-03
- E2E-04
- E2E-05
- E2E-08
- E2E-09

Warranty and HR/payroll remain mandatory before broad operational acceptance but do not hide whether the commercial/stock/manufacturing/finance spine works.

## 4. Status promotion rules

- `UNKNOWN -> BLOCKED`: only with an exact prerequisite and evidence that execution cannot start.
- `UNKNOWN/BLOCKED -> FAIL`: browser execution proves product failure.
- `UNKNOWN/BLOCKED/FAIL -> PARTIAL`: a meaningful subset passes but exit condition remains unproven.
- `* -> PASS`: only exact candidate/environment browser evidence satisfies the per-flow spec and evidence contract.
- `PASS -> UNKNOWN/STALE` is represented by resetting to `UNKNOWN` when a material change invalidates evidence. Historical evidence remains historical and is linked in the evidence record.

## 5. Required coverage dimensions per flow

Each flow spec must state whether these are required:

- desktop;
- mobile/device;
- happy path;
- expected negative path;
- permission denial;
- retry/idempotency;
- correction/cancel/return;
- report/history readback;
- cross-module downstream readback;
- production-like or pilot-target evidence.

## 6. Initial execution priority

1. E2E-00 Login/context.
2. E2E-01 Sales.
3. E2E-02 Procurement.
4. E2E-03 Inventory.
5. E2E-04 Manufacturing.
6. E2E-05 Finance/debt/cash.
7. E2E-09 Correction/retry.
8. E2E-08 Report/history.
9. E2E-06 Warranty.
10. E2E-07 HR/payroll.

This order follows operator-critical dependency flow rather than visual/module polish priority.

## 7. Current baseline

Until exact browser runs are produced under this program, all rows remain `UNKNOWN`. Existing source, API, backend Golden Flow and prior ad-hoc browser scripts may be referenced as supporting evidence but do not automatically promote a row to `PASS`.
