/**
 * Mô hình dữ liệu phía client cho màn NHẬP HÀNG FIFO (Purchase Receipt).
 *
 * Không có luật nghiệp vụ nào ở đây. Chỉ là hình dạng dữ liệu + vài hàm định dạng số.
 * Con số nào mang nghĩa tiền/tồn đều tới từ server và chỉ đi qua đây để ĐƯỢC IN RA.
 */
import type { DocField, DocTypeMeta } from "@metaforge/core";
import { money as salesMoney, normalized, text, today } from "../sales-order-v2/model.js";
import type {
  BulkFifoLineSummary,
  FifoAllocationRow,
  FifoDebtSummary,
  FifoOrderBalanceRow,
  Json,
  PurchaseFifoHistoryRow,
  SupplierPayableSummary,
} from "./server-contract.js";

export type { Json };
export { normalized, text, today };
export const money = salesMoney;

/** ĐVT tồn kiểu ĐẾM ĐƯỢC của nhôm — chép từ `COUNTED_UOMS` (aluminum-purchase-closure.ts:34). */
export const COUNTED_STOCK_UOMS = ["cay", "la", "doan"];
/** ĐVT khối lượng. `normalized()` đã bỏ dấu nên "ki-lô-gam" thành "ki-lo-gam". */
export const WEIGHT_UOMS = ["kg", "kilogram", "ki-lo-gam"];
/** ĐVT chiều dài — trục BÁN của nhóm `RT_` (mua Kg · tồn CÂY · bán Mét). */
export const LINEAR_UOMS = ["met", "m", "meter", "metre"];

export const ALUMINUM_INVENTORY_MODE = "Nhôm cây/lá";
export const RECEIPT_DOCTYPE = "Purchase Receipt";
export const RECEIPT_ITEM_DOCTYPE = "Purchase Receipt Item";

