import {
  ITEM_SOURCE_ROLES,
  ITEM_SOURCE_SHARED_IDENTITIES,
  classifyAlumdoorItemSourceCode,
} from "./alumdoor-item-source-contract.mjs";
import {
  resolveAlumdoorBlankCodeEvidenceOverride,
  resolveAlumdoorBomEvidenceAlias,
  resolveAlumdoorBomItemPromotion,
  resolveAlumdoorUomEvidenceOverride,
} from "./alumdoor-item-evidence-overrides.mjs";

const clean = (value) => String(value ?? "").trim();

const ATOMIC_UOM_ALIASES = new Map([
  ["M²", "m2"],
  ["M2", "m2"],
  ["M", "Mét"],
  ["MÉT", "Mét"],
  ["KG", "Kg"],
  ["CON", "Con"],
  ["BỘ", "Bộ"],
  ["CÁI", "Cái"],
  ["CẶP", "Cặp"],
  ["CÂY", "Cây"],
  ["LÁ", "Lá"],
  ["THÂN", "Thân"],
  ["THANH", "Thanh"],
  ["SỢI", "Sợi"],
  ["CUỘN", "Cuộn"],
  ["TẤM", "Tấm"],
  ["TÚI", "Túi"],
  ["HỘP", "Hộp"],
  ["BÌNH", "Bình"],
  ["LÍT", "Lít"],
]);

function normalizeUomKey(value) {
  return clean(value).replace(/\s+/g, " ").toLocaleUpperCase("vi");
}

export function interpretAlumdoorSourceUom(sourceRole, sourceUom) {
  const raw = clean(sourceUom);
  if (!raw) {
    return Object.freeze({ status: "blocked", reason: "missing_source_uom", source_uom: raw });
  }

  const key = normalizeUomKey(raw);
  const atomic = ATOMIC_UOM_ALIASES.get(key);
  if (atomic) {
    return Object.freeze({
      status: "atomic",
      source_uom: raw,
      canonical_uom: atomic,
      requires_conversion: false,
    });
  }

  if (key === "KG/M") {
    if (sourceRole === ITEM_SOURCE_ROLES.STOCK_ITEM) {
      return Object.freeze({
        status: "dual_unit_basis",
        source_uom: raw,
        canonical_uom: "Kg",
        secondary_uom: "Mét",
        weight_uom: "Kg",
        requires_conversion: true,
        conversion_basis: "kg_per_m",
      });
    }
    if (sourceRole === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT) {
      return Object.freeze({
        status: "dual_unit_basis",
        source_uom: raw,
        canonical_uom: "Mét",
        secondary_uom: "Kg",
        weight_uom: "Kg",
        requires_conversion: true,
        conversion_basis: "kg_per_m",
      });
    }
    return Object.freeze({
      status: "rate_basis",
      source_uom: raw,
      canonical_uom: "",
      requires_conversion: true,
      conversion_basis: "kg_per_m",
    });
  }

  if (key.includes("/")) {
    return Object.freeze({
      status: "blocked",
      reason: "ambiguous_compound_uom",
      source_uom: raw,
    });
  }

  return Object.freeze({
    status: "blocked",
    reason: "unknown_source_uom",
    source_uom: raw,
  });
}

function normalizedRecord(raw, index) {
  const sourceRole = clean(raw.source_role);
  return {
    record_index: index,
    source_role: sourceRole,
    source_sheet: clean(raw.source_sheet),
    source_row: Number.isFinite(Number(raw.source_row)) ? Number(raw.source_row) : null,
    source_index: Number.isFinite(Number(raw.source_index)) ? Number(raw.source_index) : null,
    item_code: clean(raw.item_code),
    item_name: clean(raw.item_name),
    source_uom: clean(raw.source_uom),
    source_group: clean(raw.source_group),
    source_color: clean(raw.source_color),
  };
}

