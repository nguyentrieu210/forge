import { ITEM_SOURCE_ROLES } from "./alumdoor-item-source-contract.mjs";

// Evidence-backed exceptions that cannot be derived from the source code string alone.
// These rules are deliberately narrow and source-role scoped. They never rewrite a numbered
// product or stock code that is already present in the source.

export const ITEM_SOURCE_BOM_EVIDENCE_ALIASES = Object.freeze({
  "TP-YHLD-HDK": "HH-HDKMT-YH",
  "TP-YHLD_TayDK": "HH-TDKMT-YH",
  "TP-YHLD-Than300kg": "HH-TMT-YHLD300",
  "TP-YHLD-Than500kg": "HH-TMT-YHLD500",
  "TP-YHLD-Than800kg": "HH-TMT-YHLD800",
  "TP-YHLD-Than1000kg": "HH-TMT-YHLD1000",
  "TP-LacYHLD300&500KG": "HH-LMT-YHLD300-500",

  "TP-Tanker-Than400kg": "HH-TMT-TK400",
  "TP-Tanker-Than600kg": "HH-TMT-TK600",
  "TP-Tanker-Than800kg": "HH-TMT-TK800",
  "TP-Tanker-Than1000kg": "HH-TMT-TK1000",
  "TP-Tanker-Alumax-HDK": "HH-HDKMT-TANKER",
  "TP-Tanker-Alumax_TayDK": "HH-TDKMT-TANKER",
  "TP-Tanker-Alumax-Lac33": "HH-LMT33-TK400-600",
  "TP-Tanker-Alumax-Lac36": "HH-LMT36-TK400-600",
  "TP-Tanker-Lac800&1000KG": "HH-LMT-TK800-1000",

  "TP-Alumax-Than400kg": "HH-TMT-AL400",
  "TP-Alumax-Than600kg": "HH-TMT-AL600",

  "TP-JG-Than300kg": "HH-TMT-JG300",
  "TP-JG-Than400kg": "HH-TMT-JG400",
  "TP-JG-Than500kg": "HH-TMT-JG500",
  "TP-JG-Than600kg": "HH-TMT-JG600",
  "TP-JG-Than800kg": "HH-TMT-JG800",
  "TP-JG-Than1000kg": "HH-TMT-JG1000",
  "TP-JG-Than1500kg": "HH-TMT-JG1500",
  "TP-JG-HDK": "HH-HDKMT-JG",
  "TP-LacJG400-500-600KG": "HH-LMT-JG300-600",
  "TP-LacJG800KG": "HH-LMT-JG800-1000",

  "TP-MTT_BOSTEC-DON_THAN(P)": "HH-TMTDON-BOS-PHAI",
  "TP-MTT_BOSTEC-DON_THAN(T)": "HH-TMTDON-BOS-TRAI",
  "TP-MTT_BOSTEC-DOI_THAN(P)": "HH-TMTDOI-BOS-PHAI",
  "TP-MTT_BOSTEC-DOI_THAN(T)": "HH-TMTDOI-BOS-TRAI",
  "TP-MTT_BOSTEC-HOPDK": "HH-HDKMT-BOS",
  "TP-MTT-BOSTEC-TAYDK": "HH-TDK-BOS",
  "TP-MTT_CHTAIWAN-HOPDK": "HH-HDKMTDON-CH",

  // Raw Đài Loan sheet codes in older BOM rows. Finish/MSK stays a dimension; the stock identity
  // is the matching raw thickness/width code in Trang tính29.
  "NVL-TOLEKEM124_6D": "NVL-TON-DL6Dx124-STD",
  "NVL-TOLEKEM124_6D_MSK": "NVL-TON-DL6Dx124-STD",
  "NVL-TOLEKEM124_8D": "NVL-TON-DL8Dx124-STD",
  "NVL-TOLEKEM124_8D_MSK": "NVL-TON-DL8Dx124-STD",
  "NVL-TOLEKEM124_1LY": "NVL-TON-DL1LYx124-STD",

  // Lưới / phụ kiện exact-name stock identities.
  "TP-BUOMSAT": "NVL-BANBUOM-FE",
  "NVL-BATSNPHI19": "NVL-BAT-SN",
  "NVL-NHANSNPHI19": "NVL-NHAN",
  "NVL-BOSNPHI19": "NVL-BOLSN",
  "NVL-MONGNGUASNPHI19": "NVL-BOLSN",
  "NVL-TOLEKEM70_8D-YEMMV": "TP-TD327",
});

