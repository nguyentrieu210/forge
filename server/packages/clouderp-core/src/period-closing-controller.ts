import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";

interface PeriodClosingEntry extends JsonObject {
  row_id: string;
  account: string;
  root_type: "Income" | "Expense";
  balance_before_minor: number;
  debit_minor: number;
  credit_minor: number;
}

export interface PeriodClosingVoucherData extends JsonObject {
  company: string;
  fiscal_year: string;
  posting_at: string;
  closing_account: string;
  branch?: string;
  remarks?: string;
  period_start_date?: string;
  period_end_date?: string;
  company_currency?: string;
  company_currency_scale?: number;
  source_gl_row_count?: number;
  source_debit_minor?: number;
  source_credit_minor?: number;
  net_profit_loss_minor?: number;
  net_profit_loss?: string;
  total_debit_minor?: number;
  total_credit_minor?: number;
  closing_entries?: PeriodClosingEntry[];
}

/**
 * Authoritative P&L -> retained-earnings close.
 *
 * The voucher consumes the kernel's company/date/branch GL aggregate port. It never scans
 * documents ad hoc and never persists a competing balance table. Submit is only allowed
 * after the selected period is locked; migration 0151 rechecks the lock and the exact
 * append-only source fingerprint at commit time so a concurrent posting cannot make the
 * close stale between planning and D1 commit.
 */
export class PeriodClosingVoucherController implements DocumentController<PeriodClosingVoucherData> {
  readonly doctype = "Period Closing Voucher";

