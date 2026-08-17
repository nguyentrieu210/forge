import { ITEM_SOURCE_ROLES } from "./alumdoor-item-source-contract.mjs";

// Evidence-backed exceptions that cannot be derived from the source code string alone.
// These rules are deliberately narrow and source-role scoped. They never rewrite a numbered
// product or stock code that is already present in the source.

export const ITEM_SOURCE_BOM_EVIDENCE_ALIASES = Object.freeze({
  "TP-YHLD-HDK": "HH-HDKMT-YH",
  "TP-YHLD_TayDK": "HH-TDKMT-YH",
  "TP-YHLD-Than500kg": "HH-TMT-YHLD500",
  "TP-LacYHLD300&500KG": "HH-LMT-YHLD300-500",

  "TP-Tanker-Than400kg": "HH-TMT-TK400",
  "TP-Tanker-Than600kg": "HH-TMT-TK600",
  "TP-Tanker-Than1000kg": "HH-TMT-TK1000",
  "TP-Tanker-Alumax-HDK": "HH-HDKMT-TANKER",
  "TP-Tanker-Alumax_TayDK": "HH-TDKMT-TANKER",
  "TP-Tanker-Alumax-Lac33": "HH-LMT33-TK400-600",
  "TP-Tanker-Alumax-Lac36": "HH-LMT36-TK400-600",
  "TP-Tanker-Lac800&1000KG": "HH-LMT-TK800-1000",

  "TP-JG-HDK": "HH-HDKMT-JG",
  "TP-MTT_BOSTEC-HOPDK": "HH-HDKMT-BOS",
  "TP-MTT-BOSTEC-TAYDK": "HH-TDK-BOS",
  "TP-MTT_CHTAIWAN-HOPDK": "HH-HDKMTDON-CH",
});

// Two numbered YHLD component products have blank UOM cells in ĐM, while their BOM/transaction
// evidence consistently uses cái. Keep the original Item code and record the UOM as an explicit
// audited override rather than silently inferring it.
export const ITEM_SOURCE_UOM_EVIDENCE_OVERRIDES = Object.freeze({
  [`${ITEM_SOURCE_ROLES.SELLABLE_PRODUCT}|TP-YHLD-HDK`]: Object.freeze({
    canonical_source_uom: "Cái",
    reason: "audited_bom_and_transaction_uom",
  }),
  [`${ITEM_SOURCE_ROLES.SELLABLE_PRODUCT}|TP-YHLD_TayDK`]: Object.freeze({
    canonical_source_uom: "Cái",
    reason: "audited_bom_and_transaction_uom",
  }),
});

// Trang tính29 contains a stock row named "Ron đáy úc" with quantity/UOM evidence but a blank code.
// The same material is explicitly referenced by BOM code NVL-RONDAYUC. Binding those two pieces of
// source evidence resolves the blank identity without inventing a new code.
export const ITEM_SOURCE_BLANK_CODE_EVIDENCE_OVERRIDES = Object.freeze([
  Object.freeze({
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    item_name: "Ron đáy úc",
    canonical_item_code: "NVL-RONDAYUC",
    reason: "blank_stock_code_bound_to_existing_bom_identity",
  }),
]);

const clean = (value) => String(value ?? "").trim();

export function resolveAlumdoorBomEvidenceAlias(sourceCode, sourceRole) {
  if (clean(sourceRole) !== ITEM_SOURCE_ROLES.BOM_REFERENCE) return null;
  const target = ITEM_SOURCE_BOM_EVIDENCE_ALIASES[clean(sourceCode)];
  if (!target) return null;
  return Object.freeze({
    status: "alias",
    reason: "audited_bom_evidence_alias",
    source_code_original: clean(sourceCode),
    canonical_item_code: target,
  });
}

export function resolveAlumdoorUomEvidenceOverride(record) {
  if (clean(record.source_uom)) return null;
  const key = `${clean(record.source_role)}|${clean(record.item_code)}`;
  return ITEM_SOURCE_UOM_EVIDENCE_OVERRIDES[key] ?? null;
}

export function resolveAlumdoorBlankCodeEvidenceOverride(record) {
  if (clean(record.item_code)) return null;
  const sourceRole = clean(record.source_role);
  const sourceSheet = clean(record.source_sheet);
  const itemName = clean(record.item_name).toLocaleLowerCase("vi");
  const matched = ITEM_SOURCE_BLANK_CODE_EVIDENCE_OVERRIDES.find((rule) => (
    rule.source_role === sourceRole
    && rule.source_sheet === sourceSheet
    && rule.item_name.toLocaleLowerCase("vi") === itemName
  ));
  return matched ?? null;
}