// Real Item identities that exist only as repeated BOM component codes in the current source set.
// Promotion is explicit and fail-closed: keep the exact BOM code, attach an audited atomic stock UOM,
// and allow it to satisfy other BOM references. Nothing outside this allowlist is auto-promoted.
export const ITEM_SOURCE_BOM_ITEM_PROMOTIONS = Object.freeze({
  "TP-YHTaiwan-HDK": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-PATCD": Object.freeze({ canonical_source_uom: "Bộ", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-LaYHTW300-400-500KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-LaYHTW600-700-800KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-LaYHTW1000-1200KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than300KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than400KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than500KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than600KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than700KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than800KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-YHTaiwan-Than1000KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),

  "TP_JG_PATCD": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-LacJG1000-1500KG": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-LacJG33": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-JG-BDN": Object.freeze({ canonical_source_uom: "Bộ", reason: "consistent_bom_component_uom" }),

  "TP-TANKER_PATCD": Object.freeze({ canonical_source_uom: "Bộ", reason: "consistent_bom_component_uom" }),
  "TP_YHLD_PATCD": Object.freeze({ canonical_source_uom: "Cái", reason: "consistent_bom_component_uom" }),
  "TP-ALUMAX_PATCD": Object.freeze({ canonical_source_uom: "Bộ", reason: "consistent_bom_component_uom" }),
  "TP-HDK_MULLER": Object.freeze({ canonical_source_uom: "Bộ", reason: "consistent_bom_component_uom" }),
  "NVL_Daydien_PATCD": Object.freeze({ canonical_source_uom: "Mét", reason: "consistent_bom_component_uom" }),

  "TP-LUOISN13x26_INOX": Object.freeze({ canonical_source_uom: "m2", reason: "consistent_bom_component_uom" }),
  "TP-LUOISN13x26_STD": Object.freeze({ canonical_source_uom: "Kg", reason: "consistent_bom_component_uom" }),
  "TP-LUOISNPHI19_INOX": Object.freeze({ canonical_source_uom: "m2", reason: "consistent_bom_component_uom" }),
  "NVL-LUOISNPHI19_STD": Object.freeze({ canonical_source_uom: "Kg", reason: "consistent_bom_component_uom" }),

  "MŨI MÀI HỘP KIM": Object.freeze({ canonical_source_uom: "Cái", reason: "explicit_bom_consumable_identity" }),
  "NVL-CNHUA": Object.freeze({ canonical_source_uom: "Cái", reason: "explicit_bom_component_identity" }),

  // DANH MỤC gives these exact source codes with purchase UOM KG.
  "RONNHUAVANGCẢNHAY_RSU100": Object.freeze({ canonical_source_uom: "Kg", reason: "danh_muc_exact_code_uom" }),
  "RONNHUAVANGCANHAY_RSU70": Object.freeze({ canonical_source_uom: "Kg", reason: "danh_muc_exact_code_uom" }),
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

export function resolveAlumdoorBomItemPromotion(sourceCode, sourceRole) {
  if (clean(sourceRole) !== ITEM_SOURCE_ROLES.BOM_REFERENCE) return null;
  const promotion = ITEM_SOURCE_BOM_ITEM_PROMOTIONS[clean(sourceCode)];
  if (!promotion) return null;
  return Object.freeze({
    status: "promoted_item",
    reason: promotion.reason,
    source_code_original: clean(sourceCode),
    canonical_item_code: clean(sourceCode),
    canonical_source_uom: promotion.canonical_source_uom,
    identity_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
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
