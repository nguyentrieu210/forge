import {
  assertCanonicalItemPayload,
  normalizeCanonicalItemGroup,
} from "./alumdoor-item-import-policy.mjs";
import { ITEM_SOURCE_ROLES } from "./alumdoor-item-source-contract.mjs";

const PARENT_GROUPS = new Set([
  "Tất cả mặt hàng",
  "Cửa thành phẩm",
  "Motor & điện",
  "Phụ kiện & vật tư",
]);

const MANUFACTURED_FINISHED_GROUPS = new Set([
  "Cửa CN Đức",
  "Cửa tấm liền Úc",
  "Cửa Đài Loan",
  "Cửa Đài Loan Inox",
  "Cửa Siêu Trường",
  "Cửa Lưới",
  "Cửa kéo Đài Loan",
]);

const TRADED_GROUPS = new Set([
  "Motor",
  "Bình lưu điện",
  "Điều khiển & phụ kiện điện",
]);

const MATERIAL_GROUPS = new Set([
  "Linh kiện motor",
  "Nan/lá cửa",
  "Ray và trục",
  "Phụ kiện chung",
  "Phụ kiện CN Đức",
  "Phụ kiện cần sơn tĩnh điện",
]);

const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.filter(Boolean))];

function sourceLocationKey(row) {
  const index = Number.isFinite(Number(row?.source_index)) ? Number(row.source_index) : "";
  const sourceRow = Number.isFinite(Number(row?.source_row)) ? Number(row.source_row) : "";
  return [
    clean(row?.source_role),
    clean(row?.source_sheet),
    sourceRow,
    index,
  ].join("|");
}

export function collectAlumdoorAcceptedSourceGroups(acceptedItem, rawRecords = []) {
  const direct = Array.isArray(acceptedItem?.source_groups)
    ? acceptedItem.source_groups.map(clean).filter(Boolean)
    : [];
  if (direct.length > 0) return unique(direct);

  const recordsByLocation = new Map();
  for (const raw of rawRecords) {
    const key = sourceLocationKey(raw);
    const list = recordsByLocation.get(key) ?? [];
    list.push(raw);
    recordsByLocation.set(key, list);
  }

  const groups = [];
  for (const row of acceptedItem?.source_rows ?? []) {
    // A promoted BOM-only component deliberately has no group authority yet.
    // Never inherit the parent BOM/product group as the component's Item Group.
    if (clean(row.source_role) === ITEM_SOURCE_ROLES.BOM_REFERENCE) continue;

    if (clean(row.source_group)) groups.push(clean(row.source_group));
    const matches = recordsByLocation.get(sourceLocationKey(row)) ?? [];
    for (const match of matches) {
      const group = clean(match.source_group);
      if (group) groups.push(group);
    }
  }
  return unique(groups);
}

function canonicalGroupEvidence(acceptedItem, rawRecords) {
  const sourceGroups = collectAlumdoorAcceptedSourceGroups(acceptedItem, rawRecords);
  if (sourceGroups.length === 0) {
    return {
      status: "blocked",
      reason: "missing_item_group_evidence",
      source_groups: [],
    };
  }

  const canonical = [];
  for (const sourceGroup of sourceGroups) {
    try {
      canonical.push(normalizeCanonicalItemGroup(sourceGroup));
    } catch (error) {
      return {
        status: "blocked",
        reason: "noncanonical_item_group",
        source_groups: sourceGroups,
        message: error.message,
      };
    }
  }
  const groups = unique(canonical);
  if (groups.length !== 1) {
    return {
      status: "blocked",
      reason: "conflicting_item_group_evidence",
      source_groups: sourceGroups,
      canonical_groups: groups,
    };
  }
  const itemGroup = groups[0];
  if (PARENT_GROUPS.has(itemGroup)) {
    return {
      status: "blocked",
      reason: "parent_item_group_not_assignable",
      source_groups: sourceGroups,
      item_group: itemGroup,
    };
  }
  if (
    !MANUFACTURED_FINISHED_GROUPS.has(itemGroup)
    && !TRADED_GROUPS.has(itemGroup)
    && !MATERIAL_GROUPS.has(itemGroup)
  ) {
    return {
      status: "blocked",
      reason: "item_group_has_no_master_policy",
      source_groups: sourceGroups,
      item_group: itemGroup,
    };
  }
  return { status: "accepted", source_groups: sourceGroups, item_group: itemGroup };
}

function hasKgRateBasis(acceptedItem) {
  return (acceptedItem?.source_rows ?? []).some((row) => (
    clean(row.conversion_basis).startsWith("kg_per_")
  ));
}

function resolveStockUom(acceptedItem, itemGroup) {
  if (MANUFACTURED_FINISHED_GROUPS.has(itemGroup)) {
    // Finished doors are counted as physical sets while commercial dimensions
    // are calculated per transaction by the "Thành phẩm theo m2" profile.
    return "Bộ";
  }
  const explicit = clean(acceptedItem?.stock_uom);
  if (explicit) return explicit;
  if (hasKgRateBasis(acceptedItem)) return "Kg";
  const salesUoms = unique((acceptedItem?.sales_uoms ?? []).map(clean));
  return salesUoms.length === 1 ? salesUoms[0] : "";
}

function resolveMeasurementProfile(itemGroup, stockUom) {
  if (MANUFACTURED_FINISHED_GROUPS.has(itemGroup)) return "Thành phẩm theo m2";
  if (itemGroup === "Nan/lá cửa") return "Nhôm cây/lá";
  if (itemGroup === "Ray và trục") return stockUom === "Kg" ? "Ống/trục" : "Nhôm cây/lá";
  return "Hàng thường";
}

