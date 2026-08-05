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
- Identity: **60/60 journal identities dispositioned; supplier gaps 4 -> 0; duplicate policies locked**.
- UOM/quantity: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding: **LOCKED / per-row integer VND**.
- Future stock-date anomalies: **2 VIPST700 rows QUARANTINED**.
- Cutoff `30/06/2026`: **NOT PROVEN / NOT FROZEN**.
- Source search: **current uploads + File Library reviewed; no additional Alumdoor-authoritative opening/access source found**.
- Pilot-01 verdict: **PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED / EXTERNAL_SOURCE_DEPENDENCY**.
- Exact certified/deployed product SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- R6 final evidence remains **23/23 PASS**; Pilot docs/tooling commits do not change deployed runtime identity.

## 2. Capability truth

Canonical distribution remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** until a newer convergence record explicitly changes it.

## 3. Pilot-01 source truth

Accepted current Alumdoor sources are the six operator-provided files recorded in `PILOT_01_SOURCE_INGEST_20260805.json`. They already support deterministic identity, supplier, UOM, money and anomaly policies. Raw workbooks remain outside Git.

Key closed work:

- duplicate Customer references map to one retained canonical Customer;
- exact duplicate Item codes would use the lowest free `01`, `02`, `03`... suffix with lineage;
- 60/60 historical journal item strings are dispositioned;
- supplier purchase-party role gaps are closed 4 -> 0;
- overloaded `NVL-TON-DL7.2Dx124-XNXLC` is context-split between raw Stock `Kg` and Sales `m2`;
- 19/21 reviewed UOM identities are resolved/classified; `NVL-AL595-GS` and `NVL-BO1VIS AL71` remain fail-closed;
- 45 fractional VND totals use locked per-row integer rounding with raw-value provenance;
- two future-dated VIPST700 rows are quarantined without source-date rewrite;
- `30/06/2026` was evaluated and rejected as an unproven common cutoff.

## 4. Source-search exhaustion

Authority: `docs/pilot/alumdoor/PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`.

The current conversation uploads, File Library and repository authorities were reviewed for additional Alumdoor opening/access evidence. No additional source-authoritative Alumdoor AR/AP opening snapshot, canonical actual-Kg/value Stock opening, missing stock-scope extract, or named pilot-user allowlist was found.

Search results that are **not** valid Alumdoor substitutes were explicitly rejected, including generic Kairo role collateral, an unrelated phone-store opening-debt spreadsheet, and TOKA/CRM/architecture documents from other business contexts.

Pilot-01 is therefore blocked by real external source-owner dependencies rather than missing code or unsearched files.

## 5. External dependencies required to continue

1. **AR opening** — full-customer source-authoritative opening balances at one named business cutoff.
2. **AP opening** — full-supplier source-authoritative opening balances at the same cutoff.
3. **Stock opening** — canonical quantity + value at that cutoff, with actual aluminum Kg/value and complete aluminum/mesh source scope.
4. **Cash/bank** — matching balances at that cutoff when included, or an explicit scope exclusion.
5. **UOM `NVL-AL595-GS`** — physical stock axis/conversion evidence; `KG/M` is rate-like and not accepted as stock quantity.
6. **UOM `NVL-BO1VIS AL71`** — evidence resolving source `159 KG` versus canonical BỌ-family `Con`.
7. **VIPST700 dates** — source-owner corrected dates for the two quarantined rows before opening inclusion.
8. **Pilot users** — named allowlist with exactly one active named `Giám đốc` account.

These inputs may **not** be synthesized from blank fields, theoretical rates, unrelated templates or generic role documents.

## 6. Pilot-01 transition rule

When the source owner supplies the missing evidence:

1. bind new extracts by SHA-256/provenance;
2. freeze one common source-proven cutoff;
3. normalize under Mapping V1 and locked identity/UOM/money policies;
4. generate the private batch;
5. require zero unexplained variance and `PREVIEW_PASS`.

Until then, `PILOT-01-READY` must not be claimed.

## 7. Standing boundaries

- `PREVIEW_PASS` is not production-write authorization.
- No guessed opening balances, guessed UOM conversions, silent source-date rewrites or unrelated-source substitution.
- Real customer/master/opening-data write/import, cutover, provider/DNS/secret mutation, destructive restore/PITR and destructive state operations remain explicit authorization boundaries.
- Controlled pilot is not GA.

## 8. Documentation authority

Start with:

- `docs/pilot/alumdoor/PILOT_01_STATUS.json`;
- `docs/pilot/alumdoor/PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`;
- `docs/pilot/alumdoor/PILOT_01_UOM_RECONCILIATION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_MONEY_ROUNDING_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_STOCK_ANOMALY_DISPOSITION_V1.json`;
- `docs/pilot/alumdoor/PILOT_01_CUTOFF_FEASIBILITY_20260805.json`;
- `NEXT_TASKS.md`.