/** Số học "trống nghĩa là chưa có", KHÔNG phải bằng 0. `Number("")` là 0 nên phải chặn tay. */
export function numberValue(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function positiveNumber(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/**
 * Số KHÔNG ÂM — ở đây "0" là một con số THẬT, khác hẳn `positiveNumber` (0 hoá "chưa khai").
 *
 * Dùng cho các NGƯỠNG phần trăm mà 0 vừa hợp lệ vừa có nghĩa: `Measurement Profile.
 * weight_tolerance_pct = 0` nghĩa là "lệch cân bao nhiêu cũng phải giải trình". Server GIỮ
 * NGUYÊN số 0 đó, vì `COALESCE(CAST(... AS REAL),13)` chỉ thay NULL chứ không thay 0
 * (`server/apps/tenant-worker/src/index-core-base.ts:852`).
 *
 * Lọc bằng `positiveNumber` thì 0 rơi về `undefined` rồi hoá thành mặc định 13: màn nới ngưỡng
 * gấp mười ba lần so với sổ, dòng lệch cân đáng phải chọn `Nguyên nhân chênh lệch` lại lọt qua
 * êm ru. Đúng kiểu luật ngủ im lặng — không có gì báo, chỉ sai.
 */
export function nonNegativeNumber(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "co"].includes(normalized(value));
}

/** Định dạng số lượng. Có tham số `digits` vì cây/lá đếm nguyên còn kg lẻ tới 3 số. */
export function quantity(value: unknown, digits = 3): string {
  const parsed = numberValue(value);
  if (parsed === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(parsed);
}

export function percent(value: unknown, digits = 2): string {
  const parsed = numberValue(value);
  if (parsed === undefined) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(parsed)}%`;
}

export function moneyOrDash(value: unknown): string {
  const parsed = numberValue(value);
  return parsed === undefined ? "—" : money(parsed);
}

/** Thời điểm hiện tại theo giờ máy, dạng `Datetime` mà nền tảng nhận. */
export function nowLocalDatetime(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19).replace("T", " ");
}

export function resolveFieldDefault(field: DocField): unknown {
  if (field.default === undefined || field.default === null || field.default === "") return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return today();
  if (field.default === "Now" && field.fieldtype === "Datetime") return nowLocalDatetime();
  return field.default;
}

/** Giá trị mặc định của MỘT chứng từ, đọc từ metadata DocType (không hard-code). */
export function blankFromReceiptMeta(meta: DocTypeMeta): Json {
  const result: Json = {};
  for (const field of meta.fields ?? []) {
    const value = resolveFieldDefault(field);
    if (value !== undefined) result[field.fieldname] = value;
  }
  return result;
}

/** Danh sách lựa chọn của một field `Select`, LẤY TỪ META. `fallback` chỉ dùng khi meta câm. */
export function selectOptions(meta: DocTypeMeta | null, fieldname: string, fallback: string[]): string[] {
  const field = meta?.fields?.find((entry) => entry.fieldname === fieldname);
  const declared = String(field?.options ?? "").split("\n").map((entry) => entry.trim()).filter(Boolean);
  return declared.length ? declared : fallback;
}

/* -------------------------------------------------------------------------- */
/* Dòng nhận hàng                                                             */
/* -------------------------------------------------------------------------- */

export interface ReceiptFieldOverride {
  hidden?: number | boolean;
  reqd?: number | boolean;
  read_only?: number | boolean;
  label?: string;
}

/**
 * Một dòng trên bảng nhận hàng.
 *
 * Trường không có tiền tố `_` là trường THẬT của `Purchase Receipt Item` và sẽ được gửi lên.
 * Trường có tiền tố `_` chỉ sống trên màn: ảnh chụp danh mục, trạng thái preview, và các con số
 * "đã đặt / đã nhận / còn lại" suy ra từ chứng từ đơn mua để người nhập ĐỌC, không để gửi đi.
 */
export interface ReceiptLine extends Json {
  name: string;
  doctype?: string;
  item_code?: unknown;
  item_name?: unknown;
  inventory_mode?: unknown;
  measurement_profile?: unknown;
  material_specification?: unknown;
  stock_uom?: unknown;
  uom?: unknown;
  color?: unknown;
  condition?: unknown;
  is_stamped?: unknown;
  length_m?: unknown;
  width_m?: unknown;
  height_m?: unknown;
  set_count?: unknown;
  qty_bundle?: unknown;
  qty_bar?: unknown;
  qty?: unknown;
  actual_weight_kg?: unknown;
  actual_kg_per_m?: unknown;
  actual_kg_per_sqm?: unknown;
  total_length_m?: unknown;
  theoretical_kg_per_m?: unknown;
  theoretical_kg?: unknown;
  weight_variance_pct?: unknown;
  rate?: unknown;
  rate_uom?: unknown;
  amount?: unknown;
  conversion_factor?: unknown;
  stock_qty?: unknown;
  warehouse?: unknown;
  purchase_order?: unknown;
  so_no?: unknown;
  note?: unknown;

  _loading?: boolean;
  _error?: string;
  _overrides?: Record<string, ReceiptFieldOverride>;
  _itemName?: string;
  _itemGroup?: string;
  _inventoryMode?: string;
  _stockUom?: string;
  _defaultPurchaseUom?: string;
  _defaultSalesUom?: string;
  _catchWeight?: boolean;
  /** `Measurement Profile.weight_tolerance_pct` — ngưỡng CẢNH BÁO LỆCH CÂN, đọc từ danh mục. */
  _weightTolerancePct?: number;
  _weightToleranceKnown?: boolean;
  /** Số ĐÃ ĐẶT trên dòng đơn mua, theo ĐVT mua. */
  _orderedQty?: number;
  /** Số ĐÃ NHẬN trước lần này = đã đặt − còn lại (cả hai đều do server đưa). */
  _receivedQty?: number;
  /** Số CÒN LẠI mà `previewPurchaseReceipt` trả về. */
  _outstandingQty?: number;
  _orderedBars?: number;
  _sourceOrder?: string;
  /** `Nguyên nhân chênh lệch` người dùng chọn khi lệch cân vượt ngưỡng. */
  _varianceReason?: string;
  _varianceNote?: string;
}

export function receiptLineKey(line: ReceiptLine, index: number): string {
  return text(line.name) || `receipt-row-${index}`;
}

export function newReceiptLine(meta: DocTypeMeta | null, index: number): ReceiptLine {
  const row: ReceiptLine = {
    name: `new-receipt-row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    doctype: meta?.name ?? RECEIPT_ITEM_DOCTYPE,
  };
  for (const field of meta?.fields ?? []) {
    const value = resolveFieldDefault(field);
    if (value !== undefined) row[field.fieldname] = value;
  }
  return row;
}

export function isAluminumReceiptLine(line: ReceiptLine): boolean {
  const mode = text(line._inventoryMode) || text(line.inventory_mode);
  return mode === ALUMINUM_INVENTORY_MODE;
}

/** Hàng CÂN THỰC TẾ: có hai trục số lượng độc lập (đếm cây/lá và cân kg). */
export function isCatchWeightReceiptLine(line: ReceiptLine): boolean {
  if (line._catchWeight === true) return true;
  return isAluminumReceiptLine(line);
}

export function lineOverride(line: ReceiptLine, fieldname: string): ReceiptFieldOverride | undefined {
  return line._overrides?.[fieldname];
}

export function lineFieldVisible(line: ReceiptLine, fieldname: string, fallback: boolean): boolean {
  const override = lineOverride(line, fieldname);
  if (!override || override.hidden === undefined) return fallback;
  return !(override.hidden === true || override.hidden === 1);
}

export function lineFieldRequired(line: ReceiptLine, fieldname: string, fallback = false): boolean {
  const override = lineOverride(line, fieldname);
  if (!override || override.reqd === undefined) return fallback;
  return override.reqd === true || override.reqd === 1;
}

export function lineFieldLabel(line: ReceiptLine, fieldname: string, fallback: string): string {
  return text(lineOverride(line, fieldname)?.label) || fallback;
}

