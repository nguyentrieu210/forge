/**
 * ĐỌC BẢNG QUY ĐỔI ĐVT CỦA MỘT MÃ HÀNG — và phân biệt "thiếu dữ liệu" với "đúng luật".
 *
 * Đây là chỗ dễ sai nhất của màn nhập nhôm, nên viết tách riêng, thuần tuý, không React.
 *
 * Hai chuyện KHÁC NHAU mà nhìn qua giống hệt nhau (cùng là "bảng quy đổi không có dòng đó"):
 *
 *  1. THIẾU HỆ SỐ MÉT→CÂY — PHẢI BÁO.
 *     Chốt 20/08/2026: 33 mã `RT_` là **mua Kg · tồn CÂY · bán Mét**. Hệ số Mét→Cây được
 *     CỐ Ý để trống (`docs/audits/ALUMDOOR-BAN-HANG-DANH-MUC-GAP-20260821.md` §3, hàng 1).
 *     Script `nhap/doi-ray-truc-can-thuc.mjs` để lại đúng MỘT dòng `{ uom: "Mét",
 *     conversion_factor: 0 }` — tức dòng CÓ MẶT nhưng hệ số bằng 0. Nên phép thử không được
 *     là "có dòng Mét hay không" mà phải là "hệ số Mét có DƯƠNG hay không".
 *     Vì mỗi cây một chiều dài, đoán một hệ số là ghi sai tồn của cả nhóm ⇒ màn chỉ NÓI RA
 *     thiếu ở đâu và sửa ở đâu, tuyệt đối không tự điền.
 *
 *  2. KHÔNG CÓ QUY ĐỔI KG↔CÂY TRÊN HÀNG CATCH-WEIGHT — TUYỆT ĐỐI KHÔNG BÁO.
 *     `validateCanonicalAluminumItem` (`server/apps-src/alumdoor-worker/src/
 *     item-catalog-invariants.ts:98-107) TỪ CHỐI lưu Item nếu bảng quy đổi có dòng `Kg`:
 *     "số cây/lá và kg thực là hai quan sát độc lập". Nên Kg VẮNG MẶT là ĐÚNG LUẬT, không
 *     phải dữ liệu thiếu. Báo động ở đây là báo động giả cho toàn bộ nhóm nhôm — đúng cái
 *     bẫy mà §3 của bản kiểm kê dặn phải tránh.
 */
import {
  COUNTED_STOCK_UOMS,
  LINEAR_UOMS,
  WEIGHT_UOMS,
  checked,
  normalized,
  positiveNumber,
  text,
  type Json,
} from "./model.js";

export type UomGapKind =
  /** Có ĐVT bán/mua khác ĐVT tồn nhưng bảng quy đổi KHÔNG có dòng nào cho nó. */
  | "missing_row"
  /** Có dòng quy đổi nhưng hệ số bằng 0/trống — chính là ca 33 mã `RT_`. */
  | "blank_factor";

export interface UomConversionGap {
  item_code: string;
  item_name: string;
  kind: UomGapKind;
  /** ĐVT giao dịch đang thiếu đường về ĐVT tồn. */
  from_uom: string;
  /** ĐVT tồn kho của mã hàng. */
  to_uom: string;
  /** Vai trò của ĐVT đó: "bán" hay "mua". */
  role: "sales" | "purchase";
  message: string;
  /** Chỉ đích danh nơi sửa. */
  fix_at: string;
}

/** Chỗ bảng quy đổi TRỐNG MỘT CÁCH ĐÚNG LUẬT — hiện để giải thích, KHÔNG phải cảnh báo. */
export interface UomLawfulOmission {
  item_code: string;
  item_name: string;
  uom: string;
  stock_uom: string;
  explanation: string;
}

export interface UomConversionReading {
  item_code: string;
  gaps: UomConversionGap[];
  lawful: UomLawfulOmission[];
}

export const UOM_FIX_LOCATION = "Danh mục ▸ Mặt hàng ▸ ô \"Đơn vị quy đổi khác\" (Item.uom_conversions)";

interface ConversionRow {
  uom: string;
  factor: number | undefined;
}

function conversionRows(item: Json): ConversionRow[] {
  const raw = item.uom_conversions;
  if (!Array.isArray(raw)) return [];
  const rows: ConversionRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Json;
    const uom = text(row.uom);
    if (!uom) continue;
    rows.push({ uom, factor: positiveNumber(row.conversion_factor) });
  }
  return rows;
}

function findRow(rows: ConversionRow[], uom: string): ConversionRow | undefined {
  const needle = normalized(uom);
  return rows.find((row) => normalized(row.uom) === needle);
}

function isWeightUom(uom: string): boolean {
  return WEIGHT_UOMS.includes(normalized(uom));
}

function isLinearUom(uom: string): boolean {
  return LINEAR_UOMS.includes(normalized(uom));
}

function isCountedUom(uom: string): boolean {
  return COUNTED_STOCK_UOMS.includes(normalized(uom));
}

/**
 * Mã hàng có phải hàng CÂN THỰC TẾ đang đếm theo cây/lá không.
 *
 * Đúng bộ điều kiện mà `aluminumItemContract` (aluminum-purchase-closure.ts:142-157) đòi:
 * `inventory_mode = Nhôm cây/lá`, `stock_uom` là Cây/Lá/Đoạn, `default_purchase_uom = Kg`,
 * `has_catch_weight` bật, `weight_uom = Kg`.
 */
