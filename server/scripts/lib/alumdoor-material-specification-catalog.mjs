/**
 * Canonical Alumdoor Material Specification policy.
 *
 * Material Specification owns intrinsic technical facts of a material:
 * section/profile code, material grade, thickness, standard geometry and kg/m.
 * It does NOT own stock/purchase UOM, lot measurement rules, cutting formulas,
 * leaf-count geometry, pricing or BOM quantities.
 *
 * The evidence-backed target list is intentionally loaded from the existing
 * atomic Item standardization source. This module is the single authority for
 * turning those targets into Material Specification records.
 */
export const MATERIAL_SPECIFICATION_TYPES = Object.freeze([
  "Nhôm cây/lá",
  "Ống/trục",
  "Tấm/Kính",
  "Cuộn",
  "Vật tư tuyến tính",
  "Khác",
]);

const SUPPLIER = "TIẾN ĐẠT";

export function materialSpecificationCodeForTarget(target) {
  return `ĐM-${target.supplierCode ?? target.itemCode}`;
}

export function materialSpecificationTypeForTarget(target) {
  if (target.specType) return target.specType;
  if (target.inventoryMode === "Nhôm cây/lá") return "Nhôm cây/lá";
  if (Number(target.kgPerM) > 0) return "Vật tư tuyến tính";
  return "Khác";
}

export function materialSpecificationFromTarget(target) {
  const specCode = materialSpecificationCodeForTarget(target);
  const specType = materialSpecificationTypeForTarget(target);
  if (!MATERIAL_SPECIFICATION_TYPES.includes(specType)) {
    throw new Error(`Loại quy cách không hợp lệ cho ${target.itemCode}: ${specType}`);
  }
  const kgPerM = Number(target.kgPerM);
  if (!(kgPerM > 0)) throw new Error(`Thiếu kg/m kỹ thuật cho ${target.itemCode}`);
  if (!target.itemGroup) throw new Error(`Thiếu nhóm hàng cho ${target.itemCode}`);

  const payload = {
    spec_code: specCode,
    spec_name: `Quy cách ${target.itemName}`,
    item_group: target.itemGroup,
    spec_type: specType,
    profile_system: target.supplierCode ? SUPPLIER : "ALUMDOOR",
    theoretical_kg_per_m: kgPerM,
    ...(specType === "Nhôm cây/lá" || specType === "Ống/trục"
      ? { section_code: target.sectionCode ?? target.supplierCode ?? target.itemCode }
      : {}),
    ...(Number(target.thicknessMm) > 0 ? { thickness_mm: Number(target.thicknessMm) } : {}),
    note: `Barem kỹ thuật ${kgPerM} kg/m; dùng để đối chiếu/quy đổi kỹ thuật, không tự sinh số lượng mua, tồn, cắt hay BOM.`,
    disabled: false,
    _migration_source: "alumdoor-material-specification-canonical-2026-08-16",
  };
  return Object.freeze({
    specCode,
    itemCode: target.itemCode,
    itemName: target.itemName,
    itemGroup: target.itemGroup,
    specType,
    kgPerM,
    payload: Object.freeze(payload),
  });
}

export async function loadMaterialSpecificationCatalog(repoRoot) {
  // Dynamic import avoids a module-initialization cycle: item-standardization
  // imports the pure helpers above, while this catalogue loader reuses its
  // already-audited 17 atomic kg/m targets.
  const { loadKgItems } = await import("./alumdoor-item-standardization.mjs");
  const targets = await loadKgItems(repoRoot);
  const rows = targets.map(materialSpecificationFromTarget);
  const duplicateSpecs = rows.filter((row, index) => rows.findIndex((x) => x.specCode === row.specCode) !== index);
  const duplicateItems = rows.filter((row, index) => rows.findIndex((x) => x.itemCode === row.itemCode) !== index);
  if (duplicateSpecs.length) throw new Error(`Mã quy cách bị lặp: ${duplicateSpecs.map((x) => x.specCode).join(", ")}`);
  if (duplicateItems.length) throw new Error(`Item có nhiều quy cách canonical: ${duplicateItems.map((x) => x.itemCode).join(", ")}`);
  return Object.freeze(rows);
}
