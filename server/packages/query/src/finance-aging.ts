import { errors } from "../../core/src/index.js";
import {
  QueryCompiler,
  type CompiledQuery,
  type QueryFilter,
  type QueryOrder,
  type QueryRequest,
  type ReportColumn,
} from "./index.js";

interface AgingReportConfig {
  accountType: "Receivable" | "Payable";
  voucherType: "Sales Invoice" | "Purchase Invoice";
  partyLabel: "Customer" | "Supplier";
}

const AGING_REPORTS: Record<string, AgingReportConfig> = {
  "Accounts Receivable Aging": {
    accountType: "Receivable",
    voucherType: "Sales Invoice",
    partyLabel: "Customer",
  },
  "Accounts Payable Aging": {
    accountType: "Payable",
    voucherType: "Purchase Invoice",
    partyLabel: "Supplier",
  },
};

const FILTER_FIELDS = new Set([
  "as_of_date",
  "party",
  "company",
  "account",
  "currency",
  "voucher_no",
  "due_date",
  "due_date_source",
  "aging_bucket",
]);

export class FinanceQueryCompiler extends QueryCompiler {
  override compile(request: QueryRequest, forceSynchronous = false): CompiledQuery {
    const config = AGING_REPORTS[request.report];
    if (!config) return super.compile(request, forceSynchronous);
    return compileAgingReport(request, config, forceSynchronous);
  }
}

