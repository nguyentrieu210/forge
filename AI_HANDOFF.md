# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Pilot-01 real source set **OBSERVED / HASHED / INGESTED**.
- duplicate identity policy **LOCKED**.
- journal item identity reconciliation **60/60 DISPOSITIONED**.
- supplier role gaps **4 -> 0**.
- evaluated candidate cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`.
- Exact frozen product baseline `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** until a newer convergence record changes it.

## Closed identity work

- duplicate Customer -> retain first canonical source row, remap references;
- exact duplicate item code -> later exact collisions get lowest free `01`, `02`, `03`... suffix;
- master remains 277/277 unique;
- 60 journal identities = 41 canonical aliases + 18 supplemental source identities + one composite explosion;
- supplier purchase-party gaps are closed without fuzzy matching.

Quantity/UOM is still open for the 18 supplemental identities and three axis-sensitive aliases.

## Cutoff review

Authority: `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

30/06 cannot be frozen from the current uploaded set:

- `THU-CHI`: 194 dated rows, 08/04–30/06; partial cash support.
- AR journal: 514 credit-sale rows, 01/06–13/06, total `1,377,136,021.969`; 177 receipt rows, 08/04–25/06, total `2,553,550,874`. Receipts precede observed sales and exceed them, proving carry-in AR.
- `CHI TIẾT CNO KH`: 152 customer summary rows, **0 populated opening rows**.
- AP journal: 14 unpaid-purchase rows through 02/07; `CNO NCC`: 8 supplier rows, **0 populated opening rows**, no observed supplier-payment rows.
- Stock: physical histories exist (`LỊCH SỬ` 1,268 dated rows; `LICH_SU` 863 actions), but actual populated Kg cells = 0, opening valuation is absent, stock source scope is incomplete versus process spec, and 2 future-dated rows remain.

Missing AR/AP opening values must never be interpreted as zero.

## Remaining blockers

1. source-authoritative full-customer AR opening snapshot at one named cutoff;
2. source-authoritative full-supplier AP opening snapshot at the same cutoff;
3. canonical Stock quantity + value evidence at the same cutoff and complete stock scope;
4. matching cash/bank balances if in scope;
5. supplemental/axis-sensitive quantity and UOM semantics;
6. stock scope/future-date disposition;
7. deterministic integer-VND rounding for 45 fractional rows;
8. minimum BOM/work-center/employee/pilot-user inputs and exactly one active named `Giám đốc` account.

## Next execution order

- continue quantity/UOM and stock reconciliation from current source/repo evidence;
- search existing uploads for any additional authoritative opening data;
- if full AR/AP opening snapshots are not present, treat them as an external source dependency rather than synthesizing them;
- when one common cutoff is proven, generate private Mapping-V1 batch and run validator to zero-variance `PREVIEW_PASS`.

## Production boundary

No Pilot-01 production import/write has occurred. `PREVIEW_PASS` does not authorize production write. Production import, cutover, provider mutation, DNS/routes/secrets, restore/PITR and destructive state operations remain explicit authorization boundaries.

## Read order

1. exact GitHub state;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `docs/pilot/alumdoor/README.md`;
5. `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
6. `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`;
7. `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
8. `docs/pilot/alumdoor/PILOT_DATA_MAPPING_V1.json`;
9. R6 final certification evidence as needed.
