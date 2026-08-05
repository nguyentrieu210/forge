# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo `nguyentrieu210/forge`.
- RC4 **DONE**; R5 **DONE / R5-GO**; R6 **DONE / PILOT-GO**.
- Pilot-00 **DONE / PILOT-00-LOCKED**.
- Pilot-01 source set **OBSERVED / HASHED / INGESTED**.
- Identity: **60/60 journal identities dispositioned; supplier gaps 4 -> 0; duplicate rules locked**.
- UOM/quantity: **21 reviewed / 19 resolved-or-classified / 2 fail-closed**.
- VND rounding **LOCKED**.
- two future-dated `VIPST700` rows **QUARANTINED**.
- cutoff `30/06/2026` **NOT PROVEN / NOT FROZEN**.
- Current uploads + File Library were reviewed; **no additional Alumdoor-authoritative opening/access source was found**.
- Pilot-01 verdict: `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`, blocking mode `EXTERNAL_SOURCE_DEPENDENCY`.
- Exact frozen product baseline `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956**.

## Source-search exhaustion

Authority: `docs/pilot/alumdoor/PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json`.

The search covered:

- all six accepted Alumdoor uploads in the current conversation;
- File Library;
- current repository authorities.

No additional Alumdoor-specific source-authoritative AR/AP opening snapshot, canonical stock Kg/value opening, missing stock-scope source, or named pilot-user allowlist was found.

Do not use as substitutes:

- generic Kairo sales collateral that lists roles but no named Alumdoor accounts;
- unrelated phone-store opening-debt templates;
- TOKA/CRM/architecture documents for other businesses/projects.

## External dependencies now required

1. full-customer AR opening at one named cutoff;
2. full-supplier AP opening at the same cutoff;
3. canonical Stock quantity + value at that cutoff, with actual aluminum Kg/value and complete source scope;
4. matching cash/bank balances if cash/bank stays in pilot scope, or explicit scope exclusion;
5. source-owner UOM evidence for `NVL-AL595-GS`;
6. source-owner UOM evidence for `NVL-BO1VIS AL71`;
7. corrected dates for the two quarantined VIPST700 rows before opening inclusion;
8. named pilot-account allowlist with exactly one active named `Giám đốc` account.

None of these may be synthesized from unrelated templates, blanks, theoretical kg/m or guessed conversions.

## Already locked from current source

- duplicate Customer/item-code rules;
- 60/60 journal identity dispositions;
- supplier roles 4 -> 0;
- context split for `NVL-TON-DL7.2Dx124-XNXLC` (raw Stock Kg vs Sales m2);
- UOM rules for 19/21 reviewed identities, fail-closed for 2;
- integer-VND per-row rounding for 45 fractional source rows;
- quarantine of the two future-dated VIPST700 rows;
- 30/06 evaluated and rejected as an unproven common cutoff.

## Next action when source owner supplies evidence

1. hash/bind the new source extracts;
2. update the external-dependency evidence;
3. freeze a source-proven common cutoff;
4. normalize under Mapping V1 and locked identity/UOM/money policies;
5. generate the private batch;
6. run validator to zero-unexplained-variance `PREVIEW_PASS`.

Until then, Pilot-01 is correctly blocked on external source evidence rather than code/tooling.

## Production boundary

No Pilot-01 production import/write has occurred. `PREVIEW_PASS` does not authorize production write. Production import, cutover, provider/DNS/secret mutation, restore/PITR and destructive state operations remain explicit authorization boundaries.
