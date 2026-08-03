import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { requireObject, requireString } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type FilterOperator = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "like" | "is_null";
export interface QueryFilter { field: string; operator: FilterOperator; value?: JsonValue }
export interface QueryOrder { field: string; direction: "asc" | "desc" }
export interface QueryRequest {
  report: string;
  tenant_id: string;
  filters?: QueryFilter[];
  order_by?: QueryOrder[];
  limit?: number;
  offset?: number;
}
export interface ReportColumn {
  field: string;
  label: string;
  type: "Data" | "Currency" | "Float" | "Int" | "Date" | "Link";
  /** Target doctype for Link columns, carried through to the Frappe facade. */
  options?: string;
}
export interface ReportDefinition {
  name: string;
  source: string;
  tenantField: string;
  columns: ReportColumn[];
  allowedFilters: string[];
  defaultOrder?: QueryOrder[];
  maxRows: number;
  preparedThreshold: number;
}
export interface CompiledQuery { sql: string; params: unknown[]; columns: ReportColumn[]; prepared: boolean }

const companyColumn: ReportColumn = { field: "company", label: "Company", type: "Link", options: "Company" };
const branchColumn: ReportColumn = { field: "branch", label: "Branch", type: "Link", options: "Branch" };

const DEFINITIONS: Record<string, ReportDefinition> = {
  "Accounts Receivable": {
    name: "Accounts Receivable",
    source: "receivable_outstanding",
    tenantField: "tenant_id",
    columns: [
      { field: "party", label: "Customer", type: "Link" },
      { field: "currency", label: "Currency", type: "Data" },
      { field: "against_voucher_type", label: "Voucher Type", type: "Data" },
      { field: "against_voucher_no", label: "Voucher", type: "Link" },
      { field: "outstanding_amount", label: "Outstanding", type: "Currency" },
    ],
    allowedFilters: ["party", "currency", "against_voucher_type", "against_voucher_no", "outstanding_amount"],
    defaultOrder: [{ field: "against_voucher_no", direction: "asc" }],
    maxRows: 5000,
    preparedThreshold: 1000,
  },
  "Accounts Payable": {
    name: "Accounts Payable",
    source: "payable_outstanding",
    tenantField: "tenant_id",
    columns: [
      { field: "party", label: "Supplier", type: "Link" },
      { field: "currency", label: "Currency", type: "Data" },
      { field: "against_voucher_type", label: "Voucher Type", type: "Data" },
      { field: "against_voucher_no", label: "Voucher", type: "Link" },
      { field: "outstanding_amount", label: "Outstanding", type: "Currency" },
    ],
    allowedFilters: ["party", "currency", "against_voucher_type", "against_voucher_no", "outstanding_amount"],
    defaultOrder: [{ field: "against_voucher_no", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "General Ledger": {
    name: "General Ledger", source: "general_ledger_report", tenantField: "tenant_id",
    columns: [
      companyColumn, branchColumn,
      { field: "posting_at", label: "Posting Date", type: "Date" }, { field: "voucher_type", label: "Voucher Type", type: "Data" },
      { field: "voucher_no", label: "Voucher", type: "Link" }, { field: "account", label: "Account", type: "Link" },
      { field: "party_type", label: "Party Type", type: "Data" }, { field: "party", label: "Party", type: "Link" },
      { field: "currency", label: "Currency", type: "Data" }, { field: "debit", label: "Debit", type: "Currency" },
      { field: "credit", label: "Credit", type: "Currency" }, { field: "cost_center", label: "Cost Center", type: "Link" },
    ],
    allowedFilters: ["company","branch","posting_at","voucher_type","voucher_no","account","party_type","party","currency","cost_center"],
    defaultOrder: [{ field: "company", direction: "asc" }, { field: "posting_at", direction: "asc" }, { field: "voucher_no", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Trial Balance": {
    name: "Trial Balance", source: "trial_balance", tenantField: "tenant_id",
    columns: [ companyColumn, branchColumn, { field: "account", label: "Account", type: "Link" }, { field: "currency", label: "Currency", type: "Data" },
      { field: "debit", label: "Debit", type: "Currency" }, { field: "credit", label: "Credit", type: "Currency" }, { field: "balance", label: "Balance", type: "Currency" } ],
    allowedFilters: ["company","branch","account","currency","debit","credit","balance"],
    defaultOrder: [{ field: "company", direction: "asc" }, { field: "account", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Stock Ledger": {
    name: "Stock Ledger", source: "stock_ledger_report", tenantField: "tenant_id",
    columns: [
      { field: "posting_at", label: "Posting Date", type: "Date" }, { field: "voucher_type", label: "Voucher Type", type: "Data" },
      { field: "voucher_no", label: "Voucher", type: "Link" }, { field: "item_code", label: "Item", type: "Link" },
      { field: "warehouse", label: "Warehouse", type: "Link" }, { field: "batch_no", label: "Batch", type: "Link" },
      { field: "serial_no", label: "Serial No", type: "Link" }, { field: "actual_qty", label: "Actual Qty", type: "Float" },
      { field: "actual_weight", label: "Actual Weight (kg)", type: "Float" },
      { field: "valuation_rate", label: "Valuation Rate", type: "Currency" }, { field: "stock_value_difference", label: "Stock Value Difference", type: "Currency" },
    ],
    allowedFilters: ["posting_at","voucher_type","voucher_no","item_code","warehouse","batch_no","serial_no","actual_weight"],
    defaultOrder: [{ field: "posting_at", direction: "asc" }, { field: "voucher_no", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Batch Stock Balance": {
    name: "Batch Stock Balance", source: "batch_stock_balance", tenantField: "tenant_id",
    columns: [ { field: "item_code", label: "Item", type: "Link" }, { field: "warehouse", label: "Warehouse", type: "Link" },
      { field: "batch_no", label: "Batch", type: "Link" }, { field: "actual_qty", label: "Actual Qty", type: "Float" },
      { field: "actual_weight", label: "Actual Weight (kg)", type: "Float" },
      { field: "stock_value", label: "Stock Value", type: "Currency" } ],
    allowedFilters: ["item_code","warehouse","batch_no","actual_qty","actual_weight","stock_value"],
    defaultOrder: [{ field: "item_code", direction: "asc" }, { field: "batch_no", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Tồn nhôm theo khổ": {
    name: "Tồn nhôm theo khổ", source: "alumdoor_available_stock_by_length", tenantField: "tenant_id",
    columns: [
      { field: "item_code", label: "Mã nhôm", type: "Link", options: "Item" },
      { field: "warehouse", label: "Kho chính", type: "Link", options: "Warehouse" },
      { field: "color", label: "Màu", type: "Link", options: "Item Color" },
      { field: "condition", label: "Tình trạng", type: "Data" },
      { field: "min_length_m", label: "Khổ tối thiểu (m)", type: "Float" },
      { field: "total_qty", label: "Tổng cây", type: "Float" },
      { field: "reserved_qty", label: "Đã giữ", type: "Float" },
      { field: "available_qty", label: "Khả dụng", type: "Float" },
    ],
    allowedFilters: [
      "item_code", "warehouse", "color", "condition", "min_length_m",
      "total_qty", "reserved_qty", "available_qty",
    ],
    defaultOrder: [
      { field: "item_code", direction: "asc" },
      { field: "warehouse", direction: "asc" },
      { field: "min_length_m", direction: "desc" },
    ],
    maxRows: 5000,
    preparedThreshold: 1000,
  },
  "Serial Number Status": {
    name: "Serial Number Status", source: "serial_stock_state", tenantField: "tenant_id",
    columns: [ { field: "item_code", label: "Item", type: "Link" }, { field: "serial_no", label: "Serial No", type: "Link" },
      { field: "status", label: "Status", type: "Data" }, { field: "actual_qty", label: "Actual Qty", type: "Float" },
      { field: "last_inward_warehouse", label: "Last Warehouse", type: "Link" }, { field: "last_posting_at", label: "Last Posting", type: "Date" } ],
    allowedFilters: ["item_code","serial_no","status","last_inward_warehouse","last_posting_at"],
    defaultOrder: [{ field: "item_code", direction: "asc" }, { field: "serial_no", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Work Order Progress": {
    name: "Work Order Progress", source: "work_order_progress", tenantField: "tenant_id",
    columns: [ { field: "work_order", label: "Work Order", type: "Link" }, { field: "production_item", label: "Production Item", type: "Link" },
      { field: "target_warehouse", label: "Target Warehouse", type: "Link" }, { field: "planned_qty", label: "Planned Qty", type: "Float" },
      { field: "produced_qty", label: "Produced Qty", type: "Float" }, { field: "status", label: "Status", type: "Data" } ],
    allowedFilters: ["work_order","production_item","target_warehouse","status"],
    defaultOrder: [{ field: "work_order", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Asset Depreciation Ledger": {
    name: "Asset Depreciation Ledger", source: "asset_depreciation_ledger", tenantField: "tenant_id",
    columns: [ { field: "posting_at", label: "Posting Date", type: "Date" }, { field: "voucher_no", label: "Entry", type: "Link" },
      { field: "asset", label: "Asset", type: "Link" }, { field: "currency", label: "Currency", type: "Data" }, { field: "amount", label: "Amount", type: "Currency" } ],
    allowedFilters: ["posting_at","voucher_no","asset","currency","amount"],
    defaultOrder: [{ field: "posting_at", direction: "asc" }, { field: "asset", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Asset Lifecycle": {
    name: "Asset Lifecycle", source: "asset_lifecycle_report", tenantField: "tenant_id",
    columns: [
      { field: "posting_at", label: "Posting Date", type: "Date" }, { field: "voucher_type", label: "Voucher Type", type: "Data" },
      { field: "voucher_no", label: "Voucher", type: "Link" }, { field: "asset", label: "Asset", type: "Link" },
      { field: "kind", label: "Activity", type: "Data" }, { field: "location", label: "Location", type: "Link" },
      { field: "custodian", label: "Custodian", type: "Link" }, { field: "amount", label: "Amount", type: "Currency" },
      { field: "currency", label: "Currency", type: "Data" },
    ],
    allowedFilters: ["posting_at","voucher_type","voucher_no","asset","kind","location","custodian","currency"],
    defaultOrder: [{ field: "posting_at", direction: "asc" }, { field: "voucher_no", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Project Profitability": {
    name: "Project Profitability", source: "project_profitability", tenantField: "tenant_id",
    columns: [
      { field: "project", label: "Project", type: "Link" }, { field: "currency", label: "Currency", type: "Data" },
      { field: "actual_hours", label: "Actual Hours", type: "Float" }, { field: "actual_cost", label: "Actual Cost", type: "Currency" },
      { field: "billable_amount", label: "Billable Amount", type: "Currency" }, { field: "gross_margin", label: "Gross Margin", type: "Currency" },
    ],
    allowedFilters: ["project","currency","actual_hours","actual_cost","billable_amount","gross_margin"],
    defaultOrder: [{ field: "project", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "POS Session Summary": {
    name: "POS Session Summary", source: "pos_session_summary", tenantField: "tenant_id",
    columns: [
      { field: "opening_entry", label: "Opening Entry", type: "Link" }, { field: "pos_profile", label: "POS Profile", type: "Link" },
      { field: "currency", label: "Currency", type: "Data" }, { field: "net_total", label: "Net Total", type: "Currency" },
      { field: "tax_total", label: "Tax Total", type: "Currency" }, { field: "grand_total", label: "Grand Total", type: "Currency" },
      { field: "invoice_count", label: "Invoices", type: "Int" },
    ],
    allowedFilters: ["opening_entry","pos_profile","currency","net_total","tax_total","grand_total","invoice_count"],
    defaultOrder: [{ field: "opening_entry", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Bank Reconciliation Summary": {
    name: "Bank Reconciliation Summary", source: "bank_reconciliation_summary", tenantField: "tenant_id",
    columns: [
      { field: "bank_account", label: "Bank Account", type: "Link" }, { field: "bank_transaction", label: "Bank Transaction", type: "Link" },
      { field: "currency", label: "Currency", type: "Data" }, { field: "reconciled_amount", label: "Reconciled Amount", type: "Currency" },
      { field: "last_reconciled_at", label: "Last Reconciled", type: "Date" }, { field: "match_count", label: "Matches", type: "Int" },
    ],
    allowedFilters: ["bank_account","bank_transaction","currency","reconciled_amount","last_reconciled_at","match_count"],
    defaultOrder: [{ field: "last_reconciled_at", direction: "desc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Payroll Register": {
    name: "Payroll Register", source: "payroll_register", tenantField: "tenant_id",
    columns: [
      { field: "salary_slip", label: "Salary Slip", type: "Link" }, { field: "employee", label: "Employee", type: "Link" },
      { field: "company", label: "Company", type: "Link" }, { field: "start_date", label: "Start Date", type: "Date" },
      { field: "end_date", label: "End Date", type: "Date" }, { field: "gross_pay", label: "Gross Pay", type: "Currency" },
      { field: "total_deduction", label: "Deductions", type: "Currency" }, { field: "net_pay", label: "Net Pay", type: "Currency" },
      { field: "status", label: "Status", type: "Data" },
    ],
    allowedFilters: ["salary_slip","employee","company","start_date","end_date","gross_pay","total_deduction","net_pay","status"],
    defaultOrder: [{ field: "start_date", direction: "desc" }, { field: "salary_slip", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Subscription Schedule": {
    name: "Subscription Schedule", source: "subscription_schedule", tenantField: "tenant_id",
    columns: [
      { field: "subscription", label: "Subscription", type: "Link" }, { field: "customer", label: "Customer", type: "Link" },
      { field: "company", label: "Company", type: "Link" }, { field: "subscription_plan", label: "Plan", type: "Link" },
      { field: "next_invoice_date", label: "Next Invoice Date", type: "Date" }, { field: "amount", label: "Amount", type: "Currency" },
      { field: "currency", label: "Currency", type: "Data" }, { field: "status", label: "Status", type: "Data" },
    ],
    allowedFilters: ["subscription","customer","company","subscription_plan","next_invoice_date","amount","currency","status"],
    defaultOrder: [{ field: "next_invoice_date", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "E-Invoice Submission Log": {
    name: "E-Invoice Submission Log", source: "e_invoice_submission_log", tenantField: "tenant_id",
    columns: [
      { field: "submission", label: "Submission", type: "Link" }, { field: "source_doctype", label: "Source Type", type: "Data" },
      { field: "source_name", label: "Source", type: "Link" }, { field: "provider", label: "Provider", type: "Data" },
      { field: "submission_status", label: "Status", type: "Data" }, { field: "modified_at", label: "Modified", type: "Date" },
    ],
    allowedFilters: ["submission","source_doctype","source_name","provider","submission_status","modified_at"],
    defaultOrder: [{ field: "modified_at", direction: "desc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Profit and Loss": {
    name: "Profit and Loss", source: "profit_and_loss", tenantField: "tenant_id",
    columns: [
      { field: "account", label: "Account", type: "Link" }, { field: "root_type", label: "Root Type", type: "Data" },
      { field: "currency", label: "Currency", type: "Data" }, { field: "debit", label: "Debit", type: "Currency" },
      { field: "credit", label: "Credit", type: "Currency" }, { field: "balance", label: "Balance", type: "Currency" },
    ],
    allowedFilters: ["account","root_type","currency","debit","credit","balance"],
    defaultOrder: [{ field: "root_type", direction: "asc" }, { field: "account", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Balance Sheet": {
    name: "Balance Sheet", source: "balance_sheet", tenantField: "tenant_id",
    columns: [
      { field: "account", label: "Account", type: "Link" }, { field: "root_type", label: "Root Type", type: "Data" },
      { field: "currency", label: "Currency", type: "Data" }, { field: "debit", label: "Debit", type: "Currency" },
      { field: "credit", label: "Credit", type: "Currency" }, { field: "balance", label: "Balance", type: "Currency" },
    ],
    allowedFilters: ["account","root_type","currency","debit","credit","balance"],
    defaultOrder: [{ field: "root_type", direction: "asc" }, { field: "account", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Cash Flow": {
    name: "Cash Flow", source: "cash_flow", tenantField: "tenant_id",
    columns: [
      { field: "account", label: "Account", type: "Link" }, { field: "currency", label: "Currency", type: "Data" },
      { field: "net_cash_flow", label: "Net Cash Flow", type: "Currency" },
    ],
    allowedFilters: ["account","currency","net_cash_flow"],
    defaultOrder: [{ field: "account", direction: "asc" }], maxRows: 5000, preparedThreshold: 1000,
  },
  "Finance GL Integrity Exceptions": {
    name: "Finance GL Integrity Exceptions", source: "finance_gl_integrity_exceptions", tenantField: "tenant_id",
    columns: [
      { field: "severity", label: "Severity", type: "Data" }, { field: "code", label: "Code", type: "Data" },
      companyColumn, branchColumn,
      { field: "voucher_type", label: "Voucher Type", type: "Data" }, { field: "voucher_no", label: "Voucher", type: "Link" },
      { field: "voucher_revision", label: "Revision", type: "Int" }, { field: "details", label: "Details", type: "Data" },
    ],
    allowedFilters: ["severity","code","company","branch","voucher_type","voucher_no","voucher_revision"],
    defaultOrder: [{ field: "severity", direction: "asc" }, { field: "company", direction: "asc" }, { field: "voucher_no", direction: "asc" }],
    maxRows: 5000,
    preparedThreshold: 1000,
  },
  "Stock Balance": {
    name: "Stock Balance",
    source: "stock_balance",
    tenantField: "tenant_id",
    columns: [
      { field: "item_code", label: "Item", type: "Link" },
      { field: "warehouse", label: "Warehouse", type: "Link" },
      { field: "actual_qty", label: "Actual Qty", type: "Float" },
      { field: "stock_value", label: "Stock Value", type: "Currency" },
    ],
    allowedFilters: ["item_code", "warehouse", "actual_qty", "stock_value"],
    defaultOrder: [{ field: "item_code", direction: "asc" }, { field: "warehouse", direction: "asc" }],
    maxRows: 5000,
    preparedThreshold: 1000,
  },
};

export function parseQueryRequest(value: unknown, tenantId: string): QueryRequest {
  const object = requireObject(value, "query");
  const report = requireString(object.report, "report", 160);
  const filtersRaw = object.filters;
  const filters = filtersRaw === undefined ? undefined : parseFilters(filtersRaw);
  const orderRaw = object.order_by;
  const orderBy = orderRaw === undefined ? undefined : parseOrder(orderRaw);
  const limit = parseBoundedInteger(object.limit, "limit", 1, 5000);
  const offset = parseBoundedInteger(object.offset, "offset", 0, 1_000_000);
  return {
    report,
    tenant_id: tenantId,
    ...(filters ? { filters } : {}),
    ...(orderBy ? { order_by: orderBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}

export class QueryCompiler {
  compile(request: QueryRequest, forceSynchronous = false): CompiledQuery {
    const definition = DEFINITIONS[request.report];
    if (!definition) throw errors.validation(`Unknown report: ${request.report}`);
    const selectedFields = definition.columns.map((column) => quoteIdentifier(column.field));
    const params: unknown[] = [request.tenant_id];
    const where = [`${quoteIdentifier(definition.tenantField)}=?1`];
    for (const filter of request.filters ?? []) {
      if (!definition.allowedFilters.includes(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
      const field = quoteIdentifier(filter.field);
      if (filter.operator === "is_null") {
        where.push(`${field} IS NULL`);
        continue;
      }
      if (filter.operator === "in") {
        if (!Array.isArray(filter.value) || filter.value.length === 0) throw errors.validation(`IN filter requires a non-empty array: ${filter.field}`);
        if (filter.value.length > 80) throw errors.validation("IN filter exceeds the parameter budget");
        const placeholders = filter.value.map((value) => {
          params.push(value);
          return `?${params.length}`;
        });
        where.push(`${field} IN (${placeholders.join(",")})`);
        continue;
      }
      params.push(filter.value ?? null);
      const operator = filter.operator === "like" ? "LIKE" : filter.operator;
      where.push(`${field} ${operator} ?${params.length}`);
    }
    const order = request.order_by ?? definition.defaultOrder ?? [];
    for (const item of order) {
      if (!definition.columns.some((column) => column.field === item.field)) throw errors.validation(`Order field is not allowed: ${item.field}`);
    }
    const limit = Math.max(1, Math.min(request.limit ?? 100, definition.maxRows));
    const offset = Math.max(0, request.offset ?? 0);
    params.push(limit, offset);
    const orderSql = order.length
      ? ` ORDER BY ${order.map((item) => `${quoteIdentifier(item.field)} ${item.direction.toUpperCase()}`).join(", ")}`
      : "";
    const sql = `SELECT ${selectedFields.join(", ")} FROM ${quoteIdentifier(definition.source)} WHERE ${where.join(" AND ")}${orderSql} LIMIT ?${params.length - 1} OFFSET ?${params.length}`;
    const prepared = !forceSynchronous && (limit > definition.preparedThreshold || (request.filters?.length ?? 0) > 8);
    return { sql, params, columns: definition.columns, prepared };
  }
}

export class D1ReportService {
  constructor(private readonly db: D1Database, private readonly compiler = new QueryCompiler()) {}

  async run(request: QueryRequest, forceSynchronous = false): Promise<JsonObject> {
    const compiled = this.compiler.compile(request, forceSynchronous);
    if (compiled.prepared) return { prepared: true, report: request.report, reason: "QUERY_BUDGET" };
    const result = await this.db.prepare(compiled.sql).bind(...compiled.params).all<Record<string, JsonValue>>();
    return {
      prepared: false,
      report: request.report,
      columns: compiled.columns as unknown as JsonValue,
      result: (result.results ?? []) as unknown as JsonValue,
      row_count: result.results?.length ?? 0,
      message: null,
      chart: null,
      report_summary: [],
      skip_total_row: false,
    };
  }
}

function parseFilters(value: JsonValue | undefined): QueryFilter[] {
  if (!Array.isArray(value) || value.length > 20) throw errors.validation("filters must be an array with at most 20 entries");
  return value.map((entry, index) => {
    const object = requireObject(entry, `filters[${index}]`);
    const field = requireString(object.field, `filters[${index}].field`, 120);
    const operator = object.operator;
    if (!["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"].includes(String(operator))) {
      throw errors.validation(`filters[${index}].operator is invalid`);
    }
    return {
      field,
      operator: operator as FilterOperator,
      ...(object.value !== undefined ? { value: object.value } : {}),
    };
  });
}

function parseOrder(value: JsonValue | undefined): QueryOrder[] {
  if (!Array.isArray(value) || value.length > 5) throw errors.validation("order_by must be an array with at most 5 entries");
  return value.map((entry, index) => {
    const object = requireObject(entry, `order_by[${index}]`);
    const field = requireString(object.field, `order_by[${index}].field`, 120);
    if (object.direction !== "asc" && object.direction !== "desc") throw errors.validation(`order_by[${index}].direction is invalid`);
    return { field, direction: object.direction };
  });
}

function parseBoundedInteger(value: JsonValue | undefined, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw errors.validation(`${field} must be an integer from ${min} to ${max}`);
  }
  return value as number;
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw errors.validation(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

// ── Reports an APP declares ──────────────────────────────────────────────────
/**
 * Compiling a report that came from an app manifest rather than from `DEFINITIONS`.
 *
 * The definitions above read purpose-built SQL views for accounting, where the shape of
 * a ledger is fixed and the platform owns it. An app's data has no such view: it lives in
 * `documents` as JSON, one row per record. So an app report is compiled against that
 * table with `json_extract`, which is the same access path the list view already uses.
 *
 * WHAT AN APP CANNOT DO HERE, and why each is closed rather than merely undocumented:
 *   · Name a table. The source is always `documents`, filtered to ONE doctype.
 *   · Reach another tenant. `tenant_id` is the first bound parameter, always.
 *   · Reach another app. The doctype is checked against the app's own at parse time, and
 *     permission is asserted by the caller before this runs.
 *   · Inject anything. Every identifier is matched against a strict pattern; every value
 *     is a bound parameter. Nothing an app or a user writes is concatenated into SQL.
 *
 * The result is that a report is data an app carries, with the same blast radius as a
 * list view — not a hole through which an app can query the database.
 */
export interface AppReportSpec {
  name: string;
  doctype: string;
  columns: Array<{ field: string; label: string; type: string; options?: string; aggregate?: string }>;
  group_by?: string;
  order_by?: { column: string; direction: "asc" | "desc" };
  filters: string[];
  limit: number;
}

const APP_REPORT_FIELD = /^[a-z_][a-z0-9_]*$/;
const APP_REPORT_OPERATORS = new Set<FilterOperator>(["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"]);
/** Real columns of `documents`. Everything else lives inside `payload_json`. */
const RECORD_COLUMNS = new Set(["name", "owner", "status", "docstatus", "created_at", "modified_at"]);
const AGGREGATE_SQL: Record<string, (expression: string) => string> = {
  // `count` counts ROWS, so its field is irrelevant — counting a JSON field would silently
  // skip records where that field is absent, which is not what "how many" ever means.
  count: () => "COUNT(*)",
  sum: (expression) => `COALESCE(SUM(CAST(${expression} AS REAL)),0)`,
  avg: (expression) => `AVG(CAST(${expression} AS REAL))`,
  min: (expression) => `MIN(${expression})`,
  max: (expression) => `MAX(${expression})`,
};

function fieldExpression(field: string): string {
  if (!APP_REPORT_FIELD.test(field)) throw errors.validation(`Unsafe report field: ${field}`);
  if (RECORD_COLUMNS.has(field)) return `"${field}"`;
  return `json_extract(payload_json,'$.${field}')`;
}

export function compileAppReport(spec: AppReportSpec, request: QueryRequest): CompiledQuery {
  const params: unknown[] = [request.tenant_id, spec.doctype];
  // `docstatus<>2` — a cancelled document is not deleted, but it must not be counted.
  // Leaving it in makes every total quietly too big, and nothing on the screen says why.
  const where = ["tenant_id=?1", "doctype=?2", "docstatus<>2"];

  for (const filter of request.filters ?? []) {
    if (!spec.filters.includes(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    if (!APP_REPORT_OPERATORS.has(filter.operator)) throw errors.validation(`Filter operator is not allowed: ${String(filter.operator)}`);
    const expression = fieldExpression(filter.field);
    if (filter.operator === "is_null") { where.push(`${expression} IS NULL`); continue; }
    if (filter.operator === "in") {
      if (!Array.isArray(filter.value) || filter.value.length === 0) throw errors.validation(`IN filter requires a non-empty array: ${filter.field}`);
      if (filter.value.length > 80) throw errors.validation("IN filter exceeds the parameter budget");
      where.push(`${expression} IN (${filter.value.map((value) => { params.push(value); return `?${params.length}`; }).join(",")})`);
      continue;
    }
    params.push(filter.value ?? null);
    where.push(`${expression} ${filter.operator === "like" ? "LIKE" : filter.operator} ?${params.length}`);
  }

  // Aliased so the client keys rows the same way it does everywhere else; without an
  // alias, `COALESCE(SUM(...),0)` comes back as the column NAME and nothing matches.
  const alias = (column: AppReportSpec["columns"][number]) => (column.aggregate ? `${column.aggregate}_${column.field}` : column.field);
  const selected = spec.columns.map((column) => {
    const expression = fieldExpression(column.field);
    const sql = column.aggregate ? AGGREGATE_SQL[column.aggregate]?.(expression) : expression;
    if (!sql) throw errors.validation(`Unknown aggregate: ${column.aggregate}`);
    return `${sql} AS "${alias(column)}"`;
  });
  const groupSql = spec.group_by ? ` GROUP BY ${fieldExpression(spec.group_by)}` : "";
  const ordered = spec.order_by ? spec.columns.find((column) => column.field === spec.order_by?.column) : undefined;
  const orderSql = ordered ? ` ORDER BY "${alias(ordered)}" ${spec.order_by?.direction === "desc" ? "DESC" : "ASC"}` : "";

  const limit = Math.max(1, Math.min(request.limit ?? spec.limit, spec.limit));
  const offset = Math.max(0, request.offset ?? 0);
  params.push(limit, offset);

  return {
    sql: `SELECT ${selected.join(", ")} FROM documents WHERE ${where.join(" AND ")}${groupSql}${orderSql} LIMIT ?${params.length - 1} OFFSET ?${params.length}`,
    params,
    columns: spec.columns.map((column) => ({
      field: alias(column),
      label: column.label,
      type: column.type as ReportColumn["type"],
      ...(column.options ? { options: column.options } : {}),
    })),
    prepared: false,
  };
}

export class AppReportService {
  constructor(private readonly db: D1Database) {}

  async run(spec: AppReportSpec, request: QueryRequest): Promise<JsonObject> {
    const compiled = compileAppReport(spec, request);
    const result = await this.db.prepare(compiled.sql).bind(...compiled.params).all<Record<string, JsonValue>>();
    return {
      prepared: false,
      report: spec.name,
      columns: compiled.columns as unknown as JsonValue,
      result: (result.results ?? []) as unknown as JsonValue,
      row_count: result.results?.length ?? 0,
      message: null,
      chart: null,
      report_summary: [],
      skip_total_row: false,
    };
  }
}
