/**
 * Mô hình dữ liệu cho màn PHIẾU XUẤT KHO GIAO KHÁCH (Delivery Note).
 *
 * Nguyên tắc (skill forge-ui-change-routing §4.8): client chỉ ĐIỀU PHỐI và TRÌNH BÀY.
 * Mọi thẩm quyền tiền / tồn / workflow nằm ở server:
 *   - `alumdoor.sales.preview_delivery`      → phần còn phải giao của MỘT đơn bán
 *   - `alumdoor.sales.preview_bulk_delivery` → đã đặt / đã giao / còn lại + FIFO kho
 *   - `alumdoor.sales.item_context`          → tồn theo TỪNG TRỤC + thiếu hàng + độ sẵn sàng
 *   - `alumdoor.delivery_batch.preview`      → mẻ giao theo ngày
 *
 * File này KHÔNG tính lại bất kỳ con số nghiệp vụ nào; nó chỉ đặt tên cho những gì server trả
 * về và giúp màn nói ra lý do thay vì nuốt.
 */
import { mapError } from "@metaforge/core";

export {
  blankFromMeta,
  money,
  normalized,
  numberValue,
  optionList,
  positiveNumber,
  quantity,
  text,
  today,
} from "../sales-order-v2/model.js";

import { normalized, numberValue, text } from "../sales-order-v2/model.js";

export type Json = Record<string, unknown>;

/**
 * Chữ ký props giữ tương thích với khuôn `AlumdoorSalesOrderCreateProps`
 * (`sales-order-v2/model.ts`). Mọi callback để OPTIONAL để agent điều phối nối dây được cả
 * nhánh `isNew` lẫn nhánh `decoded` mà không phải bịa hàm rỗng.
 */
export interface AlumdoorDeliveryNoteCreateProps {
  name?: string;
  closeRequest?: number;
  onCreated?: (name: string) => void;
  onSaved?: (name: string) => void;
  onPreviewCreated?: (name: string) => void;
  onCancel?: () => void;
}

// ── Hợp đồng đọc từ server (chỉ khai lại để có kiểu, KHÔNG khai thêm luật) ──────────────────

/** Một chỗ trống của danh mục kèm ĐƯỜNG ĐI tới nơi sửa — `item_context.readiness`. */
export interface CatalogGap extends Json {
  code?: string;
  label?: string;
  where?: string;
}

/** Bậc ĐVT còn thiếu hệ số. `intentional = true` nghĩa là danh mục CỐ Ý để trống (33 mã `RT_`). */
export interface UomGap extends Json {
  uom?: string;
  kind?: "MISSING_CONVERSION" | "UNDECLARED_UOM";
  message?: string;
  fix_where?: string;
  intentional?: boolean;
}

export interface BatchDetail extends Json {
  batch_no?: string;
  qty?: number;
  weight_kg?: number | null;
  length_m?: number | null;
  color?: string | null;
  condition?: string | null;
  is_offcut?: boolean;
  warehouse?: string | null;
}

/** Tồn theo NHIỀU TRỤC cùng lúc: trục tồn (Cây/Bộ), trục bán (Mét/m²) và trục cân (Kg). */
export interface StockSnapshot extends Json {
  warehouse?: string | null;
  stock_uom?: string | null;
  stock_qty?: number | null;
  selected_uom?: string;
  selected_qty?: number | null;
  selected_qty_blocked_reason?: string | null;
  weight_uom?: string | null;
  weight_qty?: number | null;
  batch_tracked?: boolean;
  batch_count?: number | null;
  batches?: BatchDetail[] | null;
  source?: string | null;
  read_error?: string | null;
}

export interface ShortageInfo extends Json {
  requested_qty?: number;
  requested_uom?: string;
  available_qty?: number | null;
  available_uom?: string;
  short_by?: number | null;
  /** `unknown` = KHÔNG so được (khác trục / không đọc được tồn) — không được vẽ thành "đủ hàng". */
  severity?: "over" | "ok" | "unknown";
  message?: string;
}

export interface ItemReadiness extends Json {
  ready?: boolean;
  blocking?: CatalogGap[];
  warnings?: CatalogGap[];
}

