import type { CanonicalDocument, GeneralLedgerEntry, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { PosClosingEntryController, PosInvoiceController, PosOpeningEntryController } from "./suite-controllers.js";
import type { PosClosingEntryData, PosInvoiceData, PosOpeningEntryData } from "./types.js";

interface PosPaymentRow extends JsonObject {
  row_id?: string;
  mode_of_payment: string;
  amount: string | number;
  amount_minor?: number;
  account?: string;
  type?: string;
  reference_no?: string;
}

interface PosReconciliationRow extends JsonObject {
  row_id?: string;
  mode_of_payment: string;
  account?: string;
  opening_amount?: string | number;
  opening_amount_minor?: number;
  expected_amount?: string | number;
  expected_amount_minor?: number;
  closing_amount?: string | number;
  closing_amount_minor?: number;
  difference?: string | number;
  difference_minor?: number;
}

interface PaymentModeResolution {
  mode_of_payment: string;
  account: string;
  type: string;
}

interface ReconciliationAccumulator extends PaymentModeResolution {
  opening_minor: number;
  sales_minor: number;
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be a valid timestamp`);
  return parsed;
}

function rows(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function enabled(value: unknown): boolean {
  return value !== false && value !== 0 && value !== "0" && value !== "false" && value !== "No";
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "Yes";
}

function safeAdd(left: number, right: number, field = "POS amount"): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer bounds`);
  return value;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "payment";
}

function managerOverride(context: ControllerContext<JsonObject>): boolean {
  return context.command.actor.user_id === "Administrator"
    || context.command.actor.roles.some((role) => ["System Manager", "Sales Manager", "POS Manager"].includes(role));
}

async function submittedOpening<T extends PosInvoiceData | PosClosingEntryData>(
  context: ControllerContext<T>,
  openingEntry: string,
): Promise<CanonicalDocument<PosOpeningEntryData>> {
  const opening = await context.reader.getDocument<PosOpeningEntryData>(context.command.tenant_id, "POS Opening Entry", openingEntry);
  if (!opening || opening.docstatus !== 1) throw errors.reference(`Submitted POS Opening Entry ${openingEntry} is required`);
  return opening;
}

async function resolvePaymentMode(
  context: ControllerContext<JsonObject>,
  profile: JsonObject,
  company: string,
  modeOfPayment: string,
): Promise<PaymentModeResolution> {
  const configuredModes = rows(profile.payments)
    .map((row) => String(row.mode_of_payment ?? "").trim())
    .filter(Boolean);
  if (configuredModes.length > 0 && !configuredModes.includes(modeOfPayment)) {
    throw errors.reference(`Mode of Payment ${modeOfPayment} is not enabled for this POS Profile`);
  }

  const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Mode of Payment", modeOfPayment);
  if (!master) throw errors.reference(`Mode of Payment ${modeOfPayment} does not exist`);
  if (!enabled(master.enabled)) throw errors.reference(`Mode of Payment ${modeOfPayment} is disabled`);

  const accountRow = rows(master.accounts).find((row) => String(row.company ?? "") === company);
  const account = String(accountRow?.default_account ?? master.default_account ?? "").trim();
  if (!account) throw errors.reference(`Mode of Payment ${modeOfPayment} has no default account for ${company}`);
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, "Account", account)) {
    throw errors.reference(`Account ${account} for Mode of Payment ${modeOfPayment} does not exist or is disabled`);
  }
  return { mode_of_payment: modeOfPayment, account, type: String(master.type ?? "General") || "General" };
}