function compileAgingReport(
  request: QueryRequest,
  config: AgingReportConfig,
  forceSynchronous: boolean,
): CompiledQuery {
  const columns = agingColumns(config);
  const { asOfDate, filters } = extractAsOfDate(request.filters ?? []);
  const params: unknown[] = [request.tenant_id, asOfDate];
  const where: string[] = [];

  for (const filter of filters) {
    if (!FILTER_FIELDS.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendFilter(where, params, filter);
  }

  const order = request.order_by ?? [
    { field: "due_date", direction: "asc" },
    { field: "voucher_no", direction: "asc" },
  ];
  assertOrder(columns, order);

  const limit = Math.max(1, Math.min(request.limit ?? 100, 5000));
  const offset = Math.max(0, request.offset ?? 0);
  params.push(limit, offset);
  const orderSql = order.length
    ? ` ORDER BY ${order.map((item) => `${quoteIdentifier(item.field)} ${item.direction.toUpperCase()}`).join(", ")}`
    : "";
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const selected = columns.map((column) => quoteIdentifier(column.field)).join(", ");
  const source = agingSource(config);
  const sql = `SELECT ${selected} FROM (${source}) AS aging${whereSql}${orderSql} LIMIT ?${params.length - 1} OFFSET ?${params.length}`;
  const prepared = !forceSynchronous && (limit > 1000 || (request.filters?.length ?? 0) > 8);
  return { sql, params, columns, prepared };
}

function agingSource(config: AgingReportConfig): string {
  const divisor = "CASE currency_scale WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END";
  const overdueDays = "CAST(julianday(date(?2)) - julianday(due_date) AS INTEGER)";
  return `
    SELECT
      tenant_id,
      company,
      party,
      account,
      currency,
      voucher_type,
      voucher_no,
      posting_date,
      due_date,
      due_date_source,
      CAST(invoice_total_minor AS REAL) / ${divisor} AS invoice_total,
      CAST(invoice_total_minor - outstanding_minor AS REAL) / ${divisor} AS allocated_amount,
      CAST(outstanding_minor AS REAL) / ${divisor} AS outstanding_amount,
      CASE WHEN date(?2) <= due_date THEN 0 ELSE ${overdueDays} END AS days_overdue,
      CASE
        WHEN date(?2) <= due_date THEN 'Chưa đến hạn'
        WHEN ${overdueDays} <= 30 THEN '1–30 ngày'
        WHEN ${overdueDays} <= 60 THEN '31–60 ngày'
        WHEN ${overdueDays} <= 90 THEN '61–90 ngày'
        ELSE 'Trên 90 ngày'
      END AS aging_bucket
    FROM (
      SELECT
        t.tenant_id,
        t.company,
        t.party,
        t.account,
        t.currency,
        t.currency_scale,
        t.voucher_type,
        t.voucher_no,
        t.posting_date,
        t.due_date,
        t.due_date_source,
        t.invoice_total_minor,
        SUM(p.amount_minor) AS outstanding_minor
      FROM payment_ledger_entries p
      INNER JOIN finance_invoice_terms t
        ON t.tenant_id = p.tenant_id
       AND t.voucher_type = p.against_voucher_type
       AND t.voucher_no = p.against_voucher_no
      WHERE p.tenant_id = ?1
        AND p.account_type = '${config.accountType}'
        AND t.voucher_type = '${config.voucherType}'
        AND date(p.posting_at) <= date(?2)
      GROUP BY
        t.tenant_id,
        t.company,
        t.party,
        t.account,
        t.currency,
        t.currency_scale,
        t.voucher_type,
        t.voucher_no,
        t.posting_date,
        t.due_date,
        t.due_date_source,
        t.invoice_total_minor
      HAVING SUM(p.amount_minor) > 0
    ) AS balances
  `;
}

function extractAsOfDate(filters: QueryFilter[]): { asOfDate: string; filters: QueryFilter[] } {
  const matches = filters.filter((filter) => filter.field === "as_of_date");
  if (matches.length !== 1) throw errors.validation("Aging reports require exactly one as_of_date filter");
  const match = matches[0]!;
  if (match.operator !== "=" || typeof match.value !== "string" || !isIsoDate(match.value)) {
    throw errors.validation("as_of_date must use '=' with a valid YYYY-MM-DD value");
  }
  return {
    asOfDate: match.value,
    filters: filters.filter((filter) => filter !== match),
  };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function appendFilter(where: string[], params: unknown[], filter: QueryFilter): void {
  const field = quoteIdentifier(filter.field);
  if (filter.operator === "is_null") {
    where.push(`${field} IS NULL`);
    return;
  }
  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw errors.validation(`IN filter requires a non-empty array: ${filter.field}`);
    }
    if (filter.value.length > 80) throw errors.validation("IN filter exceeds the parameter budget");
    const placeholders = filter.value.map((value) => {
      params.push(value);
      return `?${params.length}`;
    });
    where.push(`${field} IN (${placeholders.join(",")})`);
    return;
  }
  params.push(filter.value ?? null);
  where.push(`${field} ${filter.operator === "like" ? "LIKE" : filter.operator} ?${params.length}`);
}

function assertOrder(columns: ReportColumn[], order: QueryOrder[]): void {
  for (const item of order) {
    if (!columns.some((column) => column.field === item.field)) {
      throw errors.validation(`Order field is not allowed: ${item.field}`);
    }
  }
}

function agingColumns(config: AgingReportConfig): ReportColumn[] {
  return [
    { field: "party", label: config.partyLabel, type: "Link", options: config.partyLabel },
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "account", label: "Account", type: "Link", options: "Account" },
    { field: "currency", label: "Currency", type: "Data" },
    { field: "voucher_type", label: "Voucher Type", type: "Data" },
    { field: "voucher_no", label: "Voucher", type: "Link", options: config.voucherType },
    { field: "posting_date", label: "Posting Date", type: "Date" },
    { field: "due_date", label: "Due Date", type: "Date" },
    { field: "due_date_source", label: "Due Date Source", type: "Data" },
    { field: "invoice_total", label: "Invoice Total", type: "Currency" },
    { field: "allocated_amount", label: "Allocated", type: "Currency" },
    { field: "outstanding_amount", label: "Outstanding", type: "Currency" },
    { field: "days_overdue", label: "Days Overdue", type: "Int" },
    { field: "aging_bucket", label: "Aging Bucket", type: "Data" },
  ];
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw errors.validation(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}
