/** @jsxImportSource react */
/**
 * ChildGrid (M12) — bảng con cho field Table: render row của child DocType,
 * cột = field in_list_view của child, cell = control từ registry (inline edit), thêm/xoá row.
 * Data-driven từ child meta (KHÔNG hardcode).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { aiHeaders } from "../assistant/AssistantBubble.js";
import { ArrowDown, ArrowDownToLine, ArrowUp, Columns3, Copy, Maximize2, Pin, PinOff, Plus, RotateCcw, ScanLine, Trash2, Undo2, X } from "lucide-react";
import { resolveField, type DocTypeMeta, type DocField, type Doc } from "@metaforge/core";
import { ControlRegistry, FallbackControl, type FieldServices } from "@metaforge/controls";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FileButton, Input,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, useT,
} from "@metaforge/ui";

interface GridLayout {
  w: Record<string, number>;
  order: string[];
  hidden: string[];
  pinned: string[];
  labels: Record<string, string>;
}

const EMPTY_LAYOUT: GridLayout = { w: {}, order: [], hidden: [], pinned: [], labels: {} };

const PURCHASE_COMPACT_FIELDS = ["item_code", "qty", "uom", "rate", "amount"];
const SALES_COMPACT_FIELDS = ["item_code", "uom", "qty", "rate", "amount"];
const SALES_ORDER_ITEM_FULL_FIELDS = [
  "item_code", "door_type", "width_m", "height_m", "mesh_height_m", "set_count", "color", "sales_mode",
  "has_butterfly_bracket", "leaf_variant", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding",
  "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count", "cut_width_m", "billable_area_sqm",
  "estimated_weight_kg", "estimated_minutes", "formula_policy", "formula_version", "formula_explanation",
  "uom", "qty", "rate", "amount", "motor_model", "accessories", "install_note", "warehouse",
  "availability_status", "note",
];
const PURCHASE_ORDER_ITEM_FULL_FIELDS = [
  "item_code",
  "length_m",
  "theoretical_kg_per_m",
  "qty_bundle",
  "qty_bar",
  "theoretical_kg",
  "qty",
  "uom",
  "rate",
  "amount",
  "color",
  "is_stamped",
  "so_no",
  "warehouse",
  "note",
];
const PURCHASE_RECEIPT_ITEM_FULL_FIELDS = [
  "item_code",
  "length_m",
  "qty_bundle",
  "qty_bar",
  "qty",
  "uom",
  "rate",
  "amount",
  "theoretical_kg",
  "actual_weight_kg",
  "color",
  "is_stamped",
  "so_no",
  "warehouse",
  "purchase_order",
  "note",
];

function isPurchaseGrid(meta: DocTypeMeta): boolean {
  return meta.name === "Purchase Order Item" || meta.name === "Purchase Receipt Item";
}

function isSalesOrderGrid(meta: DocTypeMeta): boolean {
  return meta.name === "Quotation Item" || meta.name === "Sales Order Item";
}

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

function isLayout(ft: string): boolean {
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
function visibleColumns(
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
    ).visible));
}

/** Một bộ cột chuẩn dùng chung cho cả bảng trong form và bảng lớn. */
export function resolveChildGridColumns(
  meta: DocTypeMeta,
  rows: Doc[],
  parentDoc?: Record<string, unknown>,
  roles?: string[],
): DocField[] {
  if (meta.name === "Purchase Order Item") {
    return PURCHASE_ORDER_ITEM_FULL_FIELDS
      .map((fieldname) => (meta.fields ?? []).find((field) => field.fieldname === fieldname))
      .filter((field): field is DocField => Boolean(field));
  }
  if (meta.name === "Purchase Receipt Item") {
    return PURCHASE_RECEIPT_ITEM_FULL_FIELDS
      .map((fieldname) => (meta.fields ?? []).find((field) => field.fieldname === fieldname))
      .filter((field): field is DocField => Boolean(field));
  }
  if (isSalesOrderGrid(meta)) {
    return SALES_ORDER_ITEM_FULL_FIELDS
      .map((fieldname) => (meta.fields ?? []).find((field) => field.fieldname === fieldname))
      .filter((field): field is DocField => Boolean(field));
  }
  const visible = visibleColumns(gridColumns(meta), meta, rows, parentDoc, roles);
  if (visible.length) return visible;
  return (meta.fields ?? []).filter((field) => !isLayout(field.fieldtype)).slice(0, 6);
}

/** Mặc định form đơn mua chỉ giữ năm cột nhập nhanh; nút Cột vẫn có thể mở thêm. */
export function defaultChildGridHiddenColumns(meta: DocTypeMeta, columns: DocField[], expanded: boolean): string[] {
  if (expanded) return [];
  const compact = isPurchaseGrid(meta) ? PURCHASE_COMPACT_FIELDS : isSalesOrderGrid(meta) ? SALES_COMPACT_FIELDS : null;
  if (!compact) return [];
  return columns
    .filter((field) => !compact.includes(field.fieldname))
    .map((field) => field.fieldname);
}

