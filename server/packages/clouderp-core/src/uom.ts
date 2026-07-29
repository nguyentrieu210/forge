/**
 * Quy đổi đơn vị tính: mua theo CÂY, tồn theo MÉT.
 *
 * Đây là chỗ mà mọi phần mềm kho đều phải có và là chỗ dễ bỏ quên nhất, vì thiếu nó thì
 * KHÔNG có gì báo lỗi — chỉ có một con số tồn kho sai lặng lẽ. Xưởng mua ray theo cây,
 * bán theo mét; mua nan nhôm theo kg, tính theo m². Ghi thẳng `qty` vào sổ kho nghĩa là
 * 20 cây ray thành "tồn 20 mét", sai gần sáu lần, và giá vốn mỗi bộ cửa sai theo.
 *
 *     stock_qty = qty × conversion_factor
 *
 * Ba quy tắc, theo đúng thứ tự:
 *
 *   1. Dòng tự khai `conversion_factor` → dùng luôn. Cây nhôm không phải lúc nào cũng
 *      đúng 5,85 m, nên người nhập phải sửa được cho từng chuyến hàng.
 *   2. Không khai `uom`, hoặc `uom` trùng đơn vị tồn của mặt hàng → hệ số 1. Đây là
 *      đường của MỌI dòng đang chạy hôm nay, nên bật quy đổi lên không làm lệch sổ cũ.
 *   3. Còn lại → tra bảng `uom_conversions` trên hồ sơ mặt hàng. KHÔNG có thì TỪ CHỐI.
 *
 * Bước 3 từ chối thay vì lặng lẽ lấy 1 là điểm chính. Người dùng đã nói rõ "dòng này
 * tính theo đơn vị khác" — lấy 1 lúc đó là ghi đè ý họ bằng một con số bịa, và cái sai
 * chỉ lộ ra khi kiểm kho vài tháng sau.
 */
import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import type { UomLine } from "./types.js";

const ONE = 1_000_000;

/** Đơn vị tồn của một mặt hàng, hoặc `undefined` khi hồ sơ chưa khai. */
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
  /** Selects the Item default UOM. It never changes the stock UOM. */
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

/**
 * Cửa bán theo m² nhưng xuất kho theo Bộ không có hệ số cố định trên Item: một bộ 1×2 m
 * và một bộ 3×3 m có diện tích khác nhau nhưng đều chỉ trừ một Bộ. Máy chủ tự tính lại cả
 * diện tích tính tiền lẫn số Bộ để API trực tiếp cũng không thể làm lệch sổ kho.
 */
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
  /**
   * Rộng và cao tính bằng MÉT, nên diện tích là tích của chúng — không chia 1.000.000 nữa.
   *
   * Hai field này từng là `width_mm`/`height_mm`. Xưởng đo và báo giá theo mét (RCL 4,9 m),
   * nên bắt nhập milimét là bắt nhân nhẩm 1000 ở mỗi dòng, và quên một số 0 thì diện tích
   * lệch mười lần mà chứng từ vẫn hợp lệ. Đổi được vì lúc chuyển chưa có chứng từ nào.
   */
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

/**
 * Điền `conversion_factor`, `stock_uom` và `stock_qty` cho từng dòng.
 *
 * Đọc hồ sơ mặt hàng MỘT lần cho mỗi mã, vì một phiếu nhập nhôm hay có mười dòng cùng mã
 * khác khổ, và mười lượt đọc D1 trong một request là thứ đã từng làm thao tác quá hạn.
 */
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
      : toScaledInt(Number(fromScaledInt(dynamicStockQty, 6)) / Number(fromScaledInt(qtyMicros, 6)), 6, `items[${index}].conversion_factor`);
    const stockQty = dynamicStockQty ?? (factorMicros === ONE
      ? qtyMicros
      : multiplyScaled(fromScaledInt(qtyMicros, 6), 6, fromScaledInt(factorMicros, 6), 6, 6, `items[${index}].stock_qty`));
    if (stockQty <= 0) throw errors.validation(`Số lượng quy đổi phải lớn hơn 0 (dòng ${index + 1})`);
    const stockUom = stockUomOf(master);
    const inventoryMode = itemText(master, "inventory_mode") || "Hàng thường";
    const measurementProfile = itemText(master, "measurement_profile");
    return {
      ...item,
      ...(uom ? { uom } : {}),
      conversion_factor: fromScaledInt(factorMicros, 6),
      conversion_factor_micros: factorMicros,
      ...(stockUom ? { stock_uom: stockUom } : {}),
      stock_qty: fromScaledInt(stockQty, 6),
      stock_qty_micros: stockQty,
      ...(master ? { inventory_mode: inventoryMode, measurement_profile: measurementProfile } : {}),
    };
  });
}

/** Số lượng theo ĐƠN VỊ TỒN của một dòng — thứ mà sổ kho và hạn mức đặt hàng phải dùng. */
export function stockQtyMicros(line: UomLine): number {
  return line.stock_qty_micros ?? line.qty_micros ?? toScaledInt(line.qty, 6, "qty");
}