export interface DeliveryItemContext extends Json {
  item_code?: string;
  item_group?: string;
  inventory_mode?: string;
  measurement_profile?: string | null;
  selected_uom?: string;
  allowed_uoms?: string[];
  stock_uom?: string;
  conversion_factor?: number | null;
  managed_stock?: boolean;
  available_stock_qty?: number | null;
  available_qty?: number | null;
  availability_status?: string;
  stock_read_error?: string | null;
  stock_snapshot?: StockSnapshot;
  shortage?: ShortageInfo;
  readiness?: ItemReadiness;
  uom_gap?: UomGap | null;
  /**
   * `alumdoor.sales.item_context` LUÔN trả field này bất kể `include_color_scope` — Xuất kho gọi
   * với `include_color_scope: 0` (khỏi tốn lượt đọc allowed_finishes) nên KHÔNG có `color_scope`,
   * nhưng vẫn đọc được `require_color` thô để làm lưới an toàn thứ 2 cho luật màu bắt buộc, độc
   * lập với việc Đơn bán có gọi/qua được `item_context` hay không (audit ALUMDOOR-KHO-DANH-MUC-
   * GAP-20260821.md, #3).
   */
  spec_context?: { measurement_profile?: { require_color?: boolean } | null } | null;
}

/** Giữ chỗ tồn đang treo — `Stock Reservation`, state "Đang giữ". */
export interface ReservationRow extends Json {
  name?: string;
  item_code?: string;
  color?: string;
  warehouse?: string;
  min_length_m?: number;
  qty_reserved?: number;
  source_doctype?: string;
  source_name?: string;
  expires_at?: string;
  state?: string;
}

/** Một lớp FIFO của `metaforge.api.preview_delivery_document` (đi qua preview_bulk_delivery). */
export interface DeliveryFifoRow extends Json {
  sales_order?: string;
  sales_order_row?: string;
  item_code?: string;
  warehouse?: string;
  inventory_layer?: string;
  received_at?: string;
  qty?: string;
  unit_cost?: string;
  cost?: string;
}

export interface DeliveryInventoryPreview extends Json {
  kind?: string;
  title?: string;
  description?: string;
  confirmation_label?: string;
  warnings?: string[];
  columns?: Array<{ key?: string; label?: string; align?: string }>;
  rows?: DeliveryFifoRow[];
  summary?: Array<{ label?: string; value?: string }>;
}

/** Đã đặt / đã giao / còn lại theo TỪNG DÒNG đơn bán — `preview_bulk_delivery.source_lines`. */
export interface DeliveryOutstanding extends Json {
  sales_order?: string;
  sales_order_row_id?: string;
  item_code?: string;
  item_name?: string;
  ordered_qty?: number;
  delivered_qty?: number;
  outstanding_qty?: number;
  delivery_qty?: number;
  delivery_stock_qty?: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  warehouse?: string;
}

/** Một đơn bán ứng viên — `preview_bulk_delivery.source_documents`. */
export interface DeliverySourceDocument extends Json {
  selected?: boolean;
  sales_order?: string;
  transaction_date?: string;
  delivery_date?: string;
  company?: string;
  currency?: string;
  modified?: string;
  outstanding_lines?: number;
  disabled_reason?: string;
}

/** Mẻ giao theo ngày — `alumdoor.delivery_batch.preview`. */
export interface DeliveryBatchRow extends Json {
  sales_order?: string;
  customer?: string;
  delivery_batch_key?: string;
  existing_delivery_note?: string;
  status?: string;
}

/** Kết quả từng đơn của `alumdoor.delivery_batch.create`. */
export interface DeliveryBatchResult extends Json {
  sales_order?: string;
  delivery_note?: string;
  status?: string;
  idempotent?: boolean;
  message?: string;
  lines?: number;
}

export interface PrintDocument extends Json {
  doctype?: string;
  name?: string;
}

// ── Dòng hàng trên màn ──────────────────────────────────────────────────────────────────────

