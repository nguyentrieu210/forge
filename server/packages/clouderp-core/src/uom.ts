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

function resolveFactorMicros(line: UomLine, master: JsonObject | null, index: number): number {
  const declared = line.conversion_factor;
  if (declared !== undefined && declared !== null && declared !== "") {
    const factor = toScaledInt(declared, 6, `items[${index}].conversion_factor`);
    if (factor <= 0) throw errors.validation(`Hệ số quy đổi phải lớn hơn 0 (dòng ${index + 1})`);
    return factor;
  }
  const uom = typeof line.uom === "string" ? line.uom.trim() : "";
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
): Promise<T[]> {
  const masters = new Map<string, JsonObject | null>();
  for (const item of items) {
    if (masters.has(item.item_code)) continue;
    masters.set(item.item_code, await context.reader.getMasterRecordData(context.command.tenant_id, "Item", item.item_code));
  }
  return items.map((item, index) => {
    const master = masters.get(item.item_code) ?? null;
    const qtyMicros = item.qty_micros ?? toScaledInt(item.qty, 6, `items[${index}].qty`);
    const factorMicros = resolveFactorMicros(item, master, index);
    const stockQty = factorMicros === ONE
      ? qtyMicros
      : multiplyScaled(fromScaledInt(qtyMicros, 6), 6, fromScaledInt(factorMicros, 6), 6, 6, `items[${index}].stock_qty`);
    if (stockQty <= 0) throw errors.validation(`Số lượng quy đổi phải lớn hơn 0 (dòng ${index + 1})`);
    const stockUom = stockUomOf(master);
    return {
      ...item,
      conversion_factor: fromScaledInt(factorMicros, 6),
      conversion_factor_micros: factorMicros,
      ...(stockUom ? { stock_uom: stockUom } : {}),
      stock_qty: fromScaledInt(stockQty, 6),
      stock_qty_micros: stockQty,
    };
  });
}

/** Số lượng theo ĐƠN VỊ TỒN của một dòng — thứ mà sổ kho và hạn mức đặt hàng phải dùng. */
export function stockQtyMicros(line: UomLine): number {
  return line.stock_qty_micros ?? line.qty_micros ?? toScaledInt(line.qty, 6, "qty");
}
