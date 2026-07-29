import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import type { TaxRow } from "../../clouderp-selling/src/types.js";

/**
 * Một dòng có ĐƠN VỊ GIAO DỊCH khác đơn vị tồn kho.
 *
 * Ray mua theo CÂY, bán theo MÉT. Nan nhôm mua theo KG, tồn theo M². Nếu sổ kho ghi thẳng
 * `qty` thì mua 20 cây ray thành "tồn 20 mét" — sai gấp gần sáu lần, và không có gì báo.
 *
 *     stock_qty = qty × conversion_factor
 *
 * `qty` và `rate` giữ nguyên ĐƠN VỊ MUA, vì đó là thứ in trên hoá đơn NCC và là thứ người
 * mua đối chiếu. Chỉ sổ kho và hạn mức "không nhận quá số đặt" chạy theo `stock_qty`.
 */
export interface UomLine extends JsonObject {
  item_code: string;
  qty: DecimalInput;
  qty_micros?: number;
  /** Đơn vị GIAO DỊCH của dòng. Bỏ trống = cùng đơn vị tồn của mặt hàng. */
  uom?: string;
  /** Bao nhiêu đơn vị tồn trong MỘT đơn vị giao dịch. Bỏ trống thì tra ở hồ sơ mặt hàng. */
  conversion_factor?: DecimalInput;
  conversion_factor_micros?: number;
  stock_uom?: string;
  stock_qty?: string;
  stock_qty_micros?: number;
  /** Snapshot from Item. The client may display it, but the server always overwrites it. */
  inventory_mode?: string;
  /** Snapshot from Item so later master-data edits never change an old voucher's meaning. */
  measurement_profile?: string;
  /** Kích thước giao dịch cho mặt hàng bán theo m² nhưng tồn theo Bộ. */
  width_mm?: DecimalInput;
  height_mm?: DecimalInput;
  set_count?: DecimalInput;
}

export interface PurchaseItem extends UomLine {
  row_id: string;
  /**
   * Đơn mua của RIÊNG dòng này, khi một phiếu nhận hàng của nhiều đơn cùng lúc.
   *
   * Bỏ trống thì lấy theo đầu phiếu. Liên kết ở cấp dòng là cách ERPNext giải bài toán N–N
   * giữa đơn mua và phiếu nhập: một đơn giao làm nhiều đợt, và một chuyến giao gộp nhiều đơn.
   */
  purchase_order?: string;
  /** Yêu cầu vật tư của riêng dòng này. Bỏ trống thì lấy theo đầu phiếu. */
  material_request?: string;
  rate: DecimalInput;
  rate_minor?: number;
  amount?: string;
  amount_minor?: number;
  net_amount?: string;
  net_amount_minor?: number;
  warehouse?: string;
  expense_account?: string;
  valuation_rate?: DecimalInput;
  valuation_rate_minor?: number;
  stock_value_difference_minor?: number;
  serial_and_batch_bundle?: string;
  batch_no?: string;
  serial_nos?: string[];
  item_price?: string;
  pricing_rule?: string;
  discount_percentage?: string;
}

export interface PurchaseOrderData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  currency_scale?: number;
  company_currency?: string;
  company_currency_scale?: number;
  conversion_rate?: string;
  conversion_rate_micros?: number;
  transaction_date: string;
  schedule_date?: string;
  buying_price_list?: string;
  supplier_group?: string;
  /** Yêu cầu vật tư mà đơn này đáp ứng. Khai thì nhân TỪ CHỐI đặt quá số đã yêu cầu. */
  material_request?: string;
  /** Báo giá NCC đã chọn. Khai thì nhân bắt khớp NCC / công ty / tiền tệ. */
  supplier_quotation?: string;
  items: PurchaseItem[];
  taxes?: TaxRow[];
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
  base_net_total?: string;
  base_net_total_minor?: number;
  base_total_taxes_and_charges?: string;
  base_total_taxes_and_charges_minor?: number;
  base_grand_total?: string;
  base_grand_total_minor?: number;
  received_percentage?: string;
  billed_percentage?: string;
}

export interface PurchaseReceiptData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  currency_scale?: number;
  posting_at: string;
  /**
   * Đơn mua mặc định cho MỌI dòng không tự khai đơn của nó.
   *
   * Tuỳ chọn, và đó là điều làm nên bài toán "một chuyến giao gộp nhiều đơn": khi mỗi dòng
   * tự trỏ đơn của mình (`PurchaseItem.purchase_order`) thì đầu phiếu không còn nghĩa gì,
   * vì không có MỘT đơn nào đại diện cho cả phiếu. Bắt buộc nó lại sẽ ép thủ kho tách một
   * chuyến xe, một biên bản giao nhận của NCC, thành hai phiếu.
   */
  against_purchase_order?: string;
  allow_negative_stock?: boolean;
  /** Tài khoản tồn kho. Kèm `stock_received_but_not_billed` mới sinh bút toán — xem `ledger`. */
  stock_account?: string;
  /** "Hàng đã nhận chưa có hoá đơn" — cầu nối giữa phiếu nhập và hoá đơn mua. */
  stock_received_but_not_billed?: string;
  items: PurchaseItem[];
}