export interface DeliveryLine extends Json {
  _key: string;
  _itemName?: string;
  /** Đơn bán nguồn của dòng. `Delivery Note Item` KHÔNG khai field này nên giữ ở tầng UI. */
  _salesOrder?: string;
  /** Kho do server đề xuất (chép từ dòng Đơn bán). Giữ riêng để nói được "vì sao kho này". */
  _serverWarehouse?: string;
  _warehouseSource?: string;
  _outstanding?: DeliveryOutstanding;
  _context?: DeliveryItemContext;
  _contextError?: string;
  _contextGap?: UomGap | null;
  _fifo?: DeliveryFifoRow[];
  _reservations?: ReservationRow[];
  _loading?: boolean;
  _error?: string;
  /** Người dùng đã sửa SL/kho ⇒ không còn dùng được đường "máy chủ dựng nguyên phiếu". */
  _edited?: boolean;
  item_code?: string;
  item_name?: string;
  sales_order_row_id?: string;
  color?: string;
  uom?: string;
  qty?: number;
  stock_uom?: string;
  stock_qty?: number;
  conversion_factor?: number;
  warehouse?: string;
  weight_kg?: number;
  rate?: number;
  amount?: number;
  measurement_profile?: string;
  inventory_mode?: string;
  length_m?: number;
}

let lineCounter = 0;

export function newDeliveryLine(seed: Json = {}): DeliveryLine {
  lineCounter += 1;
  return {
    ...seed,
    _key: `delivery-v2-${Date.now()}-${lineCounter}-${Math.random().toString(36).slice(2, 8)}`,
  } as DeliveryLine;
}

/** Dựng dòng màn từ payload server (`items` của preview_delivery / preview_bulk_delivery). */
export function hydrateDeliveryLines(rows: Json[], fallbackSalesOrder = ""): DeliveryLine[] {
  return rows.map((row) => newDeliveryLine({
    ...row,
    _itemName: text(row.item_name) || text(row.item_code),
    _salesOrder: text(row.sales_order) || text(fallbackSalesOrder),
    _serverWarehouse: text(row.warehouse),
    _warehouseSource: text(row.warehouse) ? "Đơn bán" : "",
    _loading: false,
    _error: "",
    _edited: false,
  }));
}

/** Khóa ghép Đơn bán + dòng đơn — cách duy nhất nối `source_lines` và lớp FIFO về đúng dòng. */
export function lineSourceKey(salesOrder: unknown, rowId: unknown): string {
  return `${text(salesOrder)}\u0000${text(rowId)}`;
}

export function deliveryLineKey(line: DeliveryLine): string {
  return lineSourceKey(line._salesOrder, line.sales_order_row_id);
}

// ── Lỗi: NÓI RA nguyên văn, không nuốt ──────────────────────────────────────────────────────

/**
 * Worker Alumdoor từ chối bằng `HTTP 422 { message: "<tiếng Việt>" }` — KHÔNG dùng
 * `_server_messages`, và 422 không nằm trong bảng status→kind của `mapError`. Hệ quả:
 * `mapError(error).message` trả về "Đã xảy ra lỗi không xác định." và lý do nghiệp vụ thật
 * (ví dụ "Đơn hàng SO-0007 đã giao đủ.") biến mất trước khi tới người dùng.
 *
 * `deliveryErrorPayload` lấy lại THÂN phản hồi để màn còn đường nói ra lý do và chỗ sửa.
 * frappe-js-sdk trải thẳng thân JSON lên object lỗi kèm `httpStatus`, nên đọc cả hai dạng.
 */
export function deliveryErrorPayload(error: unknown): Json {
  const mapped = mapError(error);
  const raw = (mapped.raw ?? error) as Json | undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const response = raw.response as { data?: unknown } | undefined;
  const data = response?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data as Json;
  return raw;
}

