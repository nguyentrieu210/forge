import { errors } from "../../core/src/index.js";
import type {
  CompiledQuery,
  QueryFilter,
  QueryOrder,
  QueryRequest,
  ReportColumn,
} from "./index.js";
import { FinanceQueryCompiler } from "./finance-aging.js";

/**
 * AP control reports deliberately read the canonical Payment Ledger + GL.
 * They never persist another supplier-balance table or mutable reconciliation state.
 */
export class AccountsPayableQueryCompiler extends FinanceQueryCompiler {
  override compile(request: QueryRequest, forceSynchronous = false): CompiledQuery {
    if (request.report === "Supplier Statement") {
      return compileSupplierStatement(request, forceSynchronous);
    }
    if (request.report === "Supplier Reconciliation") {
      return compileSupplierReconciliation(request, forceSynchronous);
    }
    return super.compile(request, forceSynchronous);
  }
}

function compileSupplierStatement(request: QueryRequest, forceSynchronous: boolean): CompiledQuery {
  const controls = consumeControls(request.filters ?? [], [
    "company",
    "party",
    "account",
    "currency",
    "from_date",
    "to_date",
  ]);
  if (controls.remaining.length) {
    throw errors.validation(`Filter is not allowed: ${controls.remaining[0]!.field}`);
  }
  assertIsoDate(controls.values.from_date, "from_date");
  assertIsoDate(controls.values.to_date, "to_date");
  if (String(controls.values.from_date) > String(controls.values.to_date)) {
    throw errors.validation("from_date cannot be after to_date");
  }

  const params: unknown[] = [
    request.tenant_id,
    controls.values.company,
    controls.values.party,
    controls.values.account,
    controls.values.currency,
    controls.values.from_date,
    controls.values.to_date,
  ];
  const columns = supplierStatementColumns();
  const order = request.order_by ?? [
    { field: "posting_at", direction: "asc" },
    { field: "voucher_type", direction: "asc" },
    { field: "voucher_no", direction: "asc" },
    { field: "line_key", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const divisor = moneyDivisor("currency_scale");
  const sql = `
    WITH base AS (
      SELECT
        p.posting_at,p.voucher_type,p.voucher_no,p.line_key,
        p.against_voucher_type,p.against_voucher_no,p.amount_minor,p.currency_scale
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.voucher_type
       AND d.name=p.voucher_no
      WHERE p.tenant_id=?1
        AND json_extract(d.payload_json,'$.company')=?2
        AND p.party_type='Supplier'
        AND p.account_type='Payable'
        AND p.party=?3
        AND p.account=?4
        AND p.currency=?5
        AND date(p.posting_at)<=date(?7)
    ), opening AS (
      SELECT
        COALESCE(SUM(amount_minor),0) AS balance_minor,
        COALESCE(MAX(currency_scale),2) AS currency_scale
      FROM base
      WHERE date(posting_at)<date(?6)
    ), period AS (
      SELECT *,
        SUM(amount_minor) OVER (
          ORDER BY posting_at,voucher_type,voucher_no,line_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS period_balance_minor
      FROM base
      WHERE date(posting_at)>=date(?6)
    ), statement AS (
      SELECT
        ?2 AS company,
        ?6 AS posting_at,
        'Opening' AS voucher_type,
        '' AS voucher_no,
        '' AS line_key,
        'Opening balance' AS entry_type,
        0.0 AS debit_amount,
        0.0 AS credit_amount,
        CAST(opening.balance_minor AS REAL)/${divisor} AS running_balance,
        '' AS against_voucher_type,
        '' AS against_voucher_no
      FROM opening
      UNION ALL
      SELECT
        ?2 AS company,
        period.posting_at,
        period.voucher_type,
        period.voucher_no,
        period.line_key,
        CASE
          WHEN period.voucher_type='Payment Entry' THEN 'Supplier Payment/Advance'
          WHEN period.voucher_type='Payment Allocation' AND period.against_voucher_type='Payment Entry' THEN 'Advance Allocation Source'
          WHEN period.voucher_type='Payment Allocation' THEN 'Invoice Allocation'
          WHEN period.voucher_type='Debit Note' THEN 'Supplier Debit Adjustment'
          WHEN period.voucher_type='Purchase Invoice' THEN 'Purchase Invoice'
          ELSE 'Payable Adjustment'
        END AS entry_type,
        CAST(CASE WHEN period.amount_minor<0 THEN -period.amount_minor ELSE 0 END AS REAL)/${moneyDivisor("period.currency_scale")} AS debit_amount,
        CAST(CASE WHEN period.amount_minor>0 THEN period.amount_minor ELSE 0 END AS REAL)/${moneyDivisor("period.currency_scale")} AS credit_amount,
        CAST(opening.balance_minor+period.period_balance_minor AS REAL)/${moneyDivisor("period.currency_scale")} AS running_balance,
        COALESCE(period.against_voucher_type,'') AS against_voucher_type,
        COALESCE(period.against_voucher_no,'') AS against_voucher_no
      FROM period CROSS JOIN opening
    )
    SELECT ${columns.map((column) => quoteIdentifier(column.field)).join(", ")}
    FROM statement${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;
  return { sql, params, columns, prepared: prepared(request, forceSynchronous) };
}

function compileSupplierReconciliation(request: QueryRequest, forceSynchronous: boolean): CompiledQuery {
  const asOf = extractControl(request.filters ?? [], "as_of_date", true);
  assertIsoDate(asOf.value, "as_of_date");
  const company = extractControl(asOf.remaining, "company", true);
  const params: unknown[] = [request.tenant_id, asOf.value, company.value];
  const where: string[] = [];
  const allowed = new Set(["party", "account", "currency", "status"]);
  for (const filter of company.remaining) {
    if (!allowed.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendFilter(where, params, filter);
  }
  const columns = supplierReconciliationColumns();
  const order = request.order_by ?? [
    { field: "status", direction: "desc" },
    { field: "party", direction: "asc" },
    { field: "account", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const sql = `
    WITH payment_balance AS (
      SELECT
        p.party,
        json_extract(d.payload_json,'$.company') AS company,
        p.account,
        COALESCE(json_extract(d.payload_json,'$.company_currency'), p.currency) AS currency,
        SUM(p.base_amount_minor) AS payable_ledger_balance_minor
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.voucher_type
       AND d.name=p.voucher_no
      WHERE p.tenant_id=?1
        AND json_extract(d.payload_json,'$.company')=?3
        AND p.party_type='Supplier'
        AND p.account_type='Payable'
        AND date(p.posting_at)<=date(?2)
      GROUP BY p.party,company,p.account,currency
    ), gl_balance AS (
      SELECT
        g.party,
        json_extract(d.payload_json,'$.company') AS company,
        g.account,
        g.currency,
        SUM(g.credit_minor-g.debit_minor) AS gl_control_balance_minor
      FROM gl_entries g
      INNER JOIN documents d
        ON d.tenant_id=g.tenant_id
       AND d.doctype=g.voucher_type
       AND d.name=g.voucher_no
      WHERE g.tenant_id=?1
        AND json_extract(d.payload_json,'$.company')=?3
        AND g.party_type='Supplier'
        AND g.party IS NOT NULL
        AND date(g.posting_at)<=date(?2)
      GROUP BY g.party,company,g.account,g.currency
    ), keys AS (
      SELECT party,company,account,currency FROM payment_balance
      UNION
      SELECT party,company,account,currency FROM gl_balance
    ), reconciliation AS (
      SELECT
        keys.party,
        keys.company,
        keys.account,
        keys.currency,
        COALESCE(payment_balance.payable_ledger_balance_minor,0) AS payable_ledger_balance_minor,
        COALESCE(gl_balance.gl_control_balance_minor,0) AS gl_control_balance_minor,
        COALESCE(payment_balance.payable_ledger_balance_minor,0)-COALESCE(gl_balance.gl_control_balance_minor,0) AS difference_minor,
        CAST(COALESCE(payment_balance.payable_ledger_balance_minor,0) AS REAL)/100.0 AS payable_ledger_balance,
        CAST(COALESCE(gl_balance.gl_control_balance_minor,0) AS REAL)/100.0 AS gl_control_balance,
        CAST(COALESCE(payment_balance.payable_ledger_balance_minor,0)-COALESCE(gl_balance.gl_control_balance_minor,0) AS REAL)/100.0 AS difference,
        CASE
          WHEN COALESCE(payment_balance.payable_ledger_balance_minor,0)=COALESCE(gl_balance.gl_control_balance_minor,0)
            THEN 'Reconciled'
          ELSE 'Mismatch'
        END AS status
      FROM keys
      LEFT JOIN payment_balance
        ON payment_balance.party=keys.party
       AND payment_balance.company=keys.company
       AND payment_balance.account=keys.account
       AND payment_balance.currency=keys.currency
      LEFT JOIN gl_balance
        ON gl_balance.party=keys.party
       AND gl_balance.company=keys.company
       AND gl_balance.account=keys.account
       AND gl_balance.currency=keys.currency
    )
    SELECT ${columns.map((column) => quoteIdentifier(column.field)).join(", ")}
    FROM reconciliation${whereSql}${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;
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

function supplierStatementColumns(): ReportColumn[] {
  return [
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "posting_at", label: "Posting Date", type: "Date" },
    { field: "voucher_type", label: "Voucher Type", type: "Data" },
    { field: "voucher_no", label: "Voucher", type: "Data" },
    { field: "line_key", label: "Line", type: "Data" },
    { field: "entry_type", label: "Entry Type", type: "Data" },
    { field: "debit_amount", label: "Debit", type: "Currency" },
    { field: "credit_amount", label: "Credit", type: "Currency" },
    { field: "running_balance", label: "Payable Balance", type: "Currency" },
    { field: "against_voucher_type", label: "Against Type", type: "Data" },
    { field: "against_voucher_no", label: "Against Voucher", type: "Data" },
  ];
}

function supplierReconciliationColumns(): ReportColumn[] {
  return [
    { field: "party", label: "Supplier", type: "Link", options: "Supplier" },
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "account", label: "Payable Account", type: "Link", options: "Account" },
    { field: "currency", label: "Company Currency", type: "Data" },
    { field: "payable_ledger_balance_minor", label: "Payable Ledger Minor", type: "Int" },
    { field: "gl_control_balance_minor", label: "GL Control Minor", type: "Int" },
    { field: "difference_minor", label: "Difference Minor", type: "Int" },
    { field: "payable_ledger_balance", label: "Payable Ledger", type: "Currency" },
    { field: "gl_control_balance", label: "GL Control", type: "Currency" },
    { field: "difference", label: "Difference", type: "Currency" },
    { field: "status", label: "Status", type: "Data" },
  ];
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw errors.validation(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}