export interface PurchaseInvoiceData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  currency_scale?: number;
  company_currency?: string;
  company_currency_scale?: number;
  conversion_rate?: string;
  conversion_rate_micros?: number;
  posting_at: string;
  due_date?: string;
  buying_price_list?: string;
  supplier_group?: string;
  against_purchase_order?: string;
  credit_to: string;
  items: PurchaseItem[];
  taxes?: TaxRow[];
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
  base_net_total?: string;
  base_net_total_minor?: number;
  base_total_taxes_and_charges?: string;
  base_total_taxes_and_charges_minor?: number;
  base_grand_total?: string;
  base_grand_total_minor?: number;
  outstanding_amount?: string;
  outstanding_amount_minor?: number;
}

/**
 * Một dòng nhu cầu: cần gì, bao nhiêu, khi nào, về kho nào.
 *
 * Không có `rate` — đây là chỗ nói CẦN GÌ, chưa phải chỗ nói GIÁ BAO NHIÊU. Giá đến ở
 * bước sau (báo giá NCC), và trộn hai việc vào một chứng từ là cách đánh mất câu hỏi
 * "cái này ai yêu cầu, và đã đặt mua đủ chưa".
 */
export interface MaterialRequestItem extends UomLine {
  row_id: string;
  warehouse?: string;
  schedule_date?: string;
  note?: string;
}

export type MaterialRequestType = "Purchase" | "Material Transfer" | "Material Issue" | "Manufacture";

export interface MaterialRequestData extends JsonObject {
  company: string;
  material_request_type: MaterialRequestType;
  transaction_date: string;
  schedule_date?: string;
  requested_by?: string;
  items: MaterialRequestItem[];
  note?: string;
}

export interface RequestForQuotationSupplier extends JsonObject {
  row_id: string;
  supplier: string;
  contact?: string;
  note?: string;
}

/**
 * Hỏi giá NHIỀU nhà cung cấp CÙNG một rổ hàng.
 *
 * Đây là lý do RFQ là một chứng từ riêng chứ không phải nhiều báo giá rời: rổ hàng viết
 * MỘT lần, và mỗi NCC trả lời bằng một `Supplier Quotation` trỏ ngược về đây, nên so giá
 * là so trên cùng một danh sách chứ không phải so hai tờ giấy khác nhau.
 */
export interface RequestForQuotationData extends JsonObject {
  company: string;
  transaction_date: string;
  response_by?: string;
  material_request?: string;
  suppliers: RequestForQuotationSupplier[];
  items: MaterialRequestItem[];
  note?: string;
}

export interface SupplierQuotationData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  currency_scale?: number;
  company_currency?: string;
  company_currency_scale?: number;
  conversion_rate?: string;
  conversion_rate_micros?: number;
  transaction_date: string;
  valid_till?: string;
  request_for_quotation?: string;
  supplier_group?: string;
  buying_price_list?: string;
  items: PurchaseItem[];
  taxes?: TaxRow[];
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
  base_net_total?: string;
  base_net_total_minor?: number;
  base_total_taxes_and_charges?: string;
  base_total_taxes_and_charges_minor?: number;
  base_grand_total?: string;
  base_grand_total_minor?: number;
}

export interface JournalEntryLine extends JsonObject {
  row_id: string;
  account: string;
  party_type?: string;
  party?: string;
  debit: DecimalInput;
  credit: DecimalInput;
  debit_minor?: number;
  credit_minor?: number;
  cost_center?: string;
  accounting_dimensions?: JsonObject;
  reference_type?: string;
  reference_name?: string;
}

export interface JournalEntryData extends JsonObject {
  company: string;
  posting_at: string;
  voucher_type?: string;
  user_remark?: string;
  company_currency?: string;
  company_currency_scale?: number;
  accounts: JournalEntryLine[];
  total_debit?: string;
  total_credit?: string;
  total_debit_minor?: number;
  total_credit_minor?: number;
}

export interface StockEntryItem extends JsonObject {
  row_id: string;
  item_code: string;
  qty: DecimalInput;
  qty_micros?: number;
  source_warehouse?: string;
  target_warehouse?: string;
  valuation_rate?: DecimalInput;
  valuation_rate_minor?: number;
  stock_value_difference_minor?: number;
  serial_and_batch_bundle?: string;
  batch_no?: string;
  serial_nos?: string[];
}

export interface StockEntryData extends JsonObject {
  company: string;
  posting_at: string;
  purpose: "Material Receipt" | "Material Issue" | "Material Transfer" | "Manufacture";
  currency?: string;
  currency_scale?: number;
  allow_negative_stock?: boolean;
  work_order?: string;
  finished_good_item?: string;
  finished_good_qty?: DecimalInput;
  finished_good_qty_micros?: number;
  source_warehouse?: string;
  target_warehouse?: string;
  operating_cost?: DecimalInput;
  operating_cost_minor?: number;
  finished_good_bundle?: string;
  items: StockEntryItem[];
}
