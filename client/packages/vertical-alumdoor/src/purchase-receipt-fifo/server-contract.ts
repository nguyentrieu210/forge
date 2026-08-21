/**
 * Hợp đồng đọc-về từ server cho màn NHẬP HÀNG FIFO.
 *
 * Mọi kiểu trong file này là BẢN SAO CHÉP TAY của payload server đang trả, chép từ đúng file
 * nguồn (ghi rõ ở từng khối). Client KHÔNG tính lại bất kỳ con số nào ở đây — theo
 * `skills/forge-ui-change-routing/SKILL.md` §4.8: client chỉ điều phối + trình bày, tiền/tồn/
 * định giá FIFO là thẩm quyền server.
 *
 * Vì là bản chép tay nên mọi trường đều `optional`: server thêm trường mới thì màn vẫn chạy,
 * server đổi tên trường thì màn hiện "—" chứ không đoán ra một con số khác.
 */

export type Json = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Tên method — tự xác minh trong:                                            */
/*   server/apps-src/alumdoor-worker/src/entry.ts (dòng 52-57)                 */
/*   server/apps-src/alumdoor-worker/src/index.ts (dòng 2734-2764)             */
/* -------------------------------------------------------------------------- */

export const PURCHASE_RECEIPT_METHODS = {
  /** index.ts:2761 — previewPurchaseReceipt(call, args{purchase_order, warehouse}) */
  previewReceiptFromOrder: "alumdoor.purchase.preview_receipt",
  /** index.ts:2762 — receiptFromPurchaseOrder(call, args{purchase_order, warehouse, supplier_invoice_no, driver}) */
  receiptFromOrder: "alumdoor.purchase.receipt_from_order",
  /** entry.ts:54 — handleTrackedPurchaseFifoRequest(request, env, create=false, bulk=false) */
  previewFifoReceipt: "alumdoor.purchase.preview_fifo_receipt",
  /** entry.ts:55 — handleTrackedPurchaseFifoRequest(request, env, create=true, bulk=false) */
  fifoReceipt: "alumdoor.purchase.fifo_receipt",
  /** entry.ts:56 — handleTrackedPurchaseFifoRequest(request, env, create=false, bulk=true) */
  previewBulkFifoReceipt: "alumdoor.purchase.preview_bulk_fifo_receipt",
  /** entry.ts:57 — handleTrackedPurchaseFifoRequest(request, env, create=true, bulk=true) */
  bulkFifoReceipt: "alumdoor.purchase.bulk_fifo_receipt",
  /** entry.ts:52 — handlePurchaseSupplierDashboard(request, env), args{supplier} */
  supplierDeliveryDashboard: "alumdoor.purchase.supplier_delivery_dashboard",
  /** index.ts:2734 — previewChildRow(call, args) */
  previewChildRow: "alumdoor.ui.preview_child_row",
  /** index.ts:2735 — previewDocument(call, args). CHÚ Ý: chỉ nhận "Purchase Order"/"Sales Order". */
  previewDocument: "alumdoor.ui.preview_document",
} as const;

/* -------------------------------------------------------------------------- */
/* alumdoor.purchase.preview_receipt                                          */
/* nguồn: server/apps-src/alumdoor-worker/src/index.ts::previewPurchaseReceipt */
/* -------------------------------------------------------------------------- */