  async buildPlan(
    context: ControllerContext<PeriodClosingVoucherData>,
  ): Promise<MutationPlan<PeriodClosingVoucherData>> {
    if (context.command.action === "cancel") return this.buildCancelPlan(context);

    const data = await this.normalize(context);
    const docstatus = context.command.action === "submit" ? 1 : 0;
    const status = docstatus === 1 ? "Closed" : "Draft";
    const gl = context.command.action === "submit" ? buildClosingGl(data) : [];
    const document = canonicalDocument(context, data, docstatus, status);
    return {
      command: context.command,
      document,
      gl_entries: gl,
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      events: [domainEvent({
        type: context.command.action === "submit"
          ? "period_closing_voucher.submitted"
          : "period_closing_voucher.updated",
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          status,
          company: data.company,
          fiscal_year: data.fiscal_year,
          period_end_date: data.period_end_date ?? "",
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        docstatus,
        status,
        ...(data.net_profit_loss_minor !== undefined
          ? { net_profit_loss_minor: data.net_profit_loss_minor }
          : {}),
      },
    };
  }

  private async normalize(
    context: ControllerContext<PeriodClosingVoucherData>,
  ): Promise<PeriodClosingVoucherData> {
    const input = context.command.document;
    const companyName = text(input.company);
    const fiscalYearName = text(input.fiscal_year);
    const postingAt = text(input.posting_at);
    const closingAccountName = text(input.closing_account);
    if (!companyName || !fiscalYearName || !postingAt || !closingAccountName) {
      throw errors.validation("Company, fiscal year, posting_at and closing account are required");
    }
    // All GL readers use calendar dates from the persisted timestamp. A prefix
    // match alone permits invalid GL that disappears from SQLite date scopes.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(postingAt)
      || !Number.isFinite(Date.parse(postingAt))
      || new Date(postingAt).toISOString().slice(0, 10) !== postingAt.slice(0, 10)) {
      throw errors.validation("Period Closing Voucher posting_at must be a valid UTC timestamp");
    }

    // Draft payloads never get to supply authoritative close/fingerprint values.
    const draft: PeriodClosingVoucherData = {
      ...input,
      company: companyName,
      fiscal_year: fiscalYearName,
      posting_at: postingAt,
      closing_account: closingAccountName,
      ...(text(input.branch) ? { branch: text(input.branch) } : {}),
      ...(text(input.remarks) ? { remarks: text(input.remarks) } : {}),
      closing_entries: [],
      source_gl_row_count: 0,
      source_debit_minor: 0,
      source_credit_minor: 0,
      net_profit_loss_minor: 0,
      total_debit_minor: 0,
      total_credit_minor: 0,
    };
    if (context.command.action !== "submit") return draft;

    const [company, fiscalYear, closingAccount] = await Promise.all([
      context.reader.getMasterRecordData(context.command.tenant_id, "Company", companyName),
      context.reader.getMasterRecordData(context.command.tenant_id, "Fiscal Year", fiscalYearName),
      context.reader.getMasterRecordData(context.command.tenant_id, "Account", closingAccountName),
    ]);
    if (!company) throw errors.reference(`Company ${companyName} does not exist`);
    if (!fiscalYear) throw errors.reference(`Fiscal Year ${fiscalYearName} does not exist`);
    if (!closingAccount) throw errors.reference(`Account ${closingAccountName} does not exist`);

    const periodStart = isoDate(fiscalYear.year_start_date, "Fiscal Year year_start_date");
    const periodEnd = isoDate(fiscalYear.year_end_date, "Fiscal Year year_end_date");
    if (postingAt.slice(0, 10) !== periodEnd) {
      throw errors.validation("Period Closing Voucher posting_at must be on the fiscal period end date", {
        period_end_date: periodEnd,
      });
    }
    const lockDate = await context.reader.getPeriodLockDate(context.command.tenant_id, companyName);
    if (!lockDate || lockDate < periodEnd) {
      throw errors.lifecycle("Lock the accounting period through the closing date before submitting Period Closing Voucher", {
        period_end_date: periodEnd,
        lock_date: lockDate ?? "",
      });
    }

    const companyCurrency = text(company.default_currency);
    if (!companyCurrency) throw errors.reference(`Company ${companyName} must define default_currency`);
    const currency = await context.reader.getMasterRecordData(
      context.command.tenant_id,
      "Currency",
      companyCurrency,
    );
    if (!currency) throw errors.reference(`Currency ${companyCurrency} does not exist`);
    const currencyScale = typeof currency.currency_scale === "number"
      && Number.isSafeInteger(currency.currency_scale)
      ? currency.currency_scale
      : 2;

    const closingRoot = text(closingAccount.root_type);
    if (!["Equity", "Liability"].includes(closingRoot) || checked(closingAccount.is_group)) {
      throw errors.reference("Closing account must be a leaf Equity or Liability account");
    }
    if (text(closingAccount.company) && text(closingAccount.company) !== companyName) {
      throw errors.reference("Closing account belongs to another company");
    }

    const accountRecords = await context.reader.listMasterRecordData(
      context.command.tenant_id,
      "Account",
    );
    const pnl = new Map<string, "Income" | "Expense">();
    for (const record of accountRecords) {
      const root = text(record.data.root_type);
      if (root !== "Income" && root !== "Expense") continue;
      if (checked(record.data.is_group)) continue;
      if (text(record.data.company) && text(record.data.company) !== companyName) continue;
      pnl.set(record.name, root);
    }
    if (pnl.size === 0) throw errors.reference(`Company ${companyName} has no leaf Income/Expense accounts`);

    const balances = await context.reader.getGlAccountBalances({
      tenantId: context.command.tenant_id,
      company: companyName,
      fromDate: periodStart,
      throughDate: periodEnd,
      ...(text(input.branch) ? { branch: text(input.branch) } : {}),
    });
    const sourceRows = balances.filter((row) => pnl.has(row.account));
    let sourceRowCount = 0;
    let sourceDebit = 0;
    let sourceCredit = 0;
    const entries: PeriodClosingEntry[] = [];
    let closingDebit = 0;
    let closingCredit = 0;

    for (const row of sourceRows) {
      if (row.currency !== companyCurrency || row.currency_scale !== currencyScale) {
        throw errors.ledger(
          `P&L account ${row.account} contains non-company-currency GL rows in the closing period`,
        );
      }
      sourceRowCount = safeAdd(sourceRowCount, row.row_count, "source GL row count");
      sourceDebit = safeAdd(sourceDebit, row.debit_minor, "source GL debit");
      sourceCredit = safeAdd(sourceCredit, row.credit_minor, "source GL credit");
      if (row.balance_minor === 0) continue;
      const rootType = pnl.get(row.account)!;
      const debitMinor = row.balance_minor < 0 ? -row.balance_minor : 0;
      const creditMinor = row.balance_minor > 0 ? row.balance_minor : 0;
      closingDebit = safeAdd(closingDebit, debitMinor, "period closing debit");
      closingCredit = safeAdd(closingCredit, creditMinor, "period closing credit");
      entries.push({
        row_id: `CLOSE-${entries.length + 1}`,
        account: row.account,
        root_type: rootType,
        balance_before_minor: row.balance_minor,
        debit_minor: debitMinor,
        credit_minor: creditMinor,
      });
    }
    if (entries.length === 0) {
      throw errors.reference("No non-zero Income/Expense balance remains to close for this period");
    }

    const netProfitLoss = closingDebit - closingCredit;
    const closingAccountDebit = netProfitLoss < 0 ? -netProfitLoss : 0;
    const closingAccountCredit = netProfitLoss > 0 ? netProfitLoss : 0;
    const totalDebit = safeAdd(closingDebit, closingAccountDebit, "total closing debit");
    const totalCredit = safeAdd(closingCredit, closingAccountCredit, "total closing credit");
    if (totalDebit <= 0 || totalDebit !== totalCredit) {
      throw errors.ledger("Period Closing Voucher did not produce a balanced close");
    }

    return {
      ...draft,
      period_start_date: periodStart,
      period_end_date: periodEnd,
      company_currency: companyCurrency,
      company_currency_scale: currencyScale,
      closing_entries: entries,
      source_gl_row_count: sourceRowCount,
      source_debit_minor: sourceDebit,
      source_credit_minor: sourceCredit,
      net_profit_loss_minor: netProfitLoss,
      net_profit_loss: fromScaledInt(netProfitLoss, currencyScale),
      total_debit_minor: totalDebit,
      total_credit_minor: totalCredit,
    };
  }

  private async buildCancelPlan(
    context: ControllerContext<PeriodClosingVoucherData>,
  ): Promise<MutationPlan<PeriodClosingVoucherData>> {
    if (!context.existing) throw errors.notFound();
    const data = structuredClone(context.existing.data);
    const original = await context.reader.getVoucherGlEntries(
      context.command.tenant_id,
      this.doctype,
      context.command.aggregate.name,
      context.existing.version,
    );
    if (original.length === 0) {
      throw errors.reference("Original Period Closing Voucher GL posting was not found");
    }
    const document = canonicalDocument(context, data, 2, "Cancelled");
    return {
      command: context.command,
      document,
      gl_entries: reverseGl(original),
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      events: [domainEvent({
        type: "period_closing_voucher.cancelled",
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          status: "Cancelled",
          company: data.company,
          fiscal_year: data.fiscal_year,
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        docstatus: 2,
        status: "Cancelled",
      },
    };
  }
}

function buildClosingGl(data: PeriodClosingVoucherData): GeneralLedgerEntry[] {
  const scale = data.company_currency_scale ?? 2;
  const currency = data.company_currency;
  if (!currency) throw errors.ledger("Period Closing Voucher has no company currency snapshot");
  const entries = data.closing_entries ?? [];
  const gl: GeneralLedgerEntry[] = entries.map((entry) => ({
    line_key: entry.row_id,
    account: entry.account,
    debit_minor: entry.debit_minor,
    credit_minor: entry.credit_minor,
    currency,
    currency_scale: scale,
    ...(data.branch ? { accounting_dimensions: { branch: data.branch } } : {}),
    remarks: data.remarks ?? `Close fiscal year ${data.fiscal_year}`,
    posting_at: data.posting_at,
  }));
  const net = data.net_profit_loss_minor ?? 0;
  gl.push({
    line_key: "CLOSING-ACCOUNT",
    account: data.closing_account,
    debit_minor: net < 0 ? -net : 0,
    credit_minor: net > 0 ? net : 0,
    currency,
    currency_scale: scale,
    ...(data.branch ? { accounting_dimensions: { branch: data.branch } } : {}),
    remarks: data.remarks ?? `Close fiscal year ${data.fiscal_year}`,
    posting_at: data.posting_at,
  });
  return gl;
}

function canonicalDocument(
  context: ControllerContext<PeriodClosingVoucherData>,
  data: PeriodClosingVoucherData,
  docstatus: 0 | 1 | 2,
  status: string,
): CanonicalDocument<PeriodClosingVoucherData> {
  const children: ChildRow[] = (data.closing_entries ?? []).map((entry, index) => ({
    fieldname: "closing_entries",
    child_doctype: "Period Closing Voucher Closing Entry",
    row_id: entry.row_id,
    idx: index + 1,
    data: structuredClone(entry),
  }));
  return {
    tenant_id: context.command.tenant_id,
    doctype: "Period Closing Voucher",
    name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id,
    docstatus,
    status,
    version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now,
    modified_at: context.now,
    data,
    children,
  };
}

function isoDate(value: unknown, field: string): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw errors.validation(`${field} is invalid`);
  }
  return raw;
}

function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw errors.validation(`${field} must use safe integers`);
  }
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
    || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
