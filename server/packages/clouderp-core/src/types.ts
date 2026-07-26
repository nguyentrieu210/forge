import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import type { TaxRow } from "../../clouderp-selling/src/types.js";

export interface PurchaseItem extends JsonObject {
  row_id: string;
  item_code: string;
  qty: DecimalInput;
  rate: DecimalInput;
  qty_micros?: number;
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
  against_purchase_order: string;
  allow_negative_stock?: boolean;
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
