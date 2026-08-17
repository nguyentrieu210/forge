const cleanCode = (value) => String(value ?? "").trim();

export const ALUMDOOR_ITEM_SOURCE_AUTHORITY = Object.freeze({
  sellable_item_identity: "MS LIÊN BS.xlsx / ĐM / numbered product rows",
  stock_item_identity: "MS LIÊN BS.xlsx / Trang tính29 / MÃ NVL",
  stock_uom: "MS LIÊN BS.xlsx / Trang tính29 / ĐVT",
  bom_reference: "MS LIÊN BS.xlsx / ĐM / unnumbered component rows",
  physical_lot_evidence: "TỒN NHÔM 2026 NEW.xlsx",
  specification_and_color_policy: "QUY CÁCH (3).xlsx",
  production_and_cutting_rules: "25.7 QUY TRÌNH (2).docx",
});

export const ITEM_SOURCE_ROLES = Object.freeze({
  SELLABLE_PRODUCT: "sellable_product",
  STOCK_ITEM: "stock_item",
  BOM_REFERENCE: "bom_reference",
});

export const ITEM_SOURCE_EXCLUDED_PREFIXES = Object.freeze([
  "TRU-",
  "PHUTHU",
  "CPSTD_",
]);

// These source values are useful as BOM/evidence records but must not become canonical Item codes.
export const ITEM_SOURCE_EXCLUDED_CODES = Object.freeze({
  "NVL-LD-3LD": "aggregate_bom_helper",
  "NVL-LD-3LD-MSK": "aggregate_bom_helper",
  "NVL-INOX, NVL-NHUA, NVL-MOC": "composite_component_list_not_item_code",
  "CPVC": "service_or_cost_not_stock_item",
  "TIỀN CÔNG LẮP ĐẶT": "service_or_cost_not_stock_item",
  "TIỀN CÔNG CẮT LẠI CỬA": "service_or_cost_not_stock_item",
});

