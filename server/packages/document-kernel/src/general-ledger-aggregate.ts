import { errors } from "../../core/src/index.js";

const MAX_ACCOUNT_FILTERS = 64;
const MAX_SCOPE_TEXT = 240;

export interface GeneralLedgerAggregateQuery {
  tenant_id: string;
  company: string;
  from_posting_date: string;
  to_posting_date: string;
  /** Omitted means all branches in the company scope. */
  branch?: string;
  /** Omitted means all accounts. If supplied, the list must contain 1..64 unique account names. */
  accounts?: readonly string[];
  /** Omitted means all currencies. */
  currency?: string;
}

export interface GeneralLedgerAggregateEvidence {
  /** Canonical append-only authority used for the aggregate. */
  source: "gl_entries";
  entry_count: number;
  voucher_count: number;
  first_posting_at: string;
  last_posting_at: string;
}

export interface GeneralLedgerAggregateRow {
  company: string;
  branch: string;
  account: string;
  currency: string;
  currency_scale: number;
  debit_minor: number;
  credit_minor: number;
  net_minor: number;
  source_evidence: GeneralLedgerAggregateEvidence;
}

/**
 * Narrow reusable read boundary for domain controllers that need authoritative GL
 * totals without owning SQL, document scans or a competing accounting projection.
 */
export interface GeneralLedgerAggregateReader {
  aggregateGeneralLedger(query: GeneralLedgerAggregateQuery): Promise<GeneralLedgerAggregateRow[]>;
}

type PreparedReader = Pick<D1Database, "prepare"> | Pick<D1DatabaseSession, "prepare">;

type RawAggregateRow = {
  company: unknown;
  branch: unknown;
  account: unknown;
  currency: unknown;
  currency_scale: unknown;
  debit_minor: unknown;
  credit_minor: unknown;
  entry_count: unknown;
  voucher_count: unknown;
  first_posting_at: unknown;
  last_posting_at: unknown;
};

/**
 * D1 implementation of the shared GL aggregate contract.
 *
 * Callers pass only business scope. Company/branch are resolved from the canonical
 * voucher document plus persisted accounting dimensions; the service never trusts
 * client-computed balances and never materializes a second ledger.
 */
export class D1GeneralLedgerAggregateReader implements GeneralLedgerAggregateReader {
  private readonly reader: PreparedReader;

  constructor(db: D1Database | D1DatabaseSession) {
    const candidate = db as D1Database;
    this.reader = typeof candidate.withSession === "function"
      ? candidate.withSession("first-primary")
      : db;
  }

  async aggregateGeneralLedger(query: GeneralLedgerAggregateQuery): Promise<GeneralLedgerAggregateRow[]> {
    const scope = normalizeQuery(query);
    const params: unknown[] = [
      scope.tenant_id,
      scope.company,
      scope.from_posting_date,
      scope.to_posting_date,
    ];
    const branchExpr = "COALESCE(NULLIF(json_extract(d.payload_json,'$.branch'),''),NULLIF(json_extract(g.dimensions_json,'$.branch'),''),'')";
    const conditions = [
      "g.tenant_id=?1",
      "json_extract(d.payload_json,'$.company')=?2",
      "date(g.posting_at)>=date(?3)",
      "date(g.posting_at)<=date(?4)",
    ];

    if (scope.branch !== undefined) {
      params.push(scope.branch);
      conditions.push(`${branchExpr}=?${params.length}`);
    }
    if (scope.currency !== undefined) {
      params.push(scope.currency);
      conditions.push(`g.currency=?${params.length}`);
    }
    if (scope.accounts !== undefined) {
      const placeholders: string[] = [];
      for (const account of scope.accounts) {
        params.push(account);
        placeholders.push(`?${params.length}`);
      }
      conditions.push(`g.account IN (${placeholders.join(",")})`);
    }

    const sql = `
      SELECT
        ?2 AS company,
        ${branchExpr} AS branch,
        g.account,
        g.currency,
        g.currency_scale,
        SUM(g.debit_minor) AS debit_minor,
        SUM(g.credit_minor) AS credit_minor,
        COUNT(*) AS entry_count,
        COUNT(DISTINCT g.voucher_type || char(31) || g.voucher_no || char(31) || CAST(g.voucher_revision AS TEXT)) AS voucher_count,
        MIN(g.posting_at) AS first_posting_at,
        MAX(g.posting_at) AS last_posting_at
      FROM gl_entries g
      INNER JOIN documents d
        ON d.tenant_id=g.tenant_id
       AND d.doctype=g.voucher_type
       AND d.name=g.voucher_no
      WHERE ${conditions.join(" AND ")}
      GROUP BY ${branchExpr},g.account,g.currency,g.currency_scale
      ORDER BY ${branchExpr},g.account,g.currency,g.currency_scale`;

    const result = await this.reader.prepare(sql).bind(...params).all<RawAggregateRow>();
    return (result.results ?? []).map(mapAggregateRow);
  }
}

