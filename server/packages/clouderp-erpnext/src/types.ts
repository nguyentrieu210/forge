import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import type { TaxRow } from "../../clouderp-selling/src/types.js";

export interface ReturnItem extends JsonObject {
  row_id: string;
  item_code: string;
  qty: DecimalInput;
  qty_micros?: number;
  rate: DecimalInput;
  rate_minor?: number;
  amount?: string;
  amount_minor?: number;
  net_amount?: string;
  net_amount_minor?: number;
  warehouse?: string;
  expense_account?: string;
  income_account?: string;
  serial_and_batch_bundle?: string;
  valuation_rate?: DecimalInput;
  valuation_rate_minor?: number;
  stock_value_difference_minor?: number;
}

export interface CreditNoteData extends JsonObject {
  customer: string;
  company: string;
  currency: string;
  currency_scale?: number;
  company_currency?: string;
  company_currency_scale?: number;
  conversion_rate?: string;
  conversion_rate_micros?: number;
  posting_at: string;
  return_against: string;
  debit_to: string;
  default_income_account: string;
  round_off_account?: string;
  items: ReturnItem[];
  taxes?: TaxRow[];
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
  base_net_total_minor?: number;
  base_grand_total_minor?: number;
}

export interface DebitNoteData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  currency_scale?: number;
  company_currency?: string;
  company_currency_scale?: number;
  conversion_rate?: string;
  conversion_rate_micros?: number;
  posting_at: string;
  return_against: string;
  credit_to: string;
  default_expense_account: string;
  round_off_account?: string;
  items: ReturnItem[];
  taxes?: TaxRow[];
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
  base_net_total_minor?: number;
  base_grand_total_minor?: number;
}

export interface StockReturnData extends JsonObject {
  party: string;
  company: string;
  currency: string;
  currency_scale?: number;
  posting_at: string;
  return_against: string;
  return_type: "Sales" | "Purchase";
  stock_account?: string;
  cogs_or_expense_account?: string;
  items: ReturnItem[];
}

export interface BomItem extends JsonObject {
  row_id: string;
  item_code: string;
  qty: DecimalInput;
  qty_micros?: number;
  rate?: DecimalInput;
  rate_minor?: number;
  amount_minor?: number;
  source_warehouse?: string;
}

export interface BillOfMaterialsData extends JsonObject {
  company: string;
  item: string;
  quantity: DecimalInput;
  quantity_micros?: number;
  currency?: string;
  currency_scale?: number;
  operating_cost?: DecimalInput;
  operating_cost_minor?: number;
  items: BomItem[];
  raw_material_cost_minor?: number;
  total_cost_minor?: number;
  rate_minor?: number;
}

export interface WorkOrderRequiredItem extends JsonObject {
  row_id: string;
  item_code: string;
  required_qty: string;
  required_qty_micros: number;
  source_warehouse: string;
}

export interface WorkOrderData extends JsonObject {
  company: string;
  production_item: string;
  bom_no: string;
  qty: DecimalInput;
  qty_micros?: number;
  source_warehouse: string;
  wip_warehouse?: string;
  target_warehouse: string;
  planned_start_date?: string;
  planned_end_date?: string;
  operating_cost_minor?: number;
  required_items?: WorkOrderRequiredItem[];
  produced_qty?: string;
  produced_qty_micros?: number;
  produced_percentage?: string;
}

export interface AssetData extends JsonObject {
  asset_name: string;
  company: string;
  asset_category: string;
  purchase_date: string;
  available_for_use_date: string;
  gross_purchase_amount: DecimalInput;
  gross_purchase_amount_minor?: number;
  salvage_value?: DecimalInput;
  salvage_value_minor?: number;
  currency?: string;
  currency_scale?: number;
  depreciation_method: "Straight Line" | "Written Down Value" | "Double Declining Balance" | "Manual";
  total_number_of_depreciations: number;
  frequency_of_depreciation_months: number;
  depreciation_rate?: DecimalInput;
  accumulated_depreciation_account: string;
  depreciation_expense_account: string;
  fixed_asset_account: string;
}

export interface AssetDepreciationData extends JsonObject {
  asset: string;
  company: string;
  posting_at: string;
  amount?: DecimalInput;
  amount_minor?: number;
  currency?: string;
  currency_scale?: number;
  accumulated_depreciation_account?: string;
  depreciation_expense_account?: string;
  schedule_index?: number;
}


export interface ProductionPlanItem extends JsonObject {
  row_id: string;
  item_code: string;
  bom_no: string;
  planned_qty: DecimalInput;
  planned_qty_micros?: number;
  warehouse?: string;
}

export interface ProductionPlanData extends JsonObject {
  company: string;
  posting_at: string;
  items: ProductionPlanItem[];
  total_planned_qty?: string;
  total_planned_qty_micros?: number;
}

export interface JobCardTimeLog extends JsonObject {
  row_id: string;
  from_time: string;
  to_time: string;
  hours?: string;
  hours_micros?: number;
}

