import { errors } from "../../core/src/index.js";
import type {
  CompiledQuery,
  QueryFilter,
  QueryOrder,
  QueryRequest,
  ReportColumn,
} from "./index.js";
import { AccountsPayableQueryCompiler } from "./ap-reconciliation.js";

/**
 * Transaction-closure finance reports are read-only projections over canonical
 * GL / Payment Ledger / bank reconciliation evidence. They never persist a
 * competing balance or reconciliation ledger.
 */
export class FinanceClosureQueryCompiler extends AccountsPayableQueryCompiler {
  override compile(request: QueryRequest, forceSynchronous = false): CompiledQuery {
    if (request.report === "Daily Detailed Ledger") {
      return compileDailyDetailedLedger(request, forceSynchronous);
    }
    if (request.report === "Finance Reconciliation Diagnostics") {
      return compileFinanceReconciliationDiagnostics(request, forceSynchronous);
    }
    return super.compile(request, forceSynchronous);
  }
}

function compileDailyDetailedLedger(request: QueryRequest, forceSynchronous: boolean): CompiledQuery {
  const ledgerDate = extractControl(request.filters ?? [], "ledger_date", true);
  assertIsoDate(ledgerDate.value, "ledger_date");
  const company = extractControl(ledgerDate.remaining, "company", true);
  assertNonEmpty(company.value, "company");
  const branch = extractControl(company.remaining, "branch", false);
  assertOptionalText(branch.value, "branch");
  const account = extractControl(branch.remaining, "account", false);
  assertOptionalText(account.value, "account");
  const currency = extractControl(account.remaining, "currency", false);
  assertOptionalText(currency.value, "currency");
  if (currency.remaining.length) {
    throw errors.validation(`Filter is not allowed: ${currency.remaining[0]!.field}`);
  }

  const params: unknown[] = [
    request.tenant_id,
    company.value,
    ledgerDate.value,
    branch.value ?? "",
    account.value ?? "",
    currency.value ?? "",
  ];
  const columns = dailyLedgerColumns();
  const order = request.order_by ?? [
    { field: "account", direction: "asc" },
    { field: "currency", direction: "asc" },
    { field: "branch", direction: "asc" },
    { field: "row_order", direction: "asc" },
    { field: "posting_at", direction: "asc" },
    { field: "voucher_type", direction: "asc" },
    { field: "voucher_no", direction: "asc" },
    { field: "voucher_revision", direction: "asc" },
    { field: "line_key", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const branchExpr = "COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')";
  const sql = `
    WITH scoped AS (
      SELECT
        json_extract(d.payload_json,'$.company') AS company,
        ${branchExpr} AS branch,
        g.posting_at,g.voucher_type,g.voucher_no,g.voucher_revision,g.line_key,
        g.account,g.party_type,g.party,g.currency,g.currency_scale,
        g.debit_minor,g.credit_minor,g.cost_center
      FROM gl_entries g
      INNER JOIN documents d
        ON d.tenant_id=g.tenant_id
       AND d.doctype=g.voucher_type
       AND d.name=g.voucher_no
      WHERE g.tenant_id=?1
        AND json_extract(d.payload_json,'$.company')=?2
        AND date(g.posting_at)<=date(?3)
        AND (?4='' OR ${branchExpr}=?4)
        AND (?5='' OR g.account=?5)
        AND (?6='' OR g.currency=?6)
    ), opening AS (
      SELECT
        company,branch,account,currency,currency_scale,
        SUM(CASE WHEN date(posting_at)<date(?3) THEN debit_minor-credit_minor ELSE 0 END) AS opening_balance_minor
      FROM scoped
      GROUP BY company,branch,account,currency,currency_scale
    ), period AS (
      SELECT
        scoped.*,
        SUM(debit_minor-credit_minor) OVER (
          PARTITION BY company,branch,account,currency,currency_scale
          ORDER BY posting_at,voucher_type,voucher_no,voucher_revision,line_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS period_running_minor
      FROM scoped
      WHERE date(posting_at)=date(?3)
    ), closing AS (
      SELECT
        opening.company,opening.branch,opening.account,opening.currency,opening.currency_scale,
        opening.opening_balance_minor+
          COALESCE(SUM(CASE WHEN date(scoped.posting_at)=date(?3) THEN scoped.debit_minor-scoped.credit_minor ELSE 0 END),0)
          AS closing_balance_minor
      FROM opening
      LEFT JOIN scoped
        ON scoped.company=opening.company
       AND scoped.branch=opening.branch
       AND scoped.account=opening.account
       AND scoped.currency=opening.currency
       AND scoped.currency_scale=opening.currency_scale
      GROUP BY
        opening.company,opening.branch,opening.account,opening.currency,opening.currency_scale,opening.opening_balance_minor
    ), ledger AS (
      SELECT
        opening.company,opening.branch,?3 AS ledger_date,
        ?3 || 'T00:00:00.000Z' AS posting_at,
        0 AS row_order,'Opening' AS row_kind,
        '' AS voucher_type,'' AS voucher_no,0 AS voucher_revision,'' AS line_key,
        opening.account,'' AS party_type,'' AS party,opening.currency,opening.currency_scale,
        0 AS debit_minor,0 AS credit_minor,0 AS movement_minor,
        opening.opening_balance_minor AS running_balance_minor,
        0.0 AS debit_amount,0.0 AS credit_amount,0.0 AS movement_amount,
        CAST(opening.opening_balance_minor AS REAL)/${moneyDivisor("opening.currency_scale")} AS running_balance,
        '' AS cost_center
      FROM opening

      UNION ALL

      SELECT
        period.company,period.branch,?3,
        period.posting_at,
        1,'Movement',
        period.voucher_type,period.voucher_no,period.voucher_revision,period.line_key,
        period.account,COALESCE(period.party_type,''),COALESCE(period.party,''),period.currency,period.currency_scale,
        period.debit_minor,period.credit_minor,period.debit_minor-period.credit_minor,
        opening.opening_balance_minor+period.period_running_minor,
        CAST(period.debit_minor AS REAL)/${moneyDivisor("period.currency_scale")},
        CAST(period.credit_minor AS REAL)/${moneyDivisor("period.currency_scale")},
        CAST(period.debit_minor-period.credit_minor AS REAL)/${moneyDivisor("period.currency_scale")},
        CAST(opening.opening_balance_minor+period.period_running_minor AS REAL)/${moneyDivisor("period.currency_scale")},
        COALESCE(period.cost_center,'')
      FROM period
      INNER JOIN opening
        ON opening.company=period.company
       AND opening.branch=period.branch
       AND opening.account=period.account
       AND opening.currency=period.currency
       AND opening.currency_scale=period.currency_scale

      UNION ALL

      SELECT
        closing.company,closing.branch,?3,
        ?3 || 'T23:59:59.999Z',
        2,'Closing',
        '', '',0,'',
        closing.account,'','',closing.currency,closing.currency_scale,
        0,0,0,closing.closing_balance_minor,
        0.0,0.0,0.0,
        CAST(closing.closing_balance_minor AS REAL)/${moneyDivisor("closing.currency_scale")},
        ''
      FROM closing
    )
    SELECT ${selectColumns(columns)}
    FROM ledger${renderOrder(order)} LIMIT ?${limit} OFFSET ?${offset}`;

  return { sql, params, columns, prepared: prepared(request, forceSynchronous) };
}

function compileFinanceReconciliationDiagnostics(
  request: QueryRequest,
  forceSynchronous: boolean,
): CompiledQuery {
  const asOf = extractControl(request.filters ?? [], "as_of_date", true);
  assertIsoDate(asOf.value, "as_of_date");
  const company = extractControl(asOf.remaining, "company", true);
  assertNonEmpty(company.value, "company");
  const params: unknown[] = [request.tenant_id, asOf.value, company.value];
  const where: string[] = [];
  const allowed = new Set(["domain", "party_type", "party", "account", "currency", "status"]);
  for (const filter of company.remaining) {
    if (!allowed.has(filter.field)) throw errors.validation(`Filter is not allowed: ${filter.field}`);
    appendOutputFilter(where, params, filter);
  }

  const columns = reconciliationColumns();
  const order = request.order_by ?? [
    { field: "domain", direction: "asc" },
    { field: "status", direction: "asc" },
    { field: "party", direction: "asc" },
    { field: "account", direction: "asc" },
    { field: "evidence", direction: "asc" },
  ];
  assertOrder(columns, order);
  const { limit, offset } = appendPagination(params, request);
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const companyCurrency = "COALESCE(json_extract(d.payload_json,'$.company_currency'),json_extract(company_master.data_json,'$.default_currency'),p.currency)";
  const companyScale = "COALESCE(CAST(json_extract(d.payload_json,'$.company_currency_scale') AS INTEGER),CAST(json_extract(currency_master.data_json,'$.currency_scale') AS INTEGER),p.currency_scale)";

  const sql = `
    WITH payment_balance AS (
      SELECT
        CASE p.account_type WHEN 'Receivable' THEN 'AR' ELSE 'AP' END AS domain,
        p.party_type,p.party,p.account,
        ${companyCurrency} AS currency,
        ${companyScale} AS currency_scale,
        SUM(p.base_amount_minor) AS source_balance_minor
      FROM payment_ledger_entries p
      INNER JOIN documents d
        ON d.tenant_id=p.tenant_id
       AND d.doctype=p.voucher_type
       AND d.name=p.voucher_no
      LEFT JOIN master_records company_master
        ON company_master.tenant_id=p.tenant_id
       AND company_master.record_type='Company'
       AND company_master.name=json_extract(d.payload_json,'$.company')
       AND company_master.disabled=0
      LEFT JOIN master_records currency_master
        ON currency_master.tenant_id=p.tenant_id
       AND currency_master.record_type='Currency'
       AND currency_master.name=${companyCurrency}
       AND currency_master.disabled=0
      WHERE p.tenant_id=?1
        AND json_extract(d.payload_json,'$.company')=?3
        AND date(p.posting_at)<=date(?2)
        AND (
          (p.account_type='Receivable' AND p.party_type='Customer')
          OR (p.account_type='Payable' AND p.party_type='Supplier')
        )
      GROUP BY domain,p.party_type,p.party,p.account,${companyCurrency},${companyScale}
    ), gl_balance AS (
      SELECT
        CASE g.party_type WHEN 'Customer' THEN 'AR' ELSE 'AP' END AS domain,
        g.party_type,g.party,g.account,g.currency,g.currency_scale,
        SUM(CASE g.party_type
          WHEN 'Customer' THEN g.debit_minor-g.credit_minor
          ELSE g.credit_minor-g.debit_minor
        END) AS control_balance_minor
      FROM gl_entries g
      INNER JOIN documents d
        ON d.tenant_id=g.tenant_id
       AND d.doctype=g.voucher_type
       AND d.name=g.voucher_no
      WHERE g.tenant_id=?1
        AND json_extract(d.payload_json,'$.company')=?3
        AND date(g.posting_at)<=date(?2)
        AND g.party_type IN ('Customer','Supplier')
        AND g.party IS NOT NULL
      GROUP BY domain,g.party_type,g.party,g.account,g.currency,g.currency_scale
    ), party_keys AS (
      SELECT domain,party_type,party,account,currency,currency_scale FROM payment_balance
      UNION
      SELECT domain,party_type,party,account,currency,currency_scale FROM gl_balance
    ), party_control AS (
      SELECT
        keys.domain,?3 AS company,keys.party_type,keys.party,keys.account,keys.currency,keys.currency_scale,
        COALESCE(payment_balance.source_balance_minor,0) AS source_balance_minor,
        COALESCE(gl_balance.control_balance_minor,0) AS control_balance_minor,
        COALESCE(payment_balance.source_balance_minor,0)-COALESCE(gl_balance.control_balance_minor,0) AS difference_minor,
        CAST(COALESCE(payment_balance.source_balance_minor,0) AS REAL)/${moneyDivisor("keys.currency_scale")} AS source_balance,
        CAST(COALESCE(gl_balance.control_balance_minor,0) AS REAL)/${moneyDivisor("keys.currency_scale")} AS control_balance,
        CAST(COALESCE(payment_balance.source_balance_minor,0)-COALESCE(gl_balance.control_balance_minor,0) AS REAL)/${moneyDivisor("keys.currency_scale")} AS difference,
        CASE
          WHEN COALESCE(payment_balance.source_balance_minor,0)=COALESCE(gl_balance.control_balance_minor,0)
            THEN 'Reconciled'
          ELSE 'Mismatch'
        END AS status,
        'Payment Ledger base vs party-dimension GL control' AS evidence
      FROM party_keys keys
      LEFT JOIN payment_balance
        ON payment_balance.domain=keys.domain
       AND payment_balance.party_type=keys.party_type
       AND payment_balance.party=keys.party
       AND payment_balance.account=keys.account
       AND payment_balance.currency=keys.currency
       AND payment_balance.currency_scale=keys.currency_scale
      LEFT JOIN gl_balance
        ON gl_balance.domain=keys.domain
       AND gl_balance.party_type=keys.party_type
       AND gl_balance.party=keys.party
       AND gl_balance.account=keys.account
       AND gl_balance.currency=keys.currency
       AND gl_balance.currency_scale=keys.currency_scale
    ), gl_integrity AS (
      SELECT
        'GL' AS domain,r.company,'' AS party_type,'' AS party,'' AS account,r.currency,r.currency_scale,
        r.debit_minor AS source_balance_minor,
        r.credit_minor AS control_balance_minor,
        r.difference_minor,
        CAST(r.debit_minor AS REAL)/${moneyDivisor("r.currency_scale")} AS source_balance,
        CAST(r.credit_minor AS REAL)/${moneyDivisor("r.currency_scale")} AS control_balance,
        CAST(r.difference_minor AS REAL)/${moneyDivisor("r.currency_scale")} AS difference,
        'Mismatch' AS status,
        r.voucher_type || ':' || r.voucher_no || ':r' || r.voucher_revision AS evidence
      FROM finance_gl_reconciliation r
      WHERE r.tenant_id=?1
        AND r.company=?3
        AND date(r.last_posting_at)<=date(?2)
        AND r.difference_minor<>0
    ), bank_integrity AS (
      SELECT
        'BANK' AS domain,?3 AS company,'' AS party_type,
        COALESCE(json_extract(bt.payload_json,'$.bank_account'),'') AS party,
        COALESCE(json_extract(bt.payload_json,'$.gl_account'),'') AS account,
        COALESCE(json_extract(bt.payload_json,'$.currency'),'') AS currency,
        COALESCE(CAST(json_extract(bt.payload_json,'$.currency_scale') AS INTEGER),2) AS currency_scale,
        COALESCE(SUM(e.amount_minor),0) AS source_balance_minor,
        ABS(COALESCE(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER),0)) AS control_balance_minor,
        COALESCE(SUM(e.amount_minor),0)-ABS(COALESCE(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER),0)) AS difference_minor,
        CAST(COALESCE(SUM(e.amount_minor),0) AS REAL)/${moneyDivisor("COALESCE(CAST(json_extract(bt.payload_json,'$.currency_scale') AS INTEGER),2)")} AS source_balance,
        CAST(ABS(COALESCE(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER),0)) AS REAL)/${moneyDivisor("COALESCE(CAST(json_extract(bt.payload_json,'$.currency_scale') AS INTEGER),2)")} AS control_balance,
        CAST(COALESCE(SUM(e.amount_minor),0)-ABS(COALESCE(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER),0)) AS REAL)/${moneyDivisor("COALESCE(CAST(json_extract(bt.payload_json,'$.currency_scale') AS INTEGER),2)")} AS difference,
        'Mismatch' AS status,
        'Bank Transaction:' || bt.name || ':active reconciliation outside statement capacity' AS evidence
      FROM documents bt
      LEFT JOIN bank_reconciliation_entries e
        ON e.tenant_id=bt.tenant_id
       AND e.bank_transaction=bt.name
      WHERE bt.tenant_id=?1
        AND bt.doctype='Bank Transaction'
        AND bt.docstatus=1
        AND json_extract(bt.payload_json,'$.company')=?3
        AND date(json_extract(bt.payload_json,'$.posting_at'))<=date(?2)
      GROUP BY bt.tenant_id,bt.name,bt.payload_json
      HAVING COALESCE(SUM(e.amount_minor),0)<0
         OR COALESCE(SUM(e.amount_minor),0)>ABS(COALESCE(CAST(json_extract(bt.payload_json,'$.amount_minor') AS INTEGER),0))
    ), reconciliation AS (
      SELECT * FROM party_control
      UNION ALL
      SELECT * FROM gl_integrity
      UNION ALL
      SELECT * FROM bank_integrity
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

function assertOptionalText(value: unknown, field: string): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || value.trim() === "") {
    throw errors.validation(`${field} must be a non-empty string when provided`);
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
  const field = quoteIdentifier(filter.field);
  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw errors.validation(`IN filter requires a non-empty array: ${filter.field}`);
    }
    if (filter.value.length > 40) throw errors.validation("IN filter exceeds the parameter budget");
    const placeholders = filter.value.map((value) => {
      params.push(value);
      return `?${params.length}`;
    });
    where.push(`${field} IN (${placeholders.join(",")})`);
    return;
  }
  if (filter.operator !== "=" && filter.operator !== "!=") {
    throw errors.validation(`Filter operator is not allowed: ${filter.field}`);
  }
  params.push(filter.value ?? null);
  where.push(`${field} ${filter.operator} ?${params.length}`);
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

function dailyLedgerColumns(): ReportColumn[] {
  return [
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "branch", label: "Branch", type: "Link", options: "Branch" },
    { field: "ledger_date", label: "Ledger Date", type: "Date" },
    { field: "posting_at", label: "Posting At", type: "Date" },
    { field: "row_order", label: "Row Order", type: "Int" },
    { field: "row_kind", label: "Row Kind", type: "Data" },
    { field: "voucher_type", label: "Voucher Type", type: "Data" },
    { field: "voucher_no", label: "Voucher", type: "Data" },
    { field: "voucher_revision", label: "Revision", type: "Int" },
    { field: "line_key", label: "Line", type: "Data" },
    { field: "account", label: "Account", type: "Link", options: "Account" },
    { field: "party_type", label: "Party Type", type: "Data" },
    { field: "party", label: "Party", type: "Data" },
    { field: "currency", label: "Currency", type: "Data" },
    { field: "currency_scale", label: "Currency Scale", type: "Int" },
    { field: "debit_minor", label: "Debit Minor", type: "Int" },
    { field: "credit_minor", label: "Credit Minor", type: "Int" },
    { field: "movement_minor", label: "Movement Minor", type: "Int" },
    { field: "running_balance_minor", label: "Running Balance Minor", type: "Int" },
    { field: "debit_amount", label: "Debit", type: "Currency" },
    { field: "credit_amount", label: "Credit", type: "Currency" },
    { field: "movement_amount", label: "Movement", type: "Currency" },
    { field: "running_balance", label: "Running Balance", type: "Currency" },
    { field: "cost_center", label: "Cost Center", type: "Link", options: "Cost Center" },
  ];
}

function reconciliationColumns(): ReportColumn[] {
  return [
    { field: "domain", label: "Domain", type: "Data" },
    { field: "company", label: "Company", type: "Link", options: "Company" },
    { field: "party_type", label: "Party Type", type: "Data" },
    { field: "party", label: "Party / Bank Account", type: "Data" },
    { field: "account", label: "Control Account", type: "Link", options: "Account" },
    { field: "currency", label: "Currency", type: "Data" },
    { field: "currency_scale", label: "Currency Scale", type: "Int" },
    { field: "source_balance_minor", label: "Source Minor", type: "Int" },
    { field: "control_balance_minor", label: "Control Minor", type: "Int" },
    { field: "difference_minor", label: "Difference Minor", type: "Int" },
    { field: "source_balance", label: "Source Balance", type: "Currency" },
    { field: "control_balance", label: "Control Balance", type: "Currency" },
    { field: "difference", label: "Difference", type: "Currency" },
    { field: "status", label: "Status", type: "Data" },
    { field: "evidence", label: "Evidence", type: "Data" },
  ];
}