export function deliveryErrorMessage(error: unknown): string {
  const mapped = mapError(error);
  const payload = deliveryErrorPayload(error);
  const status = numberValue(payload.httpStatus) ?? mapped.httpStatus;
  const serverText = text(payload.message);
  const key = normalized(`${serverText} ${mapped.message}`);
  if (status === 0
    || key.includes("failed to fetch")
    || key.includes("network error")
    || key.includes("network request failed")) {
    return "Không kết nối được máy chủ. Hãy bật backend rồi bấm Thử lại.";
  }
  if (mapped.kind === "auth" || mapped.kind === "conflict") return mapped.message;
  // Nguyên văn của server thắng thông điệp khuôn mẫu: đây chính là chỗ luật hay bị nuốt.
  if (serverText) return serverText;
  return mapped.message || "Không thực hiện được thao tác trên Phiếu xuất kho.";
}

/** Bậc ĐVT còn thiếu hệ số, kèm "cố ý để trống" — đọc từ thân 422 của `item_context`. */
export function deliveryErrorUomGap(error: unknown): UomGap | null {
  const payload = deliveryErrorPayload(error);
  const gap = payload.uom_gap;
  return gap && typeof gap === "object" && !Array.isArray(gap) ? gap as UomGap : null;
}

// ── Trục số lượng: hiện SONG SONG, không ép về một trục ─────────────────────────────────────

export interface QuantityAxis {
  /** `sale` = ĐVT bán, `stock` = ĐVT tồn, `weight` = trục cân thực tế. */
  kind: "sale" | "stock" | "weight";
  label: string;
  uom: string;
  value: number | undefined;
  /** `true` = con số này do màn suy ra tạm, chưa phải số máy chủ chốt. */
  estimated?: boolean;
  /** Vì sao trục này không có số — không được im lặng bỏ trắng. */
  blockedReason?: string;
}

/** Hệ số quy đổi ĐVT bán → ĐVT tồn, ưu tiên hệ số của DÒNG (dòng luôn thắng bảng Item). */
export function lineConversionFactor(line: DeliveryLine): number | undefined {
  return numberValue(line.conversion_factor)
    ?? numberValue(line._outstanding?.conversion_factor)
    ?? numberValue(line._context?.conversion_factor ?? undefined);
}

export function lineStockUom(line: DeliveryLine): string {
  return text(line.stock_uom)
    || text(line._outstanding?.stock_uom)
    || text(line._context?.stock_uom)
    || text(line._context?.stock_snapshot?.stock_uom);
}

export function lineSaleUom(line: DeliveryLine): string {
  return text(line.uom) || text(line._outstanding?.uom) || text(line._context?.selected_uom);
}

/**
 * Các trục số lượng CỦA DÒNG. Nhóm `RT_` bán theo Mét nhưng tồn theo ĐVT tồn của Item, và
 * còn có trục cân thực tế — cả ba phải hiện cạnh nhau.
 *
 * KHÔNG ghim ĐVT tồn của `RT_` trong đầu, luôn đọc `stock_uom` của dòng: ngày 21/08/2026
 * `RT_TR114_2.1` đổi `stock_uom` từ Kg sang Cây ngay giữa một đợt kiểm thử, trong khi hàng
 * đã nhập trước đó vẫn nằm trong sổ theo Kg. Bản chú thích trước ở đây khẳng định một ĐVT
 * cụ thể và đã sai chỉ sau vài giờ.
 *
 * CẠM BẪY kèm theo, xem báo cáo `bao-cao/ban-xuat.md`: hệ số quy đổi của mã đó là 4,7 với
 * ghi chú "1 Mét = 4,7 **Kg**", nhưng ĐVT tồn giờ là **Cây** — nên máy chủ trừ 47 CÂY cho
 * 10 Mét (sự thật vật lý ≈ 1,7 cây). Hệ số và ĐVT tồn lệch nhau thì màn này vẫn hiện đúng
 * cái nó được cho; chỗ sửa là bảng quy đổi trên Item, không phải ở đây.
 *
 * Trục tồn khi người dùng vừa sửa SL thì đánh dấu `estimated` chứ không xoá trắng, và khi
 * thiếu hệ số quy đổi thì nói ra lý do thay vì để trống.
 */