// High-confidence spellings found on unnumbered ĐM BOM/reference rows. They may resolve only
// when the caller explicitly identifies the row as BOM_REFERENCE. A numbered product row always
// keeps its own exact source Item code even if the same text also appears in this map.
export const ITEM_SOURCE_ALIASES = Object.freeze({
  "NVL_TDAL595THO": "NVL-AL595-THO",
  "NVL-TDAL70THO": "NVL-AL70(2LOP)-THO",
  "NVL-TDAL70GS": "NVL-AL70(2LOP)-GS",
  "NVL-TDAL70VK": "NVL-AL70(2LOP)-VK",
  "NVL-TD-AL71NTHO": "NVL-AL71-THO",
  "NVL-TD-AL71N GS": "NVL-AL71-GS",
  "NVL-TD-AL71N VK": "NVL-AL71-VK",
  "NVL-TD-AL503N26 VK": "NVL-AL503-VK",
  "NVL-TD-AL503N26 GS": "NVL-AL503-GS",
  "NVL-TD-AL503N26 THO": "NVL-AL503-THO",
  "NVL-TD-AL548N GS": "NVL-AL548-GS",
  "NVL-TD-AL548NTHO": "NVL-AL548-THO",
  "NVL-TD-AL548N VK": "NVL-AL548-VK",
  "NVL-TD-AL501N VK": "NVL-AL501-VK",
  "NVL-TD-AL501N GS": "NVL-AL501-GS",
  "NVL-TD-AL501N MSK": "NVL-AL501-THO",
  "NVL-ALD-DL552 VK": "NVL-AL552-VK",
  "NVL-ALD-DL552 THO": "NVL-AL552-THO",
  "NVL-ALD-DL552 GS": "NVL-AL552-GS",
  "NVL-ALD-DL752 GS": "NVL-AL752-GS",
  "NVL-ALD-DL752 VK": "NVL-AL752-VK",
  "NVL-ALD-DL752THO": "NVL-AL752-THO",
  "NVL-ALD-DL652 THO": "NVL-AL652-THO",
  "NVL-ALD-DL652 GS": "NVL-AL652-GS",
  "NVL-ALD-DL652 VK": "NVL-AL652-VK",
  "NVL-ALD-DL50 THO": "NVL-AL50-THO",
  "NVL-ALD-DL50 GS": "NVL-AL50-GS",
  "NVL-ALD-DL50VK": "NVL-AL50-VK",
  "NVL-VIP50GS": "NVL-ALVIP50-GS",
  "NVL-VIP50THO": "NVL-ALVIP50-THO",
  "NVL-VIPST500THO": "NVL-ALVIPST500-THO",
  "NVL-VIPST700THO": "NVL-ALVIPST700-THO",
  "NVL-BATFE": "NVL-BATSAT",
  "NVL-CONTAN12": "NVL-CONTAN12.12",
  "RNHUA-DR": "NVL-RNHUA-DR",
  "RNINOX-DR": "NVL-RINOX-DR",
  "NVL-RNINOX-DR": "NVL-RINOX-DR",
  "RON-DD": "NVL-RON-DD",
  "NVL-PULY-DEN": "NVL-PULY ĐEN",
  "NVL-BO1VIS AL70_2LOP": "NVL-BO1VIS-AL702LOP",
  "NVL-BO1VIS AL70_1LOP": "NVL-BO1VIS-AL701LOP",
  "NVL-BO1VIS AL75": "NVL-BO1VIS-AL75",
  "NVL-AL75THO": "NVL-AL75-THO",
  "NVL-AL75VK": "NVL-AL75-VK",
  "NVL-AL75 GS": "NVL-AL75-GS",
  "NVL-TOLE0.42x598-XN-VK": "NVL-TOLE0.42x598-XNVK",
  "NVL-TOLE0.42x598-TR-XLC": "NVL-TOLE0.42x598-TRXLC",
  "TP-BUOMINOX": "NVL-BANBUOM-INOX",
  "NVL-BO1VIS AL70": "NVL-BO1VIS-AL702LOP",
  "NVL-BO1VIS AL71": "NVL-BO1VIS-503N-71-595",
  "NVL-BO2VIS-548C-501C-AL652": "NVL-BO2VIS-652-548C",

  // Audit crosswalk round 2: exact stock/product targets already present in the canonical source set.
  "NVL-AL701LOPTHO": "NVL-AL70(1LOP)-THO",
  "TP_PAT_KHONGDAY": "TP-PAT_KHONGDAY",
  "NVL-BATMV": "NVL-BAT-MV",
  "NVL-DINHTANMV": "NVL-DINHTAN-MV",
  "NVL-CONTANMV": "NVL-CONTAN-MV",
  "TP-RAYINOX_8P_RON": "TP-RAYINOX-8P-RON",
  "TP-RAYINOX_6P_RON": "TP-RAYINOX-6P-RON",
  "NVL-BO2VIS-AL50-VIP50-AL548-ST500": "NVL-BO2VIS AL50-VIP50-548-ST500",
  "NVL-BO2VIS-501-552": "NVL-BO2VIS-501N-552",
  "NVL-BO2VIS-752-VIPST700": "NVL-BO2VIS-752-ST700",
  "NVL-BO1VIS-AL503C": "NVL-BO1VIS-503C",
  "NVL-BUOMSAT-DL": "NVL-BUOMFE-DL",
  "NVL-BUOMSAT-ST": "NVL-BUOMFE-ST",
  "NVL-LX-5.5 x 70 x 46V": "NVL-LX5.5x70x46V",
  "NVL-TOLE0.42x598-XR-CF": "NVL-TOLE0.42x598-XR-CAFE",
  "NVL-TOLE1.2x190-CORON": "NVL-TOLE1.2x190-RON",
  "TRUC114_1.8LY": "NVL-TR114-1.8",
  "NVL-TRUC114_1.8LY": "NVL-TR114-1.8",
  "NVL-TON3.8D-XN-VK": "NVL-TOLE0.35x598-XNVK",
  "NVL-TOLE0.42x598-KU-GU": "NVL-TOLE0.42x598-GUKU",
  "NVL-TOLE0.48x598-KU-GU": "NVL-TOLE0.48x598-GUKU",

  // Same audited profile families, written without spaces in older BOM rows.
  "NVL-ALD-DL50GS": "NVL-AL50-GS",
  "NVL-ALD-DL50THO": "NVL-AL50-THO",
  "NVL-ALD-DL552THO": "NVL-AL552-THO",
  "NVL-ALD-DL652GS": "NVL-AL652-GS",
  "NVL-ALD-DL652THO": "NVL-AL652-THO",
  "NVL-ALD-DL652VK": "NVL-AL652-VK",
  "NVL-TD-AL503N26THO": "NVL-AL503-THO",
});

// Same source code is intentionally one Item identity; finish/color belongs to master dimensions,
// not to a synthetic code split.
export const ITEM_SOURCE_SHARED_IDENTITIES = Object.freeze({
  "NVL-V5_KEM_STD": Object.freeze({
    dimensions: Object.freeze(["surface_finish"]),
    reason: "same V5 stock identity appears under different finish/pricing contexts",
  }),
  "NVL-AL70(1LOP)-GS": Object.freeze({
    dimensions: Object.freeze(["item_color"]),
    reason: "same stock identity appears with more than one color row",
  }),
  "NVL-AL75-VK": Object.freeze({
    dimensions: Object.freeze(["item_color"]),
    reason: "same stock identity appears with more than one color row",
  }),
});

// The source reuses this exact code for distinct numbered products. Numbered product identity must
// therefore fail closed. The audited stock targets are retained only as evidence for a BOM/reference
// resolver; they are not permission to rewrite a sellable product's original code.
export const ITEM_SOURCE_CONTEXTUAL_COLLISIONS = Object.freeze({
  "NVL-TON-ST-1LYx175-_MSK": Object.freeze([
    Object.freeze({ source_indexes: Object.freeze([351]), stock_reference_code: "NVL-TON-DL1.2LYx175-STD" }),
    Object.freeze({ source_indexes: Object.freeze([352, 353]), stock_reference_code: "NVL-TON-DL1.3LYx175-STD" }),
  ]),
});

