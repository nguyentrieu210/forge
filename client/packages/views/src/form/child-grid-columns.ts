import { resolveField, type Doc, type DocField, type DocTypeMeta } from "@metaforge/core";
import { ControlRegistry, type FieldServices } from "@metaforge/controls";
import {
  childGridPolicyLabel, compactPolicyFields, resolvePolicyColumns, salesVisibilityOverride,
} from "./child-grid-policy.js";

// Phần "cột nào, rộng bao nhiêu, đọc ra số gì" của lưới dòng con.
//
// ChildGrid.tsx là 2200 dòng và gần như toàn bộ là một component; 300 dòng đầu lại là luật
// thuần không dính React — chọn cột hiện, bề rộng theo kiểu field, suy ra barem và cân nặng
// trung bình, đọc dữ liệu dán vào. Tách ra để kiểm thử được luật mà không phải dựng lưới,
// và để đọc luật không phải cuộn qua 1900 dòng JSX.

export interface GridLayout {
  w: Record<string, number>;
  order: string[];
  hidden: string[];
  pinned: string[];
  labels: Record<string, string>;
}

export const EMPTY_LAYOUT: GridLayout = { w: {}, order: [], hidden: [], pinned: [], labels: {} };

export interface ChildGridProps {
  childMeta: DocTypeMeta;
  rows: Doc[];
  onChange: (rows: Doc[]) => void;
  registry: ControlRegistry;
  services?: FieldServices;
  readOnly?: boolean;
  /** doc CHA (giá trị form) — ngữ cảnh resolve depends_on/eval của field con (parent.*). */
  parentDoc?: Record<string, unknown>;
  /** role user — resolve permlevel/quyền ghi field con (P1-06 canonical). */
  roles?: string[];
  /**
   * Giá trị mồi cho DÒNG MỚI, lấy từ bối cảnh đang chọn (vd kho hiện tại).
   *
   * `blankDoc` chỉ gieo bối cảnh cho chứng từ CHA, nên dòng bảng con không nhận được gì —
   * thủ kho phải chọn lại đúng một cái kho cho từng dòng, mỗi lần. Chỉ mồi ô đang TRỐNG và
   * chỉ những field bảng con thật sự có.
   */
  rowDefaults?: Record<string, unknown>;
}

export function isLayout(ft: string): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(ft);
}

function gridColumns(meta: DocTypeMeta): DocField[] {
  const inList = (meta.fields ?? []).filter((f) => f.in_list_view === 1 && !isLayout(f.fieldtype));
  if (inList.length > 0) return inList;
  return (meta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).slice(0, 4);
}

/**
 * Cột mà KHÔNG dòng nào hiện được thì BỎ HẲN, không để lại một cột toàn dấu "—".
 *
 * Một bảng dòng thường phải phục vụ nhiều loại mua rất khác nhau: mua nhôm cần màu, chiều
 * dài cây, số kg / số bó / số cây; mua mô tơ chỉ cần cái và giá. Khai đủ cột cho cả hai rồi
 * dùng `depends_on` để ẩn theo từng ô thì phiếu mua mô tơ vẫn còn năm cái tiêu đề rỗng —
 * chiếm chỗ, và bắt người đọc tự hiểu là chúng không liên quan.
 *
 * Đánh giá theo ĐÚNG bộ máy `depends_on` sẵn có, trong ngữ cảnh dòng + chứng từ cha. Bảng
 * chưa có dòng nào thì đánh giá với một dòng rỗng, để cột phụ thuộc vào chứng từ cha vẫn
 * quyết định được ngay từ lúc chưa nhập gì.
 */
export function visibleColumns(
  cols: DocField[],
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc: Record<string, unknown> | undefined,
  roles: string[] | undefined,
): DocField[] {
  const probes: Doc[] = rows.length ? rows : [{ name: "probe", doctype: meta.name } as Doc];
  return cols.filter((column) =>
    probes.some((row) => resolveField(
      column.list_only ? { ...column, list_only: 0 } : column,
      meta,
      { doc: row, parent: parentDoc, roles, assumeWritable: true },
).visible || (meta.name === "Sales Order Item" && salesVisibilityOverride(row, column.fieldname))));
}

