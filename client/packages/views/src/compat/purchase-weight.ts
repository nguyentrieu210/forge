import type { Doc } from "@metaforge/core";

/**
 * Legacy purchase/receipt math retained only for compatibility tests and old consumers.
 *
 * This module is deliberately outside generic Form/ChildGrid runtime. New operational behavior
 * must come from canonical metadata plus named server/domain projections; do not call these helpers
 * from shared renderers.
 */
export interface AverageWeightResult {
  totalLengthM?: number;
  totalAreaSqm?: number;
  averageWeight?: number;
  basis?: "kg/m" | "kg/m²" | "kg/cây" | "kg/ĐVT";
}

/** @deprecated Domain-owned calculation; kept temporarily for compatibility callers only. */
export function derivePurchaseOrderBarem(row: Doc): number | undefined {
  const length = Number(row.length_m);
  const bars = Number(row.qty_bar);
  const kgPerM = Number(row.theoretical_kg_per_m);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(bars) || bars <= 0 || !Number.isFinite(kgPerM) || kgPerM <= 0) return undefined;
  return length * bars * kgPerM;
}

/** @deprecated Domain-owned calculation; kept temporarily for compatibility callers only. */
export function deriveAverageWeight(row: Doc): AverageWeightResult {
  const positive = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const uom = String(row.uom ?? "").trim().toLocaleLowerCase("vi");
  const isKg = ["kg", "kilogram", "ki-lô-gam"].includes(uom);
  const totalKg = isKg ? positive(row.qty) : positive(row.actual_weight_kg);
  const bars = positive(row.qty_bar);
  const length = positive(row.length_m);
  const quantity = positive(row.qty);
  const width = positive(row.width_m);
  const height = positive(row.height_m);
  const pieces = positive(row.set_count);
  const inventoryMode = String(row.inventory_mode ?? "").trim();
  const isAreaItem = inventoryMode === "Tấm/Kính" || inventoryMode === "Thành phẩm theo m2";
  const totalAreaSqm = isAreaItem && width > 0 && height > 0 && pieces > 0 ? width * height * pieces : undefined;
  const totalLengthM = bars > 0 && length > 0 ? bars * length : length || undefined;
  let divisor = 0;
  let basis: AverageWeightResult["basis"];
  if (totalAreaSqm) { divisor = totalAreaSqm; basis = "kg/m²"; }
  else if (totalLengthM) { divisor = totalLengthM; basis = "kg/m"; }
  else if (bars > 0) { divisor = bars; basis = "kg/cây"; }
  else if (!isKg && quantity > 0) { divisor = quantity; basis = "kg/ĐVT"; }
  return {
    ...(totalAreaSqm ? { totalAreaSqm } : {}),
    ...(totalLengthM ? { totalLengthM } : {}),
    ...(totalKg > 0 && divisor > 0 ? { averageWeight: totalKg / divisor, basis } : {}),
  };
}