export function classifyAlumdoorItemSourceCode(sourceCode, context = {}) {
  const sourceCodeOriginal = cleanCode(sourceCode);
  const sourceRole = cleanCode(context.source_role);
  if (!sourceCodeOriginal) {
    return Object.freeze({
      status: "blocked",
      reason: "blank_source_code",
      source_code_original: sourceCodeOriginal,
      canonical_item_code: "",
    });
  }

  const excludedPrefix = ITEM_SOURCE_EXCLUDED_PREFIXES.find((prefix) => sourceCodeOriginal.startsWith(prefix));
  if (excludedPrefix) {
    return Object.freeze({
      status: "excluded",
      reason: "pricing_or_adjustment_not_item",
      source_code_original: sourceCodeOriginal,
      canonical_item_code: "",
    });
  }

  if (ITEM_SOURCE_EXCLUDED_CODES[sourceCodeOriginal]) {
    return Object.freeze({
      status: "excluded",
      reason: ITEM_SOURCE_EXCLUDED_CODES[sourceCodeOriginal],
      source_code_original: sourceCodeOriginal,
      canonical_item_code: "",
    });
  }

  const contextualRules = ITEM_SOURCE_CONTEXTUAL_COLLISIONS[sourceCodeOriginal];
  if (contextualRules) {
    if (sourceRole === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT) {
      return Object.freeze({
        status: "blocked",
        reason: "duplicate_source_code_for_distinct_products",
        source_code_original: sourceCodeOriginal,
        canonical_item_code: "",
      });
    }
    if (sourceRole !== ITEM_SOURCE_ROLES.BOM_REFERENCE) {
      return Object.freeze({
        status: "blocked",
        reason: "source_role_required_for_collision",
        source_code_original: sourceCodeOriginal,
        canonical_item_code: "",
      });
    }
    const sourceIndex = Number(context.source_index);
    const matched = Number.isFinite(sourceIndex)
      ? contextualRules.find((rule) => rule.source_indexes.includes(sourceIndex))
      : null;
    if (!matched) {
      return Object.freeze({
        status: "blocked",
        reason: "context_required_for_collision",
        source_code_original: sourceCodeOriginal,
        canonical_item_code: "",
      });
    }
    return Object.freeze({
      status: "alias",
      reason: "contextual_bom_reference",
      source_code_original: sourceCodeOriginal,
      canonical_item_code: matched.stock_reference_code,
    });
  }

  const aliasTarget = ITEM_SOURCE_ALIASES[sourceCodeOriginal];
  if (aliasTarget) {
    if (sourceRole === ITEM_SOURCE_ROLES.BOM_REFERENCE) {
      return Object.freeze({
        status: "alias",
        reason: "audited_bom_reference_alias",
        source_code_original: sourceCodeOriginal,
        canonical_item_code: aliasTarget,
      });
    }
    if (sourceRole === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT || sourceRole === ITEM_SOURCE_ROLES.STOCK_ITEM) {
      return Object.freeze({
        status: "source",
        reason: "source_role_identity",
        source_code_original: sourceCodeOriginal,
        canonical_item_code: sourceCodeOriginal,
      });
    }
    return Object.freeze({
      status: "blocked",
      reason: "source_role_required_for_alias",
      source_code_original: sourceCodeOriginal,
      canonical_item_code: "",
    });
  }

  return Object.freeze({
    status: "source",
    reason: ITEM_SOURCE_SHARED_IDENTITIES[sourceCodeOriginal] ? "shared_identity_with_dimensions" : "source_identity",
    source_code_original: sourceCodeOriginal,
    canonical_item_code: sourceCodeOriginal,
  });
}

export function assertAlumdoorItemSourceContract() {
  for (const [source, target] of Object.entries(ITEM_SOURCE_ALIASES)) {
    if (!cleanCode(source) || !cleanCode(target)) throw new Error("Item source alias không được để trống");
    if (source === target) throw new Error(`Item source alias tự trỏ vào chính nó: ${source}`);
    if (ITEM_SOURCE_ALIASES[target]) throw new Error(`Item source alias phải trỏ thẳng vào canonical target, không được chain: ${source} -> ${target}`);
    if (ITEM_SOURCE_EXCLUDED_CODES[target]) throw new Error(`Item source alias trỏ vào mã bị loại: ${source} -> ${target}`);
    if (ITEM_SOURCE_EXCLUDED_PREFIXES.some((prefix) => target.startsWith(prefix))) {
      throw new Error(`Item source alias trỏ vào adjustment: ${source} -> ${target}`);
    }
  }

  for (const [source, rules] of Object.entries(ITEM_SOURCE_CONTEXTUAL_COLLISIONS)) {
    if (!rules.length) throw new Error(`Contextual collision không có rule: ${source}`);
    const seenIndexes = new Set();
    for (const rule of rules) {
      if (!cleanCode(rule.stock_reference_code)) throw new Error(`Contextual collision thiếu stock reference: ${source}`);
      for (const index of rule.source_indexes) {
        if (seenIndexes.has(index)) throw new Error(`Contextual collision trùng source_index ${index}: ${source}`);
        seenIndexes.add(index);
      }
    }
  }

  return true;
}