async function normalizePaymentRows(
  context: ControllerContext<PosInvoiceData>,
  data: PosInvoiceData,
  profile: JsonObject,
): Promise<PosInvoiceData> {
  const rawPayments = rows(data.payments);
  const configuredModes = rows(profile.payments)
    .map((row) => String(row.mode_of_payment ?? "").trim())
    .filter(Boolean);

  if (rawPayments.length === 0) {
    if (context.command.action === "submit" && configuredModes.length > 0) {
      throw errors.validation("At least one configured Mode of Payment is required for POS Invoice submission");
    }
    return data;
  }

  const seen = new Set<string>();
  const normalized: PosPaymentRow[] = [];
  let paidMinor = 0;
  for (const [index, raw] of rawPayments.entries()) {
    const modeOfPayment = String(raw.mode_of_payment ?? "").trim();
    if (!modeOfPayment) throw errors.validation(`Mode of Payment is required at payment row ${index + 1}`);
    if (seen.has(modeOfPayment)) throw errors.validation(`Mode of Payment ${modeOfPayment} is duplicated`);
    seen.add(modeOfPayment);

    const amountMinor = toScaledInt(raw.amount as string | number, data.currency_scale ?? 2, `payments[${index}].amount`);
    if (amountMinor <= 0) throw errors.validation(`Payment amount must be positive at row ${index + 1}`);
    const resolved = await resolvePaymentMode(context as unknown as ControllerContext<JsonObject>, profile, data.company, modeOfPayment);
    paidMinor = safeAdd(paidMinor, amountMinor, "POS paid amount");
    normalized.push({
      ...raw,
      row_id: String(raw.row_id ?? `PAY-${index + 1}`),
      mode_of_payment: modeOfPayment,
      amount: fromScaledInt(amountMinor, data.currency_scale ?? 2),
      amount_minor: amountMinor,
      account: resolved.account,
      type: resolved.type,
    } as PosPaymentRow);
  }

  const grandTotalMinor = data.grand_total_minor ?? 0;
  if (context.command.action === "submit" && paidMinor < grandTotalMinor) {
    if (checked(profile.allow_partial_payment)) {
      throw errors.validation("Partial POS payment requires canonical receivable/payment-ledger integration and is not enabled in this WS16 slice");
    }
    throw errors.validation("POS Invoice must be fully paid before submission");
  }

  const changeMinor = Math.max(0, paidMinor - grandTotalMinor);
  let changeAccount = String(profile.account_for_change_amount ?? data.account_for_change_amount ?? "").trim();
  if (changeMinor > 0 && !changeAccount) {
    changeAccount = normalized.find((payment) => payment.type === "Cash")?.account ?? "";
  }
  if (changeMinor > 0) {
    if (!changeAccount) throw errors.reference("POS change requires an account_for_change_amount or a Cash payment account");
    if (!normalized.some((payment) => payment.account === changeAccount)) {
      throw errors.reference("POS change account must match one payment mode account so closing reconciliation can subtract change deterministically");
    }
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, "Account", changeAccount)) {
      throw errors.reference(`POS change Account ${changeAccount} does not exist or is disabled`);
    }
  }

  const scale = data.currency_scale ?? 2;
  return {
    ...data,
    payments: normalized,
    paid_amount: fromScaledInt(paidMinor, scale),
    paid_amount_minor: paidMinor,
    change_amount: fromScaledInt(changeMinor, scale),
    change_amount_minor: changeMinor,
    ...(changeAccount ? { account_for_change_amount: changeAccount } : {}),
  };
}

