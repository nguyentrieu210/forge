import { ITEM_SOURCE_ROLES } from "./alumdoor-item-source-contract.mjs";

// Audited source defects that remain intentionally blocked after the canonical Item evidence passes.
// These are source-data contradictions, not normalization opportunities. Do not rewrite or invent codes
// to make the preflight green.
export const ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS = Object.freeze([
  Object.freeze({
    scope: "bom",
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 2678,
    item_code: "NVL-TOLEKEM175_1LY_MSK",
    item_name: "LÁ SIÊU TRƯỜNG 175_XN-VK_9D",
    source_uom: "M2",
    expected_reason: "unresolved_bom_reference",
    note: "Code nói 1LY, tên nói 9D, parent nói 1.2LY; dữ liệu tự mâu thuẫn nên không alias theo suy đoán.",
  }),
]);