export interface ReceiptFromOrderPreview {
  purchase_order?: string;
  supplier?: string;
  /** Dòng CÒN PHẢI NHẬN. Dòng đã về đủ biến mất hẳn khỏi mảng này (remainingLines). */
  items?: Json[];
  lines?: number;
  /** Chỉ có khi đơn đã nhận đủ. */
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* alumdoor.purchase.preview_fifo_receipt / fifo_receipt                      */
/* nguồn: server/apps-src/alumdoor-worker/src/purchase-fifo-receipt.ts        */
/*        + aluminum-purchase-closure.ts::handleTrackedPurchaseFifoRequest    */
/* -------------------------------------------------------------------------- */

/** Chép đúng `FifoDebtSummary` (purchase-fifo-receipt.ts) — kết quả `buildFifoDebtSummary`. */
export interface FifoDebtSummary {
  ordered_bars?: number;
  received_bars_before?: number;
  delivered_bars_now?: number;
  received_bars_after?: number;
  tolerance_pct?: number;
  tolerance_bars?: number;
  nominal_remaining_bars?: number;
  minimum_additional_bars_to_settle?: number;
  maximum_additional_bars_allowed?: number;
  nominal_remaining_meters?: number;
  minimum_additional_meters_to_settle?: number;
  maximum_additional_meters_allowed?: number;
}

/** Chép đúng `allocationRows()` — MỘT LỚP FIFO: đơn cũ nhất bị trừ trước. */
export interface FifoAllocationRow {
  purchase_order?: string;
  order_date?: string;
  /** "Nominal" / "Tolerance"… — do `allocateBarsFifo` đặt, hiện nguyên văn. */
  kind?: string;
  allocated_bars?: number;
  allocated_meters?: number;
  barem_weight_kg?: number;
  actual_weight_kg?: number;
  /** chỉ có ở route bulk (bulk-purchase-fifo-receipt.ts gắn thêm). */
  input_row?: number;
  item_code?: string;
}

/** Chép đúng `orderBalanceRows()` — cân đối theo từng đơn mua. */
export interface FifoOrderBalanceRow {
  purchase_order?: string;
  order_date?: string;
  ordered_bars?: number;
  received_bars_before?: number;
  allocated_bars_now?: number;
  received_bars_after?: number;
  nominal_remaining_bars?: number;
  nominal_remaining_meters?: number;
  tolerance_min_total_bars?: number;
  tolerance_max_total_bars?: number;
  input_row?: number;
  item_code?: string;
}

/** Chép đúng `PurchaseFifoHistoryRow` (purchase-fifo-receipt.ts) — THỨ TỰ NHẬP đã ghi sổ. */
export interface PurchaseFifoHistoryRow {
  purchase_receipt?: string;
  posting_at?: string;
  supplier_invoice_no?: string;
  purchase_order?: string;
  item_code?: string;
  length_m?: number;
  theoretical_kg_per_m?: number;
  qty_bar?: number;
  total_length_m?: number;
  barem_weight_kg?: number;
  actual_weight_kg?: number | null;
  color?: string;
  is_stamped?: string;
  note?: string;
}

export interface FifoReceiptResult {
  supplier?: string;
  item_code?: string;
  length_m?: number;
  theoretical_kg_per_m?: number;
  delivered_bars?: number;
  delivered_meters?: number;
  delivered_barem_weight_kg?: number;
  actual_weight_kg?: number;
  /** `resolveSupplierReceiptTolerance().tolerance_pct` — dung sai GIAO NHẬN theo số cây. */
  tolerance_pct?: number;
  /** "supplier" | "tien_dat_default" | "default_zero" — nói RÕ ngưỡng lấy từ đâu. */
  tolerance_source?: string;
  debt?: FifoDebtSummary;
  allocations?: FifoAllocationRow[];
  order_balances?: FifoOrderBalanceRow[];
  receipt_history?: PurchaseFifoHistoryRow[];
  /** Dòng Purchase Receipt Item mà server SẼ ghi — đã canonicalize qua closure. */
  items?: Json[];
  message?: string;
  /** chỉ có khi create=true */
  purchase_receipt?: string;
  name?: string;
  doctype?: string;
  draft?: boolean;
  replayed?: boolean;
  inventory_authority?: string;
  batches?: unknown;
  bundles?: unknown;
}

/** Chép đúng `line_summaries` của bulk-purchase-fifo-receipt.ts. */
export interface BulkFifoLineSummary {
  input_row?: number;
  item_code?: string;
  length_m?: number;
  qty_bar?: number;
  actual_weight_kg?: number;
  theoretical_kg_per_m?: number;
  barem_weight_kg?: number;
  nominal_remaining_bars?: number;
  nominal_remaining_meters?: number;
  minimum_additional_bars_to_settle?: number;
  maximum_additional_bars_allowed?: number;
}

export interface BulkFifoReceiptResult {
  supplier?: string;
  warehouse?: string;
  posting_at?: string;
  supplier_invoice_no?: string;
  line_count?: number;
  item_count?: number;
  total_qty_bar?: number;
  total_actual_weight_kg?: number;
  total_barem_weight_kg?: number;
  line_summaries?: BulkFifoLineSummary[];
  order_balances?: FifoOrderBalanceRow[];
  allocations?: FifoAllocationRow[];
  receipt_history?: PurchaseFifoHistoryRow[];
  items?: Json[];
  message?: string;
  purchase_receipt?: string;
  name?: string;
  doctype?: string;
  draft?: boolean;
  replayed?: boolean;
}

/* -------------------------------------------------------------------------- */
/* alumdoor.purchase.supplier_delivery_dashboard                              */
/* nguồn: server/apps-src/alumdoor-worker/src/purchase-supplier-dashboard.ts  */
/* Dùng cho khối "Tóm tắt công nợ NCC" phần TIỀN (Payment Ledger authoritative)*/
/* -------------------------------------------------------------------------- */

export interface SupplierPayableSummary {
  authoritative?: boolean;
  source?: string;
  invoice_count?: number;
  invoice_total?: number;
  received_value?: number;
  received_not_invoiced_hint?: number;
  invoice_outstanding_hint?: number;
  total_outstanding?: number | null;
  due_amount?: number | null;
  overdue_amount?: number | null;
  advance_balance?: number | null;
  net_exposure?: number | null;
  oldest_due_date?: string | null;
  currencies?: string[];
  note?: string;
}

export interface SupplierDeliveryDashboard {
  supplier?: string;
  generated_at?: string;
  source?: string;
  summary?: {
    purchase_order_count?: number;
    open_purchase_order_count?: number;
    overdue_purchase_order_count?: number;
    ordered_bars?: number;
    received_bars?: number;
    remaining_bars?: number;
    remaining_meters?: number;
    remaining_barem_weight_kg?: number;
    actual_received_weight_kg?: number;
    purchase_value?: number;
    payable_outstanding?: number | null;
    payable_overdue?: number | null;
    supplier_advance?: number | null;
    payable_net_exposure?: number | null;
  };
  billing?: SupplierPayableSummary;
  payable?: SupplierPayableSummary;
}

/* -------------------------------------------------------------------------- */
/* alumdoor.ui.preview_child_row                                              */
/* nguồn: server/apps-src/alumdoor-worker/src/ui-child-preview.ts             */
/* -------------------------------------------------------------------------- */

export interface ChildRowPreview {
  patch?: Json;
  clear?: unknown;
  field_overrides?: Json;
  source?: string;
  message?: string;
}