async function buildReconciliation(
  context: ControllerContext<PosClosingEntryData>,
  data: PosClosingEntryData,
  opening: CanonicalDocument<PosOpeningEntryData>,
  profile: JsonObject,
): Promise<PosClosingEntryData> {
  const scale = data.currency_scale ?? 2;
  const closingAt = timestamp(data.posting_at, "POS Closing Entry posting_at");
  const accumulator = new Map<string, ReconciliationAccumulator>();

  const ensureMode = async (modeOfPayment: string, accountHint?: string, typeHint?: string): Promise<ReconciliationAccumulator> => {
    const existing = accumulator.get(modeOfPayment);
    if (existing) return existing;
    let resolved: PaymentModeResolution;
    if (accountHint) {
      resolved = { mode_of_payment: modeOfPayment, account: accountHint, type: typeHint ?? "General" };
    } else if (modeOfPayment === "Cash" && rows(profile.payments).length === 0) {
      resolved = { mode_of_payment: "Cash", account: String(profile.cash_account ?? ""), type: "Cash" };
    } else {
      resolved = await resolvePaymentMode(context as unknown as ControllerContext<JsonObject>, profile, data.company, modeOfPayment);
    }
    const value: ReconciliationAccumulator = { ...resolved, opening_minor: 0, sales_minor: 0 };
    accumulator.set(modeOfPayment, value);
    return value;
  };

  const openingDetails = rows(opening.data.balance_details);
  if (openingDetails.length > 0) {
    for (const [index, row] of openingDetails.entries()) {
      const mode = String(row.mode_of_payment ?? "").trim();
      if (!mode) throw errors.reference(`POS Opening Entry payment mode is missing at row ${index + 1}`);
      const resolved = await ensureMode(mode, typeof row.account === "string" ? row.account : undefined, typeof row.type === "string" ? row.type : undefined);
      const openingMinor = typeof row.opening_amount_minor === "number"
        ? row.opening_amount_minor
        : toScaledInt(row.opening_amount as string | number, scale, `opening.balance_details[${index}].opening_amount`);
      resolved.opening_minor = safeAdd(resolved.opening_minor, openingMinor, "POS opening amount");
    }
  } else if ((opening.data.opening_cash_minor ?? 0) !== 0) {
    const legacyCash = await ensureMode("Cash");
    legacyCash.opening_minor = opening.data.opening_cash_minor ?? 0;
  }

  const invoices = (await context.reader.listDocumentsByDoctype<PosInvoiceData>(context.command.tenant_id, "POS Invoice"))
    .filter((invoice) => invoice.docstatus === 1 && invoice.data.opening_entry === data.opening_entry);

  for (const invoice of invoices) {
    if (invoice.data.pos_profile !== data.pos_profile) throw errors.reference(`POS Invoice ${invoice.name} profile does not match closing profile`);
    if (timestamp(invoice.data.posting_at, `POS Invoice ${invoice.name} posting_at`) > closingAt) {
      throw errors.validation(`POS Closing Entry cannot predate POS Invoice ${invoice.name}`);
    }
    const payments = rows(invoice.data.payments);
    if (payments.length === 0) {
      const legacyCash = await ensureMode("Cash");
      legacyCash.sales_minor = safeAdd(legacyCash.sales_minor, invoice.data.grand_total_minor ?? 0, "POS payment total");
      continue;
    }

    const accountModes = new Map<string, string>();
    for (const [index, payment] of payments.entries()) {
      const mode = String(payment.mode_of_payment ?? "").trim();
      const account = String(payment.account ?? "").trim();
      if (!mode || !account) throw errors.reference(`POS Invoice ${invoice.name} payment row ${index + 1} is not normalized`);
      const resolved = await ensureMode(mode, account, String(payment.type ?? "General"));
      const amountMinor = typeof payment.amount_minor === "number"
        ? payment.amount_minor
        : toScaledInt(payment.amount as string | number, scale, `POS Invoice ${invoice.name} payment amount`);
      resolved.sales_minor = safeAdd(resolved.sales_minor, amountMinor, "POS payment total");
      accountModes.set(account, mode);
    }

    const changeMinor = typeof invoice.data.change_amount_minor === "number" ? invoice.data.change_amount_minor : 0;
    if (changeMinor > 0) {
      const changeAccount = String(invoice.data.account_for_change_amount ?? "");
      const changeMode = accountModes.get(changeAccount);
      if (!changeMode) throw errors.reference(`POS Invoice ${invoice.name} change account cannot be reconciled to a payment mode`);
      const resolved = accumulator.get(changeMode)!;
      resolved.sales_minor = safeAdd(resolved.sales_minor, -changeMinor, "POS payment change");
    }
  }

  const providedRows = rows(data.payment_reconciliation);
  const provided = new Map<string, JsonObject>();
  for (const [index, row] of providedRows.entries()) {
    const mode = String(row.mode_of_payment ?? "").trim();
    if (!mode) throw errors.validation(`Mode of Payment is required at reconciliation row ${index + 1}`);
    if (provided.has(mode)) throw errors.validation(`Mode of Payment ${mode} is duplicated in closing reconciliation`);
    provided.set(mode, row);
  }
  for (const mode of provided.keys()) {
    if (!accumulator.has(mode)) throw errors.validation(`Closing reconciliation contains unexpected Mode of Payment ${mode}`);
  }

  const reconciliation: PosReconciliationRow[] = [];
  let totalDifferenceMinor = 0;
  let cashClosingMinor = 0;
  for (const [index, expected] of [...accumulator.values()].sort((left, right) => left.mode_of_payment.localeCompare(right.mode_of_payment)).entries()) {
    const input = provided.get(expected.mode_of_payment);
    if (context.command.action === "submit" && !input) {
      throw errors.validation(`Closing amount is required for Mode of Payment ${expected.mode_of_payment}`);
    }
    const expectedMinor = safeAdd(expected.opening_minor, expected.sales_minor, "POS expected closing amount");
    let closingMinor: number | undefined;
    if (input && input.closing_amount !== undefined) {
      closingMinor = toScaledInt(input.closing_amount as string | number, scale, `payment_reconciliation[${index}].closing_amount`);
      if (closingMinor < 0) throw errors.validation(`Closing amount cannot be negative for Mode of Payment ${expected.mode_of_payment}`);
    } else if (input && typeof input.closing_amount_minor === "number") {
      closingMinor = input.closing_amount_minor;
      if (closingMinor < 0) throw errors.validation(`Closing amount cannot be negative for Mode of Payment ${expected.mode_of_payment}`);
    }
    const differenceMinor = closingMinor === undefined ? undefined : closingMinor - expectedMinor;
    if (differenceMinor !== undefined) totalDifferenceMinor = safeAdd(totalDifferenceMinor, differenceMinor, "POS closing difference");
    if (expected.type === "Cash" && closingMinor !== undefined) cashClosingMinor = safeAdd(cashClosingMinor, closingMinor, "POS cash closing");
    reconciliation.push({
      ...(input ?? {}),
      row_id: String(input?.row_id ?? `RECON-${index + 1}`),
      mode_of_payment: expected.mode_of_payment,
      account: expected.account,
      opening_amount: fromScaledInt(expected.opening_minor, scale),
      opening_amount_minor: expected.opening_minor,
      expected_amount: fromScaledInt(expectedMinor, scale),
      expected_amount_minor: expectedMinor,
      ...(closingMinor === undefined ? {} : {
        closing_amount: fromScaledInt(closingMinor, scale),
        closing_amount_minor: closingMinor,
        difference: fromScaledInt(differenceMinor ?? 0, scale),
        difference_minor: differenceMinor ?? 0,
      }),
    });
  }

  const discrepancyReason = typeof data.discrepancy_reason === "string" ? data.discrepancy_reason.trim() : "";
  if (context.command.action === "submit" && totalDifferenceMinor !== 0 && !discrepancyReason) {
    throw errors.validation("A discrepancy reason is required when POS payment reconciliation does not match expected amounts");
  }

  return {
    ...data,
    payment_reconciliation: reconciliation,
    closing_cash: fromScaledInt(cashClosingMinor, scale),
    closing_cash_minor: cashClosingMinor,
    difference_minor: totalDifferenceMinor,
    ...(discrepancyReason ? { discrepancy_reason: discrepancyReason } : {}),
  };
}

