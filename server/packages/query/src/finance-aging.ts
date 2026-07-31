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

const AGING_FILTER_FIELDS = new Set([
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
    const aging = AGING_REPORTS[request.report];
    if (aging) return compileAgingReport(request, aging, forceSynchronous);
    if (request.report === "Party Statement") return compilePartyStatement(request, forceSynchronous);
    if (request.report === "Debt Summary") return compileDebtSummary(request, forceSynchronous);
    if (request.report === "Advance Balance") return compileAdvanceBalance(request, forceSynchronous);
    return super.compile(request, forceSynchronous);
  }
}

function compileAgingReport(
  request: QueryRequest,
  config: AgingReportConfig,
  forceSynchronous: boolean,
): CompiledQuery {
  const columns = agingColumns(config);
  const { value: asOfDate, remaining: filters } = extractControl(request.filters ?? [], "as_of_date", true);
  assertIsoDate(asOfDate, "as_of_date");
  const params: unknown[] = [request.tenant_id, asOfDate];
  const where: string[] = [];
  for (const filter of filters) {
    if (!AGING_FILTER_FIELDS.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendFilter(where, params, filter);
  }
  const order = request.order_by ?? [
    { field: "due_date", direction: "asc" },
    { field: "voucher_no", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const source = agingSource(config);
  const selected = columns.map((column) => quoteIdentifier(column.field)).join(", ");
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const orderSql = renderOrder(order);
  return {
    sql: `SELECT ${selected} FROM (${source}) AS aging${whereSql}${orderSql} LIMIT ?${limit} OFFSET ?${offset}`,
    params,
    columns,
    prepared: prepared(request, forceSynchronous),
  };
}

function agingSource(config: AgingReportConfig): string {
  const divisor = moneyDivisor("currency_scale");
  const overdueDays = "CAST(julianday(date(?2)) - julianday(due_date) AS INTEGER)";
  return `
    SELECT
      tenant_id, company, party, account, currency, voucher_type, voucher_no,
      posting_date, due_date, due_date_source,
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
        t.tenant_id, t.company, t.party, t.account, t.currency, t.currency_scale,
        t.voucher_type, t.voucher_no, t.posting_date, t.due_date, t.due_date_source,
        t.invoice_total_minor, SUM(p.amount_minor) AS outstanding_minor
      FROM payment_ledger_entries p
      INNER JOIN finance_invoice_terms t
        ON t.tenant_id=p.tenant_id
       AND t.voucher_type=p.against_voucher_type
       AND t.voucher_no=p.against_voucher_no
      WHERE p.tenant_id=?1
        AND p.account_type='${config.accountType}'
        AND t.voucher_type='${config.voucherType}'
        AND date(p.posting_at)<=date(?2)
      GROUP BY
        t.tenant_id,t.company,t.party,t.account,t.currency,t.currency_scale,
        t.voucher_type,t.voucher_no,t.posting_date,t.due_date,t.due_date_source,t.invoice_total_minor
      HAVING SUM(p.amount_minor)>0
    ) AS balances
  `;
}

function compilePartyStatement(request: QueryRequest, forceSynchronous: boolean): CompiledQuery {
  const controls = consumeControls(request.filters ?? [], ["party", "account", "currency", "from_date", "to_date"]);
  assertIsoDate(controls.values.from_date, "from_date");
  assertIsoDate(controls.values.to_date, "to_date");
  if (String(controls.values.from_date) > String(controls.values.to_date)) {
    throw errors.validation("from_date cannot be after to_date");
  }
  const accountTypeControl = extractControl(controls.remaining, "account_type", false);
  const accountType = accountTypeControl.value ?? null;
  if (accountType !== null && accountType !== "Receivable" && accountType !== "Payable") {
    throw errors.validation("account_type must be Receivable or Payable");
  }
  if (accountTypeControl.remaining.length) {
    throw errors.validation(`Filter is not allowed: ${accountTypeControl.remaining[0]!.field}`);
  }
  const params: unknown[] = [
    request.tenant_id,
    controls.values.party,
    controls.values.account,
    controls.values.currency,
    controls.values.from_date,
    controls.values.to_date,
    accountType,
  ];
  const columns = partyStatementColumns();
  const order = request.order_by ?? [
    { field: "posting_at", direction: "asc" },
    { field: "voucher_type", direction: "asc" },
    { field: "voucher_no", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const divisor = moneyDivisor("currency_scale");
  const sql = `
    WITH base AS (
      SELECT posting_at,voucher_type,voucher_no,line_key,against_voucher_type,against_voucher_no,
             amount_minor,currency_scale
      FROM payment_ledger_entries
      WHERE tenant_id=?1 AND party=?2 AND account=?3 AND currency=?4
        AND date(posting_at)<=date(?6)
        AND (?7 IS NULL OR account_type=?7)
    ), opening AS (
      SELECT COALESCE(SUM(amount_minor),0) AS balance_minor,
             COALESCE(MAX(currency_scale),2) AS currency_scale
      FROM base WHERE date(posting_at)<date(?5)
    ), period AS (
      SELECT *,
        SUM(amount_minor) OVER (
          ORDER BY posting_at,voucher_type,voucher_no,line_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS period_balance_minor
      FROM base
      WHERE date(posting_at)>=date(?5)
    ), statement AS (
      SELECT
        ?5 AS posting_at,
        'Opening' AS voucher_type,
        '' AS voucher_no,
        'Opening balance' AS entry_type,
        0.0 AS debit_amount,
        0.0 AS credit_amount,
        CAST(opening.balance_minor AS REAL)/${divisor} AS running_balance,
        '' AS against_voucher_type,
        '' AS against_voucher_no
      FROM opening
      UNION ALL
      SELECT
        period.posting_at,
        period.voucher_type,
        period.voucher_no,
        CASE
          WHEN period.voucher_type='Payment Entry' THEN 'Payment'
          WHEN period.voucher_type='Payment Allocation' THEN 'Allocation'
          ELSE 'Invoice/Adjustment'
        END AS entry_type,
        CAST(CASE WHEN period.amount_minor>0 THEN period.amount_minor ELSE 0 END AS REAL)/${moneyDivisor("period.currency_scale")} AS debit_amount,
        CAST(CASE WHEN period.amount_minor<0 THEN -period.amount_minor ELSE 0 END AS REAL)/${moneyDivisor("period.currency_scale")} AS credit_amount,
        CAST(opening.balance_minor+period.period_balance_minor AS REAL)/${moneyDivisor("period.currency_scale")} AS running_balance,
        COALESCE(period.against_voucher_type,'') AS against_voucher_type,
        COALESCE(period.against_voucher_no,'') AS against_voucher_no
      FROM period CROSS JOIN opening
    )
    SELECT ${columns.map((column) => quoteIdentifier(column.field)).join(", ")}
    FROM statement${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;
  return { sql, params, columns, prepared: prepared(request, forceSynchronous) };
}

function compileDebtSummary(request: QueryRequest, forceSynchronous: boolean): CompiledQuery {
  const { value: asOfDate, remaining: filters } = extractControl(request.filters ?? [], "as_of_date", true);
  assertIsoDate(asOfDate, "as_of_date");
  const params: unknown[] = [request.tenant_id, asOfDate];
  const where: string[] = [];
  const allowed = new Set(["party", "company", "account", "currency", "account_type"]);
  for (const filter of filters) {
    if (!allowed.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendFilter(where, params, filter);
  }
  const columns = debtSummaryColumns();
  const order = request.order_by ?? [
    { field: "overdue_amount", direction: "desc" },
    { field: "party", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const components = `
    WITH invoice_balances AS (
      SELECT
        t.party,
        t.company,
        t.account,
        t.currency,
        t.currency_scale,
        p.account_type,
        t.due_date,
        SUM(p.amount_minor) AS outstanding_minor
      FROM payment_ledger_entries p
      JOIN finance_invoice_terms t
        ON t.tenant_id=p.tenant_id
       AND t.voucher_type=p.against_voucher_type
       AND t.voucher_no=p.against_voucher_no
      WHERE p.tenant_id=?1 AND date(p.posting_at)<=date(?2)
      GROUP BY t.party,t.company,t.account,t.currency,t.currency_scale,p.account_type,t.voucher_type,t.voucher_no,t.due_date
      HAVING SUM(p.amount_minor)>0
    ), advances AS (
      SELECT
        p.party,
        json_extract(d.payload_json,'$.company') AS company,
        p.account,
        p.currency,
        p.currency_scale,
        p.account_type,
        -SUM(p.amount_minor) AS advance_minor
      FROM payment_ledger_entries p
      JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype='Payment Entry'
       AND d.name=p.against_voucher_no
      WHERE p.tenant_id=?1
        AND p.against_voucher_type='Payment Entry'
        AND date(p.posting_at)<=date(?2)
      GROUP BY p.party,company,p.account,p.currency,p.currency_scale,p.account_type,p.against_voucher_no
      HAVING SUM(p.amount_minor)<0
    ), components AS (
      SELECT party,company,account,currency,currency_scale,account_type,
             outstanding_minor,
             CASE WHEN date(due_date)<=date(?2) THEN outstanding_minor ELSE 0 END AS due_minor,
             CASE WHEN date(due_date)<date(?2) THEN outstanding_minor ELSE 0 END AS overdue_minor,
             0 AS advance_minor,
             due_date
      FROM invoice_balances
      UNION ALL
      SELECT party,company,account,currency,currency_scale,account_type,
             0,0,0,advance_minor,NULL
      FROM advances
    ), summary AS (
      SELECT
        party,company,account,currency,account_type,
        SUM(outstanding_minor) AS total_outstanding_minor,
        SUM(due_minor) AS due_minor,
        SUM(overdue_minor) AS overdue_minor,
        SUM(advance_minor) AS advance_minor,
        SUM(outstanding_minor)-SUM(advance_minor) AS net_exposure_minor,
        MIN(CASE WHEN outstanding_minor>0 THEN due_date END) AS oldest_due_date,
        CAST(SUM(outstanding_minor) AS REAL)/${moneyDivisor("MAX(currency_scale)")} AS total_outstanding,
        CAST(SUM(due_minor) AS REAL)/${moneyDivisor("MAX(currency_scale)")} AS due_amount,
        CAST(SUM(overdue_minor) AS REAL)/${moneyDivisor("MAX(currency_scale)")} AS overdue_amount,
        CAST(SUM(advance_minor) AS REAL)/${moneyDivisor("MAX(currency_scale)")} AS advance_balance,
        CAST(SUM(outstanding_minor)-SUM(advance_minor) AS REAL)/${moneyDivisor("MAX(currency_scale)")} AS net_exposure
      FROM components
      GROUP BY party,company,account,currency,account_type
    )`;
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const sql = `${components}
    SELECT ${columns.map((column) => quoteIdentifier(column.field)).join(", ")}
    FROM summary${whereSql}${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;
  return { sql, params, columns, prepared: prepared(request, forceSynchronous) };
}

function compileAdvanceBalance(request: QueryRequest, forceSynchronous: boolean): CompiledQuery {
  const { value: asOfDate, remaining: filters } = extractControl(request.filters ?? [], "as_of_date", true);
  assertIsoDate(asOfDate, "as_of_date");
  const params: unknown[] = [request.tenant_id, asOfDate];
  const where: string[] = [];
  const allowed = new Set(["party", "company", "account", "currency", "party_type", "source_payment_entry"]);
  for (const filter of filters) {
    if (!allowed.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendFilter(where, params, filter);
  }
  const columns = advanceBalanceColumns();
  const order = request.order_by ?? [
    { field: "source_posting_at", direction: "asc" },
    { field: "source_payment_entry", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const source = `
    SELECT
      p.party_type,
      p.party,
      json_extract(d.payload_json,'$.company') AS company,
      p.account,
      p.currency,
      p.against_voucher_no AS source_payment_entry,
      MIN(CASE WHEN p.voucher_type='Payment Entry' THEN p.posting_at END) AS source_posting_at,
      CAST(-SUM(CASE WHEN p.voucher_type='Payment Entry' AND p.amount_minor<0 THEN p.amount_minor ELSE 0 END) AS REAL)/${moneyDivisor("MAX(p.currency_scale)")} AS original_advance,
      CAST(SUM(CASE WHEN p.voucher_type='Payment Allocation' AND p.amount_minor>0 THEN p.amount_minor ELSE 0 END) AS REAL)/${moneyDivisor("MAX(p.currency_scale)")} AS allocated_amount,
      CAST(-SUM(p.amount_minor) AS REAL)/${moneyDivisor("MAX(p.currency_scale)")} AS remaining_advance
    FROM payment_ledger_entries p
    JOIN documents d
      ON d.tenant_id=p.tenant_id
     AND d.doctype='Payment Entry'
     AND d.name=p.against_voucher_no
    WHERE p.tenant_id=?1
      AND p.against_voucher_type='Payment Entry'
      AND date(p.posting_at)<=date(?2)
    GROUP BY p.party_type,p.party,company,p.account,p.currency,p.against_voucher_no
    HAVING SUM(p.amount_minor)<0`;
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const sql = `SELECT ${columns.map((column) => quoteIdentifier(column.field)).join(", ")}
    FROM (${source}) AS advances${whereSql}${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;
  return { sql, params, columns, prepared: prepared(request, forceSynchronous) };
}

function extractControl(
  filters: QueryFilter[],
  field: string,
  required: boolean,
): { value: unknown; remaining: QueryFilter[] } {
  const matches = filters.filter((filter) => filter.field === field);
  if ((required && matches.length !== 1) || (!required && matches.length > 1)) {
    throw errors.validation(`${field} ${required ? "is required exactly once" : "may appear at most once"}`);
  }
  const match = matches[0];
  if (match && match.operator !== "=") throw errors.validation(`${field} must use '='`);
  return { value: match?.value, remaining: filters.filter((filter) => filter !== match) };
}

function consumeControls(filters: QueryFilter[], fields: string[]): { values: Record<string, unknown>; remaining: QueryFilter[] } {
  let remaining = filters;
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const control = extractControl(remaining, field, true);
    values[field] = control.value;
    remaining = control.remaining;
  }
  return { values, remaining };
}

function assertIsoDate(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw errors.validation(`${field} must be a valid YYYY-MM-DD date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw errors.validation(`${field} must be a valid YYYY-MM-DD date`);
  }
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

function appendPagination(params: unknown[], request: QueryRequest): { limit: number; offset: number } {
  params.push(Math.max(1, Math.min(request.limit ?? 100, 5000)), Math.max(0, request.offset ?? 0));
  return { limit: params.length - 1, offset: params.length };
}

function prepared(request: QueryRequest, forceSynchronous: boolean): boolean {
  return !forceSynchronous && ((request.limit ?? 100) > 1000 || (request.filters?.length ?? 0) > 8);
}

function assertOrder(columns: ReportColumn[], order: QueryOrder[]): void {
  for (const item of order) {
    if (!columns.some((column) => column.field === item.field)) {
      throw errors.validation(`Order field is not allowed: ${item.field}`);
    }
  }
}

function renderOrder(order: QueryOrder[]): string {
  return order.length
    ? ` ORDER BY ${order.map((item) => `${quoteIdentifier(item.field)} ${item.direction.toUpperCase()}`).join(", ")}`
    : "";
}

function moneyDivisor(scale: string): string {
  return `CASE ${scale} WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END`;
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

function partyStatementColumns(): ReportColumn[] {
  return [
    { field: "posting_at", label: "Posting Date", type: "Date" },
    { field: "voucher_type", label: "Voucher Type", type: "Data" },
    { field: "voucher_no", label: "Voucher", type: "Data" },
    { field: "entry_type", label: "Entry Type", type: "Data" },
    { field: "debit_amount", label: "Debit", type: "Currency" },
    { field: "credit_amount", label: "Credit", type: "Currency" },
    { field: "running_balance", label: "Running Balance", type: "Currency" },
    { field: "against_voucher_type", label: "Against Type", type: "Data" },
    { field: "against_voucher_no", label: "Against Voucher", type: "Data" },
  ];
}

function debtSummaryColumns(): ReportColumn[] {
  return [
    { field: "party", label: "Party", type: "Data" },
    { field: "account_type", label: "Account Type", type: "Data" },
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "account", label: "Account", type: "Link", options: "Account" },
    { field: "currency", label: "Currency", type: "Data" },
    { field: "total_outstanding", label: "Outstanding", type: "Currency" },
    { field: "due_amount", label: "Due", type: "Currency" },
    { field: "overdue_amount", label: "Overdue", type: "Currency" },
    { field: "oldest_due_date", label: "Oldest Due Date", type: "Date" },
    { field: "advance_balance", label: "Advance", type: "Currency" },
    { field: "net_exposure", label: "Net Exposure", type: "Currency" },
  ];
}

function advanceBalanceColumns(): ReportColumn[] {
  return [
    { field: "source_payment_entry", label: "Payment Entry", type: "Link", options: "Payment Entry" },
    { field: "source_posting_at", label: "Posting Date", type: "Date" },
    { field: "party_type", label: "Party Type", type: "Data" },
    { field: "party", label: "Party", type: "Data" },
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "account", label: "Account", type: "Link", options: "Account" },
    { field: "currency", label: "Currency", type: "Data" },
    { field: "original_advance", label: "Original Advance", type: "Currency" },
    { field: "allocated_amount", label: "Allocated", type: "Currency" },
    { field: "remaining_advance", label: "Remaining Advance", type: "Currency" },
  ];
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw errors.validation(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}
