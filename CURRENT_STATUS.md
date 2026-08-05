# CURRENT STATUS

Ngày cập nhật: **2026-08-05**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set: **OBSERVED / HASHED / INGESTED**.
- Duplicate identity policy: **LOCKED**.
- Journal identities: **60/60 DISPOSITIONED**.
- Supplier roles: **4 -> 0 gaps**.
- UOM/quantity: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding: **LOCKED / per-row integer VND**.
- Future stock-date anomalies: **2 VIPST700 rows QUARANTINED**.
- Cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Exact certified/deployed product SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- R6 final evidence remains **23/23 PASS**; deployed runtime identity is unchanged by Pilot documentation/tooling commits.

## 2. Capability truth

Canonical distribution remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** until a newer convergence record explicitly changes it.

## 3. Pilot-01 source truth

Observed real source coverage includes 277 unique item codes, 258 customer rows / 256 exact names, 8 typed NCC, 730 typed journal rows, current purchase/order history, and aluminum physical-stock evidence. Raw workbooks remain outside Git.

Identity work is deterministic and fail-closed: duplicate Customer references are remapped to the retained canonical row; exact duplicate Item codes would receive the lowest free `01`, `02`, `03`... suffix; the original 60 unmatched journal strings are fully dispositioned; supplier role gaps are closed without fuzzy matching.

## 4. UOM / quantity truth

Authority: `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`.

- 21 identities reviewed;
- 10 stock/opening UOM semantics source-backed;
- 9 service/legacy-derived commercial identities classified;
- 2 stock-UOM identities remain blocked: `NVL-AL595-GS`, `NVL-BO1VIS AL71`.

`NVL-TON-DL7.2Dx124-XNXLC` is context-split: raw stock/opening/purchase remains the source identity in Kg; sales maps commercially to `TP-TOLEKEM124_6D` in m2. A missing context fails closed.

## 5. VND rounding truth

Authority: `docs/pilot/alumdoor/PILOT_01_MONEY_ROUNDING_V1.json`.

The source `Tổng thanh toán` cells display integer VND using `#,##0 ₫`, while **45 underlying values are fractional**. Pilot normalization therefore rounds **each row/document** to nearest integer VND, exact half away from zero, before integer-minor-unit storage, while preserving raw source value and declared rounding delta.

For the 45 fractional rows:

- raw sum: `469262369.969` VND;
- per-row rounded sum: `469262376` VND;
- declared rounding delta: `+6.031` VND.

This rounding is now explained reconciliation policy, not unexplained variance.

## 6. Stock anomaly truth

Authority: `docs/pilot/alumdoor/PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`.

Two `VIPST700` rows are dated `23/12/2026`, later than the 05/08/2026 source ingest:

- row 46: 6.8m / 101 lá;
- row 47: 3.77m / 56 lá.

No matching VIPST700 history entry proves a corrected date. Both rows are therefore **quarantined and excluded from opening**; their raw source dates are not rewritten.

Physical source-status metrics after the explained quarantine are **1,150 rows / 40,980 pieces-leaves** versus 1,152 / 41,137 before quarantine. These are physical metrics only, not canonical Kg/value opening balances.

Stock source scope remains incomplete: process specification expects 23 aluminum + 2 mesh sheets; the current upload exposes 18 inventory sheets and no separate mesh opening source.

## 7. Cutoff truth

`30/06/2026` remains unproven as a common Stock/AR/AP/cash-bank cutoff:

- cash has partial support;
- AR carry-in is proven but the AR opening column has 0 populated customer rows;
- AP opening column has 0 populated supplier rows;
- canonical Stock Kg/value and complete source scope are not proven.

Missing opening values are never assumed zero.

## 8. Remaining Pilot-01 blockers

1. authoritative full-customer AR opening snapshot at one named cutoff;
2. authoritative full-supplier AP opening snapshot at the same cutoff;
3. canonical Stock quantity + value at that cutoff with complete scope/aluminum Kg evidence;
4. matching cash/bank balances if in scope;
5. source-owner resolution for the two blocked UOM identities and two row-level quantity conflicts;
6. source-owner correction for the two quarantined VIPST700 dates and missing stock scope;
7. minimum BOM/work-center/employee/pilot-user data and exactly one active named `Giám đốc` account.

Pilot-01 remains PREVIEW-BLOCKED. **No real Pilot-01 production import/write has occurred.**

## 9. Standing boundaries

- `PREVIEW_PASS` is not production-write authorization.
- Real customer/master/opening-data write/import, cutover, provider/DNS/secret mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- No shadow Finance/Stock ledgers, no guessed opening balances, no guessed UOM conversions, and no silent source-date rewrites.

## 10. Documentation authority

Start with `docs/pilot/alumdoor/README.md`, `NEXT_TASKS.md`, `PILOT_01_STATUS.json`, `PILOT_01_UOM_RECONCILIATION_V1.json`, `PILOT_01_MONEY_ROUNDING_V1.json`, `PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`, and `PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.