export class HardenedPosOpeningEntryController extends PosOpeningEntryController {
  override async normalize(context: ControllerContext<PosOpeningEntryData>): Promise<PosOpeningEntryData> {
    const data = await super.normalize(context);
    const profile = await context.reader.getMasterRecordData(context.command.tenant_id, "POS Profile", data.pos_profile);
    if (!profile) throw errors.reference(`POS Profile ${data.pos_profile} does not exist`);

    const applicableUsers = rows(profile.applicable_for_users)
      .map((row) => String(row.user ?? "").trim())
      .filter(Boolean);
    if (applicableUsers.length > 0 && !applicableUsers.includes(context.command.actor.user_id) && !managerOverride(context as unknown as ControllerContext<JsonObject>)) {
      throw errors.permission("This user is not assigned to the selected POS Profile");
    }

    const balanceDetails = rows(data.balance_details);
    if (balanceDetails.length === 0) return { ...data, user: context.command.actor.user_id };

    const seen = new Set<string>();
    const normalized: PosReconciliationRow[] = [];
    let cashMinor = 0;
    for (const [index, raw] of balanceDetails.entries()) {
      const mode = String(raw.mode_of_payment ?? "").trim();
      if (!mode) throw errors.validation(`Mode of Payment is required at opening row ${index + 1}`);
      if (seen.has(mode)) throw errors.validation(`Mode of Payment ${mode} is duplicated in opening balances`);
      seen.add(mode);
      const resolved = await resolvePaymentMode(context as unknown as ControllerContext<JsonObject>, profile, data.company, mode);
      const amountMinor = toScaledInt(raw.opening_amount as string | number, data.currency_scale ?? 2, `balance_details[${index}].opening_amount`);
      if (amountMinor < 0) throw errors.validation(`Opening amount cannot be negative for Mode of Payment ${mode}`);
      if (resolved.type === "Cash") cashMinor = safeAdd(cashMinor, amountMinor, "POS opening cash");
      normalized.push({
        ...raw,
        row_id: String(raw.row_id ?? `OPEN-${index + 1}`),
        mode_of_payment: mode,
        account: resolved.account,
        type: resolved.type,
        opening_amount: fromScaledInt(amountMinor, data.currency_scale ?? 2),
        opening_amount_minor: amountMinor,
      } as PosReconciliationRow);
    }
    return {
      ...data,
      user: context.command.actor.user_id,
      balance_details: normalized,
      opening_cash: fromScaledInt(cashMinor, data.currency_scale ?? 2),
      opening_cash_minor: cashMinor,
    };
  }
}