function normalizeQuery(query: GeneralLedgerAggregateQuery): Required<Pick<GeneralLedgerAggregateQuery,
  "tenant_id" | "company" | "from_posting_date" | "to_posting_date">>
  & Pick<GeneralLedgerAggregateQuery, "branch" | "accounts" | "currency"> {
  const tenantId = requireScopeText(query.tenant_id, "tenant_id");
  const company = requireScopeText(query.company, "company");
  const fromPostingDate = requireIsoDate(query.from_posting_date, "from_posting_date");
  const toPostingDate = requireIsoDate(query.to_posting_date, "to_posting_date");
  if (fromPostingDate > toPostingDate) {
    throw errors.validation("from_posting_date must be on or before to_posting_date");
  }

  const branch = query.branch === undefined ? undefined : requireScopeText(query.branch, "branch");
  const currency = query.currency === undefined ? undefined : requireScopeText(query.currency, "currency");
  let accounts: string[] | undefined;
  if (query.accounts !== undefined) {
    if (!Array.isArray(query.accounts) || query.accounts.length === 0) {
      throw errors.validation("accounts must contain at least one account when supplied");
    }
    if (query.accounts.length > MAX_ACCOUNT_FILTERS) {
      throw errors.validation(`accounts exceeds the ${MAX_ACCOUNT_FILTERS}-account filter limit`);
    }
    accounts = [...new Set(query.accounts.map((account) => requireScopeText(account, "accounts[]")))].sort();
    if (accounts.length > MAX_ACCOUNT_FILTERS) {
      throw errors.validation(`accounts exceeds the ${MAX_ACCOUNT_FILTERS}-account filter limit`);
    }
  }

  return {
    tenant_id: tenantId,
    company,
    from_posting_date: fromPostingDate,
    to_posting_date: toPostingDate,
    ...(branch === undefined ? {} : { branch }),
    ...(accounts === undefined ? {} : { accounts }),
    ...(currency === undefined ? {} : { currency }),
  };
}

function mapAggregateRow(row: RawAggregateRow): GeneralLedgerAggregateRow {
  const company = requireResultText(row.company, "company");
  const branch = typeof row.branch === "string" ? row.branch : "";
  const account = requireResultText(row.account, "account");
  const currency = requireResultText(row.currency, "currency");
  const currencyScale = requireSafeInteger(row.currency_scale, "currency_scale");
  if (currencyScale < 0 || currencyScale > 6) {
    throw errors.ledger(`GL aggregate currency scale is invalid for ${account}`);
  }
  const debitMinor = requireSafeInteger(row.debit_minor, "debit_minor");
  const creditMinor = requireSafeInteger(row.credit_minor, "credit_minor");
  if (debitMinor < 0 || creditMinor < 0) {
    throw errors.ledger(`GL aggregate contains a negative debit/credit total for ${account}`);
  }
  const netMinor = debitMinor - creditMinor;
  if (!Number.isSafeInteger(netMinor)) {
    throw errors.ledger(`GL aggregate net exceeds JavaScript safe integer range for ${account}`);
  }
  const entryCount = requireSafeInteger(row.entry_count, "entry_count");
  const voucherCount = requireSafeInteger(row.voucher_count, "voucher_count");
  if (entryCount < 1 || voucherCount < 1 || voucherCount > entryCount) {
    throw errors.ledger(`GL aggregate evidence counts are invalid for ${account}`);
  }

  return {
    company,
    branch,
    account,
    currency,
    currency_scale: currencyScale,
    debit_minor: debitMinor,
    credit_minor: creditMinor,
    net_minor: netMinor,
    source_evidence: {
      source: "gl_entries",
      entry_count: entryCount,
      voucher_count: voucherCount,
      first_posting_at: requireResultText(row.first_posting_at, "first_posting_at"),
      last_posting_at: requireResultText(row.last_posting_at, "last_posting_at"),
    },
  };
}

function requireScopeText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_SCOPE_TEXT) {
    throw errors.validation(`${field} must be a non-empty string no longer than ${MAX_SCOPE_TEXT} characters`);
  }
  return value.trim();
}

function requireResultText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw errors.ledger(`GL aggregate returned invalid ${field}`);
  }
  return value;
}

function requireSafeInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw errors.ledger(`GL aggregate ${field} exceeds JavaScript safe integer range`);
  }
  return number;
}

function requireIsoDate(value: unknown, field: string): string {
  const text = requireScopeText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw errors.validation(`${field} must use YYYY-MM-DD`);
  }
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw errors.validation(`${field} is not a valid calendar date`);
  }
  return text;
}
