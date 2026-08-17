#!/usr/bin/env node
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorBomItemPromotion } from "./lib/alumdoor-item-evidence-overrides.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

const promotion = resolveAlumdoorBomItemPromotion("TP-LUOIMV_INOX", ITEM_SOURCE_ROLES.BOM_REFERENCE);
if (!promotion) throw new Error("Thiếu promotion TP-LUOIMV_INOX");
expect(promotion.status, "promoted_item", "TP-LUOIMV_INOX promotion status");
expect(promotion.canonical_item_code, "TP-LUOIMV_INOX", "TP-LUOIMV_INOX exact source code");
expect(promotion.canonical_source_uom, "m2", "TP-LUOIMV_INOX UOM");
expect(promotion.identity_role, ITEM_SOURCE_ROLES.STOCK_ITEM, "TP-LUOIMV_INOX identity role");
expect(
  resolveAlumdoorBomItemPromotion("TP-LUOIMV_INOX", ITEM_SOURCE_ROLES.SELLABLE_PRODUCT),
  null,
  "TP-LUOIMV_INOX promotion must be BOM-only",
);

const audit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 1214,
    item_code: "TP-LUOIMV_INOX",
    item_name: "LƯỚI MV INOX",
    source_uom: "",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 1216,
    item_code: "TP-LUOIMV_INOX",
    item_name: "LƯỚI MV INOX",
    source_uom: "",
  },
]);

expect(audit.blocker_count, 0, "TP-LUOIMV_INOX audit blockers");
expect(audit.accepted_count, 1, "TP-LUOIMV_INOX accepted identity count");
expect(audit.promotion_count, 2, "TP-LUOIMV_INOX source promotion count");
expect(audit.accepted[0].item_code, "TP-LUOIMV_INOX", "TP-LUOIMV_INOX accepted code");
expect(audit.accepted[0].stock_uom, "m2", "TP-LUOIMV_INOX stock UOM");
expect(audit.accepted[0].source_rows.length, 2, "TP-LUOIMV_INOX source row trace count");

console.log("ALUMDOOR_ITEM_LUOIMV_INOX_PASS");