export function isCatchWeightCountedItem(item: Json): boolean {
  if (!isCountedUom(text(item.stock_uom))) return false;
  if (checked(item.has_catch_weight)) return true;
  // Dữ liệu cũ có thể chưa có cờ; hai dấu hiệu còn lại của hợp đồng nhôm là đủ chắc.
  return text(item.inventory_mode) === "Nhôm cây/lá" && isWeightUom(text(item.default_purchase_uom));
}

/**
 * Đọc bảng quy đổi của MỘT mã hàng.
 *
 * Trả về hai danh sách tách bạch: `gaps` là chỗ PHẢI báo, `lawful` là chỗ trống đúng luật.
 * Không bao giờ suy ra một hệ số nào.
 */
export function readItemUomConversions(itemCode: string, item: Json | null): UomConversionReading {
  const code = text(itemCode) || text(item?.item_code);
  const reading: UomConversionReading = { item_code: code, gaps: [], lawful: [] };
  if (!item) return reading;

  const itemName = text(item.item_name) || code;
  const stockUom = text(item.stock_uom);
  if (!stockUom) return reading;

  const rows = conversionRows(item);
  const catchWeight = isCatchWeightCountedItem(item);

  const candidates: Array<{ uom: string; role: "sales" | "purchase" }> = [
    { uom: text(item.default_sales_uom), role: "sales" },
    { uom: text(item.default_purchase_uom), role: "purchase" },
  ];

  for (const candidate of candidates) {
    const uom = candidate.uom;
    if (!uom) continue;
    // ĐVT giao dịch trùng ĐVT tồn thì hệ số là 1, không cần khai.
    if (normalized(uom) === normalized(stockUom)) continue;

    /*
     * ↓↓↓ ĐÂY LÀ DÒNG PHÂN BIỆT HAI CA. ↓↓↓
     * Hàng cân thực tế mua theo Kg: `validateCanonicalAluminumItem` TỪ CHỐI hệ số Kg↔Cây tĩnh,
     * nên bảng quy đổi KHÔNG được có dòng Kg. Ghi vào `lawful` để màn giải thích, và `continue`
     * để KHÔNG BAO GIỜ rơi xuống nhánh sinh cảnh báo bên dưới.
     */
    if (catchWeight && isWeightUom(uom)) {
      reading.lawful.push({
        item_code: code,
        item_name: itemName,
        uom,
        stock_uom: stockUom,
        explanation: `Hàng cân thực tế: ${uom} và ${stockUom} là hai quan sát độc lập nên bảng quy đổi CỐ Ý không có dòng ${uom}↔${stockUom}. Đây là đúng luật danh mục, không phải dữ liệu thiếu.`,
      });
      continue;
    }

    const row = findRow(rows, uom);
    const label = `${uom}→${stockUom}`;
    /** Đúng ca "bán Mét · tồn Cây" của 33 mã `RT_` — nói thẳng ra để người sửa nhận ra ngay. */
    const isMeterToBar = isLinearUom(uom) && isCountedUom(stockUom);
    const prefix = isMeterToBar ? `${code} (bán ${uom} · tồn ${stockUom})` : code;

    if (!row) {
      reading.gaps.push({
        item_code: code,
        item_name: itemName,
        kind: "missing_row",
        from_uom: uom,
        to_uom: stockUom,
        role: candidate.role,
        message: `${prefix}: chưa có dòng quy đổi ${label} trong bảng đơn vị của mặt hàng, nên không quy được số ${uom} về ${stockUom}.`,
        fix_at: `${UOM_FIX_LOCATION} — thêm dòng ĐVT = ${uom}.`,
      });
      continue;
    }
    if (row.factor === undefined) {
      reading.gaps.push({
        item_code: code,
        item_name: itemName,
        kind: "blank_factor",
        from_uom: row.uom,
        to_uom: stockUom,
        role: candidate.role,
        message: `${prefix}: dòng quy đổi ${label} có tồn tại nhưng HỆ SỐ đang để trống (0). Mỗi cây một chiều dài nên hệ thống không đoán hộ; số ${uom} chưa quy được về ${stockUom}.`,
        fix_at: `${UOM_FIX_LOCATION} — điền "Hệ số về ĐVT tồn" cho dòng ĐVT = ${row.uom}.`,
      });
    }
  }

  return reading;
}

/** Gộp nhiều mã hàng, khử trùng theo (mã hàng, ĐVT). */
export function mergeUomReadings(readings: UomConversionReading[]): {
  gaps: UomConversionGap[];
  lawful: UomLawfulOmission[];
} {
  const gaps = new Map<string, UomConversionGap>();
  const lawful = new Map<string, UomLawfulOmission>();
  for (const reading of readings) {
    for (const gap of reading.gaps) gaps.set(`${gap.item_code}${normalized(gap.from_uom)}`, gap);
    for (const entry of reading.lawful) lawful.set(`${entry.item_code}${normalized(entry.uom)}`, entry);
  }
  return {
    gaps: [...gaps.values()].sort((left, right) => left.item_code.localeCompare(right.item_code, "vi")),
    lawful: [...lawful.values()].sort((left, right) => left.item_code.localeCompare(right.item_code, "vi")),
  };
}