/** Một bộ cột chuẩn dùng chung cho cả bảng trong form và bảng lớn. */
export function resolveChildGridColumns(
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc?: Record<string, unknown>,
  roles?: string[],
): DocField[] {
  const policyColumns = resolvePolicyColumns(meta);
  if (policyColumns) return policyColumns;
  const visible = visibleColumns(gridColumns(meta), meta, rows, parentDoc, roles);
  if (visible.length) return visible;
  return (meta.fields ?? []).filter((field) => !isLayout(field.fieldtype)).slice(0, 6);
}

/** Mặc định form đơn mua chỉ giữ năm cột nhập nhanh; nút Cột vẫn có thể mở thêm. */
export function defaultChildGridHiddenColumns(meta: DocTypeMeta, columns: DocField[], expanded: boolean): string[] {
  if (expanded) return [];
  const compact = compactPolicyFields(meta);
  if (!compact) return [];
  return columns
    .filter((field) => !compact.includes(field.fieldname))
    .map((field) => field.fieldname);
}

export function childGridColumnLabel(meta: DocTypeMeta, field: DocField): string {
  return childGridPolicyLabel(meta, field) ?? field.label ?? field.fieldname;
}

/**
 * BỀ RỘNG CỘT LÀ TUYỆT ĐỐI, và đúng MỘT cột co giãn.
 *
 * Bản trước cấp `min-width` cho từng cột rồi để bảng `w-full`. Nhưng `min-width` chỉ là
 * sàn: trình duyệt lấy phần thừa chia ĐỀU cho mọi cột, nên cột "SL" sàn 4,5rem phình ra
 * ngang cột "Thành tiền" dù nó chỉ chứa "20". Đó là lý do các cột trông không hợp lý —
 * không phải vì con số sàn sai, mà vì sàn không quyết định được gì khi còn chỗ thừa.
 *
 * Cách của mọi bảng nhập liệu dùng được (MISA, Excel): cột nào cũng có bề rộng CỐ ĐỊNH,
 * trừ MỘT cột nuốt hết phần thừa — ở đây là cột tên hàng, cột duy nhất mà chữ dài ra thì
 * cần thêm chỗ. `table-fixed` để bề rộng khai ra được tôn trọng đúng như khai.
 */
const GRID_WIDTH: Record<string, string> = {
  Check: "3.5rem", Int: "5rem", Float: "5.5rem", Percent: "5.5rem", Currency: "8rem",
  Date: "8.5rem", Time: "7rem", Datetime: "10.5rem",
  // Ghi chú là cột ĐỌC LƯỚT, không phải cột soạn thảo: 12rem khiến nó rộng ngang cột tiền
  // trong khi nội dung thường là vài chữ. Muốn viết dài thì mở chi tiết dòng.
  "Small Text": "8rem", Text: "8rem", "Long Text": "8rem",
};

/**
 * Cột MÃ HÀNG không bao giờ co, và không bao giờ là cột chịu thiệt.
 *
 * Nó là thứ duy nhất người đọc dùng để biết dòng này là hàng gì; mọi cột khác chỉ có nghĩa
 * khi đã biết điều đó.
 */
export const IDENTITY_WIDTH = "14rem";