export function lineQuantityAxes(line: DeliveryLine): QuantityAxis[] {
  const saleUom = lineSaleUom(line);
  const stockUom = lineStockUom(line);
  const factor = lineConversionFactor(line);
  const qty = numberValue(line.qty);
  const axes: QuantityAxis[] = [{
    kind: "sale",
    label: "SL giao",
    uom: saleUom,
    value: qty,
  }];

  if (stockUom && normalized(stockUom) !== normalized(saleUom)) {
    /**
     * `line.stock_qty` là ẢNH CHỤP của máy chủ từ lần lưu/dựng phiếu trước. Sửa SL trên màn
     * KHÔNG đụng tới nó, nên tin nó sau khi người dùng gõ là dán số cũ lên số mới: dòng trục
     * hạ từ 10 Mét xuống 4 Mét vẫn hiện "SL xuất kho 47 Kg" (đúng phải là 18,8 Kg) mà không
     * một dấu hiệu nào cho biết đó là số cũ — thủ kho lấy hàng theo con số trên màn.
     *
     * Nên khi dòng đã `_edited`, dựng lại từ SL đang thấy và đánh dấu `estimated`; máy chủ
     * vẫn là nơi chốt số cuối (`applyUomConversion` tính lại từ `qty × hệ số`, không đọc ô
     * `stock_qty` client gửi lên), màn chỉ có nghĩa vụ không nói dối trong lúc chờ.
     */
    const snapshotStockQty = line._edited ? undefined : numberValue(line.stock_qty);
    const derivable = snapshotStockQty === undefined && qty !== undefined && factor !== undefined;
    axes.push({
      kind: "stock",
      label: "SL xuất kho",
      uom: stockUom,
      value: snapshotStockQty ?? (derivable ? qty! * factor! : undefined),
      estimated: derivable,
      blockedReason: snapshotStockQty === undefined && !derivable
        ? text(line._context?.uom_gap?.message)
          || text(line._context?.stock_snapshot?.selected_qty_blocked_reason)
          || `Chưa có hệ số quy đổi ${saleUom || "ĐVT bán"} → ${stockUom}; máy chủ chốt số khi lưu.`
        : undefined,
    });
  }

  const weightUom = text(line._context?.stock_snapshot?.weight_uom);
  const weight = numberValue(line.weight_kg);
  if (weightUom || weight !== undefined) {
    axes.push({
      kind: "weight",
      label: "Cân thực tế",
      uom: weightUom || "kg",
      value: weight,
      blockedReason: weight === undefined ? "Chưa cân — nhập sau khi cân thực tế." : undefined,
    });
  }
  return axes;
}

// ── Cảnh báo tồn / giữ chỗ: hiện trên đúng dòng, kèm lý do ──────────────────────────────────

export type DeliveryAlertLevel = "block" | "warn" | "info";

export interface DeliveryAlert {
  level: DeliveryAlertLevel;
  message: string;
  /** Đường đi tới nơi sửa, do server trả (`readiness.*.where`, `uom_gap.fix_where`). */
  where?: string;
}

/**
 * Gom mọi thứ server đã NÓI về dòng này thành danh sách cảnh báo có thứ hạng.
 * Không tự phát minh luật: mọi câu chữ đều là câu server trả về.
 */