function staticSalesConversion(acceptedItem, stockUom, salesUom, itemGroup) {
  if (!salesUom || salesUom === stockUom) return { status: "accepted", rows: [] };

  // Door area-to-set conversion is geometry-dependent per sales/production line,
  // never a static Item conversion factor.
  if (MANUFACTURED_FINISHED_GROUPS.has(itemGroup)) {
    return { status: "accepted", rows: [] };
  }

  const factors = unique((acceptedItem?.conversion_factors ?? [])
    .map((row) => Number(row?.conversion_factor))
    .filter((value) => Number.isFinite(value) && value > 0));
  if (factors.length === 0) {
    return {
      status: "blocked",
      reason: "missing_static_sales_uom_conversion",
      stock_uom: stockUom,
      sales_uom: salesUom,
    };
  }
  if (factors.length > 1) {
    return {
      status: "blocked",
      reason: "conflicting_static_sales_uom_conversion",
      stock_uom: stockUom,
      sales_uom: salesUom,
      conversion_factors: factors,
    };
  }
  return {
    status: "accepted",
    rows: [{ uom: salesUom, conversion_factor: factors[0] }],
  };
}

export function buildCanonicalAlumdoorItemPayload(acceptedItem, rawRecords = []) {
  const itemCode = clean(acceptedItem?.item_code);
  if (!itemCode) return { status: "blocked", reason: "missing_item_code" };

  const groupEvidence = canonicalGroupEvidence(acceptedItem, rawRecords);
  if (groupEvidence.status !== "accepted") {
    return { item_code: itemCode, ...groupEvidence };
  }
  const itemGroup = groupEvidence.item_group;
  const identityRoles = new Set(acceptedItem?.identity_roles ?? acceptedItem?.source_roles ?? []);
  const hasSellable = identityRoles.has(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT);

  if (MANUFACTURED_FINISHED_GROUPS.has(itemGroup) && !hasSellable) {
    return {
      status: "blocked",
      reason: "manufactured_finished_item_missing_sellable_source",
      item_code: itemCode,
      item_group: itemGroup,
    };
  }

  const stockUom = resolveStockUom(acceptedItem, itemGroup);
  if (!stockUom) {
    return {
      status: "blocked",
      reason: "missing_stock_uom_after_classification",
      item_code: itemCode,
      item_group: itemGroup,
    };
  }

  const salesUoms = unique((acceptedItem?.sales_uoms ?? []).map(clean));
  if (hasSellable && salesUoms.length !== 1) {
    return {
      status: "blocked",
      reason: salesUoms.length === 0 ? "missing_sales_uom" : "conflicting_sales_uom",
      item_code: itemCode,
      item_group: itemGroup,
      sales_uoms: salesUoms,
    };
  }
  const salesUom = hasSellable ? salesUoms[0] : "";

  const manufactured = MANUFACTURED_FINISHED_GROUPS.has(itemGroup);
  const purchased = TRADED_GROUPS.has(itemGroup) || MATERIAL_GROUPS.has(itemGroup);
  const materialStage = manufactured
    ? "Thành phẩm"
    : TRADED_GROUPS.has(itemGroup)
      ? "Hàng hoá"
      : "Nguyên vật liệu";
  const supplyType = manufactured ? "Tự sản xuất" : "Mua ngoài";

  const conversion = staticSalesConversion(acceptedItem, stockUom, salesUom, itemGroup);
  if (conversion.status !== "accepted") {
    return { item_code: itemCode, item_group: itemGroup, ...conversion };
  }

  const payload = {
    doctype: "Item",
    item_code: itemCode,
    item_name: clean(acceptedItem.item_name) || itemCode,
    item_group: itemGroup,
    item_nature: "Hàng tồn kho",
    material_stage: materialStage,
    supply_type: supplyType,
    is_stock_item: 1,
    is_purchase_item: purchased ? 1 : 0,
    is_sales_item: hasSellable ? 1 : 0,
    is_fixed_asset: 0,
    include_item_in_manufacturing: 1,
    is_sub_contracted_item: 0,
    stock_uom: stockUom,
    default_purchase_uom: purchased ? stockUom : "",
    default_sales_uom: salesUom,
    measurement_profile: resolveMeasurementProfile(itemGroup, stockUom),
    disabled: 0,
    uom_conversions: conversion.rows,
  };

  try {
    assertCanonicalItemPayload(payload);
  } catch (error) {
    return {
      status: "blocked",
      reason: "canonical_item_payload_validation_failed",
      item_code: itemCode,
      item_group: itemGroup,
      message: error.message,
    };
  }

  return {
    status: "accepted",
    item_code: itemCode,
    source_groups: groupEvidence.source_groups,
    payload,
  };
}

export function buildCanonicalAlumdoorItemMaster(preflight, rawRecords = []) {
  if (!preflight || !Array.isArray(preflight.accepted)) {
    throw new Error("Item preflight phải có accepted array");
  }
  if (!Array.isArray(rawRecords)) throw new Error("rawRecords phải là array");

  const accepted = [];
  const blockers = [];
  for (const item of preflight.accepted) {
    const result = buildCanonicalAlumdoorItemPayload(item, rawRecords);
    if (result.status === "accepted") accepted.push(result);
    else blockers.push(result);
  }

  return {
    source_item_count: preflight.accepted.length,
    accepted_count: accepted.length,
    blocker_count: blockers.length,
    payloads: accepted.map((row) => row.payload),
    accepted,
    blockers,
  };
}
