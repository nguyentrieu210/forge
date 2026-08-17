#!/usr/bin/env node
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

const audit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 731,
    source_index: 184,
    item_code: "TP-BKAN",
    item_name: "TP BÁT KHÓA ÂM NỀN",
    source_uom: "BỘ/4 CẶP",
  },
]);

expect(audit.blocker_count, 0, "TP-BKAN blocker count");
expect(audit.accepted_count, 1, "TP-BKAN accepted count");
expect(audit.accepted[0].item_code, "TP-BKAN", "TP-BKAN exact code");
expect(audit.accepted[0].sales_uoms[0], "Cặp", "TP-BKAN normalized sales UOM");
expect(audit.accepted[0].source_rows[0].source_uom, "BỘ/4 CẶP", "TP-BKAN source UOM trace");
expect(audit.accepted[0].source_rows[0].effective_source_uom, "Cặp", "TP-BKAN effective UOM");
expect(audit.accepted[0].source_rows[0].uom_origin, "explicit_evidence_override", "TP-BKAN override trace");

console.log("ALUMDOOR_ITEM_BKAN_UOM_PASS");