export function lineAlerts(line: DeliveryLine): DeliveryAlert[] {
  const alerts: DeliveryAlert[] = [];
  const context = line._context;

  if (text(line._error)) alerts.push({ level: "block", message: text(line._error) });
  if (text(line._contextError)) {
    const gap = line._contextGap;
    alerts.push({
      level: gap?.intentional ? "warn" : "block",
      message: gap?.intentional
        ? `${text(line._contextError)} — danh mục CỐ Ý để trống, chờ chủ xưởng chốt.`
        : text(line._contextError),
      where: text(gap?.fix_where) || undefined,
    });
  }

  /**
   * Lưới an toàn thứ 2 cho luật "màu bắt buộc" (song song với sales-order-v2/model.ts). Đơn bán
   * đọc `color_scope.requires_color` để chặn dòng thiếu màu, nhưng nếu 1 dòng lọt qua (sửa tay
   * sau, đơn cũ, import) thì Xuất kho trước đây KHÔNG có lưới thứ 2 — xem #3 trong audit trên.
   */
  if (context?.spec_context?.measurement_profile?.require_color === true && !text(line.color)) {
    alerts.push({
      level: "block",
      message: "Chưa chọn màu — bộ theo dõi của mã này bắt buộc có màu.",
      where: "Chọn ngay trên dòng này",
    });
  }

  const shortage = context?.shortage;
  if (shortage?.severity === "over") {
    alerts.push({
      level: "block",
      message: text(shortage.message) || "Tồn không đủ cho số lượng đang giao.",
      where: `Kho ${text(line.warehouse) || "(chưa chọn)"}`,
    });
  } else if (shortage?.severity === "unknown") {
    alerts.push({
      level: "warn",
      message: text(shortage.message) || "Không so được tồn với số lượng đang giao.",
    });
  }

  for (const gap of context?.readiness?.blocking ?? []) {
    const label = text(gap.label);
    if (!label || alerts.some((alert) => alert.message.includes(label))) continue;
    alerts.push({ level: "block", message: label, where: text(gap.where) || undefined });
  }
  for (const gap of context?.readiness?.warnings ?? []) {
    const label = text(gap.label);
    if (!label || alerts.some((alert) => alert.message.includes(label))) continue;
    alerts.push({ level: "warn", message: label, where: text(gap.where) || undefined });
  }

  const readError = text(context?.stock_snapshot?.read_error) || text(context?.stock_read_error);
  if (readError && !alerts.some((alert) => alert.message === readError)) {
    alerts.push({ level: "warn", message: readError, where: "Báo cáo kho — cần vai Thủ kho/Stock User" });
  }

  const reserved = lineReservedQty(line);
  if (reserved > 0) {
    alerts.push({
      level: "warn",
      message: `Đang có ${reserved} đơn vị giữ chỗ treo trên mã này tại kho đã chọn — tồn khả dụng thật thấp hơn số hiện ở cột Tồn.`,
      where: "Kho → Giữ chỗ tồn (Stock Reservation)",
    });
  }

  if (!text(line.warehouse)) {
    alerts.push({
      level: "block",
      message: "Dòng chưa có Kho xuất. Đơn bán không khai kho và phiếu chưa chọn kho mặc định.",
      where: "Đơn bán → dòng hàng → Kho, hoặc chọn Kho xuất mặc định ở đầu phiếu",
    });
  }
  return alerts;
}

export function lineReservedQty(line: DeliveryLine): number {
  return (line._reservations ?? []).reduce((sum, row) => sum + (numberValue(row.qty_reserved) ?? 0), 0);
}

export function lineBlocked(line: DeliveryLine): boolean {
  return lineAlerts(line).some((alert) => alert.level === "block");
}

/** Đã giao trước phiếu này — chỉ đọc từ `source_lines`, không tự cộng trừ. */
export function lineDeliveredBefore(line: DeliveryLine): number | undefined {
  return numberValue(line._outstanding?.delivered_qty);
}

export function lineOrderedQty(line: DeliveryLine): number | undefined {
  return numberValue(line._outstanding?.ordered_qty);
}

export function lineOutstandingQty(line: DeliveryLine): number | undefined {
  return numberValue(line._outstanding?.outstanding_qty);
}

/** Giao nhiều hơn phần còn lại: không chặn im lặng, chỉ nói ra để người dùng quyết. */
export function lineOverDelivering(line: DeliveryLine): boolean {
  const outstanding = lineOutstandingQty(line);
  const qty = numberValue(line.qty);
  return outstanding !== undefined && qty !== undefined && qty > outstanding + 1e-9;
}

export function anyLineEdited(lines: DeliveryLine[]): boolean {
  return lines.some((line) => line._edited === true);
}

/** Thời điểm xuất mặc định theo giờ máy trạm, định dạng `datetime-local` mà control đang dùng. */
export function nowLocalDatetime(): string {
  const now = new Date();
  const shifted = new Date(now.valueOf() - now.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 19).replace("T", " ");
}

export function isoDateOnly(value: unknown): string {
  return text(value).slice(0, 10);
}