export interface JobCardData extends JsonObject {
  company: string;
  work_order: string;
  operation: string;
  workstation: string;
  employee?: string;
  posting_at: string;
  completed_qty: DecimalInput;
  completed_qty_micros?: number;
  time_logs: JobCardTimeLog[];
  total_hours?: string;
  total_hours_micros?: number;
}

export interface AssetMovementData extends JsonObject {
  asset: string;
  company: string;
  posting_at: string;
  target_location: string;
  target_custodian?: string;
}

export interface AssetMaintenanceData extends JsonObject {
  asset: string;
  company: string;
  posting_at: string;
  maintenance_type: "Preventive" | "Corrective" | "Calibration";
  description: string;
  next_due_date?: string;
}

export interface AssetDisposalData extends JsonObject {
  asset: string;
  company: string;
  posting_at: string;
  proceeds: DecimalInput;
  proceeds_minor?: number;
  cash_or_receivable_account: string;
  gain_account: string;
  loss_account: string;
  gross_amount_minor?: number;
  accumulated_depreciation_minor?: number;
  net_book_value_minor?: number;
  gain_or_loss_minor?: number;
  currency?: string;
  currency_scale?: number;
  fixed_asset_account?: string;
  accumulated_depreciation_account?: string;
}

export interface TimesheetDetail extends JsonObject {
  row_id: string;
  project: string;
  task?: string;
  activity_type: string;
  from_time: string;
  to_time: string;
  hours?: string;
  hours_micros?: number;
  cost_rate?: DecimalInput;
  billing_rate?: DecimalInput;
  cost_amount_minor?: number;
  billing_amount_minor?: number;
}

export interface TimesheetData extends JsonObject {
  company: string;
  employee: string;
  posting_at: string;
  currency?: string;
  currency_scale?: number;
  time_logs: TimesheetDetail[];
  total_hours?: string;
  total_hours_micros?: number;
  total_cost_minor?: number;
  total_billing_minor?: number;
}

export interface QualityReading extends JsonObject {
  row_id: string;
  specification: string;
  value: DecimalInput;
  minimum?: DecimalInput;
  maximum?: DecimalInput;
  accepted?: boolean;
}

export interface QualityInspectionData extends JsonObject {
  inspection_type: "Incoming" | "Outgoing" | "In Process";
  reference_type?: string;
  reference_name?: string;
  item_code: string;
  posting_at: string;
  readings: QualityReading[];
  status?: "Accepted" | "Rejected";
  remarks?: string;
}

export interface IssueData extends JsonObject {
  subject: string;
  customer?: string;
  service_level_agreement?: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status?: "Open" | "Replied" | "On Hold" | "Resolved" | "Closed";
  opened_at: string;
  first_response_due_at?: string;
  resolution_due_at?: string;
  resolution_details?: string;
}

export interface ExpenseClaimItem extends JsonObject {
  row_id: string;
  expense_type: string;
  expense_account: string;
  amount: DecimalInput;
  amount_minor?: number;
  cost_center?: string;
}

export interface ExpenseClaimData extends JsonObject {
  employee: string;
  company: string;
  posting_at: string;
  payable_account: string;
  currency?: string;
  currency_scale?: number;
  expenses: ExpenseClaimItem[];
  total_claimed_amount?: string;
  total_claimed_amount_minor?: number;
}

export interface PosInvoiceItem extends JsonObject {
  row_id: string;
  item_code: string;
  qty: DecimalInput;
  qty_micros?: number;
  rate: DecimalInput;
  rate_minor?: number;
  amount_minor?: number;
  warehouse: string;
  income_account?: string;
}

export interface PosOpeningEntryData extends JsonObject {
  pos_profile: string;
  company: string;
  posting_at: string;
  opening_cash: DecimalInput;
  opening_cash_minor?: number;
  currency?: string;
  currency_scale?: number;
}

export interface PosInvoiceData extends JsonObject {
  pos_profile: string;
  opening_entry: string;
  customer: string;
  company: string;
  currency: string;
  currency_scale?: number;
  posting_at: string;
  cash_account: string;
  default_income_account: string;
  stock_account: string;
  cogs_account: string;
  items: PosInvoiceItem[];
  taxes?: TaxRow[];
  net_total?: string;
  net_total_minor?: number;
  total_taxes_and_charges?: string;
  total_taxes_and_charges_minor?: number;
  grand_total?: string;
  grand_total_minor?: number;
}

export interface PosClosingEntryData extends JsonObject {
  pos_profile: string;
  opening_entry: string;
  company: string;
  posting_at: string;
  expected_net_total_minor?: number;
  expected_tax_total_minor?: number;
  expected_grand_total_minor?: number;
  closing_cash: DecimalInput;
  closing_cash_minor?: number;
  difference_minor?: number;
  currency?: string;
  currency_scale?: number;
}
