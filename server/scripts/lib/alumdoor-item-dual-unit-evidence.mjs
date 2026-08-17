import { ITEM_SOURCE_ROLES } from "./alumdoor-item-source-contract.mjs";

// Explicit conversion factors taken from audited source rows. These are not inferred from code text.
// Keep exact source identity; only the unit relationship is normalized for Item persistence.
export const ITEM_SOURCE_DUAL_UNIT_EVIDENCE = Object.freeze({
  [`${ITEM_SOURCE_ROLES.SELLABLE_PRODUCT}|NVL-LAMAU-PHE`]: Object.freeze({
    source_uom: "KG/THÙNG",
    conversion_basis: "kg_per_thung",
    conversion_factor: 1.4,
    reason: "dm_numbered_row_kg_per_thung_factor",
  }),
});

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function resolveAlumdoorDualUnitEvidence(record) {
  const key = `${clean(record?.source_role)}|${clean(record?.item_code)}`;
  const evidence = ITEM_SOURCE_DUAL_UNIT_EVIDENCE[key] ?? null;
  if (!evidence) return null;
  if (clean(record?.source_uom).toLocaleUpperCase("vi") !== evidence.source_uom.toLocaleUpperCase("vi")) {
    return null;
  }
  return evidence;
}
