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

function assertAllowedUom(line: UomLine, master: JsonObject | null, uom: string, index: number): void {
  if (master && uom && !allowedUoms(master).has(uom)) {
    throw errors.validation(
      `Mặt hàng ${line.item_code} (dòng ${index + 1}) không cho phép giao dịch theo ĐVT "${uom}". `
      + "Khai ĐVT đó làm ĐVT mua/bán mặc định hoặc trong bảng quy đổi trước khi dùng.",
    );
  }
}

function normalizedUom(value: string | undefined): string {
  return String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
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
  _qtyMicros: number,
  index: number,
): number | undefined {
  if (!usesDynamicSquareMetreToSet(master, uom)) return undefined;
  const setsMicros = toScaledInt(line.set_count ?? 1, 6, `items[${index}].set_count`);
  if (setsMicros <= 0) throw errors.validation(`Số bộ phải lớn hơn 0 (dòng ${index + 1})`);
  /**
   * UOM core chỉ đổi trục m² thương mại sang số Bộ tồn kho. Nó không được tự quyết m² bán:
   * cửa có thể dùng PB ray, PB nhựa hoặc rộng cắt theo policy/nhóm khách, nên `width × height`
   * ở tầng dùng chung vừa trùng luật vừa có thể mâu thuẫn với app validator. App/runtime policy
   * chịu trách nhiệm chốt transaction qty trước khi đi tới đây; stock snapshot chỉ là số bộ.
   */
  return setsMicros;
}

function lineQuantityMicros(line: UomLine, field: string, index: number, label: string): number {
  if (!SAFE_FIELDNAME.test(field)) {
    throw errors.validation(`Mặt hàng ${line.item_code}: ${label} khai trường không hợp lệ`);
  }
  const raw = (line as JsonObject)[field];
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw errors.validation(`Mặt hàng ${line.item_code}: thiếu ${field} cho ${label} (dòng ${index + 1})`);
  }
  const qty = toScaledInt(raw, 6, `items[${index}].${field}`);
  if (qty <= 0) throw errors.validation(`Mặt hàng ${line.item_code}: ${field} phải lớn hơn 0 (dòng ${index + 1})`);
  return qty;
}

function ratioFactorMicros(stockQtyMicros: number, transactionQtyMicros: number, index: number): number {
  if (transactionQtyMicros <= 0) throw errors.validation(`Số lượng giao dịch phải lớn hơn 0 (dòng ${index + 1})`);
  return toScaledInt(
    Number(fromScaledInt(stockQtyMicros, 6)) / Number(fromScaledInt(transactionQtyMicros, 6)),
    6,
    `items[${index}].conversion_factor`,
  );
}

function declaredFactorMicros(line: UomLine, index: number): number | undefined {
  const declared = line.conversion_factor;
  if (declared === undefined || declared === null || declared === "") return undefined;
  const factor = toScaledInt(declared, 6, `items[${index}].conversion_factor`);
  if (factor <= 0) throw errors.validation(`Hệ số quy đổi phải lớn hơn 0 (dòng ${index + 1})`);
  return factor;
}

function resolveFactorMicros(line: UomLine, master: JsonObject | null, uom: string, index: number): number {
  assertAllowedUom(line, master, uom, index);
  const declared = declaredFactorMicros(line, index);
  if (declared !== undefined) return declared;
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
  // Hidden micros are server snapshots returned by REST. A normal edit keeps them in the row,
  // so trusting them would make a changed decimal value bill/post the old quantity. Always
  // rebuild from the visible canonical value on every mutation.
  const weightMicros = item.actual_weight_kg === undefined
    || item.actual_weight_kg === null
    || item.actual_weight_kg === ""
    ? undefined
    : toScaledInt(item.actual_weight_kg, 6, `items[${index}].actual_weight_kg`);
  const weightPart = weightMicros === undefined
    ? {}
    : { actual_weight_micros: weightMicros, actual_weight_kg: fromScaledInt(weightMicros, 6) };

  const lineUom = uom ?? stockUomOf(master);
  const rateUom = item.rate_uom;
  if (!rateUom || rateUom === lineUom) {
    return { ...weightPart, ...(lineUom ? { rate_uom: lineUom } : {}), priced_qty_micros: qtyMicros };
  }

  const weightUom = itemText(master, "weight_uom");
  const hasCatchWeight = master?.has_catch_weight === true || master?.has_catch_weight === 1;
  if (rateUom === weightUom) {
    if (!hasCatchWeight) {
      throw errors.validation(
        `Mặt hàng ${item.item_code} (dòng ${index + 1}) không được cấu hình cân theo kiện; không thể tính giá theo "${rateUom}".`,
      );
    }
    if (weightMicros === undefined) {
      throw errors.validation(
        `Mặt hàng ${item.item_code} (dòng ${index + 1}): đơn giá tính theo "${rateUom}" nhưng chưa cân.`
        + ` Điền Khối lượng thực (actual weight) — suy từ số lượng là bịa ra một phép cân chưa từng xảy ra.`,
      );
    }
    if (weightMicros <= 0) throw errors.validation(`Khối lượng thực phải lớn hơn 0 (dòng ${index + 1})`);
    return { ...weightPart, rate_uom: weightUom, priced_qty_micros: weightMicros };
  }

  throw errors.validation(
    `Mặt hàng ${item.item_code} (dòng ${index + 1}): rate_uom "${rateUom}" không phải đơn vị giao dịch "${lineUom ?? "?"}"`
    + `${weightUom ? ` cũng không phải đơn vị khối lượng "${weightUom}"` : ", và mặt hàng không cân theo kiện"}.`
    + ` Đơn giá phải tính theo một trong hai — quy đổi ngầm sang đơn vị thứ ba là cách sai tiền quay lại lần nữa.`,
  );
}

