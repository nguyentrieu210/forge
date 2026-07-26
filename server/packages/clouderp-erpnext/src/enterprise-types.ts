import type { JsonObject } from "../../contracts/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";

export interface BankTransactionData extends JsonObject {
  bank_account: string;
  company?: string;
  posting_at: string;
  transaction_type: "Deposit" | "Withdrawal";
  amount: DecimalInput;
  amount_minor?: number;
  signed_amount_minor?: number;
  currency?: string;
  currency_scale?: number;
  gl_account?: string;
  reference_number?: string;
  description?: string;
}

export interface BankReconciliationItem extends JsonObject {
  row_id: string;
  bank_transaction: string;
  voucher_type: string;
  voucher_no: string;
  amount: DecimalInput;
  amount_minor?: number;
}

export interface BankReconciliationData extends JsonObject {
  bank_account: string;
  company?: string;
  posting_at: string;
  currency?: string;
  currency_scale?: number;
  entries: BankReconciliationItem[];
  total_reconciled?: string;
  total_reconciled_minor?: number;
}

export interface SalarySlipComponentRow extends JsonObject {
  row_id: string;
  salary_component: string;
  amount: DecimalInput;
  amount_minor?: number;
  account?: string;
  cost_center?: string;
}

export interface SalarySlipData extends JsonObject {
  employee: string;
  company: string;
  posting_at: string;
  start_date: string;
  end_date: string;
  payroll_payable_account: string;
  currency?: string;
  currency_scale?: number;
  earnings: SalarySlipComponentRow[];
  deductions?: SalarySlipComponentRow[];
  gross_pay?: string;
  gross_pay_minor?: number;
  total_deduction?: string;
  total_deduction_minor?: number;
  net_pay?: string;
  net_pay_minor?: number;
  outstanding_amount?: string;
  outstanding_amount_minor?: number;
}

export interface PayrollEntryData extends JsonObject {
  company: string;
  posting_at: string;
  start_date: string;
  end_date: string;
  salary_slips: Array<{ row_id: string; salary_slip: string; employee?: string; net_pay_minor?: number }>;
  employee_count?: number;
  total_net_pay?: string;
  total_net_pay_minor?: number;
  currency?: string;
  currency_scale?: number;
}

export interface SubscriptionData extends JsonObject {
  customer: string;
  company: string;
  subscription_plan: string;
  start_date: string;
  end_date?: string;
  frequency?: "Monthly" | "Quarterly" | "Yearly";
  interval_months?: number;
  item_code?: string;
  qty?: DecimalInput;
  qty_micros?: number;
  rate?: DecimalInput;
  rate_minor?: number;
  amount?: string;
  amount_minor?: number;
  currency?: string;
  currency_scale?: number;
  next_invoice_date?: string;
}

export interface EInvoiceSubmissionData extends JsonObject {
  source_doctype: "Sales Invoice" | "Credit Note";
  source_name: string;
  regional_profile: string;
  posting_at: string;
  company?: string;
  source_version?: number;
  provider?: string;
  submission_status?: "Queued" | "Submitted" | "Accepted" | "Rejected" | "Cancelled";
  external_reference?: string;
  response_message?: string;
}