/** Chỉ giữ field THẬT của child DocType; bỏ mọi khoá `_` của màn. */
export function cleanReceiptLine(line: ReceiptLine, childMeta: DocTypeMeta, keepIdentity: boolean): Json {
  const allowed = new Set((childMeta.fields ?? []).map((field) => field.fieldname));
  const result: Json = {};
  for (const [fieldname, value] of Object.entries(line)) {
    if (fieldname.startsWith("_") || value === undefined || value === null || value === "") continue;
    if (allowed.has(fieldname)) result[fieldname] = value;
  }
  if (keepIdentity && text(line.name) && !text(line.name).startsWith("new-")) {
    result.name = line.name;
    result.doctype = line.doctype || childMeta.name;
  }
  return result;
}

export function fieldValueForServer(fieldtype: DocField["fieldtype"], value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (["Float", "Int", "Currency", "Percent"].includes(fieldtype)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Dòng nhập nhôm FIFO (tab thứ hai) — args của `alumdoor.purchase.*fifo*`     */
/* -------------------------------------------------------------------------- */

export interface FifoInputLine extends Json {
  name: string;
  item_code?: unknown;
  length_m?: unknown;
  qty_bar?: unknown;
  actual_weight_kg?: unknown;
  rate?: unknown;
  color?: unknown;
  is_stamped?: unknown;
  _itemName?: string;
  _kgPerM?: number;
  _standardLengthM?: number;
  _weightTolerancePct?: number;
  _weightToleranceKnown?: boolean;
  _error?: string;
}

export function newFifoInputLine(index: number, defaults: Partial<FifoInputLine> = {}): FifoInputLine {
  return {
    name: `fifo-row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    is_stamped: "Không",
    ...defaults,
  };
}

/** Args gửi lên `preview_fifo_receipt` / `fifo_receipt` (một dòng). Chữ ký đọc từ purchase-fifo-receipt.ts. */
export function fifoSingleArgs(line: FifoInputLine, header: {
  supplier: string;
  warehouse: string;
  supplierInvoiceNo: string;
  driver: string;
  postingAt: string;
}): Json {
  return {
    supplier: header.supplier,
    warehouse: header.warehouse,
    item_code: text(line.item_code),
    length_m: numberValue(line.length_m),
    qty_bar: numberValue(line.qty_bar),
    actual_weight_kg: numberValue(line.actual_weight_kg),
    rate: numberValue(line.rate) ?? 0,
    color: text(line.color),
    is_stamped: text(line.is_stamped),
    ...(header.supplierInvoiceNo ? { supplier_invoice_no: header.supplierInvoiceNo } : {}),
    ...(header.driver ? { driver: header.driver } : {}),
    ...(header.postingAt ? { posting_at: header.postingAt } : {}),
  };
}

/** Args gửi lên `preview_bulk_fifo_receipt` / `bulk_fifo_receipt`. `supplier_invoice_no` BẮT BUỘC. */
export function fifoBulkArgs(lines: FifoInputLine[], header: {
  supplier: string;
  warehouse: string;
  supplierInvoiceNo: string;
  driver: string;
  postingAt: string;
}): Json {
  return {
    supplier: header.supplier,
    warehouse: header.warehouse,
    supplier_invoice_no: header.supplierInvoiceNo,
    ...(header.driver ? { driver: header.driver } : {}),
    ...(header.postingAt ? { posting_at: header.postingAt } : {}),
    lines: lines.map((line) => ({
      item_code: text(line.item_code),
      length_m: numberValue(line.length_m),
      qty_bar: numberValue(line.qty_bar),
      actual_weight_kg: numberValue(line.actual_weight_kg),
      rate: numberValue(line.rate) ?? 0,
      color: text(line.color),
      is_stamped: text(line.is_stamped),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Gộp kết quả FIFO của hai route (đơn dòng / hàng loạt) về MỘT hình dạng      */
/* -------------------------------------------------------------------------- */

export interface FifoInsight {
  /** "single" = alumdoor.purchase.*fifo_receipt; "bulk" = *bulk_fifo_receipt. */
  route: "single" | "bulk";
  allocations: FifoAllocationRow[];
  orderBalances: FifoOrderBalanceRow[];
  history: PurchaseFifoHistoryRow[];
  /** Dòng Purchase Receipt Item server dựng — dùng để lấy ĐƠN GIÁ của từng lớp FIFO. */
  items: Json[];
  /** Tóm tắt công nợ HIỆN VẬT của một dòng (route single). */
  debt?: FifoDebtSummary;
  /** Tóm tắt công nợ HIỆN VẬT theo từng dòng nhập (route bulk). */
  lineSummaries: BulkFifoLineSummary[];
  tolerancePct?: number;
  toleranceSource?: string;
  message: string;
  createdReceipt?: string;
  replayed?: boolean;
  totals: {
    bars?: number;
    actualKg?: number;
    baremKg?: number;
    lineCount?: number;
    itemCount?: number;
  };
}

export interface SupplierPayableView {
  loading: boolean;
  error: string;
  payable?: SupplierPayableSummary;
  remainingBars?: number;
  remainingMeters?: number;
  remainingBaremKg?: number;
  openOrders?: number;
  overdueOrders?: number;
  generatedAt?: string;
}