/**
 * TRỤC SỐ LƯỢNG MUA của hàng đếm-được-cân-thực-tế — SERVER TỰ TÍNH, không ai gõ tay.
 *
 * Ba ô `purchase_stock_qty_field` / `purchase_allocation_qty_field` / `purchase_allocation_uom`
 * trên `Item` khai `valueSource: "formula"` + `read_only` + `hidden`: hợp đồng metadata nói
 * SERVER tính chúng. Nhưng không có chỗ nào tính, nên chúng rỗng vĩnh viễn — và hai luật khác
 * lại ĐỌC chúng:
 *
 *   · `aluminumItemContract` (alumdoor-worker) TỪ CHỐI lưu mặt hàng nhôm khi ba ô này khác
 *     `qty_bar`/`qty_bar`/`stock_uom`. Ô thì chỉ-đọc, gửi lên thì kernel ném "Field is
 *     server-controlled". Đo ngày 21/08/2026 trên cổng 8810: KHÔNG tạo nổi một mã
 *     `Nhôm cây/lá` nào qua API — nhóm hàng lõi của xưởng đứng hình, lỗi lại trỏ vào ô
 *     người dùng không nhìn thấy.
 *   · `applyUomConversion` ngay bên dưới: thiếu `purchase_stock_qty_field` thì lượt mua rơi
 *     về `resolveFactorMicros`, mà hàng catch-weight CỐ Ý không có hệ số Kg↔Cây tĩnh, nên
 *     phiếu mua chết với "chưa có quy đổi từ Kg sang đơn vị tồn Cây".
 *
 * Nên trục này được TÍNH LẠI ở mỗi lượt ghi `Item`, đúng như `fetch_from` được tính lại: giá
 * trị client gửi lên bị thay, không phải bị tin.
 *
 * Trả về chuỗi rỗng cho mặt hàng không thuộc kiểu này — rỗng là "xoá ô", không phải "giữ
 * nguyên ô cũ"; đổi một mã từ nhôm sang hàng thường mà để lại `qty_bar` là để lại một luật
 * ngủ đúng chỗ nguy hiểm nhất.
 */
export interface PurchaseQuantityAxis {
  purchase_stock_qty_field: string;
  purchase_allocation_qty_field: string;
  purchase_allocation_uom: string;
}

