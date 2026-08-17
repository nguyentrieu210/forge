#!/usr/bin/env node
import { CANONICAL_UOMS } from "./lib/alumdoor-item-import-policy.mjs";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorDualUnitEvidence } from "./lib/alumdoor-item-dual-unit-evidence.mjs";
import {
  ALUMDOOR_UOM_CATALOG,
  canonicalAlumdoorUom,
} from "./lib/alumdoor-uom-catalog.mjs";
import {
  interpretAlumdoorSourceUom,
  preflightAlumdoorItemSourceRecords,
} from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

if (!CANONICAL_UOMS.has("Thùng")) throw new Error("Canonical Item UOM thiếu Thùng");
if (!ALUMDOOR_UOM_CATALOG.some((entry) => entry.name === "Thùng" && entry.mustBeWholeNumber === true)) {
  throw new Error("Layer 0 UOM catalog thiếu Thùng nguyên chiếc");
}
expect(canonicalAlumdoorUom("thùng"), "Thùng", "Thùng canonicalization");

let uom = interpretAlumdoorSourceUom(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT, "KG/THÙNG");
expect(uom.status, "dual_unit_basis", "Lá Mẫu KG/THÙNG status");
expect(uom.canonical_uom, "Thùng", "Lá Mẫu commercial UOM");
expect(uom.secondary_uom, "Kg", "Lá Mẫu weight UOM");
expect(uom.conversion_basis, "kg_per_thung", "Lá Mẫu conversion basis");
expect(uom.requires_conversion, true, "Lá Mẫu conversion required");

const sourceRecord = {
  source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
  source_sheet: "ĐM",
  source_row: 1902,
  source_index: 350,
  item_code: "NVL-LAMAU-PHE",
  item_name: "LÁ MẪU ĐỨC",
  source_uom: "KG/THÙNG",
};
const evidence = resolveAlumdoorDualUnitEvidence(sourceRecord);
if (!evidence) throw new Error("Thiếu Lá Mẫu dual-unit evidence");
expect(evidence.conversion_factor, 1.4, "Lá Mẫu Kg/Thùng factor");
expect(evidence.conversion_basis, "kg_per_thung", "Lá Mẫu evidence basis");

const audit = preflightAlumdoorItemSourceRecords([sourceRecord]);
expect(audit.blocker_count, 0, "Lá Mẫu blocker count");
expect(audit.accepted_count, 1, "Lá Mẫu accepted Item count");
expect(audit.accepted[0].item_code, "NVL-LAMAU-PHE", "Lá Mẫu exact code");
expect(audit.accepted[0].sales_uoms[0], "Thùng", "Lá Mẫu sales UOM");
expect(audit.accepted[0].requires_conversion, true, "Lá Mẫu accepted conversion flag");
expect(audit.accepted[0].conversion_bases[0], "kg_per_thung", "Lá Mẫu accepted conversion basis");
expect(audit.accepted[0].conversion_factors[0].conversion_factor, 1.4, "Lá Mẫu accepted conversion factor");
expect(audit.accepted[0].source_rows[0].source_uom, "KG/THÙNG", "Lá Mẫu source UOM trace");
expect(audit.accepted[0].source_rows[0].conversion_factor, 1.4, "Lá Mẫu source conversion trace");

console.log("ALUMDOOR_ITEM_LAMAU_PACKAGE_UOM_PASS");
