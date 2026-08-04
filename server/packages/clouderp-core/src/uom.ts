import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import type { UomLine } from "./types.js";

const ONE = 1_000_000;
const SAFE_FIELDNAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function stockUomOf(master: JsonObject | null): string | undefined {
  const declared = master?.stock_uom;
  return typeof declared === "string" && declared.trim() ? declared.trim() : undefined;
}

function factorFromMaster(master: JsonObject | null, uom: string): number | undefined {
  const rows = master?.uom_conversions;
  if (!Array.isArray(rows)) return undefined;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const entry = row as JsonObject;
    if (typeof entry.uom !== "string" || entry.uom.trim() !== uom) continue;
    const raw = entry.conversion_factor;
    if (raw === undefined || raw === null || raw === "") continue;
    const factor = toScaledInt(raw as DecimalInput, 6, "conversion_factor");
    if (factor > 0) return factor;
  }
  return undefined;
}

export type UomTransactionKind = "purchase" | "sales" | "stock";

export interface ApplyUomOptions {
  transactionKind?: UomTransactionKind;
}

function itemText(master: JsonObject | null, fieldname: string): string {
  const value = master?.[fieldname];
  return typeof value === "string" ? value.trim() : "";
}

function transactionUomOf(line: UomLine, master: JsonObject | null, kind: UomTransactionKind): string {
  const declared = typeof line.uom === "string" ? line.uom.trim() : "";
  if (declared) return declared;
  const preferredField = kind === "purchase"
    ? "default_purchase_uom"
    : kind === "sales" ? "default_sales_uom" : "stock_uom";
  return itemText(master, preferredField) || stockUomOf(master) || "";
}

function allowedUoms(master: JsonObject | null): Set<string> {
  const result = new Set<string>();
  for (const fieldname of ["stock_uom", "default_purchase_uom", "default_sales_uom"]) {
    const value = itemText(master, fieldname);
    if (value) result.add(value);
  }
  const rows = master?.uom_conversions;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const value = (row as JsonObject).uom;
      if (typeof value === "string" && value.trim()) result.add(value.trim());
    }
  }
  return result;
}

function normalizedUom(value: string | undefined): string {
  return String(value ?? "").trim().toLocaleLowerCase("vi");
}

function usesDynamicSquareMetreToSet(master: JsonObject | null, uom: string): boolean {
  return itemText(master, "inventory_mode") === "Thành phẩm theo m2"
    && ["m2", "m²", "sqm"].includes(normalizedUom(uom))
    && ["bộ", "bo", "set"].includes(normalizedUom(stockUomOf(master)));
}

function dynamicSetStockQtyMicros(
  line: UomLine,
  master: JsonObject | null,
  uom: string,
  qtyMicros: number,
  index: number,
): number | undefined {
  if (!usesDynamicSquareMetreToSet(master, uom)) return undefined;
  const setsMicros = toScaledInt(line.set_count ?? 1, 6, `items[${index}].set_count`);
  if (setsMicros <= 0) throw errors.validation(`Số bộ phải lớn hơn 0 (dòng ${index + 1})`);
  const width = Number(line.width_m);
  const height = Number(line.height_m);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw errors.validation(`Hàng tính m² phải có rộng và cao lớn hơn 0 (dòng ${index + 1})`);
  }
  const minimumArea = Math.max(0, Number(master?.min_area_sqm) || 0);
  const setCount = Number(fromScaledInt(setsMicros, 6));
  const expectedQty = toScaledInt(Math.max(width * height, minimumArea) * setCount, 6, `items[${index}].qty`);
  if (Math.abs(expectedQty - qtyMicros) > 1) {
    throw errors.validation(`Số lượng m² không khớp kích thước, số bộ và diện tích tối thiểu của Item (dòng ${index + 1})`);
  }
  return setsMicros;
}

