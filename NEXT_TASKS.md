# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Final R6 evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json` — **23/23 PASS**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set: **OBSERVED / HASHED / INGESTED**.
- Duplicate identity policy: **LOCKED**.
- Journal item identities: **60/60 DISPOSITIONED**.
- Supplier purchase-party roles: **4 -> 0 gaps**.
- UOM/quantity: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding: **LOCKED / 45 fractional rows normalized per-row to integer VND**.
- Future stock dates: **2 VIPST700 rows QUARANTINED / source dates not rewritten**.
- Cutoff candidate `30/06/2026`: **EVALUATED / NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**.
- Active phase: **source-authoritative opening evidence + residual source-owner/access blockers**.
- Next milestone: **one proven common cutoff -> private normalized batch `PREVIEW_PASS` -> Pilot-01 READY -> Pilot-02**.

## 1. Pilot-01 work completed from current uploads

- real source set ingested by SHA-256/evidence;
- duplicate Customer/item-code policy locked;
- 60 historical journal identities fully dispositioned;
- supplier role gaps closed without fuzzy party merge;
- 21 UOM identities reviewed, with deterministic context/UOM rules for 19 and fail-closed refusal for 2;
- unsafe global alias for `NVL-TON-DL7.2Dx124-XNXLC` replaced by context split: raw Stock `Kg` vs commercial Sales `m2`;
- VND integer storage rule locked from source workbook display semantics;
- two future-dated `VIPST700` rows explicitly quarantined from opening instead of guessing a replacement date;
- preview-only tests/CI guards enforce no production mutation.

### VND rounding — DONE

Authority: `docs/pilot/alumdoor/PILOT_01_MONEY_ROUNDING_V1.json`.

The source `Tổng thanh toán` column is formatted as integer VND (`#,##0 ₫`) while 45 underlying rows are fractional. Pilot normalization therefore rounds **each monetary row/document** to nearest integer VND, exact `.5` away from zero, before integer-minor-unit storage.

Observed fractional subset:

- raw sum: `469,262,369.969` VND;
- per-row rounded sum: `469,262,376` VND;
- declared rounding delta: `+6.031` VND.

Raw fractional source values and per-row rounding deltas remain provenance. Rounding the aggregate only is prohibited because it does not reproduce per-document source display semantics.

### Future-date stock anomaly — DISPOSITIONED

Authority: `docs/pilot/alumdoor/PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`.

`VIPST700` rows 46–47 contain raw date `23/12/2026`, later than the source-ingest date, with:

- row 46: 6.8m / 101 lá;
- row 47: 3.77m / 56 lá.

No matching `VIPST700` entry in either history table proves a replacement date. Therefore both rows are **quarantined and excluded from opening** until the source owner supplies a corrected date. Their raw date is retained unchanged.

Physical source-status denominator becomes, after this explained quarantine:

- 1,152 -> **1,150** opening-eligible physical rows;
- 41,137 -> **40,980** opening-eligible pieces/leaves.

These remain physical metrics only, **not** canonical opening Kg/value.

## 2. Remaining blockers before `PILOT-01-READY`

1. **AR opening:** source-authoritative full-customer opening snapshot at one named cutoff.
2. **AP opening:** source-authoritative full-supplier opening snapshot at the same cutoff.
3. **Stock opening:** canonical quantity + value at the same cutoff, including complete scope and aluminum Kg/value evidence.
4. **Cash/bank:** matching balances at the same cutoff if cash/bank remains in scope.
5. **Residual UOM:** source-owner evidence for `NVL-AL595-GS` (`KG/M` ambiguity) and `NVL-BO1VIS AL71` (Kg vs Con), plus row-level quantity evidence for ray row 327 and the historical VIS sales conversion.
6. **Stock source scope:** process specification expects 23 aluminum + 2 mesh sheets while current upload exposes 18 inventory sheets and no separate mesh opening source.
7. **Future-date correction:** the two quarantined VIPST700 rows need source-owner corrected dates before they may enter opening Stock.
8. **Operating/access masters:** minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

`30/06/2026` remains only an evaluated candidate; it cannot be frozen because AR/AP and canonical Stock opening are not source-proven there.

## 3. Next execution order

- search the existing uploaded set/file library for any additional authoritative AR/AP/opening/access source that has not yet been bound into Pilot-01;
- materialize any deterministic minimum BOM/work-center/employee data already present in the process/master files without inventing identities;
- if full AR/AP/Stock opening evidence or the two blocked UOM conversions are absent, record them as external source-owner dependencies rather than synthesizing values;
- once one common cutoff is source-proven, build the private Mapping-V1 batch and run `validate-pilot-batch.mjs` until zero-variance `PREVIEW_PASS`.

**Production write/import remains unauthorized.** `PREVIEW_PASS` does not authorize production mutation.

## 4. Pilot-02 onward

Pilot-02 Dry Run starts only after Pilot-01 READY and named accounts are frozen. Pilot-03 then runs parallel reconciliation; Pilot-04 is the explicit cutover decision; Pilot-05 is hypercare/exit. Only `PILOT-ACCEPTED` advances to Accepted Production Reference -> GA.

## 5. Standing boundaries

- Controlled pilot is not GA.
- Raw customer/master/opening files stay outside Git.
- Missing opening values are never assumed zero.
- Rate-like `KG/M` / `KG/M2` labels are never silently promoted to stock quantities.
- Future-dated source rows are never silently rewritten.
- Real production data write/import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.

## 6. Authorities

- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_MONEY_ROUNDING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
- `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md`.