export function derivePurchaseQuantityAxis(item: JsonObject | null): PurchaseQuantityAxis {
  const trong: PurchaseQuantityAxis = {
    purchase_stock_qty_field: "",
    purchase_allocation_qty_field: "",
    purchase_allocation_uom: "",
  };
  if (!item) return trong;
  if (itemText(item, "inventory_mode") !== "Nhôm cây/lá") return trong;
  const stockUom = stockUomOf(item);
  if (!stockUom) return trong;
  return {
    purchase_stock_qty_field: "qty_bar",
    purchase_allocation_qty_field: "qty_bar",
    purchase_allocation_uom: stockUom,
  };
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
    // `qty_micros` có thể là snapshot cũ từ lần GET trước; qty hiện tại luôn là nguồn thật.
    const qtyMicros = toScaledInt(item.qty, 6, `items[${index}].qty`);
    const purchaseStockQtyField = transactionKind === "purchase" ? itemText(master, "purchase_stock_qty_field") : "";
    if (purchaseStockQtyField && !SAFE_FIELDNAME.test(purchaseStockQtyField)) {
      throw errors.validation(`Mặt hàng ${item.item_code}: purchase_stock_qty_field không hợp lệ`);
    }
    const exactPurchaseStockQty = purchaseStockQtyField
      ? lineQuantityMicros(item, purchaseStockQtyField, index, "số lượng tồn mua")
      : undefined;
    const dynamicStockQty = dynamicSetStockQtyMicros(item, master, uom, qtyMicros, index);
    if (exactPurchaseStockQty !== undefined && dynamicStockQty !== undefined) {
      throw errors.validation(`Mặt hàng ${item.item_code}: có hai nguồn số lượng tồn mua cùng lúc`);
    }

    let factorMicros: number;
    if (exactPurchaseStockQty !== undefined) {
      // Exact observed stock quantity is the authority. This is the dual-measure/catch-weight
      // path: 568.7 kg can be 200 counted bars, so there is no truthful static kg->bar factor
      // to keep on Item master. Derive the per-line factor from the two observations. If an old
      // client still sends a factor, accept it only when it agrees with the derived value.
      assertAllowedUom(item, master, uom, index);
      const expectedFactor = ratioFactorMicros(exactPurchaseStockQty, qtyMicros, index);
      const declared = declaredFactorMicros(item, index);
      if (declared !== undefined && Math.abs(declared - expectedFactor) > 1) {
        throw errors.validation(
          `Mặt hàng ${item.item_code} (dòng ${index + 1}): hệ số quy đổi không khớp ${purchaseStockQtyField}`,
        );
      }
      factorMicros = expectedFactor;
    } else if (dynamicStockQty !== undefined) {
      factorMicros = ratioFactorMicros(dynamicStockQty, qtyMicros, index);
    } else {
      factorMicros = resolveFactorMicros(item, master, uom, index);
    }

    const stockQty = exactPurchaseStockQty ?? dynamicStockQty ?? (factorMicros === ONE
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
    if (transactionKind === "purchase" && Boolean(purchaseAllocationQtyField) !== Boolean(purchaseAllocationUom)) {
      throw errors.validation(
        `Mặt hàng ${item.item_code}: purchase_allocation_qty_field và purchase_allocation_uom phải được khai cùng nhau`,
      );
    }
    if (purchaseAllocationQtyField && !SAFE_FIELDNAME.test(purchaseAllocationQtyField)) {
      throw errors.validation(`Mặt hàng ${item.item_code}: purchase_allocation_qty_field không hợp lệ`);
    }
    // Drop every client/persisted integer snapshot before rebuilding it below. Keeping a stale
    // key with `undefined` is not enough under exact optional types and is easy to serialize
    // inconsistently; omitting it makes the authority boundary explicit.
    const {
      qty_micros: _clientQtyMicros,
      conversion_factor_micros: _clientFactorMicros,
      stock_qty_micros: _clientStockQtyMicros,
      priced_qty_micros: _clientPricedQtyMicros,
      actual_weight_micros: _clientWeightMicros,
      purchase_stock_qty_field: _clientPurchaseStockQtyField,
      purchase_allocation_qty_field: _clientPurchaseAllocationQtyField,
      purchase_allocation_uom: _clientPurchaseAllocationUom,
      ...canonicalItem
    } = item;
    const normalized: UomLine = {
      ...canonicalItem,
      item_code: item.item_code,
      qty: fromScaledInt(qtyMicros, 6),
      qty_micros: qtyMicros,
      ...(uom ? { uom } : {}),
      conversion_factor: fromScaledInt(factorMicros, 6),
      conversion_factor_micros: factorMicros,
      ...(stockUom ? { stock_uom: stockUom } : {}),
      stock_qty: fromScaledInt(stockQty, 6),
      stock_qty_micros: stockQty,
      ...applyRateUnit(item, master, uom, qtyMicros, index),
      // Quantity-axis authority is master data. Always overwrite/clear client-supplied descriptors.
      ...(purchaseStockQtyField ? { purchase_stock_qty_field: purchaseStockQtyField } : {}),
      ...(purchaseAllocationQtyField ? { purchase_allocation_qty_field: purchaseAllocationQtyField } : {}),
      ...(purchaseAllocationUom ? { purchase_allocation_uom: purchaseAllocationUom } : {}),
      ...(master ? {
        inventory_mode: inventoryMode,
        measurement_profile: measurementProfile,
        has_catch_weight: master.has_catch_weight === true || master.has_catch_weight === 1,
        ...(typeof master.weight_uom === "string" ? { weight_uom: master.weight_uom } : {}),
      } : {}),
    };
    // `canonicalItem` preserves every caller-specific child-row property; this function only
    // replaces the shared UOM snapshots declared by UomLine.
    return normalized as T;
  });
}

/** Canonical stock quantity. It is always the server-snapshotted stock-UOM quantity. */
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
  const allocationUom = data.purchase_allocation_uom;
  if (typeof allocationUom !== "string" || !allocationUom.trim()) {
    throw errors.validation(`Mặt hàng ${line.item_code}: thiếu đơn vị của số lượng phân bổ mua`);
  }
  return lineQuantityMicros(line, field, index, "số lượng phân bổ mua");
}

export function pricedQtyMicros(line: UomLine): number {
  return line.priced_qty_micros ?? line.qty_micros ?? toScaledInt(line.qty, 6, "qty");
}