export function gridWidth(field: DocField): string {
  const fieldtype = field.fieldtype;
  if (fieldtype === "Select") {
    // Theo LỰA CHỌN DÀI NHẤT: cột ĐVT chỉ chứa "Cây", "Kg" — cấp cho nó bề rộng của một
    // cột trạng thái là lấy mất chỗ của cột tên hàng ngay bên cạnh.
    const longest = (field.options ?? "").split("\n").reduce((max, option) => Math.max(max, option.trim().length), 0);
    return longest <= 6 ? "6rem" : longest <= 12 ? "8.5rem" : "11rem";
  }
  /**
   * Link đo theo NHÃN, không rơi về mặc định 11rem như mọi field còn lại.
   *
   * Khi ĐVT chuyển từ Select sang Link(UOM), nhánh đo-theo-lựa-chọn ở trên không còn áp
   * dụng nữa và cột đó lặng lẽ nhảy từ 6rem lên 11rem. Một cột chỉ chứa "Kg", "Bộ", "Cây"
   * chiếm gần gấp ba chỗ nó cần — và chỗ đó lấy đúng của cột mã hàng bên cạnh. Link tới một
   * danh mục ngắn (ĐVT, màu, kho) là trường hợp thường gặp hơn hẳn Link tới tên dài.
   */
  if (["Link", "Dynamic Link", "Currency", "Int", "Float", "Percent"].includes(fieldtype)) {
    // Nhãn dài hơn con số thì chính TIÊU ĐỀ mới là thứ quyết định bề rộng.
    const label = (field.label ?? field.fieldname).length;
    const base = GRID_WIDTH[fieldtype] ?? "7rem";
    return label <= 6 ? base : label <= 12 ? "8rem" : "10rem";
  }
  return GRID_WIDTH[fieldtype] ?? "11rem";
}

/**
 * Bề rộng cột của BẢNG LỚN — hẹp, để 12 cột vừa trọn màn hình thay vì phải cuộn ngang.
 *
 * Bảng gọn đo cột theo kiểu field (`gridWidth`), hợp lý khi chỉ có 5–6 cột trong một khung
 * hẹp. Ở bảng lớn cùng cách đo ấy cộng lại vượt bề ngang màn hình, và cuộn ngang chính là
 * thứ mở bảng lớn ra để tránh. Con số ở đây theo NỘI DUNG THẬT: cột màu chứa "GS", "XN-VK";
 * cột ĐVT chứa "Kg", "Bộ"; chỉ tên hàng và ghi chú mới cần chỗ, nên chúng co giãn.
 */
export const BIG_WIDTH: Record<string, string> = {
  // Ô Link/Select vẽ ra một nút có mũi tên bên phải, nên 6rem chỉ đủ hiện "C." và "K." —
  // một cột màu không đọc được màu thì bằng không có cột. Màu và ĐVT cần 8rem.
  item_code: "14rem", color: "8rem", colour: "8rem",
  height_m: "6rem", width_m: "6rem", length_m: "6rem",
  qty: "7rem", qty_bar: "6rem", set_count: "7rem", actual_weight_kg: "7rem",
  theoretical_kg_per_m: "7rem", theoretical_kg: "8rem", is_stamped: "6rem",
  actual_kg_per_m: "7rem", actual_kg_per_sqm: "7rem", uom: "8rem",
  rate: "8rem", discount_percentage: "8rem", amount: "9rem", available_qty: "8rem", availability_status: "13rem", note: "8rem", install_note: "8rem",
};
export interface AverageWeightResult {
  totalLengthM?: number;
  totalAreaSqm?: number;
  averageWeight?: number;
  basis?: "kg/m" | "kg/m²" | "kg/cây" | "kg/ĐVT";
}

export function derivePurchaseOrderBarem(row: Doc): number | undefined {
  const length = Number(row.length_m);
  const bars = Number(row.qty_bar);
  const kgPerM = Number(row.theoretical_kg_per_m);
  if (!Number.isFinite(length) || length <= 0
    || !Number.isFinite(bars) || bars <= 0
    || !Number.isFinite(kgPerM) || kgPerM <= 0) return undefined;
  return length * bars * kgPerM;
}

