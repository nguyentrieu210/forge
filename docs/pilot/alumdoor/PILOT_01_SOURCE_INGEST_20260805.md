# Pilot-01 — Real uploaded source ingest

Date: **2026-08-05**  
Verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED**

This record corrects the earlier `WAITING-SOURCE-BATCH` assumption. The operator-provided upload set does contain real Alumdoor source data. The remaining work is now **source reconciliation/normalization**, not source acquisition.

No raw customer workbook is committed to Git. Only immutable file digests, structural counts and non-sensitive blocker summaries are retained here and in `PILOT_01_SOURCE_INGEST_20260805.json`.

## 1. Source set observed

| Source | SHA-256 role | Observed use |
|---|---|---|
| `Hàng hoá _ Vật tư-20260728-2018 (1).xlsx` | exact digest in machine record | 277-row item master export, 277 unique item codes |
| `MS LIÊN BS.xlsx` | exact digest in machine record | customer/supplier master, operating journal, cash/bank, debt/error/paint support sheets |
| `Đơn mua hàng-20260730-1550.xlsx` | exact digest in machine record | current purchase-order summary; TIẾN ĐẠT; 84,883,448 VND; 0% received |
| `CTY SÁU HỒNG.xlsx` | exact digest in machine record | customer order/history reference; 11 sheets |
| `TỒN NHÔM 2026 NEW.xlsx` | exact digest in machine record | physical aluminum lot source |
| `25.7 QUY TRÌNH.docx` | exact digest in machine record | process/formula authority supplied with the source set |

## 2. What is genuinely usable now

### Customer master

`MS LIÊN BS.xlsx / DANH MỤC` contains **258 customer source rows / 256 exact names**. Two exact-name duplicates exist and must be dispositioned by source identity rather than silently merged.

### Supplier master / purchasing references

The same source has **8 rows typed NCC**. The operational journal has 8 unique parties on `Mua hàng chưa thanh toán`. Four of those names are not typed NCC in the uploaded master.

One of the four, **TIẾN ĐẠT**, is already a canonical Forge supplier in the landed item-standardization authority. That resolves the platform identity, but does not make the remaining uploaded supplier-role gaps disappear.

### Item master

`Hàng hoá _ Vật tư...xlsx` supplies **277 unique item codes** with name/group/nature/stage/inventory mode/UOM/disabled evidence.

The operating journal contains **116 distinct populated item-code strings**, of which **60 do not exact-match** this item export. These require canonical alias/standardization reconciliation. No fuzzy or guessed code merge is accepted.

### Operational activity

`MS LIÊN BS.xlsx / chi tiết nhập hàng ngày` contains **730 typed rows**:

- 515 sales-unpaid rows;
- 178 customer receipt rows;
- 14 purchase-unpaid rows;
- 6 supplier-return rows;
- 16 other-expense rows;
- 1 cash-transfer row.

This is valuable lineage/activity evidence, but it is not by itself an opening-balance snapshot.

### Physical aluminum stock

`TỒN NHÔM 2026 NEW.xlsx` has **21 total sheets**. Excluding `MẪU`, `LICH_SU` and `LỊCH SỬ`, **18 inventory sheets** remain.

The lot area has **1,506 physical source rows**. Where status is blank, the workbook's own status formula is replayable from length and piece count. Applying only that source formula yields:

- 1,152 available (`TỒN` or `SẮP HẾT`) lot rows;
- 41,137 pieces/leaves on those available rows;
- 354 `HẾT` rows.

This is physical evidence only. It is **not yet canonical opening Stock quantity**.

## 3. Why PREVIEW_PASS is still blocked

### A. No coherent common cutoff

The uploaded sources are not demonstrably one time-consistent snapshot:

- cash/bank source is labelled `30/06` and its nearby journal is 2026;
- operating journal runs through `02/07/2026`;
- stock source contains legitimate receipt dates through `23/07/2026`;
- item export filename is dated `28/07/2026`;
- purchase-order export filename is dated `30/07/2026`.

Therefore one immutable Pilot-01 `cutoff_at` cannot yet be asserted across Stock + AR/AP + cash/bank.

### B. Stock file has no actual Kg quantity

The current canonical `Nhôm cây/lá` contract uses **Kg** as Stock UOM while preserving length/piece/color/condition as physical dimensions. The uploaded stock workbook has **zero populated `SỐ KG TỔNG` cells** in the observed lot rows.

The repository contains kg/m theoretical evidence for profiles/supplier codes. That evidence is intentionally not equivalent to actual measured Kg and must not be synthesized into opening Stock quantity.

### C. Stock source scope differs from process specification

The supplied process specification describes **23 aluminum sheets plus 2 mesh sheets**. The uploaded aluminum workbook currently has **21 total sheets / 18 inventory sheets**, and no separate mesh opening source was observed in this upload set.

This may be a harmless newer layout or a missing source, but the difference must be dispositioned explicitly.

### D. Two future stock dates

Two `VIPST700` rows carry a source date `23/12/2026`, later than the 05/08/2026 ingest date. They are not silently corrected.

### E. Opening AR cannot be reconstructed from observed activity alone

Observed receipts in the journal exceed observed sales in the available period, proving that carry-in receivables exist outside the observed activity window. A current opening AR balance/source snapshot is still required.

### F. Opening AP cannot be reconstructed safely

Purchase rows exist, but a complete supplier opening/payment state at the same cutoff is not proven.

### G. VND integer policy has to be source-bound

There are **45 typed journal rows** whose `Tổng thanh toán` is fractional VND (examples arise from area × rate/discount calculations). Forge opening-money mapping requires integer minor-unit values. A deterministic source-approved rounding rule must be locked before conversion.

### H. Access and operating masters remain incomplete

A complete employee source, named Pilot user allowlist, canonical work-center set and canonical BOM set were not observed as migration-ready datasets. Exactly one active named `Giám đốc` account remains mandatory for the pilot governance chain.

## 4. Stock warehouse decision already available

The Alumdoor product brief already records the reversible business decision that the stock workbook has no warehouse column and imported aluminum stock defaults to **KHO 1**, with later movements performed through canonical stock-transfer documents. Pilot-01 may therefore use that rule once the canonical Warehouse master/name is confirmed; this is no longer an uninformed guess.

## 5. Next execution

Pilot-01 should now proceed in this order:

1. normalize the 277-item export against canonical item aliases/standardization;
2. reconcile customer duplicate identities and journal party aliases;
3. reconcile supplier roles, preserving the existing canonical TIẾN ĐẠT identity;
4. freeze one business cutoff and obtain matching AR/AP/cash-bank opening snapshots at that cutoff;
5. disposition the 23-sheet-vs-18-inventory-sheet stock scope difference and the two future stock dates;
6. obtain actual measured Kg for opening aluminum lots, or an explicitly approved source conversion policy that does not mislabel theoretical weight as measured evidence;
7. bind named employees/pilot accounts and exactly one active `Giám đốc` account;
8. generate the private normalized batch and run `validate-pilot-batch.mjs`;
9. only `PREVIEW_PASS` may advance Pilot-01 to READY.

`PREVIEW_PASS` still does **not** authorize production write/import.
