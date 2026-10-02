import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController, OpenPaymentBalance } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";

const APPROVER_ROLES = new Set(["Accounts Manager", "Chief Accountant", "Kế toán trưởng", "System Manager"]);

interface RevaluationEntry extends JsonObject {
  row_id: string;
  account_type: "Receivable" | "Payable";
  party_type: string;
  party: string;
  account: string;
  against_voucher_type: "Sales Invoice" | "Purchase Invoice";
  against_voucher_no: string;
  currency: string;
  currency_scale: number;
  outstanding_minor: number;
  base_outstanding_minor: number;
  closing_rate_micros: number;
  closing_rate: string;
  target_base_minor: number;
  difference_minor: number;
  source_row_count: number;
}

export interface ExchangeRateRevaluationData extends JsonObject {
  company: string;
  posting_at: string;
  remarks?: string;
  company_currency?: string;
  company_currency_scale?: number;
  gain_loss_account?: string;
  reversal_at?: string;
  total_gain_minor?: number;
  total_loss_minor?: number;
  total_adjustment_minor?: number;
  revaluation_entries?: RevaluationEntry[];
}

export class ExchangeRateRevaluationController implements DocumentController<ExchangeRateRevaluationData> {
  readonly doctype = "Exchange Rate Revaluation";