/**
 * Trọng lượng bình quân chỉ được suy ra khi dòng có một nguồn TỔNG KG thật.
 *
 * - giao dịch theo Kg: `qty` chính là tổng kg;
 * - giao dịch theo Bộ/Cái/Cây/...: phải nhập riêng `actual_weight_kg`;
 * - hàng theo diện tích: chia tổng kg cho `cao × rộng × số cái/bộ`;
 * - tuyệt đối không coi số Bộ/Cái trong `qty` là kg, vì vậy dòng 222 Bộ không thể tự sinh 0,10 kg/cái.
 */
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
  const totalAreaSqm = isAreaItem && width > 0 && height > 0 && pieces > 0
    ? width * height * pieces
    : undefined;
  const totalLengthM = bars > 0 && length > 0 ? bars * length : length || undefined;

  let divisor = 0;
  let basis: AverageWeightResult["basis"];
  if (totalAreaSqm) {
    divisor = totalAreaSqm;
    basis = "kg/m²";
  } else if (totalLengthM) {
    divisor = totalLengthM;
    basis = "kg/m";
  } else if (bars > 0) {
    divisor = bars;
    basis = "kg/cây";
  } else if (!isKg && quantity > 0) {
    divisor = quantity;
    basis = "kg/ĐVT";
  }

  return {
    ...(totalAreaSqm ? { totalAreaSqm } : {}),
    ...(totalLengthM ? { totalLengthM } : {}),
    ...(totalKg > 0 && divisor > 0 ? { averageWeight: totalKg / divisor, basis } : {}),
  };
}

/**
 * Một ô dán từ Excel → giá trị của field.
 *
 * Excel tiếng Việt xuất số theo dấu phẩy thập phân và chấm ngăn nghìn ("1.234,5"), còn
 * `Number()` đọc chuỗi đó ra `NaN` — dán vào là mất sạch số lượng mà không báo gì. Chuỗi
 * rỗng trả về `undefined` để ô trống trong Excel KHÔNG xoá giá trị đang có.
 */
export function parsePasted(field: DocField, raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  if (field.fieldtype === "Check") {
    const normalized = text.toLocaleLowerCase("vi");
    if (["1", "true", "yes", "y", "x", "có"].includes(normalized)) return 1;
    if (["0", "false", "no", "n", "không"].includes(normalized)) return 0;
    return undefined;
  }
  if (["Currency", "Float", "Int", "Percent"].includes(field.fieldtype)) {
    const normalized = text.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }
  return text;
}

/** Cột ĐỊNH DANH — Link đầu tiên, tức mã hàng. Được ghim khi cuộn ngang và không co. */
export function identityColumn(cols: DocField[]): string | undefined {
  return cols.find((c) => ["Link", "Dynamic Link"].includes(c.fieldtype))?.fieldname ?? cols[0]?.fieldname;
}

/**
 * Cột được phép CO GIÃN — đúng một, và là cột GHI CHÚ, không phải cột mã hàng.
 *
 * Không có cột co giãn thì tổng bề rộng cố định hiếm khi bằng bề ngang bảng: thiếu thì
 * thừa một khoảng trắng ở mép phải, dư thì cuộn ngang cả những cột không cần.
 *
 * Nhưng cột co giãn cũng là cột DUY NHẤT có thể bị ép về 0: với `table-fixed`, cột không
 * khai bề rộng chỉ nhận PHẦN CÒN LẠI, và phần còn lại có thể âm. Đo trên đơn mua hàng thật
 * ngày 29/7: các cột đã khai cộng lại 848px trong một khung 722px, nên cột "Mã sản phẩm" —
 * cột được chọn co giãn lúc đó — rộng đúng **0px**. Không nhìn thấy, không bấm được, tức là
 * không tạo nổi một dòng hàng nào. Cuộn ngang cũng vô ích vì cuộn tới nơi vẫn rộng 0.
 *
 * Nên chỗ chịu thiệt phải là thứ mất đi vẫn đọc được chứng từ: ghi chú. Không có cột chữ
 * nào thì không có cột co giãn — mọi cột giữ đúng bề rộng đã khai và bảng tự tràn để cuộn.
 */
export function flexibleColumn(cols: DocField[], identity: string | undefined): string | undefined {
  const text = cols.filter((c) => c.fieldname !== identity
    && ["Data", "Small Text", "Text", "Long Text"].includes(c.fieldtype));
  return text[text.length - 1]?.fieldname;
}

export function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

export function detailFieldSpan(field: DocField): string {
  if (["Small Text", "Text", "Long Text", "Text Editor", "Code", "HTML", "Markdown Editor"].includes(field.fieldtype)) {
    return "sm:col-span-2 lg:col-span-3";
  }
  return "";
}