export class HardenedPosInvoiceController extends PosInvoiceController {
  override async normalize(context: ControllerContext<PosInvoiceData>): Promise<PosInvoiceData> {
    const base = await super.normalize(context);
    const opening = await submittedOpening(context, base.opening_entry);
    const openedAt = timestamp(opening.data.posting_at, "POS Opening Entry posting_at");
    const postedAt = timestamp(base.posting_at, "POS Invoice posting_at");
    if (postedAt < openedAt) throw errors.validation("POS Invoice cannot be posted before its opening session");
    if (opening.data.user && opening.data.user !== context.command.actor.user_id && !managerOverride(context as unknown as ControllerContext<JsonObject>)) {
      throw errors.permission("POS Invoice must be created by the cashier who opened the session");
    }
    const profile = await context.reader.getMasterRecordData(context.command.tenant_id, "POS Profile", base.pos_profile);
    if (!profile) throw errors.reference(`POS Profile ${base.pos_profile} does not exist`);
    return normalizePaymentRows(context, base, profile);
  }

  override async ledgers(context: ControllerContext<PosInvoiceData>, data: PosInvoiceData) {
    const base = await super.ledgers(context, data);
    if (!["submit", "cancel"].includes(context.command.action)) return base;
    const payments = rows(data.payments);
    if (payments.length === 0) return base;

    const currency = data.currency;
    const scale = data.currency_scale ?? 2;
    const originalPaymentGl: GeneralLedgerEntry[] = payments.map((payment, index) => ({
      line_key: `PAY-${slug(String(payment.mode_of_payment ?? ""))}-${index + 1}`,
      account: String(payment.account ?? ""),
      debit_minor: Number(payment.amount_minor ?? 0),
      credit_minor: 0,
      currency,
      currency_scale: scale,
      posting_at: data.posting_at,
    }));
    const changeMinor = typeof data.change_amount_minor === "number" ? data.change_amount_minor : 0;
    if (changeMinor > 0) {
      originalPaymentGl.push({
        line_key: "CHANGE",
        account: String(data.account_for_change_amount ?? ""),
        debit_minor: 0,
        credit_minor: changeMinor,
        currency,
        currency_scale: scale,
        posting_at: data.posting_at,
      });
    }

    const replacedKey = context.command.action === "cancel" ? "REV-CASH" : "CASH";
    const nonCashGl = (base.gl ?? []).filter((line) => line.line_key !== replacedKey);
    const paymentGl = context.command.action === "cancel" ? reverseGl(originalPaymentGl) : originalPaymentGl;
    return { ...base, gl: [...nonCashGl, ...paymentGl] };
  }
}

export class HardenedPosClosingEntryController extends PosClosingEntryController {
  override async normalize(context: ControllerContext<PosClosingEntryData>): Promise<PosClosingEntryData> {
    const input = context.command.document;
    const suppliedReconciliation = rows(input.payment_reconciliation);
    const syntheticClosingCash = input.closing_cash ?? suppliedReconciliation
      .filter((row) => String(row.type ?? "") === "Cash" || String(row.mode_of_payment ?? "") === "Cash")
      .reduce<number>((sum, row) => sum + Number(row.closing_amount ?? 0), 0);
    const baseContext = input.closing_cash === undefined
      ? {
          ...context,
          command: { ...context.command, document: { ...input, closing_cash: syntheticClosingCash ?? 0 } },
        } as ControllerContext<PosClosingEntryData>
      : context;
    const data = await super.normalize(baseContext);
    const opening = await submittedOpening(context, data.opening_entry);
    const openedAt = timestamp(opening.data.posting_at, "POS Opening Entry posting_at");
    const postedAt = timestamp(data.posting_at, "POS Closing Entry posting_at");
    if (postedAt < openedAt) throw errors.validation("POS Closing Entry cannot be posted before its opening session");
    if ((data.closing_cash_minor ?? 0) < 0) throw errors.validation("Closing cash cannot be negative");

    const profile = await context.reader.getMasterRecordData(context.command.tenant_id, "POS Profile", data.pos_profile);
    if (!profile) throw errors.reference(`POS Profile ${data.pos_profile} does not exist`);
    const hasPaymentModeEvidence = suppliedReconciliation.length > 0
      || rows(opening.data.balance_details).length > 0
      || rows(profile.payments).length > 0;
    if (hasPaymentModeEvidence) return buildReconciliation(context, data, opening, profile);

    const discrepancyReason = typeof data.discrepancy_reason === "string" ? data.discrepancy_reason.trim() : "";
    if (context.command.action === "submit" && (data.difference_minor ?? 0) !== 0 && !discrepancyReason) {
      throw errors.validation("A discrepancy reason is required when POS closing cash does not match expected cash");
    }
    return discrepancyReason ? { ...data, discrepancy_reason: discrepancyReason } : data;
  }
}