function resolveFactorMicros(line: UomLine, master: JsonObject | null, uom: string, index: number): number {
  if (master && uom && !allowedUoms(master).has(uom)) {
    throw errors.validation(
      `Mặt hàng ${line.item_code} (dòng ${index + 1}) không cho phép giao dịch theo ĐVT "${uom}". `
      + "Hãy khai ĐVT đó trong Hàng hoá → Đơn vị quy đổi khác trước khi dùng.",
    );
  }
  const declared = line.conversion_factor;
  if (declared !== undefined && declared !== null && declared !== "") {
    const factor = toScaledInt(declared, 6, `items[${index}].conversion_factor`);
    if (factor <= 0) throw errors.validation(`Hệ số quy đổi phải lớn hơn 0 (dòng ${index + 1})`);
    return factor;
  }
  const stockUom = stockUomOf(master);
  if (!uom || !stockUom || uom === stockUom) return ONE;
  const factor = factorFromMaster(master, uom);
  if (factor !== undefined) return factor;
  throw errors.validation(
    `Mặt hàng ${line.item_code} (dòng ${index + 1}): chưa có quy đổi từ "${uom}" sang đơn vị tồn "${stockUom}".`
    + ` Khai ở Hàng hoá → Quy đổi đơn vị, hoặc điền Hệ số quy đổi ngay trên dòng.`,
  );
}

function applyRateUnit<T extends UomLine>(
  item: T,
  master: JsonObject | null,
  uom: string | undefined,
  qtyMicros: number,
  index: number,
): Partial<UomLine> {
  const weightMicros = item.actual_weight_micros
    ?? (item.actual_weight_kg === undefined
      ? undefined
      : toScaledInt(item.actual_weight_kg, 6, `items[${index}].actual_weight_kg`));
  const weightPart = weightMicros === undefined
    ? {}
    : { actual_weight_micros: weightMicros, actual_weight_kg: fromScaledInt(weightMicros, 6) };

  const lineUom = uom ?? stockUomOf(master);
  const rateUom = item.rate_uom;
  if (!rateUom || rateUom === lineUom) return { ...weightPart, priced_qty_micros: qtyMicros };

  const weightUom = itemText(master, "weight_uom");
  if (rateUom === weightUom) {
    if (weightMicros === undefined) {
      throw errors.validation(
        `Mặt hàng ${item.item_code} (dòng ${index + 1}): đơn giá tính theo "${rateUom}" nhưng chưa cân.`
        + ` Điền Khối lượng thực (actual weight) — suy từ số lượng là bịa ra một phép cân chưa từng xảy ra.`,
      );
    }
    if (weightMicros <= 0) throw errors.validation(`Khối lượng thực phải lớn hơn 0 (dòng ${index + 1})`);
    return { ...weightPart, priced_qty_micros: weightMicros };
  }

  throw errors.validation(
    `Mặt hàng ${item.item_code} (dòng ${index + 1}): rate_uom "${rateUom}" không phải đơn vị giao dịch "${lineUom ?? "?"}"`
    + `${weightUom ? ` cũng không phải đơn vị khối lượng "${weightUom}"` : ", và mặt hàng không cân theo kiện"}.`
    + ` Đơn giá phải tính theo một trong hai — quy đổi ngầm sang đơn vị thứ ba là cách sai tiền quay lại lần nữa.`,
  );
}

