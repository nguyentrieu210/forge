import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";

export interface SalesItem extends JsonObject {
  row_id: string;
  item_code: string;
  qty: DecimalInput;
  rate: DecimalInput;
  amount?: string;
  qty_micros?: number;
  rate_minor?: number;
  amount_minor?: number;
  net_amount?: string;
  net_amount_minor?: number;
  warehouse?: string;
  valuation_rate?: DecimalInput;
  valuation_rate_minor?: number;
  stock_value_difference_minor?: number;
  income_account?: string;
  delivered_qty?: DecimalInput;
  billed_qty?: DecimalInput;
  serial_and_batch_bundle?: string;
  batch_no?: string;
  serial_nos?: string[];
  item_price?: string;
  pricing_rule?: string;
  discount_percentage?: string;
}

export type TaxChargeType = "On Net Total" | "On Previous Row Total" | "Actual" | "On Item Quantity";
export type TaxAddDeduct = "Add" | "Deduct";

export interface TaxRow extends JsonObject {
  row_id: string;
  account: string;
  rate: DecimalInput;
  charge_type?: TaxChargeType;
  included_in_print_rate?: boolean;
  add_deduct_tax?: TaxAddDeduct;
  /** Positive input amount for Actual charge type. Kept separate from signed canonical tax_amount. */
  actual_tax_amount?: DecimalInput;
  /** Signed canonical tax amount after Add/Deduct normalization. */
  tax_amount?: DecimalInput;
  tax_amount_minor?: number;
  total?: string;
  total_minor?: number;
}

export type DiscountBasis = "Net Total" | "Grand Total";

interface SalesTotalsData extends JsonObject {
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
  rounded_total?: string;
  rounded_total_minor?: number;
  rounding_adjustment?: string;
  rounding_adjustment_minor?: number;
  apply_discount_on?: DiscountBasis | undefined;
  additional_discount_percentage?: DecimalInput | undefined;
  discount_amount?: DecimalInput | undefined;
  discount_amount_minor?: number;
}

interface CurrencyContextData extends JsonObject {
  company_currency?: string;
  company_currency_scale?: number;
  conversion_rate?: string;
  conversion_rate_micros?: number;
  base_net_total?: string;
  base_net_total_minor?: number;
  base_total_taxes_and_charges?: string;
  base_total_taxes_and_charges_minor?: number;
  base_grand_total?: string;
  base_grand_total_minor?: number;
}

export interface SalesOrderData extends SalesTotalsData, CurrencyContextData {
  customer: string;
  currency: string;
  currency_scale?: number;
  company: string;
  transaction_date: string;
  selling_price_list?: string;
  customer_group?: string;
  items: SalesItem[];
  taxes?: TaxRow[];
  delivered_percentage?: string;
  billed_percentage?: string;
}

export interface DeliveryNoteData extends JsonObject {
  customer: string;
  company: string;
  currency: string;
  currency_scale?: number;
  posting_at: string;
  against_sales_order: string;
  allow_negative_stock?: boolean;
  items: SalesItem[];
}

export interface SalesInvoiceData extends SalesTotalsData, CurrencyContextData {
  customer: string;
  company: string;
  currency: string;
  currency_scale?: number;
  posting_at: string;
  debit_to: string;
  default_income_account: string;
  /** Backward-compatible fallback. Each tax row account remains authoritative. */
  tax_account?: string;
  round_off_account?: string;
  against_sales_order?: string;
  selling_price_list?: string;
  customer_group?: string;
  items: SalesItem[];
  taxes?: TaxRow[];
  outstanding_amount?: string;
  outstanding_amount_minor?: number;
  is_return?: boolean;
}

export interface PaymentReference extends JsonObject {
  row_id: string;
  reference_doctype: string;
  reference_name: string;
  allocated_amount: DecimalInput;
  allocated_amount_minor?: number;
  base_allocated_amount?: string;
  base_allocated_amount_minor?: number;
}

export interface PaymentEntryData extends JsonObject {
  company: string;
  company_currency?: string;
  company_currency_scale?: number;
  posting_at: string;
  payment_type: "Receive" | "Pay";
  party_type: "Customer" | "Supplier";
  party: string;
  paid_from: string;
  paid_to: string;
  exchange_gain_loss_account?: string;
  paid_amount: DecimalInput;
  paid_amount_minor?: number;
  received_amount: DecimalInput;
  received_amount_minor?: number;
  base_paid_amount?: string;
  base_paid_amount_minor?: number;
  /** Historical company-currency amount cleared from receivable/payable. */
  base_party_amount?: string;
  base_party_amount_minor?: number;
  base_receivable_amount?: string;
  base_receivable_amount_minor?: number;
  base_payable_amount?: string;
  base_payable_amount_minor?: number;
  difference_amount?: string;
  difference_amount_minor?: number;
  source_exchange_rate?: string;
  source_exchange_rate_micros?: number;
  currency: string;
  currency_scale?: number;
  references: PaymentReference[];
  unallocated_amount?: string;
  unallocated_amount_minor?: number;
}
