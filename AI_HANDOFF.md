# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Pilot-01 real source set **OBSERVED / HASHED / INGESTED**.
- journal identities **60/60 DISPOSITIONED**; supplier gaps **4 -> 0**.
- UOM/quantity **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding **LOCKED** for 45 fractional `Tổng thanh toán` rows.
- two future-dated `VIPST700` rows **QUARANTINED**, not rewritten.
- cutoff `30/06/2026` **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Exact frozen product baseline `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956**.

## Latest locked decisions

### Money

`PILOT_01_MONEY_ROUNDING_V1.json` locks source-backed integer VND semantics:

- source display format: `#,##0 ₫`;
- 45 underlying `Tổng thanh toán` rows are fractional;
- normalize each row/document before integer storage using nearest VND, exact half away from zero;
- preserve raw source amount + explicit rounding delta;
- raw fractional-row sum `469262369.969`, per-row rounded sum `469262376`, declared delta `+6.031`.

### Stock future dates

`PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json` quarantines two `VIPST700` source rows dated `23/12/2026`:

- row 46: 6.8m / 101 lá;
- row 47: 3.77m / 56 lá.

No `VIPST700` history row proves a replacement date, so the date is not guessed or rewritten. Both rows stay outside opening until corrected by the source owner.

Physical opening-eligible source-status metrics after quarantine: **1,150 rows / 40,980 pieces-leaves**. These are not canonical Kg/value.

Stock source scope remains incomplete (process expects 23 aluminum + 2 mesh; upload exposes 18 inventory sheets and no separate mesh opening source).

## Existing UOM truth

- `NVL-TON-DL7.2Dx124-XNXLC` requires context split: raw Stock Kg vs commercial Sales m2.
- blocked UOM identities remain `NVL-AL595-GS` and `NVL-BO1VIS AL71`.
- no rate-like `KG/M` or `KG/M2` label may silently become stock quantity.

## Remaining blockers

1. authoritative full-customer AR opening snapshot at one named cutoff;
2. authoritative full-supplier AP opening snapshot at the same cutoff;
3. canonical Stock quantity + value at the same cutoff with complete scope and aluminum Kg/value;
4. matching cash/bank balances if in scope;
5. source-owner resolution for two blocked UOM identities and two row-level quantity conflicts;
6. source-owner corrected dates for quarantined VIPST700 rows plus missing stock scope;
7. minimum BOM/work-center/employee/pilot-user data and exactly one active named `Giám đốc` account.

## Next execution order

- finish rounding/anomaly branch through CI/merge;
- search existing uploaded files/File Library for additional authoritative opening/access data before declaring an external dependency;
- materialize deterministic minimum operating/access masters only where source evidence exists;
- never synthesize missing AR/AP/Stock openings or UOM conversions;
- after one common cutoff is proven, generate private Mapping-V1 batch and drive validator to zero-variance `PREVIEW_PASS`.

## Production boundary

No Pilot-01 production import/write has occurred. `PREVIEW_PASS` does not authorize production write. Production import, cutover, provider/DNS/secret mutation, restore/PITR and destructive state operations remain explicit authorization boundaries.
