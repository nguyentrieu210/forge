# Alumdoor Real Data → Local D1 Execution Contract

## Scope

This branch completes the canonical Alumdoor real-data load into the local D1-backed runtime. The work is local-only and must not mutate remote Cloudflare data.

Canonical source documents are the extracted source files already committed under:

- `apps/alumdoor/docs/nguon/ms-lien/*`
- `apps/alumdoor/docs/nguon/ton-nhom/*`
- `apps/alumdoor/docs/nguon/quy-cach/*`
- `apps/alumdoor/docs/nguon/quy-trinh-van-ban.md`

Legacy `server/imports/alumdoor-item-only-2026-08-11.sql` and the historical count of 278 Items are forensic/reference material only and must not define the canonical dataset.

## Hard constraints

1. Preserve source business Item codes exactly. No slugging, suffix generation, or silent renaming.
2. Do not generate Items from aluminium stock rows. A stable Item/profile may own many physical stock lots.
3. Compound expressions such as `KG/M` and `KG/M2` are rate/conversion evidence, not stock UOM names.
4. Do not reintroduce removed masters: Sales Option, Sales Package, Material Grade, Item Attribute, Brand, Manufacturer.
5. Do not add accounting or sales-type/sales-method catalogs. Pricing behavior remains policy-driven.
6. No delete-all/reseed import strategy.
7. Import semantics are fail-closed and idempotent:
   - missing → create;
   - exact managed record → skip;
   - same identity with conflicting managed fields → block before mutation unless an explicit source-owned update path is proven safe.
8. No data guess may be added solely to make CI pass. Overrides require source evidence and provenance.

## Current verified baseline before the final load

At branch creation, current `main` is `df62b12cc40ba5341914e38570661fbc3b7d459c` (merge of PR #936).

PR #937 continues on `agent/alumdoor-real-d1-load`.

The current real-source pipeline has already demonstrated on CI:

- 2,169 extracted source records;
- 362 sellable source rows;
- 242 stock source rows;
- 1,565 BOM-reference rows;
- 587 canonical Item identities;
- Item source blockers = 0;
- Item payload blockers = 0;
- BOM reference blockers = 0.

The current BOM builder has demonstrated:

- 237 BOM parents;
- 1,308 materialized BOM component references;
- 257 excluded references under explicit source/parent policy;
- total source-reference coverage 1,565 / 1,565.

These values are not accepted as final merely because they appeared previously: every final execution must rebuild them from the branch/main source and audit the resulting local D1 state.

## Source authority

### Item Master

Use the extracted `MS LIÊN BS` source with these roles:

- `DANH MỤC`: primary commercial/catalog evidence;
- `ĐM`: finished/component classification and BOM structure;
- `Trang tính29`: raw material/profile/color/UOM and stock identity cross-check;
- transaction sheets: validation that business codes were actually used.

### BOM

Use `MS LIÊN BS/ĐM` for parent/component structure and the production-process document for formula semantics. Preserve formulas and rate notes when they cannot safely be reduced to a fixed numeric quantity.

### Aluminium physical stock

Use current-stock profile sheets under `ton-nhom`. `LICH_SU` / `LỊCH-SỬ` are lineage/history inputs, not current physical lots.

## Required model semantics

### Item

Canonical payload must include, where supported by the live DocType metadata:

- `item_code`
- `item_name`
- `item_group`
- `item_nature`
- `material_stage`
- `supply_type`
- stock/purchase/sales flags
- `include_item_in_manufacturing`
- `stock_uom`
- default purchase and sales UOM
- measurement/geometry profile
- UOM conversions backed by source evidence
- provenance sufficient to trace the source rows used to classify the identity.

### Bill of Materials / BOM Item

Live local metadata must be treated as authoritative. Current known shape includes:

- parent Item / company / quantity / active state;
- `items` child table;
- child `item_code`, `qty`, `uom`, `qty_basis`, `source_note`, `note`;
- deterministic `bom_fingerprint`;
- configuration/source snapshot fields when available.

Every one of the 1,565 BOM-reference source rows must be accounted for as imported or explicitly excluded with a reason.

### Aluminium Lot

If no local DocType exists, add a dedicated Alumdoor DocType rather than abusing Item or another stock master. It must support at least:

- deterministic unique `source_key`;
- source sheet/file/row;
- linked Item;
- profile/type;
- raw color/finish;
- condition (old/new when present);
- length;
- piece/leaf/tree count;
- stock status;
- cutting-selection flag;
- scrap/remnant field;
- total kg;
- received/re-received dates;
- notes;
- raw source snapshot JSON.

`source_key` is the idempotency identity for the physical-source row.

## Known aluminium-lot anomalies that must be resolved with evidence

1. `AL70 - 1 LỚP`, color `XF` — inventory evidence shows `NVL-AL70(1LOP)-VK` is the XINGFA identity.
2. `AL70 1.5MM`, color `THÔ` — exact material identity must be found in real source evidence; no synthetic Item code is allowed.
3. `AL752`, color `9512 (TRẮNG)` — determine whether this is a lot finish on an existing profile identity or a separately sourced material identity; do not create a fake `AL752-TRANG` code.
4. `VIPST700`, color `4004` — same rule: resolve through source evidence and preserve raw color on the lot.

No unresolved lot mapping may be silently dropped.

## Execution sequence

1. Audit current main/PR/local runtime and live DocType metadata.
2. Rebuild real source records and Item payload; require non-zero counts and zero blockers.
3. Rebuild BOM payload; require non-zero count, deterministic fingerprints, resolved parent/component links, and complete source-reference coverage.
4. Build Aluminium Lot payload; require non-zero count, zero unresolved mappings, stable `source_key`, and full source-row coverage for current-stock sheets.
5. Add/migrate required DocTypes locally.
6. Snapshot/pre-image the local D1 state.
7. Import dependencies and canonical Items.
8. Import real BOMs.
9. Import real Aluminium Lots.
10. Audit local API/D1 against every payload.
11. Run the same import a second time; require zero creates and zero conflicts.
12. Run domain smoke tests for Đức, Úc, Đài Loan, and Siêu Trường where source BOM exists, including lot lookup by profile/color/length without creating new Items.
13. Merge only when the real local load, audit, and idempotency evidence pass.

## Post-import audit requirements

The final audit must prove:

- every canonical Item payload code exists exactly once;
- Item managed fields and UOM conversions match payload;
- every BOM payload fingerprint exists and matches;
- BOM parent/component links are valid;
- total BOM child rows match payload;
- every Aluminium Lot `source_key` exists exactly once;
- lot count matches payload;
- no orphan Item links;
- aggregate counts/length/pieces/kg by source sheet/profile/color/condition match the source payload where numeric source data exists;
- second import creates zero Items, zero BOMs, and zero Lots and produces zero conflicts.

## Definition of Done

The task is complete only when local execution logs contain equivalent proof markers:

- `ALUMDOOR_REAL_ITEM_PASS`
- `ALUMDOOR_REAL_BOM_PASS`
- `ALUMDOOR_REAL_ALUMINIUM_LOT_PASS`
- `ALUMDOOR_REAL_D1_AUDIT_PASS`
- `ALUMDOOR_REAL_D1_IDEMPOTENCY_PASS`
- `ALUMDOOR_REAL_D1_FULL_LOAD_PASS`

The final record must include main SHA, PR number, real Item count, BOM count, BOM child count, Aluminium Lot count, zero blockers, first-run create counts, second-run create counts = 0, audit result, excluded-source reasons, and preserved source anomalies/provenance.