function applyIdentityEvidenceOverride(record) {
  const override = resolveAlumdoorBlankCodeEvidenceOverride(record);
  if (!override) {
    return {
      ...record,
      source_code_original: record.item_code,
      code_origin: "source",
      code_override_reason: null,
    };
  }
  return {
    ...record,
    source_code_original: record.item_code,
    item_code: override.canonical_item_code,
    code_origin: "explicit_evidence_override_for_blank_source",
    code_override_reason: override.reason,
  };
}

function resolveEffectiveUom(record) {
  const override = resolveAlumdoorUomEvidenceOverride(record);
  if (!override) {
    return {
      effective_source_uom: record.source_uom,
      uom_origin: "source",
      uom_override_reason: null,
    };
  }
  return {
    effective_source_uom: override.canonical_source_uom,
    uom_origin: "explicit_evidence_override",
    uom_override_reason: override.reason,
  };
}

function pushBlock(blockers, record, reason, detail = {}) {
  blockers.push({
    source_sheet: record.source_sheet,
    source_row: record.source_row,
    source_index: record.source_index,
    source_role: record.source_role,
    item_code: record.item_code,
    source_code_original: record.source_code_original ?? record.item_code,
    item_name: record.item_name,
    reason,
    ...detail,
  });
}

export function preflightAlumdoorItemSourceRecords(rawRecords) {
  if (!Array.isArray(rawRecords)) throw new Error("Item source records phải là array");

  const records = rawRecords.map(normalizedRecord).map(applyIdentityEvidenceOverride);
  const blockers = [];
  const excluded = [];
  const aliases = [];
  const promotions = [];
  const references = [];
  const identityRows = [];

  for (const record of records) {
    if (!Object.values(ITEM_SOURCE_ROLES).includes(record.source_role)) {
      pushBlock(blockers, record, "invalid_source_role");
      continue;
    }

    const evidenceAlias = resolveAlumdoorBomEvidenceAlias(record.item_code, record.source_role);
    const promotion = resolveAlumdoorBomItemPromotion(record.item_code, record.source_role);
    const classification = evidenceAlias ?? classifyAlumdoorItemSourceCode(record.item_code, {
      source_role: record.source_role,
      source_index: record.source_index,
    });

    if (classification.status === "excluded") {
      excluded.push({ ...record, reason: classification.reason });
      continue;
    }
    if (classification.status === "blocked") {
      pushBlock(blockers, record, classification.reason);
      continue;
    }
    if (classification.status === "alias") {
      aliases.push({
        ...record,
        canonical_item_code: classification.canonical_item_code,
        reason: classification.reason,
      });
      references.push({
        ...record,
        canonical_item_code: classification.canonical_item_code,
        reason: classification.reason,
      });
      continue;
    }

    if (promotion) {
      const uom = interpretAlumdoorSourceUom(promotion.identity_role, promotion.canonical_source_uom);
      if (uom.status === "blocked") {
        pushBlock(blockers, record, "invalid_bom_item_promotion_uom", {
          promotion_uom: promotion.canonical_source_uom,
          promotion_reason: promotion.reason,
        });
        continue;
      }
      const promoted = {
        ...record,
        identity_role: promotion.identity_role,
        effective_source_uom: promotion.canonical_source_uom,
        uom_origin: "explicit_bom_item_promotion",
        uom_override_reason: promotion.reason,
        canonical_item_code: promotion.canonical_item_code,
        source_classification_reason: "audited_bom_item_promotion",
        uom,
      };
      promotions.push({
        ...record,
        identity_role: promotion.identity_role,
        canonical_item_code: promotion.canonical_item_code,
        canonical_source_uom: promotion.canonical_source_uom,
        reason: promotion.reason,
      });
      identityRows.push(promoted);
      continue;
    }

    if (record.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE) {
      const uom = interpretAlumdoorSourceUom(record.source_role, record.source_uom);
      references.push({
        ...record,
        canonical_item_code: classification.canonical_item_code,
        reference_uom: uom,
        reason: classification.reason,
      });
      continue;
    }

    const uomEvidence = resolveEffectiveUom(record);
    const uom = interpretAlumdoorSourceUom(record.source_role, uomEvidence.effective_source_uom);
    if (uom.status === "blocked") {
      pushBlock(blockers, record, uom.reason, {
        source_uom: record.source_uom,
        effective_source_uom: uomEvidence.effective_source_uom,
      });
      continue;
    }

    identityRows.push({
      ...record,
      identity_role: record.source_role,
      effective_source_uom: uomEvidence.effective_source_uom,
      uom_origin: uomEvidence.uom_origin,
      uom_override_reason: uomEvidence.uom_override_reason,
      canonical_item_code: classification.canonical_item_code,
      source_classification_reason: classification.reason,
      uom,
    });
  }

  const rowsByCode = new Map();
  for (const row of identityRows) {
    const list = rowsByCode.get(row.canonical_item_code) ?? [];
    list.push(row);
    rowsByCode.set(row.canonical_item_code, list);
  }

  const accepted = [];
  for (const [itemCode, rows] of rowsByCode) {
    const sellableRows = rows.filter((row) => (row.identity_role ?? row.source_role) === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT);
    const stockRows = rows.filter((row) => (row.identity_role ?? row.source_role) === ITEM_SOURCE_ROLES.STOCK_ITEM);

    const sellableNames = [...new Set(sellableRows.map((row) => row.item_name).filter(Boolean))];
    if (
      sellableRows.length > 1
      && sellableNames.length > 1
      && !ITEM_SOURCE_SHARED_IDENTITIES[itemCode]
    ) {
      for (const row of sellableRows) {
        pushBlock(blockers, row, "duplicate_sellable_code_for_distinct_names", {
          item_code: itemCode,
          distinct_names: sellableNames,
        });
      }
      continue;
    }

    const stockUoms = [...new Set(stockRows.map((row) => row.uom.canonical_uom).filter(Boolean))];
    if (stockUoms.length > 1) {
      for (const row of stockRows) {
        pushBlock(blockers, row, "conflicting_stock_uom", {
          item_code: itemCode,
          stock_uoms: stockUoms,
        });
      }
      continue;
    }

    const stockUom = stockUoms[0] ?? "";
    const salesUoms = [...new Set(sellableRows.map((row) => row.uom.canonical_uom).filter(Boolean))];
    const requiresConversion = rows.some((row) => Boolean(row.uom.requires_conversion));

    accepted.push({
      item_code: itemCode,
      item_name: sellableNames[0]
        ?? stockRows.map((row) => row.item_name).find(Boolean)
        ?? itemCode,
      source_roles: [...new Set(rows.map((row) => row.source_role))],
      identity_roles: [...new Set(rows.map((row) => row.identity_role ?? row.source_role))],
      source_rows: rows.map((row) => ({
        source_sheet: row.source_sheet,
        source_row: row.source_row,
        source_index: row.source_index,
        source_role: row.source_role,
        identity_role: row.identity_role ?? row.source_role,
        source_code_original: row.source_code_original,
        code_origin: row.code_origin,
        source_uom: row.source_uom,
        effective_source_uom: row.effective_source_uom,
        uom_origin: row.uom_origin,
        uom_override_reason: row.uom_override_reason,
        item_name: row.item_name,
      })),
      stock_uom: stockUom,
      sales_uoms: salesUoms,
      requires_conversion: requiresConversion,
      conversion_bases: [...new Set(rows.map((row) => row.uom.conversion_basis).filter(Boolean))],
      colors: [...new Set(stockRows.map((row) => row.source_color).filter(Boolean))],
    });
  }

  const acceptedCodes = new Set(accepted.map((item) => item.item_code));
  for (const reference of references) {
    if (!reference.canonical_item_code) continue;
    if (!acceptedCodes.has(reference.canonical_item_code)) {
      pushBlock(blockers, reference, "unresolved_bom_reference", {
        canonical_item_code: reference.canonical_item_code,
      });
    }
  }

  return {
    source_record_count: records.length,
    accepted_count: accepted.length,
    alias_count: aliases.length,
    promotion_count: promotions.length,
    excluded_count: excluded.length,
    reference_count: references.length,
    blocker_count: blockers.length,
    accepted,
    aliases,
    promotions,
    excluded,
    references,
    blockers,
  };
}