  async buildPlan(context: ControllerContext<ExchangeRateRevaluationData>): Promise<MutationPlan<ExchangeRateRevaluationData>> {
    if (context.command.action === "cancel") return this.cancel(context);
    const data = await this.normalize(context);
    const submitted = context.command.action === "submit";
    const document = canonical(context, data, submitted ? 1 : 0, submitted ? "Revalued" : "Draft");
    const gl = submitted ? buildGl(data) : [];
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
        type: submitted ? "exchange_rate_revaluation.submitted" : "exchange_rate_revaluation.updated",
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          status: document.status,
          company: data.company,
          posting_at: data.posting_at,
          total_adjustment_minor: data.total_adjustment_minor ?? 0,
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        docstatus: document.docstatus,
        status: document.status,
        total_adjustment_minor: data.total_adjustment_minor ?? 0,
      },
    };
  }

  private async normalize(context: ControllerContext<ExchangeRateRevaluationData>): Promise<ExchangeRateRevaluationData> {
    const input = context.command.document;
    const companyName = text(input.company);
    const postingAt = utcTimestamp(input.posting_at, "posting_at");
    if (!companyName) throw errors.validation("Company and posting_at are required");

    const base: ExchangeRateRevaluationData = {
      ...input,
      company: companyName,
      posting_at: postingAt,
      revaluation_entries: [],
      total_gain_minor: 0,
      total_loss_minor: 0,
      total_adjustment_minor: 0,
    };
    delete base.company_currency;
    delete base.company_currency_scale;
    delete base.gain_loss_account;
    delete base.reversal_at;

    if (context.command.action !== "submit") return base;
    assertApprover(context);

    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", companyName);
    if (!company) throw errors.reference(`Company ${companyName} does not exist`);
    const companyCurrency = text(company.default_currency);
    if (!companyCurrency) throw errors.reference(`Company ${companyName} must define default_currency`);
    const currency = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", companyCurrency);
    if (!currency) throw errors.reference(`Currency ${companyCurrency} does not exist`);
    const companyScale = scale(currency.currency_scale, `Currency ${companyCurrency}`);

    const gainLossAccount = text(company.exchange_gain_loss_account);
    if (!gainLossAccount) throw errors.reference(`Company ${companyName} must define exchange_gain_loss_account`);
    const gainLoss = await context.reader.getMasterRecordData(context.command.tenant_id, "Account", gainLossAccount);
    if (!gainLoss) throw errors.reference(`Account ${gainLossAccount} does not exist`);
    if (checked(gainLoss.is_group)) throw errors.reference("Exchange gain/loss account must be a posting account");
    if (text(gainLoss.company) && text(gainLoss.company) !== companyName) {
      throw errors.reference("Exchange gain/loss account belongs to another company");
    }

    const postingDate = postingAt.slice(0, 10);
    const duplicates = await context.reader.listDocumentsByDoctype<ExchangeRateRevaluationData>(
      context.command.tenant_id,
      this.doctype,
    );
    const duplicate = duplicates.find((doc) =>
      doc.docstatus === 1
      && doc.name !== context.existing?.name
      && doc.data.company === companyName
      && text(doc.data.posting_at).slice(0, 10) === postingDate
    );
    if (duplicate) throw errors.lifecycle(`Exchange Rate Revaluation ${duplicate.name} already covers ${companyName} on ${postingDate}`);

    const balances = await context.reader.listOpenPaymentBalances({
      tenantId: context.command.tenant_id,
      company: companyName,
      throughDate: postingDate,
    });
    const entries: RevaluationEntry[] = [];
    let totalGain = 0;
    let totalLoss = 0;
    let totalAdjustment = 0;

    for (const row of balances) {
      if (row.currency === companyCurrency) continue;
      validateOpenBalance(row);
      if (row.amount_minor === 0) {
        throw errors.ledger(`${row.against_voucher_type} ${row.against_voucher_no} has base outstanding without foreign outstanding`);
      }

      const rate = await closingRate(context, row.currency, companyCurrency, postingDate);
      const targetBase = convertMinor(row.amount_minor, row.currency_scale, rate, companyScale);
      const difference = targetBase - row.base_amount_minor;
      if (difference === 0) continue;
      if (!Number.isSafeInteger(difference)) throw errors.validation("Revaluation difference exceeds safe integer range");

      const gain = row.account_type === "Receivable" ? difference > 0 : difference < 0;
      if (gain) totalGain = safeAdd(totalGain, Math.abs(difference), "total revaluation gain");
      else totalLoss = safeAdd(totalLoss, Math.abs(difference), "total revaluation loss");
      totalAdjustment = safeAdd(totalAdjustment, Math.abs(difference), "total revaluation adjustment");

      entries.push({
        row_id: `FX-${entries.length + 1}`,
        account_type: row.account_type,
        party_type: row.party_type,
        party: row.party,
        account: row.account,
        against_voucher_type: row.against_voucher_type,
        against_voucher_no: row.against_voucher_no,
        currency: row.currency,
        currency_scale: row.currency_scale,
        outstanding_minor: row.amount_minor,
        base_outstanding_minor: row.base_amount_minor,
        closing_rate_micros: rate,
        closing_rate: fromScaledInt(rate, 6),
        target_base_minor: targetBase,
        difference_minor: difference,
        source_row_count: row.row_count,
      });
    }
    if (entries.length === 0) {
      throw errors.reference("No non-zero foreign-currency AR/AP revaluation remains for this date");
    }

    return {
      ...base,
      company_currency: companyCurrency,
      company_currency_scale: companyScale,
      gain_loss_account: gainLossAccount,
      reversal_at: nextDay(postingAt),
      total_gain_minor: totalGain,
      total_loss_minor: totalLoss,
      total_adjustment_minor: totalAdjustment,
      revaluation_entries: entries,
    };
  }

  private async cancel(context: ControllerContext<ExchangeRateRevaluationData>): Promise<MutationPlan<ExchangeRateRevaluationData>> {
    if (!context.existing) throw errors.notFound();
    assertApprover(context);
    const original = await context.reader.getVoucherGlEntries(
      context.command.tenant_id,
      this.doctype,
      context.command.aggregate.name,
      context.existing.version,
    );
    if (original.length === 0) throw errors.reference("Original Exchange Rate Revaluation GL posting was not found");
    const data = structuredClone(context.existing.data);
    const document = canonical(context, data, 2, "Cancelled");
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
        type: "exchange_rate_revaluation.cancelled",
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { status: "Cancelled", company: data.company, posting_at: data.posting_at },
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

function buildGl(data: ExchangeRateRevaluationData): GeneralLedgerEntry[] {
  const currency = text(data.company_currency);
  const scaleValue = scale(data.company_currency_scale, "company_currency_scale");
  const gainLoss = text(data.gain_loss_account);
  const reversalAt = text(data.reversal_at);
  if (!currency || !gainLoss || !reversalAt) throw errors.ledger("Revaluation snapshots are incomplete");

  const normal: GeneralLedgerEntry[] = [];
  for (const entry of data.revaluation_entries ?? []) {
    const amount = Math.abs(entry.difference_minor);
    const receivable = entry.account_type === "Receivable";
    const increase = entry.difference_minor > 0;
    const partyDebit = receivable ? increase : !increase;
    const gain = receivable ? increase : !increase;
    const dimensions = {
      fx_source_voucher_type: entry.against_voucher_type,
      fx_source_voucher_no: entry.against_voucher_no,
      fx_source_currency: entry.currency,
    };
    normal.push({
      line_key: `${entry.row_id}-PARTY`,
      account: entry.account,
      party_type: entry.party_type,
      party: entry.party,
      debit_minor: partyDebit ? amount : 0,
      credit_minor: partyDebit ? 0 : amount,
      currency,
      currency_scale: scaleValue,
      accounting_dimensions: dimensions,
      remarks: data.remarks ?? `FX revaluation ${entry.currency} at ${entry.closing_rate}`,
      posting_at: data.posting_at,
    });
    normal.push({
      line_key: `${entry.row_id}-GAIN-LOSS`,
      account: gainLoss,
      debit_minor: gain ? 0 : amount,
      credit_minor: gain ? amount : 0,
      currency,
      currency_scale: scaleValue,
      accounting_dimensions: dimensions,
      remarks: data.remarks ?? `FX revaluation ${entry.currency} at ${entry.closing_rate}`,
      posting_at: data.posting_at,
    });
  }
  const reversal = reverseGl(normal).map((line) => ({
    ...line,
    line_key: `REV-${line.line_key}`,
    posting_at: reversalAt,
    remarks: `Auto reversal: ${line.remarks ?? "FX revaluation"}`,
  }));
  return [...normal, ...reversal];
}

function canonical(
  context: ControllerContext<ExchangeRateRevaluationData>,
  data: ExchangeRateRevaluationData,
  docstatus: 0 | 1 | 2,
  status: string,
): CanonicalDocument<ExchangeRateRevaluationData> {
  const children: ChildRow[] = (data.revaluation_entries ?? []).map((entry, index) => ({
    fieldname: "revaluation_entries",
    child_doctype: "Exchange Rate Revaluation Entry",
    row_id: entry.row_id,
    idx: index + 1,
    data: structuredClone(entry),
  }));
  return {
    tenant_id: context.command.tenant_id,
    doctype: "Exchange Rate Revaluation",
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

async function closingRate(
  context: ControllerContext<ExchangeRateRevaluationData>,
  foreignCurrency: string,
  companyCurrency: string,
  postingDate: string,
): Promise<number> {
  for (const name of [`${foreignCurrency}:${companyCurrency}:${postingDate}`, `${foreignCurrency}:${companyCurrency}`]) {
    const record = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    if (!record) continue;
    const raw = record.rate;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const rate = toScaledInt(raw, 6, `Exchange Rate ${name}`);
    if (rate > 0) return rate;
  }
  throw errors.reference(`Exchange Rate ${foreignCurrency}:${companyCurrency} for ${postingDate} does not exist`);
}

function validateOpenBalance(row: OpenPaymentBalance): void {
  if (!Number.isSafeInteger(row.amount_minor) || !Number.isSafeInteger(row.base_amount_minor) || !Number.isSafeInteger(row.row_count)) {
    throw errors.ledger("Payment Ledger revaluation source contains non-integer values");
  }
  if (row.amount_minor < 0 || row.base_amount_minor < 0 || row.row_count <= 0) {
    throw errors.ledger(`${row.against_voucher_type} ${row.against_voucher_no} has invalid open-balance signs for revaluation`);
  }
}

function convertMinor(amount: number, sourceScale: number, rateMicros: number, targetScale: number): number {
  return multiplyScaled(
    fromScaledInt(amount, sourceScale),
    sourceScale,
    fromScaledInt(rateMicros, 6),
    6,
    targetScale,
    "exchange revaluation",
  );
}

function nextDay(timestamp: string): string {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function utcTimestamp(value: unknown, field: string): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw)
    || !Number.isFinite(Date.parse(raw))) {
    throw errors.validation(`${field} must be a valid UTC timestamp`);
  }
  return new Date(raw).toISOString();
}

function scale(value: unknown, field: string): number {
  const resolved = typeof value === "number" && Number.isSafeInteger(value) ? value : 2;
  if (resolved < 0 || resolved > 6) throw errors.validation(`${field} must be between 0 and 6`);
  return resolved;
}

function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function assertApprover(context: ControllerContext<ExchangeRateRevaluationData>): void {
  if (!context.command.actor.roles.some((role) => APPROVER_ROLES.has(role))) {
    throw errors.permission("Exchange Rate Revaluation requires an accounting approver");
  }
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
    || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