function childGridColumnLabel(meta: DocTypeMeta, field: DocField): string {
  if (isPurchaseGrid(meta)) {
    if (field.fieldname === "qty") return "Số lượng";
    if (field.fieldname === "uom") return "ĐVT";
  }
  return field.label || field.fieldname;
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
const IDENTITY_WIDTH = "14rem";

function gridWidth(field: DocField): string {
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
const BIG_WIDTH: Record<string, string> = {
  // Ô Link/Select vẽ ra một nút có mũi tên bên phải, nên 6rem chỉ đủ hiện "C." và "K." —
  // một cột màu không đọc được màu thì bằng không có cột. Màu và ĐVT cần 8rem.
  item_code: "14rem", color: "8rem", colour: "8rem",
  height_m: "6rem", width_m: "6rem", length_m: "6rem",
  qty: "7rem", qty_bar: "6rem", set_count: "7rem", actual_weight_kg: "7rem",
  theoretical_kg_per_m: "7rem", theoretical_kg: "8rem", is_stamped: "6rem",
  actual_kg_per_m: "7rem", actual_kg_per_sqm: "7rem", uom: "8rem",
  rate: "8rem", amount: "9rem", available_qty: "8rem", availability_status: "13rem", note: "8rem", install_note: "8rem",
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
function parsePasted(field: DocField, raw: string): unknown {
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
function identityColumn(cols: DocField[]): string | undefined {
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
function flexibleColumn(cols: DocField[], identity: string | undefined): string | undefined {
  const text = cols.filter((c) => c.fieldname !== identity
    && ["Data", "Small Text", "Text", "Long Text"].includes(c.fieldtype));
  return text[text.length - 1]?.fieldname;
}

function dynamicLinkTarget(field: DocField, row: Doc): string | undefined {
  if (field.fieldtype === "Link") return field.options;
  if (field.fieldtype !== "Dynamic Link" || !field.options) return undefined;
  const target = row[field.options];
  return typeof target === "string" && target.trim() ? target.trim() : undefined;
}

function detailFieldSpan(field: DocField): string {
  if (["Small Text", "Text", "Long Text", "Text Editor", "Code", "HTML", "Markdown Editor"].includes(field.fieldtype)) {
    return "sm:col-span-2 lg:col-span-3";
  }
  return "";
}

export function ChildGrid(props: ChildGridProps) {
  const t = useT();
  const { childMeta, rows, onChange, registry, services, readOnly, parentDoc, roles, rowDefaults } = props;
  const [detailRow, setDetailRow] = useState<number | null>(null);
  const [allowedColorsByItem, setAllowedColorsByItem] = useState<Record<string, string[]>>({});
  const [allowedUomsByItem, setAllowedUomsByItem] = useState<Record<string, string[]>>({});
  /**
   * BẢNG LỚN — bảng con chiếm trọn màn hình để nhập, rồi quay lại chứng từ.
   *
   * Bảng gọn trong form chỉ đủ chỗ cho vài cột, nên với phiếu nhập nhôm (mã, màu, kg, khổ,
   * số cây, ĐVT, giá, kho) người nhập phải cuộn ngang liên tục và mất dấu dòng đang gõ.
   * Mở rộng bảng gọn ra thì lại đẩy các ô đầu phiếu xuống dưới màn hình.
   *
   * Nó vẫn là bảng con của chứng từ cha — cùng một mảng `rows`, cùng `onChange`. Không có
   * bước "lưu" riêng: đóng lại là thấy nguyên các dòng vừa nhập trong phiếu.
   */
  const [expanded, setExpanded] = useState(false);
  const [pickedRow, setPickedRow] = useState<number | null>(null);
  const [pickedColumn, setPickedColumn] = useState(0);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [lastDeleted, setLastDeleted] = useState<Array<{ row: Doc; index: number }> | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const itemLoadVersion = useRef(new Map<string, number>());
  const automaticItemLoads = useRef(new Set<string>());
  const canonicalCols = resolveChildGridColumns(childMeta, rows, parentDoc, roles);
  /** Hai chế độ dùng chung dữ liệu, nhưng có mặc định và tùy chỉnh cột riêng. */
  const baseCols = canonicalCols;
  const defaultHidden = defaultChildGridHiddenColumns(childMeta, baseCols, expanded);
  const defaultLayout = (): GridLayout => ({
    w: {},
    order: [],
    hidden: [...defaultHidden],
    pinned: [],
    labels: {},
  });

  /**
   * BỀ RỘNG VÀ THỨ TỰ CỘT do người dùng đặt, và NHỚ LẠI ở lần mở sau.
   *
   * Bề rộng mặc định ở đây chỉ là phỏng đoán từ kiểu field: nó không biết xưởng này ghi chú
   * dài hay ngắn, mã hàng của họ mấy ký tự, hay người nhập quen đọc cột nào trước. Chỉnh
   * được mà mở lại mất hết thì cũng như không chỉnh — nên lưu theo TỪNG doctype con và TỪNG
   * chế độ. Form mặc định gọn; bảng lớn mặc định đầy đủ, không để việc ẩn cột ở form làm mất
   * cột nghiệp vụ trong bảng lớn.
   *
   * Hỏng localStorage (chế độ riêng tư, hết quota) chỉ mất phần tuỳ chỉnh, bảng vẫn dựng
   * bằng mặc định — không được phép làm chết cả bảng vì một tiện ích.
   */
  // big-v3 resets the previous default order so the customer-approved purchase sequence is applied
  // even on browsers that already persisted the old big-table layout.
  const layoutKey = `mf-grid-layout:${childMeta.name}:${expanded ? "big-v4" : "compact-v3"}`;
  const [layout, setLayout] = useState<GridLayout>(() => ({ ...EMPTY_LAYOUT, w: {}, order: [], hidden: [], pinned: [], labels: {} }));
  const loadedKey = useRef("");
  if (loadedKey.current !== layoutKey) {
    loadedKey.current = layoutKey;
    try {
      const saved = localStorage.getItem(layoutKey);
      const parsed = saved ? JSON.parse(saved) as Partial<GridLayout> : {};
      const defaults = defaultLayout();
      layout.w = parsed.w ?? defaults.w;
      layout.order = parsed.order ?? defaults.order;
      layout.hidden = parsed.hidden ?? defaults.hidden;
      layout.pinned = parsed.pinned ?? defaults.pinned;
      layout.labels = parsed.labels ?? defaults.labels;
    } catch { /* không có thì dùng mặc định */ }
  }
  const saveLayout = (next: GridLayout) => {
    setLayout(next);
    try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* hết quota — vẫn dùng được trong phiên */ }
  };
  const resetLayout = () => saveLayout(defaultLayout());
  const hiddenIsDefault = layout.hidden.length === defaultHidden.length
    && defaultHidden.every((fieldname) => layout.hidden.includes(fieldname));
  const hasCustomLayout = Boolean(
    layout.order.length
    || Object.keys(layout.w).length
    || layout.pinned.length
    || Object.keys(layout.labels).length
    || !hiddenIsDefault,
  );

  // Cột người dùng đã xếp lên trước; cột chưa từng xếp giữ nguyên thứ tự gốc ở phía sau, nên
  // một cột MỚI thêm vào doctype vẫn xuất hiện thay vì biến mất vì không có trong thứ tự cũ.
  const baseIdentity = identityColumn(baseCols);
  const orderedCols = layout.order.length
    ? [
        ...layout.order.map((name) => baseCols.find((c) => c.fieldname === name)).filter((c): c is DocField => Boolean(c)),
        ...baseCols.filter((c) => !layout.order.includes(c.fieldname)),
      ]
    : baseCols;
  const cols = orderedCols.filter((column) => column.fieldname === baseIdentity || !layout.hidden.includes(column.fieldname));
  const formulaLoadVersion = useRef(new Map<string, number>());
  const previousFormulaGroup = useRef("");
  const previousSellingContext = useRef("");
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = rows;
  }, [rows]);
  const emitRows = (next: Doc[]) => {
    latestRows.current = next;
    onChange(next);
  };
  const identity = identityColumn(cols);
  const flexible = flexibleColumn(cols, identity);
  const columnWidth = (column: DocField): string => {
    const custom = layout.w[column.fieldname];
    if (custom) return `${custom}rem`;               // người dùng đã kéo — luôn thắng mặc định
    return expanded
      ? (BIG_WIDTH[column.fieldname] ?? "")          // rỗng ⇒ cột co giãn, chia phần còn lại
      : column.fieldname === identity ? IDENTITY_WIDTH : gridWidth(column);
  };
  /**
   * Bảng RỘNG BẰNG TỔNG CÁC CỘT, rồi mới cuộn — chứ không ép mọi cột vào khung.
   *
   * `w-full` một mình có nghĩa "không bao giờ rộng hơn khung", nên `overflow-x-auto` bọc
   * ngoài không bao giờ có gì để cuộn: bảng tự bóp lại cho vừa, và thứ bị bóp là cột không
   * khai bề rộng. Khai `min-width` bằng đúng tổng các cột thì bảng mới thật sự tràn, thanh
   * cuộn mới xuất hiện, và mỗi cột giữ được bề rộng đã tính cho nó.
   */
  const minWidthRem = 2.5 + (readOnly ? 0 : 7)
    + cols.reduce((sum, column) => sum + (Number.parseFloat(columnWidth(column)) || 0), 0);
  const pinnedOffsets = new Map<string, number>();
  let pinnedLeft = readOnly ? 2.5 : 5;
  for (const column of cols) {
    if (column.fieldname !== identity && !layout.pinned.includes(column.fieldname)) continue;
    pinnedOffsets.set(column.fieldname, pinnedLeft);
    pinnedLeft += Number.parseFloat(columnWidth(column) || gridWidth(column)) || 8;
  }
  const stickyColumn = (fieldname: string, header = false) => {
    const left = pinnedOffsets.get(fieldname);
    return {
      className: left === undefined ? "" : `sticky ${header ? "z-30" : "z-10"} bg-card shadow-[inset_-1px_0_0_var(--border)]`,
      style: left === undefined ? undefined : { left: `${left}rem` },
    };
  };

  /**
   * Các field dòng TỰ TÍNH được, tính ngay khi gõ.
   *
   * Server vẫn là nơi quyết định con số cuối cùng (`calculateSalesTotals` tính lại toàn bộ
   * khi lưu, theo đơn vị nhỏ nhất). Nhưng nếu ô "Thành tiền" trống suốt lúc nhập thì người
   * bán không soát được gì cho tới khi bấm lưu — mà một dòng sai đơn giá chỉ lộ ra ở tổng
   * đơn, lúc đã muộn. Nên tính ở client để NHÌN, và vẫn để server tính lại để TIN.
   *
   * Quy ước theo tên field, cùng lối với `fillItemDefaults` ngay dưới: dòng nào có đủ
   * `qty` và `rate` và có ô `amount` thì `amount = qty × rate`. Không có đủ ba thì không
   * làm gì — không đoán, không ghi đè field người dùng tự nhập.
   */
  const COMPUTED_FROM = new Set([
    "qty", "rate", "qty_bar", "length_m", "theoretical_kg_per_m", "width_m", "height_m", "set_count",
    "mesh_height_m", "sales_mode", "has_butterfly_bracket", "uom", "conversion_factor", "actual_weight_kg",
  ]);
  const ITEM_DERIVED_FIELDS = [
    "conversion_factor", "uom", "stock_uom", "stock_qty", "inventory_mode", "measurement_profile", "min_area_sqm",
    "item_name", "description", "color", "colour", "rate", "amount",
    "formula_policy", "formula_version", "formula_explanation", "width_basis", "cut_width_m", "billable_area_sqm",
    "door_type", "leaf_variant", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding", "leaf_count",
    "single_layer_leaf_count", "double_layer_leaf_count", "estimated_weight_kg", "estimated_minutes", "paint_required",
    "length_m", "qty_bundle", "qty_bar", "actual_weight_kg", "total_length_m",
    "material_specification", "theoretical_kg_per_m", "theoretical_kg",
    "actual_kg_per_m", "actual_kg_per_sqm", "so_no",
    "available_qty", "available_stock_qty", "available_stock_uom", "availability_status",
  ];
  /**
   * Item.allowed_colors là chiều chặn thật của màu. Link phải dùng đúng danh sách đó ngay
   * khi tìm kiếm, nếu không người dùng vẫn thấy cả màu mạ trên một dòng STĐ rồi chỉ bị báo
   * lỗi sau khi bấm lưu. Danh sách rỗng được lọc về một mã không tồn tại (fail closed).
   */
  const fieldForRow = (field: DocField, row: Doc): DocField => {
    const itemCode = String(row.item_code ?? "").trim();
    if (field.fieldname === "uom" && itemCode && Object.hasOwn(allowedUomsByItem, itemCode)) {
      const allowed = allowedUomsByItem[itemCode] ?? [];
      return {
        ...field,
        link_filters: JSON.stringify([
          ["UOM", "name", "in", allowed.length ? allowed : ["__NO_CONFIGURED_SALES_UOM__"]],
        ]),
      };
    }
    if (field.fieldname !== "color" && field.fieldname !== "colour") return field;
    const allowed = allowedColorsByItem[itemCode] ?? [];
    return {
      ...field,
      link_filters: JSON.stringify([
        ["Item Color", "name", "in", allowed.length ? allowed : ["__NO_ALLOWED_COLOR_CONFIG__"]],
      ]),
    };
  };
  const withComputed = (row: Doc): Doc => {
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    let next = { ...row };
    if (has("theoretical_kg") && next.inventory_mode === "Nhôm cây/lá") {
      const baremKg = derivePurchaseOrderBarem(next);
      if (baremKg !== undefined) {
        next.theoretical_kg = baremKg;
        if (has("qty")) next.qty = baremKg;
      } else {
        next.theoretical_kg = undefined;
        if (has("qty")) next.qty = undefined;
      }
    }
    if (next.inventory_mode === "Thành phẩm theo m2" && has("qty")) {
      const width = Number(next.width_m);
      const height = Number(next.height_m);
      const sets = Number(next.set_count ?? 1);
      const normalizedUom = String(next.uom ?? "").trim().toLocaleLowerCase("vi");
      const normalizedStockUom = String(next.stock_uom ?? "").trim().toLocaleLowerCase("vi");
      if (Number.isFinite(sets) && sets > 0) {
        if (["bộ", "bo", "set"].includes(normalizedUom)) {
          next.qty = sets;
        } else if (["m2", "m²", "sqm"].includes(normalizedUom)
          && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          // Rộng và cao đã là MÉT, nên diện tích là tích của chúng — bỏ phép chia 1.000.000.
          const actualArea = width * height;
          const minimumArea = Math.max(0, Number(next.min_area_sqm) || 0);
          next.qty = Math.max(actualArea, minimumArea) * sets;
        }
        // Cửa có thể bán theo m² nhưng kho quản lý theo Bộ. Hệ số ở đây là động theo
        // kích thước từng cửa, vì vậy tuyệt đối không lấy một hệ số tĩnh trên Item.
        if (["bộ", "bo", "set"].includes(normalizedStockUom)) {
          const billableQty = Number(next.qty);
          if (Number.isFinite(billableQty) && billableQty > 0) {
            if (has("conversion_factor")) next.conversion_factor = sets / billableQty;
            if (has("stock_qty")) next.stock_qty = sets;
          }
        }
      }
    }
    /**
     * Nhôm giữ HAI sự thật nhưng không trộn chúng:
     *
     *   - `qty` là kg thực cân — đơn vị tồn và đơn vị tính tiền;
     *   - `qty_bar × length_m` là hình dáng vật lý để biết có cắt được hay không.
     *
     * Vì vậy KHÔNG lấy cây ÷ kg làm hệ số kho. Hai con số dẫn xuất dưới đây chỉ mô tả lô;
     * Stock Ledger vẫn nhận nguyên số kg với hệ số 1.
     */
    /**
     * Chỉ tính khi đã xác định được TỔNG KG thật: `qty` nếu ĐVT là Kg, nếu không phải dùng ô
     * `actual_weight_kg`. Nhờ đó số lượng Bộ/Cái không bao giờ bị lấy nhầm làm trọng lượng.
     */
    if (has("actual_kg_per_m") || has("actual_kg_per_sqm") || has("total_length_m")) {
      const derived = deriveAverageWeight(next);
      next = {
        ...next,
        ...(has("total_length_m") ? { total_length_m: derived.totalLengthM } : {}),
        ...(has("actual_kg_per_m")
          ? { actual_kg_per_m: derived.basis === "kg/m²" ? undefined : derived.averageWeight }
          : {}),
        ...(has("actual_kg_per_sqm")
          ? { actual_kg_per_sqm: derived.basis === "kg/m²" ? derived.averageWeight : undefined }
          : {}),
      };
    }
    if (has("stock_qty") && has("qty") && has("conversion_factor")) {
      const qty = Number(next.qty);
      const factor = Number(next.conversion_factor);
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(factor) && factor > 0) {
        next.stock_qty = qty * factor;
      }
    }
    if (has("amount") && has("qty") && has("rate")) {
      const qty = Number(next.qty);
      const rate = Number(next.rate);
      if (Number.isFinite(qty) && Number.isFinite(rate)) next.amount = qty * rate;
    }
    return next;
  };

  const isDoorSalesGrid = ["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]
    .includes(childMeta.name);

  /**
   * Tính ở Worker rồi chụp kết quả vào dòng. Client chỉ làm nhiệm vụ tự điền; cùng payload
   * sẽ được Worker tính lại khi lưu nên sửa DOM hay gọi API thẳng cũng không ghi được m2 sai.
   */
  const fillDoorFormula = async (
    rowIdx: number,
    base: Doc[],
    loadKey: string,
    loadVersion: number,
  ) => {
    if (!isDoorSalesGrid || !services?.callPost) return;
    const row = base[rowIdx];
    if (!row || row.inventory_mode !== "Thành phẩm theo m2" || !row.item_code) return;
    const width = Number(row.width_m);
    const height = Number(row.height_m);
    const normalizedUom = String(row.uom ?? "").trim().toLocaleLowerCase("vi");
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return;
    if (!["m2", "m²", "sqm"].includes(normalizedUom)) return;
    try {
      const calculated = await services.callPost<Record<string, unknown>>("alumdoor.sales.production_line_context", {
        item_code: row.item_code,
        customer: parentDoc?.customer,
        customer_group: parentDoc?.customer_group,
        sales_mode: row.sales_mode ?? "Trọn bộ",
        has_butterfly_bracket: row.has_butterfly_bracket ?? 0,
        width_m: width,
        height_m: height,
        mesh_height_m: row.mesh_height_m,
        set_count: row.set_count ?? 1,
        leaf_variant: row.leaf_variant,
        leaf_divisor_m: row.leaf_divisor_m,
        single_layer_leaf_count: row.single_layer_leaf_count,
        purpose: "Bán hàng",
      });
      if (formulaLoadVersion.current.get(loadKey) !== loadVersion) return;
      const billable = Number(calculated.billable_area_sqm);
      const cutWidthM = Number(calculated.cut_width_m);
      if (!Number.isFinite(billable) || billable <= 0 || !Number.isFinite(cutWidthM) || cutWidthM <= 0) return;
      const has = (fieldname: string) => (childMeta.fields ?? []).some((field) => field.fieldname === fieldname);
      const currentRows = latestRows.current;
      const currentRowIdx = currentRows.findIndex((entry, index) => String(entry.name ?? index) === loadKey);
      if (currentRowIdx < 0) return;
      const currentRow = currentRows[currentRowIdx]!;
      const sets = Number(currentRow.set_count ?? 1);
      const patch: Record<string, unknown> = { qty: billable };
      if (has("formula_policy")) patch.formula_policy = calculated.policy_name;
      if (has("width_basis")) patch.width_basis = calculated.width_basis;
      if (has("cut_width_m")) patch.cut_width_m = cutWidthM;
      if (has("billable_area_sqm")) patch.billable_area_sqm = billable;
      for (const fieldname of [
        "door_type", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding", "leaf_count",
        "single_layer_leaf_count", "double_layer_leaf_count", "estimated_weight_kg", "estimated_minutes",
        "formula_version", "formula_explanation",
      ]) {
        if (has(fieldname) && calculated[fieldname] !== undefined && calculated[fieldname] !== null) patch[fieldname] = calculated[fieldname];
      }
      if (["bộ", "bo", "set"].includes(String(currentRow.stock_uom ?? "").trim().toLocaleLowerCase("vi"))
        && Number.isFinite(sets) && sets > 0) {
        if (has("conversion_factor")) patch.conversion_factor = sets / billable;
        if (has("stock_qty")) patch.stock_qty = sets;
      }
      const merged = currentRows.map((entry, index) => {
        if (index !== currentRowIdx) return entry;
        // `withComputed` vẫn phục vụ mọi app bằng công thức m2 chung. Áp snapshot của Worker
        // SAU nó để luật cửa thắng đúng tại app Alumdoor, rồi tính tiền từ qty đã chốt.
        const adjusted = { ...withComputed({ ...entry, ...patch }), ...patch } as Doc;
        const rate = Number(adjusted.rate);
        if ("amount" in adjusted && Number.isFinite(rate)) adjusted.amount = billable * rate;
        return adjusted;
      });
      emitRows(merged);
    } catch {
      // Item không thuộc năm loại cửa hoặc khách chưa phân nhóm: giữ công thức chung để form
      // vẫn nhập được; validator sẽ nêu đúng lý do khi người dùng lưu/ghi sổ.
    }
  };

  const formulaCustomerGroup = String(parentDoc?.customer_group ?? "");
  useEffect(() => {
    if (!formulaCustomerGroup || formulaCustomerGroup === previousFormulaGroup.current) return;
    previousFormulaGroup.current = formulaCustomerGroup;
    rows.forEach((row, rowIdx) => {
      const loadKey = String(row.name ?? rowIdx);
      const version = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
      formulaLoadVersion.current.set(loadKey, version);
      void fillDoorFormula(rowIdx, rows, loadKey, version);
    });
    // Chỉ chạy lại khi nhóm khách đổi. Thêm `rows` sẽ tự tạo vòng lặp vì kết quả tính cũng
    // cập nhật rows; các thay đổi dòng đã được `setCell` xử lý riêng ngay bên dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaCustomerGroup]);

  const sellingContextKey = [parentDoc?.selling_price_list, parentDoc?.currency].map((value) => String(value ?? "")).join("\u0000");
  useEffect(() => {
    if (!isDoorSalesGrid || !sellingContextKey || sellingContextKey === previousSellingContext.current) return;
    previousSellingContext.current = sellingContextKey;
    rows.forEach((row, rowIdx) => {
      const itemCode = String(row.item_code ?? "").trim();
      if (!itemCode) return;
      const loadKey = String(row.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, itemCode, rows, loadKey, loadVersion);
    });
    // Item rows are refreshed by setCell; this effect is only for a header price-list/currency change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellingContextKey]);

  const setCell = (rowIdx: number, fieldname: string, value: unknown) => {
    // Luôn ghép trên snapshot mới nhất. Hai ô số có thể phát onChange trước khi React render lại;
    // dùng prop `rows` cũ ở lần sửa sau sẽ làm mất giá trị người dùng vừa nhập ở lần trước.
    const currentRows = latestRows.current;
    // Mọi thao tác trên dòng đều làm kết quả công thức đang bay trở nên cũ. Tăng version ngay,
    // kể cả field vừa sửa không tham gia phép tính, để phản hồi chậm không ghi đè dữ liệu mới.
    const formulaKey = String(currentRows[rowIdx]?.name ?? rowIdx);
    const formulaVersion = (formulaLoadVersion.current.get(formulaKey) ?? 0) + 1;
    formulaLoadVersion.current.set(formulaKey, formulaVersion);
    if (["uom", "color", "colour"].includes(fieldname)) {
      const loadKey = String(currentRows[rowIdx]?.name ?? rowIdx);
      itemLoadVersion.current.set(loadKey, (itemLoadVersion.current.get(loadKey) ?? 0) + 1);
    }
    const next = currentRows.map((r, i) => {
      if (i !== rowIdx) return r;
      const changingItem = fieldname === "item_code" && value !== r.item_code;
      const reset = changingItem
        ? Object.fromEntries(ITEM_DERIVED_FIELDS.filter((name) => name in r).map((name) => [name, undefined]))
        : {};
      const updated = {
        ...r,
        ...reset,
        [fieldname]: value,
        // Hệ số thuộc về CẶP Item + UOM. Đổi một trong hai mà giữ hệ số cũ là cách tạo
        // tồn sai nhưng chứng từ vẫn hợp lệ, nên xoá để server tra lại từ master.
        ...((fieldname === "item_code" || fieldname === "uom") && "conversion_factor" in r
          ? { conversion_factor: undefined }
          : {}),
      };
      return COMPUTED_FROM.has(fieldname) ? withComputed(updated) : updated;
    }) as Doc[];
    emitRows(next);
    if (COMPUTED_FROM.has(fieldname)) {
      void fillDoorFormula(rowIdx, next, formulaKey, formulaVersion);
    }
    if (fieldname === "item_code" && value) {
      const loadKey = String(next[rowIdx]?.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, String(value), next, loadKey, loadVersion);
    } else if ((fieldname === "uom" || fieldname === "warehouse") && next[rowIdx]?.item_code) {
      const loadKey = String(next[rowIdx]?.name ?? rowIdx);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, String(next[rowIdx]!.item_code), next, loadKey, loadVersion);
    }
  };

  /**
   * Chọn mặt hàng xong thì tự điền ĐƠN VỊ TÍNH, tên và mô tả từ chính bản ghi Item.
   *
   * Trên ERPNext Desk việc này do client script gọi `get_item_details` làm; ta không chạy client
   * script của Frappe nên phải tự làm, nếu không thủ kho chọn hàng xong vẫn phải tự gõ đơn vị cho
   * TỪNG dòng — và gõ sai đơn vị thì số tồn sai theo (10 thùng ghi thành 10 cái).
   *
   * Nguyên tắc: CHỈ điền vào ô đang TRỐNG. Người dùng đã tự sửa đơn vị (mua theo thùng nhưng nhập
   * kho theo cái) thì không được đạp lên lựa chọn của họ.
   */
  /**
   * TÍNH phần cần điền cho một dòng, KHÔNG ghi.
   *
   * Tách khỏi phần ghi vì dán từ Excel cần điền NHIỀU dòng cùng lúc. Bản trước mỗi lần điền
   * tự gọi `onChange` với bản chụp `rows` của riêng nó; bắn 40 lời gọi song song thì cái về
   * sau cùng đè lên tất cả — dán 40 dòng chỉ có một dòng được điền, và đúng dòng nào thì tuỳ
   * mạng nhanh chậm.
   */
  const computeItemPatch = async (
    rowIdx: number,
    itemCode: string,
    base: Doc[],
  ): Promise<Record<string, unknown>> => {
    if (!services?.fetchValue && !services?.fetchDocument) return {};
    const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
    const item = services.fetchDocument
      ? await services.fetchDocument("Item", itemCode).catch(() => undefined)
      : undefined;
    const readItemValue = async (fieldname: string): Promise<unknown> => {
      // Form profile có thể lược bớt field khỏi document đã tải. Khi field đó trống, vẫn phải hỏi
      // riêng master value; nếu không ĐVT mua/tồn có dữ liệu nhưng bảng con chỉ hiện dấu "—".
      const documentValue = item?.[fieldname];
      if (documentValue !== undefined && documentValue !== null && documentValue !== "") return documentValue;
      return services?.fetchValue?.("Item", itemCode, fieldname).catch(() => undefined);
    };
    // nguồn trên Item → các ô đích trên dòng bảng con
    const plan: Array<[string, string[]]> = [
      ["stock_uom", ["stock_uom"]],
      ["inventory_mode", ["inventory_mode"]],
      ["measurement_profile", ["measurement_profile"]],
      ["material_specification", ["material_specification"]],
      ["item_name", ["item_name"]],
      ["description", ["description"]],
      ["default_color", ["color", "colour"]],
      ["min_area_sqm", ["min_area_sqm"]],
      ["door_type", ["door_type"]],
      ["purchase_kg_per_m2", ["purchase_kg_per_m2"]],
      ["leaf_divisor_m", ["leaf_divisor_m"]],
      ["standard_rate", ["rate"]],
      /**
       * KHO MẶC ĐỊNH của chính mặt hàng — nan nhôm về kho nhôm, mô tơ về kho phụ kiện.
       *
       * Cụ thể hơn bối cảnh đang chọn, nên nó được phép ghi đè giá trị mà `rowDefaults` vừa
       * mồi (xem điều kiện dưới). Cái nó KHÔNG bao giờ ghi đè là kho người dùng tự chọn.
       */
      ["default_warehouse", ["warehouse"]],
    ];
    const patch: Record<string, unknown> = {};
    await Promise.all(plan.map(async ([src, dests]) => {
      const targets = dests.filter((d) => {
        if (!has(d)) return false;
        const current = base[rowIdx]?.[d];
        if (!current) return true;
        // Giá trị do bối cảnh mồi vào thì mặc định của MẶT HÀNG được quyền thay.
        return rowDefaults?.[d] !== undefined && current === rowDefaults[d];
      });
      if (targets.length === 0) return;
      const v = await readItemValue(src);
      if (v === undefined || v === null || v === "") return;
      for (const d of targets) patch[d] = v;
    }));
    const allowedColors = Array.isArray(item?.allowed_colors)
      ? item.allowed_colors
        .map((entry) => entry && typeof entry === "object"
          ? String((entry as Record<string, unknown>).color ?? "").trim()
          : "")
        .filter(Boolean)
      : [];
    setAllowedColorsByItem((current) => (
      current[itemCode]?.join("\u0000") === allowedColors.join("\u0000")
        ? current
        : { ...current, [itemCode]: allowedColors }
    ));
    const currentColor = String(base[rowIdx]?.color ?? base[rowIdx]?.colour ?? "").trim();
    if (currentColor && !allowedColors.includes(currentColor)) {
      if (has("color")) patch.color = undefined;
      if (has("colour")) patch.colour = undefined;
    }
    if (has("theoretical_kg_per_m")) {
      const specification = String(patch.material_specification ?? item?.material_specification ?? "").trim();
      if (specification && services.fetchDocument) {
        const spec = await services.fetchDocument("Material Specification", specification).catch(() => undefined);
        const kgPerM = Number(spec?.theoretical_kg_per_m);
        if (Number.isFinite(kgPerM) && kgPerM > 0) patch.theoretical_kg_per_m = kgPerM;
      }
    }

    /**
     * ĐVT giao dịch có ưu tiên theo NGỮ CẢNH, không đồng nhất với ĐVT tồn:
     *
     *   - mua: default_purchase_uom;
     *   - bán/giao: default_sales_uom;
     *   - chứng từ khác: stock_uom.
     *
     * Thiếu mặc định riêng mới lùi về ĐVT tồn. Không tự nhét hệ số 1: nếu mua theo Cây mà
     * tồn theo Mét, server phải lấy đúng bảng quy đổi trên Item.
     */
    if (has("uom") && !base[rowIdx]?.uom) {
      const lower = childMeta.name.toLowerCase();
      const source = lower.includes("purchase") || lower.includes("supplier")
        ? "default_purchase_uom"
        : lower.includes("sales") || lower.includes("quotation") || lower.includes("delivery")
          ? "default_sales_uom"
          : "stock_uom";
      const preferred = await readItemValue(source);
      const fallback = source === "stock_uom"
        ? preferred
        : preferred || await readItemValue("stock_uom");
      if (fallback !== undefined && fallback !== null && fallback !== "") patch.uom = fallback;
    }
    const transactionUom = String(patch.uom ?? base[rowIdx]?.uom ?? "").trim();
    const stockUom = String(patch.stock_uom ?? item?.stock_uom ?? "").trim();
    if (has("conversion_factor") && transactionUom && stockUom) {
      if (transactionUom === stockUom) patch.conversion_factor = 1;
      else {
        const conversions = Array.isArray(item?.uom_conversions) ? item.uom_conversions : [];
        const match = conversions.find((row) => Boolean(row) && typeof row === "object"
          && String((row as Record<string, unknown>).uom ?? "").trim() === transactionUom) as Record<string, unknown> | undefined;
        const factor = Number(match?.conversion_factor);
        if (Number.isFinite(factor) && factor > 0) patch.conversion_factor = factor;
      }
    }

    if (isDoorSalesGrid && services?.callPost) {
      try {
        const salesContext = await services.callPost<Record<string, unknown>>("alumdoor.sales.item_context", {
          item_code: itemCode,
          uom: patch.uom ?? base[rowIdx]?.uom,
          warehouse: patch.warehouse ?? base[rowIdx]?.warehouse,
          price_list: parentDoc?.selling_price_list,
          currency: parentDoc?.currency,
          qty: base[rowIdx]?.qty,
        });
        const allowedUoms = Array.isArray(salesContext.allowed_uoms)
          ? salesContext.allowed_uoms.map((value) => String(value ?? "").trim()).filter(Boolean)
          : [];
        setAllowedUomsByItem((current) => (
          current[itemCode]?.join("\u0000") === allowedUoms.join("\u0000")
            ? current
            : { ...current, [itemCode]: allowedUoms }
        ));
        const selectedUom = String(salesContext.selected_uom ?? "").trim();
        if (has("uom") && !base[rowIdx]?.uom && selectedUom) patch.uom = selectedUom;
        const factor = Number(salesContext.conversion_factor);
        if (has("conversion_factor") && Number.isFinite(factor) && factor > 0) patch.conversion_factor = factor;
        if (has("available_qty")) patch.available_qty = salesContext.available_qty;
        if (has("available_stock_qty")) patch.available_stock_qty = salesContext.available_stock_qty;
        if (has("available_stock_uom")) patch.available_stock_uom = salesContext.stock_uom;
        if (has("availability_status")) patch.availability_status = salesContext.availability_status;
        for (const fieldname of ["door_type", "purchase_kg_per_m2", "leaf_divisor_m"]) {
          if (has(fieldname) && salesContext[fieldname] !== undefined && salesContext[fieldname] !== null) patch[fieldname] = salesContext[fieldname];
        }
        if (parentDoc?.selling_price_list && has("rate")) {
          patch.rate = salesContext.price_missing ? undefined : salesContext.rate;
        }
      } catch {
        if (has("available_qty")) patch.available_qty = undefined;
        if (has("available_stock_qty")) patch.available_stock_qty = undefined;
        if (has("available_stock_uom")) patch.available_stock_uom = undefined;
        if (parentDoc?.selling_price_list && has("rate")) patch.rate = undefined;
        if (has("availability_status")) patch.availability_status = "Không đọc được tồn / giá";
      }
    }
    // Item tạo trước khi có kiểu quản lý được coi là hàng thường — tương thích ngược.
    if (has("inventory_mode") && !Object.hasOwn(patch, "inventory_mode")) patch.inventory_mode = "Hàng thường";

    /**
     * Đổi từ một mã nhôm sang hàng thường phải xoá quy cách của mã cũ. Giữ lại các số này
     * sẽ tạo một dòng motor mang 51 cây × 8,5 m trong payload dù giao diện đã giấu chúng.
     */
    if (patch.inventory_mode !== "Nhôm cây/lá") {
      for (const fieldname of [
        "length_m", "qty_bundle", "qty_bar", "so_no", "total_length_m", "actual_kg_per_m",
        "material_specification", "theoretical_kg_per_m", "theoretical_kg", "is_stamped",
      ]) {
        if (has(fieldname)) patch[fieldname] = undefined;
      }
    }
    if (patch.inventory_mode !== "Tấm/Kính" && patch.inventory_mode !== "Thành phẩm theo m2") {
      if (has("actual_kg_per_sqm")) patch.actual_kg_per_sqm = undefined;
    }
    return patch;
  };

  const fillItemDefaults = async (
    rowIdx: number,
    itemCode: string,
    base: Doc[],
    loadKey: string,
    loadVersion: number,
  ) => {
    const patch = await computeItemPatch(rowIdx, itemCode, base);
    // Người dùng đổi Item lần nữa trước khi các Link mặc định tải xong: kết quả cũ phải bị bỏ,
    // nếu không màu/UOM của mặt hàng trước sẽ chui vào dòng mới rồi bị server từ chối lúc lưu.
    if (itemLoadVersion.current.get(loadKey) !== loadVersion) return;
    if (Object.keys(patch).length === 0) return;
    const currentRows = latestRows.current;
    const currentRowIdx = currentRows.findIndex((entry, index) => String(entry.name ?? index) === loadKey);
    if (currentRowIdx < 0 || String(currentRows[currentRowIdx]?.item_code ?? "") !== itemCode) return;
    const currentRow = currentRows[currentRowIdx]!;
    // Master Item tải bất đồng bộ. Trong lúc chờ, người dùng có thể đã nhập SL/Đơn giá; chỉ tự điền
    // vào ô còn trống, còn các field phân loại thuộc chính Item luôn phải đồng bộ theo mã vừa chọn.
    const authoritativeItemFields = new Set([
      "stock_uom", "inventory_mode", "measurement_profile", "material_specification",
      "item_name", "description", "min_area_sqm", "theoretical_kg_per_m",
      "available_qty", "available_stock_qty", "available_stock_uom", "availability_status",
    ]);
    if (parentDoc?.selling_price_list) {
      authoritativeItemFields.add("rate");
      authoritativeItemFields.add("conversion_factor");
    }
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([fieldname]) => {
      if (authoritativeItemFields.has(fieldname)) return true;
      const current = currentRow[fieldname];
      return current === undefined || current === null || current === ""
        || (rowDefaults?.[fieldname] !== undefined && current === rowDefaults[fieldname]);
    }));
    const merged = currentRows.map((r, i) => (i === currentRowIdx ? { ...r, ...safePatch } : r));
    // Đơn giá vừa mồi xong thì thành tiền phải theo ngay, không đợi người dùng chạm vào ô.
    const computed = merged.map((r, i) => (i === currentRowIdx ? withComputed(r) : r));
    emitRows(computed);
    const formulaVersion = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
    formulaLoadVersion.current.set(loadKey, formulaVersion);
    void fillDoorFormula(currentRowIdx, computed, loadKey, formulaVersion);
  };

  /** Điền cho NHIỀU dòng rồi ghi MỘT lần — đường dán từ Excel đi lối này. */
  const fillItemDefaultsMany = async (indices: number[], base: Doc[]) => {
    const patches = await Promise.all(indices.map(async (at) =>
      [at, await computeItemPatch(at, String(base[at]?.item_code ?? ""), base)] as const));
    const byRow = new Map(patches.filter(([, p]) => Object.keys(p).length > 0));
    if (byRow.size === 0) return;
    const merged = base.map((r, i) => (byRow.has(i) ? withComputed({ ...r, ...byRow.get(i)! }) : r));
    emitRows(merged);
    for (const rowIdx of byRow.keys()) {
      const loadKey = String(merged[rowIdx]?.name ?? rowIdx);
      const version = (formulaLoadVersion.current.get(loadKey) ?? 0) + 1;
      formulaLoadVersion.current.set(loadKey, version);
      void fillDoorFormula(rowIdx, merged, loadKey, version);
    }
  };
  /**
   * Dòng mới mang sẵn giá trị mặc định của field và của BỐI CẢNH đang chọn.
   *
   * Trước đây dòng mới hoàn toàn trắng, nên thủ kho phải chọn lại đúng một cái kho cho từng
   * dòng, mỗi lần lập phiếu. Mặc định của field (`default` trong metadata) cũng bị bỏ qua ở
   * bảng con dù form cha vẫn dùng — hai chỗ cùng một khái niệm mà hành xử khác nhau.
   */
  /**
   * Link picker có thể trả mã hàng trước khi lượt lấy master đầu tiên hoàn tất. Nếu lượt đó bị
   * thay thế bởi một cập nhật cùng dòng, các cột quy cách đã mở nhưng định mức vẫn trống. Tự bù
   * lại theo trạng thái dòng: chỉ chạy khi đã có mã hàng mà chưa có kg/m và chặn request trùng.
   */
  useEffect(() => {
    const hasBaremField = (childMeta.fields ?? []).some((field) => field.fieldname === "theoretical_kg_per_m");
    const hasColorField = (childMeta.fields ?? []).some((field) => field.fieldname === "color" || field.fieldname === "colour");
    if (!hasBaremField && !hasColorField) return;
    rows.forEach((row, rowIdx) => {
      const itemCode = String(row.item_code ?? "").trim();
      const kgPerM = Number(row.theoretical_kg_per_m);
      const needsBarem = hasBaremField && !(Number.isFinite(kgPerM) && kgPerM > 0);
      const needsColorPolicy = hasColorField
        && !Object.prototype.hasOwnProperty.call(allowedColorsByItem, itemCode);
      if (!itemCode || (!needsBarem && !needsColorPolicy)) return;
      const loadKey = String(row.name ?? rowIdx);
      const requestKey = `${loadKey}:${itemCode}`;
      if (automaticItemLoads.current.has(requestKey)) return;
      automaticItemLoads.current.add(requestKey);
      const loadVersion = (itemLoadVersion.current.get(loadKey) ?? 0) + 1;
      itemLoadVersion.current.set(loadKey, loadVersion);
      void fillItemDefaults(rowIdx, itemCode, rows, loadKey, loadVersion)
        .finally(() => automaticItemLoads.current.delete(requestKey));
    });
    // `rows` là nguồn sự thật; service và metadata ổn định trong vòng đời bảng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, allowedColorsByItem]);

  const addRow = () => {
    const seed: Doc = { name: `new-${Date.now()}`, doctype: childMeta.name } as Doc;
    for (const field of childMeta.fields ?? []) {
      if (isLayout(field.fieldtype)) continue;
      if (field.default != null && field.default !== "") seed[field.fieldname] = field.default;
    }
    for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
      if (value == null || value === "") continue;
      if (!(childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) continue;
      if (seed[fieldname] == null || seed[fieldname] === "") seed[fieldname] = value;
    }
    emitRows([...rows, seed]);
  };
  const deleteRows = (indices: number[]) => {
    const targets = new Set(indices.filter((index) => index >= 0 && index < rows.length));
    if (!targets.size) return;
    setLastDeleted(rows.flatMap((row, index) => targets.has(index) ? [{ row, index }] : []));
    emitRows(rows.filter((_, index) => !targets.has(index)));
    setSelectedRows([]);
    setPickedRow((current) => current == null ? null : Math.min(current, Math.max(0, rows.length - targets.size - 1)));
  };
  const delRow = (idx: number) => deleteRows([idx]);
  const undoDelete = () => {
    if (!lastDeleted?.length) return;
    const next = [...rows];
    for (const deleted of [...lastDeleted].sort((a, b) => a.index - b.index)) {
      next.splice(Math.min(deleted.index, next.length), 0, deleted.row);
    }
    emitRows(next);
    setLastDeleted(null);
  };
  const rowKey = (row: Doc, index: number) => String(row.name ?? index);
  const selectedSet = new Set(selectedRows);
  const toggleSelected = (row: Doc, index: number) => {
    const key = rowKey(row, index);
    setSelectedRows((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  };
  const moveRows = (offset: -1 | 1) => {
    const selectedIndices = rows
      .map((row, index) => selectedSet.has(rowKey(row, index)) || (selectedRows.length === 0 && pickedRow === index) ? index : -1)
      .filter((index) => index >= 0);
    if (!selectedIndices.length) return;
    const moving = new Set(selectedIndices);
    const next = [...rows];
    const ordered = offset < 0 ? selectedIndices : [...selectedIndices].reverse();
    for (const index of ordered) {
      const target = index + offset;
      if (target < 0 || target >= next.length || moving.has(target)) continue;
      [next[index], next[target]] = [next[target]!, next[index]!];
      moving.delete(index);
      moving.add(target);
    }
    emitRows(next);
    if (pickedRow != null) setPickedRow(Math.min(next.length - 1, Math.max(0, pickedRow + offset)));
  };

  /**
   * Dòng TỔNG dưới chân bảng — cách MISA hiển thị chi tiết chứng từ.
   *
   * Tổng của cột tiền phải nhìn thấy NGAY dưới bảng, không phải đợi lưu rồi mới hiện ở ô
   * tổng của chứng từ. Người lập phiếu soát bằng cách so con số này với tờ hoá đơn trên
   * tay; bắt họ lưu trước rồi mới biết là bắt sửa sau khi đã ghi.
   *
   * Chỉ cộng cột SỐ, và chỉ khi có ít nhất một dòng — một hàng "Tổng: 0" dưới bảng rỗng là
   * nhiễu. Server vẫn tính lại toàn bộ khi lưu; đây là con số để NHÌN.
   */
  const numericColumns = cols.filter((c) => ["Currency", "Float", "Int", "Percent"].includes(c.fieldtype));
  const totals = new Map<string, number>();
  for (const column of numericColumns) {
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      const value = Number(row[column.fieldname]);
      if (Number.isFinite(value)) { sum += value; seen = true; }
    }
    if (seen) totals.set(column.fieldname, sum);
  }

  /** Nhân bản dòng — phiếu nhôm hay có 3–4 dòng chỉ khác nhau mỗi khổ và số cây. */
  const cloneRow = (idx: number) => {
    const source = rows[idx];
    if (!source) return;
    // Tên MỚI, không chép: hai dòng cùng `name` thì server coi là một, và dòng sau ghi đè dòng trước.
    const copy: Doc = { ...source, name: `new-${Date.now()}` };
    emitRows([...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)]);
  };
  /**
   * Điền xuống — chỉ vào ô ĐANG TRỐNG của các dòng dưới.
   *
   * Cố ý không đè lên ô đã có giá trị: "điền xuống" mà ghi đè thì một lần bấm nhầm xoá sạch
   * số liệu đã gõ của cả bảng, và không có bước hoàn tác nào ở đây.
   */
  const fillDown = (idx: number) => {
    const source = rows[idx];
    if (!source) return;
    const carry = (childMeta.fields ?? [])
      .filter((f) => !isLayout(f.fieldtype) && f.fieldname !== "name")
      .map((f) => f.fieldname);
    emitRows(rows.map((row, i) => {
      if (i <= idx) return row;
      const next = { ...row };
      for (const f of carry) {
        const value = source[f];
        if (value == null || value === "") continue;
        if (next[f] == null || next[f] === "") next[f] = value;
      }
      return withComputed(next);
    }));
  };

  /** Thêm nhiều dòng một lúc — dán 40 dòng từ Excel mà bấm "thêm dòng" 40 lần thì thà gõ tay. */
  const addRows = (count: number) => {
    const seeds: Doc[] = [];
    for (let i = 0; i < count; i += 1) {
      const seed: Doc = { name: `new-${Date.now()}-${i}`, doctype: childMeta.name } as Doc;
      for (const field of childMeta.fields ?? []) {
        if (isLayout(field.fieldtype)) continue;
        if (field.default != null && field.default !== "") seed[field.fieldname] = field.default;
      }
      for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
        if (value == null || value === "") continue;
        if (!(childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) continue;
        if (seed[fieldname] == null || seed[fieldname] === "") seed[fieldname] = value;
      }
      seeds.push(seed);
    }
    emitRows([...rows, ...seeds]);
  };

  /**
   * DÁN TỪ EXCEL — cách xưởng thực sự nhập một phiếu 40 dòng.
   *
   * Phiếu giao của nhà cung cấp về dưới dạng file Excel; gõ lại từng ô là vừa chậm vừa sai.
   * Trình duyệt đưa vùng chọn của Excel sang clipboard dưới dạng TSV, nên chỉ cần tách theo
   * tab và xuống dòng rồi xếp vào ĐÚNG THỨ TỰ CỘT đang hiện.
   *
   * Dán GHI ĐÈ từ dòng đang chọn xuống, và tự nối thêm dòng nếu clipboard dài hơn bảng —
   * dán 40 dòng vào bảng trống mà phải bấm thêm dòng trước thì cũng như không có tính năng.
   * Ô trống trong Excel KHÔNG xoá giá trị đang có (xem `parsePasted`).
   */
  const onPasteGrid = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;   // một ô đơn lẻ: để trình duyệt dán như thường
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const start = pickedRow ?? 0;
    const startColumn = Math.min(pickedColumn, Math.max(0, cols.length - 1));
    const next = [...rows];
    const needFill: number[] = [];
    matrix.forEach((cells, i) => {
      const at = start + i;
      if (!next[at]) {
        const seed: Doc = { name: `new-${Date.now()}-${at}`, doctype: childMeta.name } as Doc;
        for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
          if (value != null && value !== "" && (childMeta.fields ?? []).some((f) => f.fieldname === fieldname)) seed[fieldname] = value;
        }
        next[at] = seed;
      }
      const row = { ...next[at]! };
      const before = row.item_code;
      cells.forEach((cell, c) => {
        const column = cols[startColumn + c];
        if (!column) return;
        const value = parsePasted(column, cell);
        if (value !== undefined) row[column.fieldname] = value;
      });
      if (row.item_code && row.item_code !== before) needFill.push(at);
      next[at] = withComputed(row);
    });
    emitRows(next);
    /**
     * Dán mã hàng phải kéo theo tên hàng, ĐVT, giá — y như chọn bằng ô Link.
     *
     * Bản đầu chỉ ghi thẳng giá trị vào dòng, nên dán xong cột "Tên hàng" và "ĐVT" đứng im:
     * chúng là ô MÁY điền, không gõ vào được, và cái điền chúng (`fillItemDefaults`) chỉ chạy
     * trong `setCell`. Kết quả là dán vào thì được một bảng mã hàng trơ trọi — đúng thứ mà
     * dán từ Excel sinh ra để khỏi phải làm.
     */
    if (needFill.length) void fillItemDefaultsMany(needFill, next);
  };

  /**
   * DI CHUYỂN BẰNG PHÍM như Excel: ↑ ↓ ← →, Enter xuống dòng, Tab sang phải.
   *
   * Không dựng lại một lưới ô riêng — mỗi ô ở đây là một control thật (Link có tìm kiếm,
   * Select có danh sách), thứ mà một lưới text thuần không thay được. Chỉ chuyển TIÊU ĐIỂM
   * giữa các ô, bằng cách hỏi DOM ô kế tiếp qua `data-cell`.
   *
   * Bỏ qua khi ô đang mở danh sách (`aria-expanded`): lúc đó mũi tên thuộc về danh sách đó,
   * cướp nó đi thì không chọn nổi mặt hàng bằng bàn phím nữa.
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const focusCell = (r: number, c: number) => {
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
    const target = cell?.querySelector<HTMLElement>("input,button,textarea,select,[tabindex]") ?? cell;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  };
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!holder) return;
    if (holder.querySelector('[aria-expanded="true"]')) return;
    const [r, c] = holder.dataset.cell!.split(":").map(Number) as [number, number];
    const go = (dr: number, dc: number) => {
      const nr = Math.min(Math.max(r + dr, 0), rows.length - 1);
      const nc = Math.min(Math.max(c + dc, 0), cols.length - 1);
      if (nr === r && nc === c) return;
      event.preventDefault();
      focusCell(nr, nc);
    };
    if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) go(1, 0);
    else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) go(-1, 0);
    else if (event.key === "Tab" && !event.shiftKey) {
      if (c < cols.length - 1) go(0, 1);
      else if (r < rows.length - 1) { event.preventDefault(); focusCell(r + 1, 0); }
    } else if (event.key === "Tab" && event.shiftKey) {
      if (c > 0) go(0, -1);
      else if (r > 0) { event.preventDefault(); focusCell(r - 1, cols.length - 1); }
    }
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Trong ô chữ, ← → phải là di chuyển con trỏ TRONG chữ, không phải nhảy ô.
      const input = event.target as HTMLInputElement;
      const atEdge = !("selectionStart" in input) || (event.key === "ArrowRight"
        ? input.selectionStart === String(input.value ?? "").length
        : input.selectionStart === 0);
      if (atEdge) go(0, event.key === "ArrowRight" ? 1 : -1);
    }
  };

  /** Ctrl+C chép cả bảng ra dạng Excel dán được — đối chiếu với file của nhà cung cấp. */
  const onCopyGrid = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString();
    if (selection) return;   // đang bôi đen chữ trong một ô: để trình duyệt chép như thường
    event.preventDefault();
    const line = (values: unknown[]) => values.map((v) => String(v ?? "")).join("\t");
    const body = rows.map((row) => line(cols.map((c) => row[c.fieldname])));
    event.clipboardData.setData("text/plain", [line(cols.map((c) => layout.labels[c.fieldname] || c.label || c.fieldname)), ...body].join("\n"));
  };

  /**
   * ĐỌC PHIẾU GIAO BẰNG ẢNH — chụp tờ giấy của nhà cung cấp, máy dựng sẵn các dòng hàng.
   *
   * Kết quả là ĐỀ XUẤT, không phải dữ liệu đã ghi: các dòng hiện lên bảng để người nhập soát
   * rồi mới bấm lưu. Dòng nào máy không quy được về mã trong danh mục thì để TRỐNG ô mã và
   * ghi nguyên văn đã đọc vào ghi chú — thà để trống cho người ta thấy, còn hơn đoán một mã
   * gần giống rồi nhập sai kho mà không ai biết.
   */
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const onPickReceiptImage = async (file: File) => {
    setReading(true);
    setReadError(null);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Không đọc được tệp ảnh"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/method/metaforge.ai.read_receipt", {
        method: "POST", credentials: "include",
        headers: aiHeaders(),
        body: JSON.stringify({ image }),
      });
      const result = await response.json() as {
        message?: string;
        lines?: Array<Record<string, unknown>>;
        unmatched?: number;
      };
      if (!response.ok) { setReadError(result.message ?? `Lỗi ${response.status}`); return; }
      const read = result.lines ?? [];
      if (!read.length) { setReadError("Không thấy dòng hàng nào trên ảnh."); return; }

      const has = (f: string) => (childMeta.fields ?? []).some((x) => x.fieldname === f);
      const made: Doc[] = read.map((line, i) => {
        const row: Doc = { name: `new-${Date.now()}-${i}`, doctype: childMeta.name } as Doc;
        for (const [fieldname, value] of Object.entries(rowDefaults ?? {})) {
          if (value != null && value !== "" && has(fieldname)) row[fieldname] = value;
        }
        const put = (field: string, value: unknown) => {
          if (value == null || value === "" || !has(field)) return;
          row[field] = value;
        };
        put("item_code", line.item_code);
        put("color", line.color); put("colour", line.color);
        put("qty", line.qty); put("uom", line.uom);
        put("length_m", line.length_m); put("qty_bar", line.qty_bar);
        put("rate", line.rate);
        if (!line.item_code && line.raw_text) put("note", `AI đọc: ${String(line.raw_text)} — CHƯA khớp mã`);
        return row;
      });
      const next = [...rows, ...made];
      emitRows(next);
      const fill = made.map((row, i) => (row.item_code ? rows.length + i : -1)).filter((i) => i >= 0);
      if (fill.length) void fillItemDefaultsMany(fill, next);
      if (result.unmatched) setReadError(`Đã thêm ${made.length} dòng. ${result.unmatched} dòng chưa khớp được mã — xem ghi chú của dòng.`);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Đọc phiếu thất bại");
    } finally {
      setReading(false);
    }
  };

  /**
   * KÉO GIÃN cột: bám theo con trỏ, chốt lại khi thả.
   *
   * Dùng pointer capture nên chuột đi ra ngoài ô tiêu đề vẫn kéo tiếp — không có nó thì thao
   * tác đứt quãng ngay khi con trỏ vượt mép cột, đúng lúc đang muốn nới rộng. Chặn dưới 3rem:
   * một cột 0px là cột không bấm được, và không có cách nào kéo nó trở lại.
   */
  const startResize = (fieldname: string, event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const header = handle.closest("th");
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const startX = event.clientX;
    const startRem = (header?.getBoundingClientRect().width ?? 8 * rem) / rem;
    handle.setPointerCapture(event.pointerId);
    let latest = startRem;
    const move = (e: PointerEvent) => {
      latest = Math.max(3, startRem + (e.clientX - startX) / rem);
      setLayout((prev) => ({ ...prev, w: { ...prev.w, [fieldname]: latest } }));
    };
    const done = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      saveLayout({ ...layout, w: { ...layout.w, [fieldname]: latest } });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
  };

  /** ĐỔI CHỖ cột: thả cột đang kéo vào VỊ TRÍ của cột đích, các cột còn lại dồn theo. */
  const dragged = useRef<string | null>(null);
  const dropColumn = (target: string) => {
    const source = dragged.current;
    dragged.current = null;
    if (!source || source === target) return;
    const current = cols.map((c) => c.fieldname);
    const without = current.filter((n) => n !== source);
    const at = without.indexOf(target);
    if (at < 0) return;
    saveLayout({ ...layout, order: [...without.slice(0, at), source, ...without.slice(at)] });
  };

  const table = (
    <>
      {/* CUỘN NGANG, không cắt. `overflow-hidden` trước đây giấu mất các cột phía sau mà
          không để lại dấu hiệu nào — bảng chỉ đơn giản là thiếu cột. Cột "#" GHIM lại bên
          trái khi cuộn, cách MISA làm, để không lạc dòng khi kéo sang phải. */}
      <div className="overflow-x-auto rounded-md border [scrollbar-width:thin]">
        {/* Bảng lớn CHIA phần trong khung (`w-full`, không ép min-width) nên 12 cột vừa trọn
            màn hình; bảng gọn vẫn tràn để cuộn vì khung của nó hẹp hơn tổng các cột. */}
        <Table className={expanded ? "w-full table-fixed" : "table-fixed"} style={expanded ? undefined : { minWidth: `${minWidthRem}rem` }}>
          <colgroup>
            {!readOnly ? <col className="w-10" /> : null}
            <col className="w-10" />
            {/*
              MỌI cột đều khai bề rộng — kể cả cột ghi chú.
              Để trống một cột nghĩa là "cột này nhận phần CÒN LẠI", và phần còn lại không có
              giới hạn nào: trên màn hình rộng, ghi chú phình ra chiếm nửa bảng trong khi mã
              hàng và số lượng chen chúc. Cũng chính chỗ trống đó từng cho ra cột rộng 0px khi
              phần còn lại âm. Khai hết thì `table-fixed` giãn đều theo tỉ lệ — cân đối ở mọi
              bề ngang, và không còn cột nào có thể biến mất.
            */}
            {cols.map((c) => (
              <col
                key={c.fieldname}
                className="[width:var(--mf-col-width)]"
                style={{ "--mf-col-width": columnWidth(c) || (c.fieldname === flexible ? "10rem" : gridWidth(c)) } as CSSProperties}
              />
            ))}
            {!readOnly ? <col className="w-[4.5rem]" /> : null}
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {!readOnly ? (
                <TableHead className="sticky left-0 z-40 w-10 bg-card text-center">
                  <Checkbox
                    checked={rows.length > 0 && selectedRows.length === rows.length}
                    onCheckedChange={() => setSelectedRows(selectedRows.length === rows.length ? [] : rows.map(rowKey))}
                    aria-label="Chọn tất cả dòng"
                  />
                </TableHead>
              ) : null}
              <TableHead className={`sticky z-40 w-10 bg-card text-right ${readOnly ? "left-0" : "left-10"}`}>#</TableHead>
              {cols.map((c) => {
                const sticky = stickyColumn(c.fieldname, true);
                return (
                <TableHead
                  key={c.fieldname}
                  className={`group relative truncate whitespace-nowrap ${sticky.className}`}
                  style={sticky.style}
                  draggable={!readOnly}
                  onDragStart={() => { dragged.current = c.fieldname; }}
                  onDragOver={(event) => { if (dragged.current) event.preventDefault(); }}
                  onDrop={() => dropColumn(c.fieldname)}
                  title={readOnly ? undefined : "Kéo tiêu đề để đổi chỗ cột · kéo mép phải để giãn"}
                >
                  {layout.labels[c.fieldname] || childGridColumnLabel(childMeta, c)}
                  {c.reqd ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
                  {!readOnly ? (
                    /* Tay kéo nằm ĐÈ lên mép phải của ô tiêu đề, rộng 6px để bấm trúng được
                       bằng chuột mà không cần ngắm. Mờ đi cho tới khi rê vào cột. */
                    <span
                      role="presentation"
                      onPointerDown={(event) => startResize(c.fieldname, event)}
                      onDragStart={(event) => event.preventDefault()}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 transition group-hover:opacity-100 hover:bg-primary/60"
                    />
                  ) : null}
                </TableHead>
              );})}
              {!readOnly ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow
                key={String(row.name ?? ri)}
                className={(expanded && pickedRow === ri) || selectedSet.has(rowKey(row, ri)) ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-transparent"}
                {...(expanded ? { onFocusCapture: () => setPickedRow(ri), onClick: () => setPickedRow(ri) } : {})}
              >
                {!readOnly ? (
                  <TableCell className="sticky left-0 z-20 bg-card text-center" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selectedSet.has(rowKey(row, ri))} onCheckedChange={() => toggleSelected(row, ri)} aria-label={`Chọn dòng ${ri + 1}`} />
                  </TableCell>
                ) : null}
                <TableCell className={`sticky z-20 bg-card text-right text-xs text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>{ri + 1}</TableCell>
                {cols.map((c) => {
                  const sticky = stickyColumn(c.fieldname);
                  const Control = registry.resolve(c.fieldtype) ?? FallbackControl;
                  // `list_only` means "show in a table", not "hide from a table". The shared form
                  // resolver hides it for standalone form fields, so clear the flag inside ChildGrid.
                  const gridField = fieldForRow(c.list_only ? { ...c, list_only: 0 } : c, row);
                  // P1-06 canonical: trạng thái field con theo depends_on/read_only_depends_on/docstatus,
                  // eval trong ngữ cảnh row (doc) + doc cha (parent). assumeWritable: quyền ghi bảng con
                  // KẾ THỪA từ cha (DocType con permissions rỗng) — grid đã gate bằng readOnly field cha
                  // (H1). Vẫn tôn trọng read_only/read_only_depends_on/docstatus + masked_fields server.
                  const rf = resolveField(gridField, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
                  // Sales Order prices are authoritative from Item Price (price list + item + UOM).
                  // Keep this lock in code as well as metadata so stale tenant metadata cannot
                  // expose a writable rate during a rolling release.
                  const serverPricedSalesField = childMeta.name === "Sales Order Item"
                    && (c.fieldname === "rate" || c.fieldname === "discount_percentage");
                  const cellReadOnly = Boolean(readOnly || rf.readOnly || serverPricedSalesField || (expanded && !rf.visible));
                  const cellHint = !rf.visible
                    ? "Không áp dụng cho mặt hàng này"
                    : (rf.readOnly || serverPricedSalesField)
                      ? "Hệ thống tự tính hoặc tự điền"
                      : "Có thể nhập";
                  /**
                   * Bảng lớn LUÔN vẽ đủ ô, kể cả field đang bị `depends_on` ẩn.
                   *
                   * `depends_on` của các field quy cách đọc `inventory_mode` — thứ chỉ có SAU khi
                   * đã chọn mã hàng. Nên trên một dòng còn trống, gần như mọi cột hiện dấu "—":
                   * bảng trông như bị khoá cứng. Các ô đó vẫn tồn tại để giữ đúng cấu trúc khi dán bảng,
                   * nhưng bị khoá và tô xám cho tới khi mặt hàng đã chọn làm chúng có hiệu lực.
                   * Ở bảng gọn thì "—" đúng (đã biết hàng gì rồi thì cột không liên quan chỉ gây
                   * nhiễu); ở trang tính thì cột phải có sẵn để còn dán cả khối vào.
                   */
                  if (!rf.visible && !expanded) {
                    return <TableCell key={c.fieldname} className={`align-top !bg-muted/80 text-center text-xs text-muted-foreground ${sticky.className}`} style={sticky.style}>—</TableCell>;
                  }
                  return (
                    <TableCell
                      key={c.fieldname}
                      data-cell={`${ri}:${cols.indexOf(c)}`}
                      data-editable={cellReadOnly ? "false" : "true"}
                      className={`align-top transition-colors ${
                        cellReadOnly
                          ? "!bg-muted/80 text-muted-foreground [&_.mf-control]:border-muted-foreground/20 [&_.mf-control]:bg-muted/40"
                          : "!bg-primary/[0.07] ring-1 ring-inset ring-primary/25 focus-within:!bg-primary/[0.12] focus-within:ring-2 focus-within:ring-primary/60 [&_.mf-control]:border-primary/40 [&_.mf-control]:bg-background"
                      } ${sticky.className}`}
                      style={sticky.style}
                      title={cellHint}
                      onFocusCapture={() => { setPickedRow(ri); setPickedColumn(cols.indexOf(c)); }}
                      onClick={() => { setPickedRow(ri); setPickedColumn(cols.indexOf(c)); }}
                    >
                      <Control
                        field={gridField}
                        value={row[c.fieldname]}
                        onChange={(v: unknown) => setCell(ri, c.fieldname, v)}
                        readOnly={cellReadOnly}
                        masked={rf.masked}
                        services={services}
                        docname={String(row.name ?? "")}
                        linkTarget={dynamicLinkTarget(c, row)}
                        parentDoctype={childMeta.name}
                        docValues={row}
                        roles={roles}
                        compact
                      />
                    </TableCell>
                  );
                })}
                {!readOnly ? (
                  <TableCell className="whitespace-nowrap">
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => setDetailRow(ri)} aria-label="Chi tiết dòng" title="Chi tiết dòng">
                      <Maximize2 />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => delRow(ri)} aria-label={t("grid.remove_row")}>
                      <X />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-16 text-center text-muted-foreground" colSpan={cols.length + (readOnly ? 1 : 3)}>
                  {t("grid.empty")}
                </TableCell>
              </TableRow>
            ) : null}
            {rows.length > 0 && totals.size > 0 ? (
              <TableRow className="border-t-2 bg-muted/40 font-medium hover:bg-muted/40">
                {!readOnly ? <TableCell className="sticky left-0 z-20 bg-muted/40" /> : null}
                <TableCell className={`sticky z-20 bg-muted/40 text-right text-xs text-muted-foreground ${readOnly ? "left-0" : "left-10"}`}>Σ</TableCell>
                {cols.map((c) => {
                  const sticky = stickyColumn(c.fieldname);
                  return (
                  <TableCell key={c.fieldname} className={`whitespace-nowrap text-right tabular-nums ${sticky.className}`} style={sticky.style}>
                    {totals.has(c.fieldname)
                      ? (services?.fmt?.number
                          ? services.fmt.number(totals.get(c.fieldname)!)
                          : totals.get(c.fieldname)!.toLocaleString("vi-VN"))
                      : null}
                  </TableCell>
                );})}
                {!readOnly ? <TableCell /> : null}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );

  /** Bảng field của MỘT dòng — dùng cho cả hộp chi tiết và panel bên phải của bảng lớn. */
  const rowFields = (idx: number, columns: string) => {
    const row = rows[idx];
    if (!row) return null;
    return (
      <div className={`grid min-w-0 gap-x-3 gap-y-3 ${columns}`}>
        {(childMeta.fields ?? []).filter((f) => !isLayout(f.fieldtype)).map((f) => {
          const rf = resolveField(f, childMeta, { doc: row, parent: parentDoc, roles, assumeWritable: true });
          if (!rf.visible) return null;
          const Control = registry.resolve(f.fieldtype) ?? FallbackControl;
          return (
            <div key={f.fieldname} className={`grid min-w-0 gap-1.5 ${columns.includes("grid-cols-1") ? "" : detailFieldSpan(f)}`}>
              <label className="text-sm font-medium" htmlFor={`detail-${f.fieldname}`}>
                {f.label ?? f.fieldname}
                {f.reqd ? <span className="mf-required ml-0.5 text-destructive">*</span> : null}
              </label>
              <Control
                field={fieldForRow(f, row)}
                value={row[f.fieldname]}
                onChange={(v: unknown) => setCell(idx, f.fieldname, v)}
                readOnly={readOnly || rf.readOnly}
                masked={rf.masked}
                services={services}
                docname={String(row.name ?? "")}
                linkTarget={dynamicLinkTarget(f, row)}
                parentDoctype={childMeta.name}
                docValues={row}
                roles={roles}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const toolbar = !readOnly ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus /> {t("grid.add_row")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setColumnSettingsOpen(true)}>
        <Columns3 /> Cột
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pickedRow == null && selectedRows.length === 0} onClick={() => moveRows(-1)} aria-label="Đưa dòng lên">
        <ArrowUp /> Lên
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pickedRow == null && selectedRows.length === 0} onClick={() => moveRows(1)} aria-label="Đưa dòng xuống">
        <ArrowDown /> Xuống
      </Button>
      {selectedRows.length ? (
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteRows(rows.map((row, index) => selectedSet.has(rowKey(row, index)) ? index : -1).filter((index) => index >= 0))}>
          <Trash2 /> Xóa {selectedRows.length} dòng
        </Button>
      ) : null}
      {lastDeleted?.length ? (
        <Button type="button" variant="ghost" size="sm" onClick={undoDelete}>
          <Undo2 /> Hoàn tác xóa
        </Button>
      ) : null}
      {expanded ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => addRows(10)}>
            <Plus /> Thêm 10 dòng
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pickedRow == null} onClick={() => pickedRow != null && cloneRow(pickedRow)}>
            <Copy /> Nhân bản dòng
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pickedRow == null} onClick={() => pickedRow != null && fillDown(pickedRow)} title="Chép giá trị của dòng đang chọn xuống các ô còn TRỐNG ở dưới">
            <ArrowDownToLine /> Điền xuống
          </Button>
          <FileButton
            accept="image/*"
            capture="environment"
            disabled={reading}
            onFiles={(files) => {
              const file = files?.[0];
              if (file) void onPickReceiptImage(file);
            }}
          >
            <ScanLine className="size-4" />
            {reading ? "Đang đọc ảnh…" : "Đọc phiếu bằng ảnh"}
          </FileButton>
          <span className="text-xs text-muted-foreground">Chép vùng trong Excel rồi Ctrl+V ngay trên bảng</span>
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => { setExpanded(true); setPickedRow(rows.length ? 0 : null); }}>
          <Maximize2 /> Mở bảng lớn
        </Button>
      )}
      <span className="inline-flex items-center gap-3 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium" aria-label="Chú thích trạng thái ô">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className="size-3.5 rounded-sm border border-primary/50 bg-primary/10 ring-1 ring-primary/20" /> Ô nhập liệu
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-3.5 rounded-sm border border-muted-foreground/20 bg-muted" /> Tự tính / không áp dụng
        </span>
      </span>
      {/* Kéo nhầm một cột về 3rem rồi mở lại vẫn thấy nó bé tí là một cái bẫy không lối ra —
          tuỳ chỉnh nào lưu lại được cũng phải có đường hoàn tác. */}
      {hasCustomLayout ? (
        <Button type="button" variant="ghost" size="sm" onClick={resetLayout}>
          <RotateCcw /> Cột về mặc định
        </Button>
      ) : null}
      <span className="ml-auto text-xs text-muted-foreground">{rows.length} dòng</span>
    </div>
  ) : null;

  const columnDialog = (
    <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
      <DialogContent className="max-h-[82vh] w-[min(94vw,680px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tùy chỉnh cột</DialogTitle>
          <DialogDescription>Ẩn, đổi tên và ghim các cột cần nhìn khi cuộn ngang. Cột nhận diện luôn được giữ lại.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {baseCols.map((column) => {
            const isIdentity = column.fieldname === baseIdentity;
            const hidden = layout.hidden.includes(column.fieldname);
            const pinned = isIdentity || layout.pinned.includes(column.fieldname);
            return (
              <div key={column.fieldname} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2">
                <Checkbox
                  checked={!hidden}
                  disabled={isIdentity}
                  onCheckedChange={() => saveLayout({
                    ...layout,
                    hidden: hidden
                      ? layout.hidden.filter((field) => field !== column.fieldname)
                      : [...layout.hidden, column.fieldname],
                    pinned: hidden ? layout.pinned : layout.pinned.filter((field) => field !== column.fieldname),
                  })}
                  aria-label={`Hiển thị cột ${column.label ?? column.fieldname}`}
                />
                <Input
                  className="h-8"
                  value={layout.labels[column.fieldname] ?? childGridColumnLabel(childMeta, column)}
                  onChange={(event) => saveLayout({
                    ...layout,
                    labels: { ...layout.labels, [column.fieldname]: event.target.value },
                  })}
                  aria-label={`Tên hiển thị cột ${childGridColumnLabel(childMeta, column)}`}
                />
                <Button
                  type="button"
                  variant={pinned ? "secondary" : "ghost"}
                  size="icon-sm"
                  disabled={hidden || isIdentity}
                  onClick={() => saveLayout({
                    ...layout,
                    pinned: pinned
                      ? layout.pinned.filter((field) => field !== column.fieldname)
                      : [...layout.pinned, column.fieldname],
                  })}
                  aria-label={`${pinned ? "Bỏ ghim" : "Ghim"} cột ${column.label ?? column.fieldname}`}
                >
                  {pinned ? <PinOff /> : <Pin />}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={resetLayout}>
            <RotateCcw /> Mặc định
          </Button>
          <Button type="button" onClick={() => setColumnSettingsOpen(false)}>Xong</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (expanded) {
    return (
      <div className="mf-grid space-y-2">
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Đang nhập ở bảng lớn — {rows.length} dòng.
        </div>
        <Dialog open onOpenChange={(open) => { if (!open) setExpanded(false); }}>
          <DialogContent className="flex h-[94vh] w-[97vw] max-w-none flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-3 border-b px-4 py-3">
                <span>{childMeta.label ?? childMeta.name}</span>
                <Button type="button" size="sm" className="ml-auto" onClick={() => setExpanded(false)}>
                  Lưu và quay lại
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="shrink-0 border-b px-4 py-2">{toolbar}</div>
            {readError ? (
              <div className="shrink-0 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400" role="status">
                {readError}
                <Button type="button" variant="link" className="ml-2 h-auto p-0" onClick={() => setReadError(null)}>bỏ qua</Button>
              </div>
            ) : null}
            {/* Bảng chiếm trọn bề ngang. Field không có cột ở đây vẫn tới được qua nút chi tiết
                dòng (⛶) của bảng gọn — không mất field nào, chỉ là không nhét hết vào một lưới. */}
            {/*
              `min-w-0` là thứ giữ bảng NẰM TRONG hộp thoại.
              Mặc định một con flex rộng tối thiểu bằng nội dung của nó, nên bảng rộng hơn màn
              hình sẽ đẩy phình cả hộp thoại — thanh công cụ và nút "Lưu và quay lại" trôi ra
              ngoài mép phải, đúng thứ nhìn thấy trên ảnh chụp. Có `min-w-0` thì phần tràn
              thuộc về thanh cuộn của riêng vùng bảng.
            */}
            <div
              ref={gridRef}
              className="mf-grid-excel min-h-0 min-w-0 flex-1 overflow-auto p-3"
              onPaste={onPasteGrid}
              onCopy={onCopyGrid}
              onKeyDown={onGridKeyDown}
            >
              {table}
            </div>
          </DialogContent>
        </Dialog>
        {columnDialog}
      </div>
    );
  }

  return (
    <div className="mf-grid space-y-2">
      {table}
      {toolbar}
      {columnDialog}

      {/*
        CHI TIẾT DÒNG — mọi field của dòng, kể cả field không làm cột.
        Đây là thứ khiến việc rút gọn cột trở nên AN TOÀN: bảng chỉ giữ vài cột người ta
        nhìn mỗi ngày, còn field ít dùng (hệ số quy đổi, ghi chú dòng, kho riêng của dòng)
        vẫn tới được — thay vì biến mất khỏi giao diện cùng với cột của nó. Bỏ một cột mà
        không có chỗ này là xoá field khỏi tầm với của người dùng.
      */}
      <Dialog open={detailRow != null} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[88vh] w-[min(96vw,860px)] max-w-none overflow-y-auto p-0">
          <DialogHeader>
            <DialogTitle className="border-b px-5 py-4">
              {childMeta.label ?? childMeta.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Dòng {detailRow != null ? detailRow + 1 : ""}
                {detailRow != null && childMeta.title_field && rows[detailRow]?.[childMeta.title_field]
                  ? ` · ${String(rows[detailRow]?.[childMeta.title_field])}`
                  : ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detailRow != null && rows[detailRow]
            ? <div className="px-5 pb-5">{rowFields(detailRow, "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}</div>
            : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