export async function applyUomConversion<T extends UomLine>(
  context: ControllerContext<JsonObject>,
  items: T[],
  options: ApplyUomOptions = {},
): Promise<T[]> {
  const masters = new Map<string, JsonObject | null>();
  for (const item of items) {
    if (masters.has(item.item_code)) continue;
    masters.set(item.item_code, await context.reader.getMasterRecordData(context.command.tenant_id, "Item", item.item_code));
  }
  return items.map((item, index) => {
    const master = masters.get(item.item_code) ?? null;
    const transactionKind = options.transactionKind ?? "stock";
    const uom = transactionUomOf(item, master, transactionKind);
    const qtyMicros = item.qty_micros ?? toScaledInt(item.qty, 6, `items[${index}].qty`);
    const dynamicStockQty = dynamicSetStockQtyMicros(item, master, uom, qtyMicros, index);
    const factorMicros = dynamicStockQty === undefined
      ? resolveFactorMicros(item, master, uom, index)
      : toScaledInt(
          Number(fromScaledInt(dynamicStockQty, 6)) / Number(fromScaledInt(qtyMicros, 6)),
          6,
          `items[${index}].conversion_factor`,
        );
    const stockQty = dynamicStockQty ?? (factorMicros === ONE
      ? qtyMicros
      : multiplyScaled(
          fromScaledInt(qtyMicros, 6),
          6,
          fromScaledInt(factorMicros, 6),
          6,
          6,
          `items[${index}].stock_qty`,
        ));
    if (stockQty <= 0) throw errors.validation(`Số lượng quy đổi phải lớn hơn 0 (dòng ${index + 1})`);
    const stockUom = stockUomOf(master);
    const inventoryMode = itemText(master, "inventory_mode") || "Hàng thường";
    const measurementProfile = itemText(master, "measurement_profile");
    const purchaseAllocationQtyField = itemText(master, "purchase_allocation_qty_field");
    const purchaseAllocationUom = itemText(master, "purchase_allocation_uom");
    if (transactionKind === "purchase" && purchaseAllocationQtyField && !purchaseAllocationUom) {
      throw errors.validation(
        `Mặt hàng ${item.item_code}: purchase_allocation_qty_field phải đi cùng purchase_allocation_uom`,
      );
    }
    return {
      ...item,
      ...(uom ? { uom } : {}),
      conversion_factor: fromScaledInt(factorMicros, 6),
      conversion_factor_micros: factorMicros,
      ...(stockUom ? { stock_uom: stockUom } : {}),
      stock_qty: fromScaledInt(stockQty, 6),
      stock_qty_micros: stockQty,
      ...applyRateUnit(item, master, uom, qtyMicros, index),
      ...(master ? {
        inventory_mode: inventoryMode,
        measurement_profile: measurementProfile,
        has_catch_weight: master.has_catch_weight === true || master.has_catch_weight === 1,
        ...(typeof master.weight_uom === "string" ? { weight_uom: master.weight_uom } : {}),
        ...(purchaseAllocationQtyField ? { purchase_allocation_qty_field: purchaseAllocationQtyField } : {}),
        ...(purchaseAllocationUom ? { purchase_allocation_uom: purchaseAllocationUom } : {}),
      } : {}),
    };
  });
}

/** Canonical stock quantity. It is derived only from the declared stock UOM conversion. */
export function stockQtyMicros(line: UomLine): number {
  return line.stock_qty_micros ?? line.qty_micros ?? toScaledInt(line.qty, 6, "qty");
}

/**
 * Supplier-delivery obligation quantity may intentionally differ from stock/commercial quantity.
 * The Item master declares the line field and UOM that carry that axis; the server snapshots both
 * onto the document so historical allocation never depends on a vertical literal or mutable UI rule.
 */
export function purchaseAllocationQtyMicros(line: UomLine, index = 0): number {
  const data = line as JsonObject;
  const rawField = data.purchase_allocation_qty_field;
  const field = typeof rawField === "string" ? rawField.trim() : "";
  if (!field) return stockQtyMicros(line);
  if (!SAFE_FIELDNAME.test(field)) {
    throw errors.validation(`Mặt hàng ${line.item_code}: trường số lượng phân bổ mua không hợp lệ`);
  }
  const allocationUom = data.purchase_allocation_uom;
  if (typeof allocationUom !== "string" || !allocationUom.trim()) {
    throw errors.validation(`Mặt hàng ${line.item_code}: thiếu đơn vị của số lượng phân bổ mua`);
  }
  const raw = data[field];
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw errors.validation(`Mặt hàng ${line.item_code}: thiếu ${field} cho số lượng phân bổ mua (dòng ${index + 1})`);
  }
  const qty = toScaledInt(raw, 6, `items[${index}].${field}`);
  if (qty <= 0) {
    throw errors.validation(`Mặt hàng ${line.item_code}: ${field} phải lớn hơn 0 (dòng ${index + 1})`);
  }
  return qty;
}

export function pricedQtyMicros(line: UomLine): number {
  return line.priced_qty_micros ?? line.qty_micros ?? toScaledInt(line.qty, 6, "qty");
}
