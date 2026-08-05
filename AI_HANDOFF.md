# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set **OBSERVED / HASHED / INGESTED**.
- duplicate identity policy **LOCKED**.
- journal item identities **60/60 DISPOSITIONED**.
- supplier role gaps **4 -> 0**.
- UOM/quantity review **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- evaluated cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Exact frozen product baseline `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** until a newer convergence record changes it.

## Identity + UOM truth

Identity work is closed for the original 60 unmatched journal strings. UOM semantics are now materially narrowed:

- 10 source identities have accepted opening/stock UOM semantics;
- 9 are accepted as non-stock service or legacy derived commercial transaction lines;
- 2 stock identities remain blocked: `NVL-AL595-GS` and `NVL-BO1VIS AL71`.

Critical correction: `NVL-TON-DL7.2Dx124-XNXLC` is an overloaded legacy code, not a safe global alias.

- stock/opening/purchase -> raw source identity, `Kg`; source snapshot `552 Kg`, 27/03/2026;
- sales -> `TP-TOLEKEM124_6D`, `m2`;
- missing context -> fail closed.

Deterministic helpers are in `docs/pilot/alumdoor/tools/reconcile-pilot-uom.mjs` and never write production.

Other locked examples:

- ray `NVL-TOLE1.2x190-CORON` -> `TP-RS7P (CÓ RON)` / Mét / length × pieces; row 327 remains blocked because structured fields are absent;
- trục `NVL-TRUC114_2.4LY` -> `TP-TRUC140` / Mét;
- `CROMATE 3+`, `TẨY NHÔM` -> Kg;
- `MŨI MÀI HỘP KIM` -> Cái;
- `NVL-VIS-BANLO2P` -> Con from inventory source; no auto conversion from the historical `1 KG` sales description;
- CPVC/phụ thu/labor -> services, stock_uom null;
- legacy derived sales lines -> commercial m2 only, not opening Stock.

Blocked UOM evidence:

- `NVL-AL595-GS`: source inventory `504 KG/M` and sales m2 use; `KG/M` is rate-like, so no stock quantity conversion is inferred.
- `NVL-BO1VIS AL71`: source purchase `159 KG` versus canonical family Stock `Con`; no Kg-to-Con evidence.

## Cutoff review

Authority: `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

30/06 cannot be frozen from current uploads:

- cash has partial support through 30/06;
- AR carry-in is proven, but AR opening column has 0 populated rows;
- AP opening column has 0 populated rows and no source-proven historical zero state;
- physical Stock history exists, but actual Kg/value and complete stock scope are not proven.

Missing AR/AP opening values must never be interpreted as zero.

## Remaining blockers

1. source-authoritative full-customer AR opening snapshot at one named cutoff;
2. source-authoritative full-supplier AP opening snapshot at the same cutoff;
3. canonical Stock quantity + value at the same cutoff and complete stock scope;
4. matching cash/bank balances if in scope;
5. source-owner evidence for the two blocked UOM identities plus two row-level quantity conflicts;
6. stock scope/future-date disposition;
7. deterministic integer-VND rounding for 45 fractional rows;
8. minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

## Next execution order

- finish this UOM branch through CI/merge;
- next safe independent pass: VND rounding + stock date anomaly disposition where source behavior is deterministic;
- continue searching existing uploads for authoritative opening data;
- missing AR/AP/Stock opening authority and unresolved physical conversions remain external source dependencies, never synthesized;
- after one common cutoff is proven, generate private Mapping-V1 batch and run validator to zero-variance `PREVIEW_PASS`.

## Production boundary

No Pilot-01 production import/write has occurred. `PREVIEW_PASS` does not authorize production write. Production import, cutover, provider mutation, DNS/routes/secrets, restore/PITR and destructive state operations remain explicit authorization boundaries.

## Read order

1. exact GitHub state;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `docs/pilot/alumdoor/README.md`;
5. `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
6. `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`;
7. `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`;
8. `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
9. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`.
