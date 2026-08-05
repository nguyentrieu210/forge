# NEXT TASKS

Ngày cập nhật: **2026-08-05**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Current state

- RC4: **DONE**.
- R5: **DONE / R5-GO**.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 real source set: **OBSERVED / HASHED / INGESTED**.
- Identity: **60/60 journal identities dispositioned; supplier gaps 4 -> 0; duplicate rules locked**.
- UOM/quantity: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding: **LOCKED**.
- Future-date stock rows: **2 VIPST700 rows QUARANTINED**.
- Cutoff `30/06/2026`: **EVALUATED / NOT PROVEN / NOT FROZEN**.
- Current uploads + File Library: **REVIEWED; no additional Alumdoor-authoritative opening/access source found**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED / EXTERNAL_SOURCE_DEPENDENCY**.
- Next milestone: **source owner supplies missing opening/access evidence -> one proven common cutoff -> private normalized batch `PREVIEW_PASS` -> Pilot-01 READY -> Pilot-02**.

## 1. Safe normalization already completed

Current accepted Alumdoor sources have already been pushed as far as the evidence safely allows:

- duplicate Customer references collapse to one retained canonical Customer;
- exact duplicate Item codes, if encountered, use the lowest free `01`, `02`, `03`... suffix with source lineage;
- all 60 historical journal item strings have deterministic identity disposition;
- supplier purchase-party role gaps are closed without fuzzy matching;
- overloaded `NVL-TON-DL7.2Dx124-XNXLC` is context-split between raw Stock `Kg` and commercial Sales `m2`;
- 19/21 reviewed UOM identities are resolved/classified; two remain fail-closed;
- 45 fractional VND totals use locked per-row integer-VND rounding with raw-value provenance;
- two future-dated `VIPST700` rows are quarantined, not silently redated;
- `30/06/2026` was tested and rejected as an unproven common cutoff.

Authorities:

- `docs/pilot/alumdoor/PILOT_01_IDENTITY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_ALIAS_SUPPLIER_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_MONEY_ROUNDING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`.

## 2. Source search exhausted

Authority: `docs/pilot/alumdoor/PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`.

The current-conversation uploads, File Library and repository authorities were reviewed for additional Alumdoor opening/access evidence. No additional source-authoritative Alumdoor AR/AP opening snapshot, canonical actual-Kg/value stock opening, missing stock-scope file, or named pilot-user allowlist was found.

Rejected as invalid substitutes:

- generic Kairo sales collateral that lists roles but no named Alumdoor accounts;
- an unrelated phone-store spreadsheet that contains an opening-debt column;
- TOKA/CRM/architecture documents from different businesses/projects.

Do **not** use unrelated templates or generic role documents to make Pilot-01 pass.

## 3. External source-owner dependencies

The following inputs now require real source-owner evidence and may not be synthesized:

1. **AR opening** — full-customer source-authoritative opening balances at one named cutoff.
2. **AP opening** — full-supplier source-authoritative opening balances at the same cutoff.
3. **Stock opening** — canonical quantity + value at that cutoff, including actual aluminum Kg/value and complete aluminum/mesh source scope.
4. **Cash/bank** — matching balances at the same cutoff if cash/bank stays in pilot scope, or an explicit scope exclusion.
5. **UOM `NVL-AL595-GS`** — confirm physical stock axis/conversion; `KG/M` is rate-like and is not accepted as stock quantity.
6. **UOM `NVL-BO1VIS AL71`** — confirm whether source `159 KG` represents Kg, Con, package count or another axis; no Kg-to-Con conversion is inferred.
7. **VIPST700 dates** — source-owner corrected dates for the two quarantined rows before opening inclusion.
8. **Pilot access** — named pilot-account allowlist with exactly one active named `Giám đốc` account.

Remaining source-local work such as minimum BOM/work-center/employee extraction may continue only where the accepted Alumdoor sources explicitly support it; it cannot remove the opening/access dependencies above.

## 4. Transition rule

Pilot-01 stays PREVIEW-BLOCKED until the external source inputs are supplied and one common cutoff is source-proven. Then:

1. bind the new source extracts by SHA-256 and provenance;
2. normalize them under Mapping V1 and the locked identity/UOM/money policies;
3. generate the private batch;
4. run `validate-pilot-batch.mjs`;
5. require **zero unexplained variance** and `PREVIEW_PASS`.

**`PREVIEW_PASS` still does not authorize production write/import.**

## 5. Pilot-02 onward

Pilot-02 Dry Run starts only after Pilot-01 READY and named accounts are frozen. Pilot-03 is parallel run/reconciliation; Pilot-04 is explicit cutover decision; Pilot-05 is hypercare/exit. Only `PILOT-ACCEPTED` advances to Accepted Production Reference -> GA.

## 6. Standing boundaries

- Controlled pilot is not GA.
- Raw customer/master/opening files remain outside Git.
- Missing opening values are never assumed zero.
- Rate-like `KG/M` / `KG/M2` labels are never silently promoted to stock quantities.
- Future-dated source rows are never silently rewritten.
- Unrelated templates/documents are never substituted for Alumdoor source evidence.
- Real production data write/import, cutover, DNS/routes/secrets/provider mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
