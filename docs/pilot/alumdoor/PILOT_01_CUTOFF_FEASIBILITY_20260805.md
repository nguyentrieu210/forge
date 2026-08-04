# Pilot-01 — Cutoff feasibility review (2026-08-05)

Verdict: **CUTOFF_NOT_FROZEN**  
Evaluated candidate: **30/06/2026**  
Production mutation: **none**

## Decision

Do **not** freeze 30/06/2026 from the currently uploaded source set.

The date is a reasonable cash/bank candidate, but Pilot-01 requires one source-authoritative point shared by Stock, AR, AP and cash/bank. The uploaded files do not prove that state.

## Cash / bank

`MS LIÊN BS.xlsx` / `THU-CHI` contains 194 dated transaction rows from 08/04/2026 through 30/06/2026. The workbook also carries the active selector `NGÀY=30`, `THÁNG=6` for the cash/bank summary formulas.

This supports evaluating 30/06, but cash evidence alone cannot establish a common pilot cutoff.

## Accounts receivable

The journal contains:

- 514 `Bán hàng chưa thu tiền` rows from 01/06/2026 through 13/06/2026, totaling 1,377,136,021.969 VND before integer-VND rounding;
- 177 `Thu công nợ` rows from 08/04/2026 through 25/06/2026, totaling 2,553,550,874 VND.

That proves carry-in AR exists outside the observed credit-sales window: customer receipts start almost two months before the first observed credit sale, and observed receipts exceed observed credit sales.

`CHI TIẾT CNO KH` exposes an `ĐẦU KỲ` column (`AZ`) but **0 of 152 customer summary rows has a populated opening value**. The cached AR detail blocks also end earlier than the source journal (11–13/06 versus receipts through 25/06), so they are not accepted as a 30/06 authoritative snapshot.

A customer-specific historical workbook (`CTY SÁU HỒNG.xlsx`) contains `CÔNG NỢ CŨ CÒN LẠI`, but it is a 2025 single-customer history and cannot substitute for a 2026 full-customer opening snapshot.

Therefore AR at 30/06 is **not reconstructable with zero unexplained variance from the current set**.

## Accounts payable

The journal contains 14 `Mua hàng chưa thanh toán` rows from 02/02/2026 through 02/07/2026:

- 8 rows on or before 30/06, observed total 15,520,000 VND;
- 6 rows after 30/06, observed total 6,300,000 VND.

`CNO NCC` exposes an `ĐẦU KỲ` column (`BI`) but **0 supplier data row contains a populated opening value**. No `Thanh toán công nợ nhà cung cấp` row is observed in the supplied journal.

Blank opening plus no observed payment rows does **not** prove historical AP was zero. AP at 30/06 therefore remains unproven.

## Stock

`TỒN NHÔM 2026 NEW.xlsx` provides meaningful physical history:

- 18 inventory sheets / 1,506 physical lot rows;
- source-status replay: 1,152 currently available rows / 41,137 pieces-leaves;
- `LỊCH SỬ`: 1,268 dated rows from 18/05 through 20/06;
- `LICH_SU`: 863 timestamped actions from 25/06 through 27/07, including 202 actions on/before 30/06 and 661 after 30/06;
- 178 current rows have receipt/re-entry dates after 30/06.

This means a physical rewind is plausible in principle. It is **not** sufficient for canonical opening Stock because:

- `SỐ KG TỔNG` has 0 populated actual-Kg cells;
- no source-authoritative opening valuation is supplied;
- the process specification expects 23 aluminum sheets + 2 mesh sheets, while the upload has 18 inventory sheets and no separate mesh opening source;
- the two observed history blocks do not prove a continuous event sequence across every day around the cutoff;
- two `VIPST700` rows carry the future date 23/12/2026.

Theoretical kg/m remains reference evidence and must not silently be relabelled as measured opening Kg.

## Result

| Domain | 30/06/2026 assessment |
|---|---|
| Cash/bank | Partial support |
| AR | **Blocked — missing authoritative opening** |
| AP | **Blocked — missing authoritative opening** |
| Physical stock | Partial replay evidence |
| Canonical Stock Kg/value | **Blocked** |
| Common cutoff | **Not proven** |

## Required next evidence

Before any cutoff can be frozen, obtain or identify:

1. full-customer AR opening snapshot at one named date;
2. full-supplier AP opening snapshot at the same date;
3. canonical Stock quantity + value at the same date, including complete stock scope;
4. matching cash/bank balances if cash/bank remains in pilot scope;
5. deterministic integer-VND rounding;
6. zero-unexplained-variance reconciliation.

Once those exist, reevaluate 30/06 first. If the source owner supplies a stronger date, use that date instead. **Do not manufacture an opening balance by treating missing opening values as zero.**
