#!/usr/bin/env node
import {
  ITEM_SOURCE_ROLES,
  ITEM_SOURCE_SHARED_IDENTITIES,
  classifyAlumdoorItemSourceCode,
} from "./lib/alumdoor-item-source-contract.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

const code = "NVL-TON-ST-1LYx175-_MSK";
const shared = ITEM_SOURCE_SHARED_IDENTITIES[code];
if (!shared) throw new Error("Thiếu Super shared identity");
if (!shared.dimensions.includes("material_specification")) {
  throw new Error("Super shared identity phải dùng material_specification");
}

const audit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 2681,
    source_index: 351,
    item_code: code,
    item_name: "LÁ SIÊU TRƯỜNG STĐ 1.2LY_MSK",
    source_uom: "M2",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 2682,
    source_index: 352,
    item_code: code,
    item_name: "LÁ SIÊU TRƯỜNG STĐ 1.3LY_MSK",
    source_uom: "M2",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 2683,
    source_index: 353,
    item_code: code,
    item_name: "LÁ SIÊU TRƯỜNG STĐ 1.3LY_MSK",
    source_uom: "M2",
  },
]);

expect(audit.blocker_count, 0, "Super shared Item blockers");
expect(audit.accepted_count, 1, "Super shared Item count");
expect(audit.accepted[0].item_code, code, "Super exact shared code");
expect(audit.accepted[0].sales_uoms[0], "m2", "Super sales UOM");
expect(audit.accepted[0].source_rows.length, 3, "Super source trace rows");

let result = classifyAlumdoorItemSourceCode(code, {
  source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
  source_index: 351,
});
expect(result.status, "alias", "Super 1.2 BOM mapping status");
expect(result.canonical_item_code, "NVL-TON-DL1.2LYx175-STD", "Super 1.2 raw stock mapping");

result = classifyAlumdoorItemSourceCode(code, {
  source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
  source_index: 352,
});
expect(result.status, "alias", "Super 1.3 BOM mapping status");
expect(result.canonical_item_code, "NVL-TON-DL1.3LYx175-STD", "Super 1.3 raw stock mapping");

console.log("ALUMDOOR_ITEM_SUPER_SHARED_SPEC_PASS");
