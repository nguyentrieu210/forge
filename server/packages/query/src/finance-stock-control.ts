import { errors } from "../../core/src/index.js";
import type {
  CompiledQuery,
  QueryFilter,
  QueryOrder,
  QueryRequest,
  ReportColumn,
} from "./index.js";
import { FinanceClosureQueryCompiler } from "./finance-closure.js";

/**
 * Finance-owned control over the stock-owned Repost Item Valuation seam.
 * stock_ledger_entries remains valuation authority and gl_entries remains money
 * authority; this report only compares their immutable voucher revisions.
 */
export class FinanceStockControlQueryCompiler extends FinanceClosureQueryCompiler {
  override compile(request: QueryRequest, forceSynchronous = false): CompiledQuery {
    if (request.report === "Stock Valuation Reconciliation") {
      return compileStockValuationReconciliation(request, forceSynchronous);
    }
    return super.compile(request, forceSynchronous);
  }
}

function compileStockValuationReconciliation(
  request: QueryRequest,
  forceSynchronous: boolean,
): CompiledQuery {
  const asOf = extractControl(request.filters ?? [], "as_of_date", true);
  assertIsoDate(asOf.value, "as_of_date");
  const company = extractControl(asOf.remaining, "company", true);
  assertNonEmpty(company.value, "company");
  const params: unknown[] = [request.tenant_id, asOf.value, company.value];
  const where: string[] = [];
  const allowed = new Set(["voucher_no", "item_code", "warehouse", "stock_account", "currency", "status"]);
  for (const filter of company.remaining) {
    if (!allowed.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendOutputFilter(where, params, filter);
  }

  const columns = stockValuationColumns();
  const order = request.order_by ?? [
    { field: "status", direction: "asc" },
    { field: "posting_at", direction: "asc" },
    { field: "voucher_no", direction: "asc" },
    { field: "voucher_revision", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

  const sql = `
    WITH stock_side AS (
      SELECT
        s.voucher_type,s.voucher_no,s.voucher_revision,
        json_extract(d.payload_json,'$.company') AS company,
        json_extract(d.payload_json,'$.item_code') AS item_code,
        json_extract(d.payload_json,'$.warehouse') AS warehouse,
        json_extract(d.payload_json,'$.stock_account') AS stock_account,
        s.currency,s.currency_scale,
        SUM(s.stock_value_difference_minor) AS stock_value_delta_minor,
        MAX(s.posting_at) AS posting_at
      FROM stock_ledger_entries s
      INNER JOIN documents d
        ON d.tenant_id=s.tenant_id
       AND d.doctype=s.voucher_type
       AND d.name=s.voucher_no
      WHERE s.tenant_id=?1
        AND s.voucher_type='Repost Item Valuation'
        AND json_extract(d.payload_json,'$.company')=?3
        AND date(s.posting_at)<=date(?2)
      GROUP BY
        s.voucher_type,s.voucher_no,s.voucher_revision,company,item_code,warehouse,stock_account,
        s.currency,s.currency_scale
    ), gl_side AS (
      SELECT
        g.voucher_type,g.voucher_no,g.voucher_revision,
        json_extract(d.payload_json,'$.company') AS company,
        json_extract(d.payload_json,'$.item_code') AS item_code,
        json_extract(d.payload_json,'$.warehouse') AS warehouse,
        json_extract(d.payload_json,'$.stock_account') AS stock_account,
        g.currency,g.currency_scale,
        SUM(g.debit_minor-g.credit_minor) AS gl_stock_delta_minor,
        MAX(g.posting_at) AS posting_at
      FROM gl_entries g
      INNER JOIN documents d
        ON d.tenant_id=g.tenant_id
       AND d.doctype=g.voucher_type
       AND d.name=g.voucher_no
      WHERE g.tenant_id=?1
        AND g.voucher_type='Repost Item Valuation'
        AND json_extract(d.payload_json,'$.company')=?3
        AND g.account=json_extract(d.payload_json,'$.stock_account')
        AND date(g.posting_at)<=date(?2)
      GROUP BY
        g.voucher_type,g.voucher_no,g.voucher_revision,company,item_code,warehouse,stock_account,
        g.currency,g.currency_scale
    ), keys AS (
      SELECT voucher_type,voucher_no,voucher_revision,company,item_code,warehouse,stock_account,currency,currency_scale
      FROM stock_side
      UNION
      SELECT voucher_type,voucher_no,voucher_revision,company,item_code,warehouse,stock_account,currency,currency_scale
      FROM gl_side
    ), reconciliation AS (
      SELECT
        keys.company,keys.voucher_type,keys.voucher_no,keys.voucher_revision,
        keys.item_code,keys.warehouse,keys.stock_account,keys.currency,keys.currency_scale,
        COALESCE(stock_side.stock_value_delta_minor,0) AS stock_value_delta_minor,
        COALESCE(gl_side.gl_stock_delta_minor,0) AS gl_stock_delta_minor,
        COALESCE(stock_side.stock_value_delta_minor,0)-COALESCE(gl_side.gl_stock_delta_minor,0) AS difference_minor,
        CAST(COALESCE(stock_side.stock_value_delta_minor,0) AS REAL)/${moneyDivisor("keys.currency_scale")} AS stock_value_delta,
        CAST(COALESCE(gl_side.gl_stock_delta_minor,0) AS REAL)/${moneyDivisor("keys.currency_scale")} AS gl_stock_delta,
        CAST(COALESCE(stock_side.stock_value_delta_minor,0)-COALESCE(gl_side.gl_stock_delta_minor,0) AS REAL)/${moneyDivisor("keys.currency_scale")} AS difference,
        CASE
          WHEN COALESCE(stock_side.stock_value_delta_minor,0)=COALESCE(gl_side.gl_stock_delta_minor,0)
            THEN 'Reconciled'
          ELSE 'Mismatch'
        END AS status,
        COALESCE(stock_side.posting_at,gl_side.posting_at) AS posting_at
      FROM keys
      LEFT JOIN stock_side
        ON stock_side.voucher_type=keys.voucher_type
       AND stock_side.voucher_no=keys.voucher_no
       AND stock_side.voucher_revision=keys.voucher_revision
       AND stock_side.company=keys.company
       AND stock_side.item_code=keys.item_code
       AND stock_side.warehouse=keys.warehouse
       AND stock_side.stock_account=keys.stock_account
       AND stock_side.currency=keys.currency
       AND stock_side.currency_scale=keys.currency_scale
      LEFT JOIN gl_side
        ON gl_side.voucher_type=keys.voucher_type
       AND gl_side.voucher_no=keys.voucher_no
       AND gl_side.voucher_revision=keys.voucher_revision
       AND gl_side.company=keys.company
       AND gl_side.item_code=keys.item_code
       AND gl_side.warehouse=keys.warehouse
       AND gl_side.stock_account=keys.stock_account
       AND gl_side.currency=keys.currency
       AND gl_side.currency_scale=keys.currency_scale
    )
    SELECT ${selectColumns(columns)}
    FROM reconciliation${whereSql}${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;

  return { sql, params, columns, prepared: prepared(request, forceSynchronous) };
}

function extractControl(filters: QueryFilter[], field: string, required: boolean): { value: unknown; remaining: QueryFilter[] } {
  const matches = filters.filter((filter) => filter.field === field);
  if ((required && matches.length !== 1) || (!required && matches.length > 1)) {
    throw errors.validation(`${field} ${required ? "is required exactly once" : "may appear at most once"}`);
  }
  const match = matches[0];
  if (match && match.operator !== "=") throw errors.validation(`${field} must use '='`);
  return { value: match?.value, remaining: filters.filter((filter) => filter !== match) };
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw errors.validation(`${field} must be a non-empty string`);
  }
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

function appendOutputFilter(where: string[], params: unknown[], filter: QueryFilter): void {
  if (filter.operator !== "=" && filter.operator !== "!=") {
    throw errors.validation(`Filter operator is not allowed: ${filter.field}`);
  }
  params.push(filter.value ?? null);
  where.push(`${quoteIdentifier(filter.field)} ${filter.operator} ?${params.length}`);
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

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function moneyDivisor(scale: string): string {
  return `CASE ${scale} WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END`;
}

function selectColumns(columns: ReportColumn[]): string {
  return columns.map((column) => quoteIdentifier(column.field)).join(", ");
}

function stockValuationColumns(): ReportColumn[] {
  return [
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "voucher_type", label: "Voucher Type", type: "Data" },
    { field: "voucher_no", label: "Voucher", type: "Data" },
    { field: "voucher_revision", label: "Revision", type: "Int" },
    { field: "item_code", label: "Item", type: "Link", options: "Item" },
    { field: "warehouse", label: "Warehouse", type: "Link", options: "Warehouse" },
    { field: "stock_account", label: "Stock Account", type: "Link", options: "Account" },
    { field: "currency", label: "Currency", type: "Data" },
    { field: "currency_scale", label: "Currency Scale", type: "Int" },
    { field: "stock_value_delta_minor", label: "Stock Value Minor", type: "Int" },
    { field: "gl_stock_delta_minor", label: "GL Stock Minor", type: "Int" },
    { field: "difference_minor", label: "Difference Minor", type: "Int" },
    { field: "stock_value_delta", label: "Stock Value Delta", type: "Currency" },
    { field: "gl_stock_delta", label: "GL Stock Delta", type: "Currency" },
    { field: "difference", label: "Difference", type: "Currency" },
    { field: "status", label: "Status", type: "Data" },
    { field: "posting_at", label: "Posting At", type: "Date" },
  ];
}
