import type {
  CanonicalDocument,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
  PaymentLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment } from "../../ledger/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, negateMinor, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { PaymentEntryController } from "./controllers.js";
import type { PaymentEntryData, PaymentReference } from "./types.js";

interface ResolvedCurrencyContext {
  transactionScale: number;
  companyCurrency: string;
  companyScale: number;
  rateMicros: number;
}

interface PaymentAllocationData extends JsonObject {
  company: string;
  party_type: "Customer" | "Supplier";
  party: string;
  party_account: string;
  currency: string;
  currency_scale?: number;
  company_currency?: string;
  company_currency_scale?: number;
  posting_at: string;
  source_payment_entry?: string;
  source_credit_note?: string;
  /** Server-owned normalized source identity; keeps ledger replay independent of UI aliases. */
  source_voucher_type?: "Payment Entry" | "Credit Note";
  source_voucher_no?: string;
  reason?: string;
  references: PaymentReference[];
  total_allocated_amount?: string;
  total_allocated_amount_minor?: number;
  /** Target invoice historical company-currency base cleared by this allocation. */
  total_base_allocated_amount?: string;
  total_base_allocated_amount_minor?: number;
  /** Signed-source historical company-currency base consumed by this allocation. */
  total_source_base_allocated_amount?: string;
  total_source_base_allocated_amount_minor?: number;
  /** Server-derived Company exchange gain/loss account when historical bases differ. */
  exchange_gain_loss_account?: string;
  exchange_difference?: string;
  exchange_difference_minor?: number;
}

function convertMinor(
  amountMinor: number,
  sourceScale: number,
  rateMicros: number,
  targetScale: number,
  label: string,
): number {
  return multiplyScaled(
    fromScaledInt(amountMinor, sourceScale),
    sourceScale,
    fromScaledInt(rateMicros, 6),
    6,
    targetScale,
    label,
  );
}

function currencyScale(data: JsonObject | null, currency: string, required: boolean): number {
  const value = data?.currency_scale;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6) return value;
  if (required) throw errors.reference(`Currency ${currency} must define currency_scale`);
  return 2;
}

async function resolveCurrencyContext(
  context: ControllerContext<JsonObject>,
  company: string,
  documentCurrency: string,
  postingAt: string,
): Promise<ResolvedCurrencyContext> {
  const required = context.command.action === "submit";
  const transactionData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", documentCurrency);
  const transactionScale = currencyScale(transactionData, documentCurrency, required);
  const companyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", company);
  const configured = companyData?.default_currency;
  if (required && (!companyData || typeof configured !== "string" || !configured)) {
    throw errors.reference(`Company ${company} must define default_currency`);
  }
  const companyCurrency = typeof configured === "string" && configured ? configured : documentCurrency;
  const companyCurrencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", companyCurrency);
  const companyScale = currencyScale(companyCurrencyData, companyCurrency, required);
  if (companyCurrency === documentCurrency) {
    return { transactionScale, companyCurrency, companyScale, rateMicros: 1_000_000 };
  }
  const postingDate = postingAt.slice(0, 10);
  for (const name of [`${documentCurrency}:${companyCurrency}:${postingDate}`, `${documentCurrency}:${companyCurrency}`]) {
    const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    const raw = data?.rate;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const rateMicros = toScaledInt(raw, 6, `Exchange Rate ${name}`);
    if (rateMicros <= 0) throw errors.reference(`Exchange Rate ${name} must be positive`);
    return { transactionScale, companyCurrency, companyScale, rateMicros };
  }
  throw errors.reference(`Exchange Rate ${documentCurrency}:${companyCurrency} does not exist or is disabled`);
}

async function assertMaster(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<void> {
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) {
    throw errors.reference(`${doctype} ${name} does not exist or is disabled`);
  }
}

async function assertUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  const lockDate = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lockDate && postingAt.slice(0, 10) <= lockDate) {
    throw errors.reference(`Posting date ${postingAt.slice(0, 10)} is locked through ${lockDate}`);
  }
}

async function requireSubmitted<T extends JsonObject>(
  context: ControllerContext<JsonObject>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist`);
  if (document.docstatus !== 1) throw errors.reference(`${doctype} ${name} must be submitted`);
  return document;
}

/**
 * Payment Entry mở rộng: một khoản thu/chi có thể chưa phân bổ hết hoặc chưa có hóa đơn.
 * Phần chưa phân bổ được ghi thành số dư âm gắn với chính Payment Entry trong Payment Ledger.
 */
export class FinancePaymentEntryController extends PaymentEntryController {
  override async normalize(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
    const input = context.command.document;
    const receive = input.payment_type === "Receive";
    const pay = input.payment_type === "Pay";
    if (!receive && !pay) throw errors.validation("Payment Entry supports Receive or Pay");
    const customerRefund = pay && input.party_type === "Customer";
    const supportedDirection = (receive && input.party_type === "Customer")
      || (pay && (input.party_type === "Supplier" || customerRefund));
    if (!supportedDirection) {
      throw errors.validation("Receive supports Customer; Pay supports Supplier or Customer refund");
    }
    const expectedPartyType = input.party_type;
    const referenceDoctype = receive ? "Sales Invoice" : customerRefund ? "Credit Note" : "Purchase Invoice";
    if (!input.party || !input.company || !input.paid_from || !input.paid_to || !input.currency || !input.posting_at) {
      throw errors.validation("Company, party, accounts, posting date and currency are required");
    }
    const referencesInput = Array.isArray(input.references) ? input.references : [];
    const currency = await resolveCurrencyContext(context as unknown as ControllerContext<JsonObject>, input.company, input.currency, input.posting_at);
    const transactionScale = currency.transactionScale;
    const partyAccount = receive ? input.paid_from : input.paid_to;
    const bankAccount = receive ? input.paid_to : input.paid_from;
    if (context.command.action === "submit") {
      await Promise.all([
        assertMaster(context as unknown as ControllerContext<JsonObject>, "Company", input.company),
        assertMaster(context as unknown as ControllerContext<JsonObject>, expectedPartyType, input.party),
        assertMaster(context as unknown as ControllerContext<JsonObject>, "Currency", input.currency),
        assertMaster(context as unknown as ControllerContext<JsonObject>, "Account", partyAccount),
        assertMaster(context as unknown as ControllerContext<JsonObject>, "Account", bankAccount),
        ...(input.exchange_gain_loss_account
          ? [assertMaster(context as unknown as ControllerContext<JsonObject>, "Account", input.exchange_gain_loss_account)]
          : []),
      ]);
      await assertUnlocked(context as unknown as ControllerContext<JsonObject>, input.company, input.posting_at);
    }

    const paidMinor = toScaledInt(input.paid_amount, transactionScale, "paid_amount");
    if (paidMinor <= 0) throw errors.validation("Payment amount must be positive");
    const basePaidMinor = convertMinor(paidMinor, transactionScale, currency.rateMicros, currency.companyScale, "base paid amount");
    const suppliedBankMinor = toScaledInt(input.received_amount, currency.companyScale, "received_amount");
    if (suppliedBankMinor !== basePaidMinor) {
      throw errors.validation("received_amount must equal the server-converted paid_amount", {
        expected_received_minor: basePaidMinor,
        supplied_received_minor: suppliedBankMinor,
      });
    }

    const seen = new Set<string>();
    const references: PaymentReference[] = [];
    let baseAllocatedTotal = 0;
    for (const [index, reference] of referencesInput.entries()) {
      if (reference.reference_doctype !== referenceDoctype) {
        throw errors.validation(`Only ${referenceDoctype} references are supported for ${input.payment_type}`);
      }
      const key = `${reference.reference_doctype}:${reference.reference_name}`;
      if (seen.has(key)) throw errors.validation(`Duplicate payment reference at row ${index + 1}`);
      seen.add(key);
      const allocatedMinor = toScaledInt(reference.allocated_amount, transactionScale, `references[${index}].allocated_amount`);
      if (allocatedMinor <= 0) throw errors.validation(`Allocated amount must be positive at row ${index + 1}`);
      let baseAllocated = convertMinor(allocatedMinor, transactionScale, currency.rateMicros, currency.companyScale, `references[${index}].base_allocated_amount`);
      if (context.command.action === "submit") {
        const invoice = await requireSubmitted<JsonObject>(context as unknown as ControllerContext<JsonObject>, referenceDoctype, reference.reference_name);
        const invoiceParty = input.party_type === "Customer" ? invoice.data.customer : invoice.data.supplier;
        if (invoiceParty !== input.party) throw errors.reference(`${referenceDoctype} ${reference.reference_name} belongs to another ${expectedPartyType.toLowerCase()}`);
        if (invoice.data.company !== input.company) throw errors.reference(`${referenceDoctype} ${reference.reference_name} belongs to another company`);
        if (invoice.data.currency !== input.currency) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another currency`);
        const invoicePartyAccount = input.party_type === "Customer" ? invoice.data.debit_to : invoice.data.credit_to;
        if (invoicePartyAccount !== partyAccount) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another party account`);
        const rawOutstanding = await context.reader.getOutstandingMinor(context.command.tenant_id, referenceDoctype, reference.reference_name);
        const rawBaseOutstanding = await context.reader.getBaseOutstandingMinor(context.command.tenant_id, referenceDoctype, reference.reference_name);
        const outstanding = customerRefund ? -rawOutstanding : rawOutstanding;
        const baseOutstanding = customerRefund ? -rawBaseOutstanding : rawBaseOutstanding;
        if (outstanding < 0 || baseOutstanding < 0) {
          throw errors.ledger(`${referenceDoctype} ${reference.reference_name} has an invalid settlement balance`);
        }
        if (allocatedMinor > outstanding) {
          throw errors.reference(`Allocated amount exceeds outstanding for ${reference.reference_name}`, {
            outstanding_minor: outstanding,
            allocated_minor: allocatedMinor,
          });
        }
        const invoiceScale = typeof invoice.data.currency_scale === "number" ? invoice.data.currency_scale : transactionScale;
        const invoiceRate = typeof invoice.data.conversion_rate_micros === "number" ? invoice.data.conversion_rate_micros : 1_000_000;
        const historicalBase = convertMinor(allocatedMinor, invoiceScale, invoiceRate, currency.companyScale, `references[${index}].historical_base_allocated_amount`);
        baseAllocated = allocatedMinor === outstanding ? baseOutstanding : Math.min(historicalBase, baseOutstanding);
      }
      baseAllocatedTotal = addMinor([baseAllocatedTotal, baseAllocated], "base allocated amount");
      references.push({
        ...reference,
        row_id: reference.row_id || `ROW-${index + 1}`,
        allocated_amount_minor: allocatedMinor,
        allocated_amount: fromScaledInt(allocatedMinor, transactionScale),
        base_allocated_amount_minor: baseAllocated,
        base_allocated_amount: fromScaledInt(baseAllocated, currency.companyScale),
      });
    }

    const allocatedMinor = addMinor(references.map((reference) => reference.allocated_amount_minor ?? 0), "allocated amount");
    if (allocatedMinor > paidMinor) {
      throw errors.validation("Allocated amount cannot exceed paid amount", { paid_minor: paidMinor, allocated_minor: allocatedMinor });
    }
    const unallocatedMinor = paidMinor - allocatedMinor;
    if (customerRefund && unallocatedMinor !== 0) {
      throw errors.validation("Customer refund must be fully allocated to submitted Credit Note customer credit");
    }
    const currentBaseAllocated = convertMinor(allocatedMinor, transactionScale, currency.rateMicros, currency.companyScale, "current base allocated amount");
    const baseUnallocated = basePaidMinor - currentBaseAllocated;
    const basePartyTotal = addMinor([baseAllocatedTotal, baseUnallocated], "base party amount");
    const differenceMinor = receive ? basePartyTotal - suppliedBankMinor : suppliedBankMinor - basePartyTotal;
    if (differenceMinor !== 0 && !input.exchange_gain_loss_account) {
      throw errors.validation("exchange_gain_loss_account is required when historical liability and bank amount differ");
    }

    return {
      ...input,
      references,
      currency_scale: transactionScale,
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      source_exchange_rate: fromScaledInt(currency.rateMicros, 6),
      source_exchange_rate_micros: currency.rateMicros,
      paid_amount_minor: paidMinor,
      paid_amount: fromScaledInt(paidMinor, transactionScale),
      base_paid_amount_minor: basePaidMinor,
      base_paid_amount: fromScaledInt(basePaidMinor, currency.companyScale),
      base_party_amount_minor: basePartyTotal,
      base_party_amount: fromScaledInt(basePartyTotal, currency.companyScale),
      ...(input.party_type === "Customer"
        ? { base_receivable_amount_minor: basePartyTotal, base_receivable_amount: fromScaledInt(basePartyTotal, currency.companyScale) }
        : { base_payable_amount_minor: basePartyTotal, base_payable_amount: fromScaledInt(basePartyTotal, currency.companyScale) }),
      received_amount_minor: suppliedBankMinor,
      received_amount: fromScaledInt(suppliedBankMinor, currency.companyScale),
      difference_amount_minor: differenceMinor,
      difference_amount: fromScaledInt(differenceMinor, currency.companyScale),
      unallocated_amount_minor: unallocatedMinor,
      unallocated_amount: fromScaledInt(unallocatedMinor, transactionScale),
    };
  }

  override ledger(context: ControllerContext<PaymentEntryData>, data: PaymentEntryData): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [] };
    const receive = data.payment_type === "Receive";
    const transactionScale = data.currency_scale ?? 2;
    const companyScale = data.company_currency_scale ?? transactionScale;
    const companyCurrency = data.company_currency ?? data.currency;
    const baseParty = data.base_party_amount_minor ?? data.base_receivable_amount_minor ?? data.base_payable_amount_minor ?? 0;
    const bank = data.received_amount_minor ?? toScaledInt(data.received_amount, companyScale);
    const difference = data.difference_amount_minor ?? (receive ? baseParty - bank : bank - baseParty);
    const partyAccount = receive ? data.paid_from : data.paid_to;
    const bankAccount = receive ? data.paid_to : data.paid_from;
    const normal: GeneralLedgerEntry[] = receive ? [
      { line_key: "BANK", account: bankAccount, debit_minor: bank, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
      { line_key: "PARTY", account: partyAccount, party_type: data.party_type, party: data.party, debit_minor: 0, credit_minor: baseParty, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
    ] : [
      { line_key: "PARTY", account: partyAccount, party_type: data.party_type, party: data.party, debit_minor: baseParty, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
      { line_key: "BANK", account: bankAccount, debit_minor: 0, credit_minor: bank, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
    ];
    if (difference !== 0) {
      if (!data.exchange_gain_loss_account) throw errors.validation("exchange_gain_loss_account is required for exchange difference");
      normal.push({
        line_key: "EXCHANGE-DIFFERENCE",
        account: data.exchange_gain_loss_account,
        debit_minor: difference > 0 ? difference : 0,
        credit_minor: difference < 0 ? -difference : 0,
        currency: companyCurrency,
        currency_scale: companyScale,
        posting_at: data.posting_at,
      });
    }
    const customerRefund = !receive && data.party_type === "Customer";
    const payment: PaymentLedgerEntry[] = data.references.map((reference, index) => {
      const allocated = reference.allocated_amount_minor ?? toScaledInt(reference.allocated_amount, transactionScale);
      const baseAllocated = reference.base_allocated_amount_minor ?? 0;
      return {
        line_key: `ALLOC-${reference.row_id || index + 1}`,
        account_type: data.party_type === "Customer" ? "Receivable" : "Payable",
        party_type: data.party_type,
        party: data.party,
        account: partyAccount,
        amount_minor: customerRefund ? allocated : negateMinor(allocated),
        base_amount_minor: customerRefund ? baseAllocated : negateMinor(baseAllocated),
        currency: data.currency,
        currency_scale: transactionScale,
        against_voucher_type: reference.reference_doctype,
        against_voucher_no: reference.reference_name,
        posting_at: data.posting_at,
      };
    });
    const unallocated = data.unallocated_amount_minor ?? 0;
    if (unallocated > 0) {
      const allocated = addMinor(data.references.map((reference) => reference.allocated_amount_minor ?? 0), "allocated amount");
      const currentBaseAllocated = convertMinor(
        allocated,
        transactionScale,
        data.source_exchange_rate_micros ?? 1_000_000,
        companyScale,
        "current base allocated amount",
      );
      const baseUnallocated = (data.base_paid_amount_minor ?? bank) - currentBaseAllocated;
      payment.push({
        line_key: "ADVANCE",
        account_type: data.party_type === "Customer" ? "Receivable" : "Payable",
        party_type: data.party_type,
        party: data.party,
        account: partyAccount,
        amount_minor: -unallocated,
        base_amount_minor: -baseUnallocated,
        currency: data.currency,
        currency_scale: transactionScale,
        against_voucher_type: "Payment Entry",
        against_voucher_no: context.command.aggregate.name,
        posting_at: data.posting_at,
      });
    }
    return context.command.action === "cancel"
      ? { gl: reverseGl(normal), payment: reversePayment(payment) }
      : { gl: normal, payment };
  }
}

export class PaymentAllocationController implements DocumentController<PaymentAllocationData> {
  readonly doctype = "Payment Allocation";

  async buildPlan(context: ControllerContext<PaymentAllocationData>): Promise<MutationPlan<PaymentAllocationData>> {
    const data = context.command.action === "cancel"
      ? structuredClone(requireExisting(context).data)
      : await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action);
    const status = docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled";
    const ledgers = this.ledger(context, data);
    const document: CanonicalDocument<PaymentAllocationData> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [{
        fieldname: "references",
        child_doctype: "Payment Allocation Reference",
        row_id: "__placeholder__",
        idx: 1,
        data: {},
      }].flatMap(() => data.references.map((reference, index) => ({
        fieldname: "references",
        child_doctype: "Payment Allocation Reference",
        row_id: reference.row_id || `ROW-${index + 1}`,
        idx: index + 1,
        data: reference,
      }))),
    };
    const eventType = context.command.action === "submit"
      ? "payment_allocation.submitted"
      : context.command.action === "cancel"
        ? "payment_allocation.cancelled"
        : "payment_allocation.updated";
    return {
      command: context.command,
      document,
      gl_entries: ledgers.gl,
      stock_entries: [],
      payment_entries: ledgers.payment,
      fulfillment_entries: [],
      events: [domainEvent({
        type: eventType,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { action: context.command.action, status },
      })],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }

  private async normalize(context: ControllerContext<PaymentAllocationData>): Promise<PaymentAllocationData> {
    const input = context.command.document;
    if (!input.company || !input.party || !input.party_account || !input.currency || !input.posting_at) {
      throw errors.validation("Company, party, party account, currency and posting date are required");
    }
    if (input.party_type !== "Customer" && input.party_type !== "Supplier") {
      throw errors.validation("Party type must be Customer or Supplier");
    }
    if (!Array.isArray(input.references) || input.references.length === 0) {
      throw errors.validation("Payment Allocation requires at least one invoice reference");
    }

    const sourcePaymentEntry = typeof input.source_payment_entry === "string" ? input.source_payment_entry.trim() : "";
    const sourceCreditNote = typeof input.source_credit_note === "string" ? input.source_credit_note.trim() : "";
    if (Boolean(sourcePaymentEntry) === Boolean(sourceCreditNote)) {
      throw errors.validation("Payment Allocation requires exactly one source: Payment Entry advance or Credit Note customer credit");
    }
    if (sourceCreditNote && input.party_type !== "Customer") {
      throw errors.validation("Credit Note source is available only for Customer receivable allocation");
    }

    const sourceVoucherType = sourceCreditNote ? "Credit Note" as const : "Payment Entry" as const;
    const sourceVoucherNo = sourceCreditNote || sourcePaymentEntry;
    const source = await requireSubmitted<JsonObject>(
      context as unknown as ControllerContext<JsonObject>,
      sourceVoucherType,
      sourceVoucherNo,
    );
    const sourcePartyType = sourceVoucherType === "Credit Note" ? "Customer" : source.data.party_type;
    const sourceParty = sourceVoucherType === "Credit Note" ? source.data.customer : source.data.party;
    const sourcePartyAccount = sourceVoucherType === "Credit Note"
      ? source.data.debit_to
      : source.data.payment_type === "Receive" ? source.data.paid_from : source.data.paid_to;
    if (source.data.company !== input.company || sourcePartyType !== input.party_type || sourceParty !== input.party
      || sourcePartyAccount !== input.party_account || source.data.currency !== input.currency) {
      throw errors.reference(`Source ${sourceVoucherType} does not match company, party, account or currency`);
    }
    const transactionScale = typeof source.data.currency_scale === "number" ? source.data.currency_scale : 2;
    const companyScale = typeof source.data.company_currency_scale === "number"
      ? source.data.company_currency_scale
      : transactionScale;
    const sourceRemaining = -await context.reader.getOutstandingMinor(
      context.command.tenant_id,
      sourceVoucherType,
      sourceVoucherNo,
    );
    const sourceBaseRemaining = -await context.reader.getBaseOutstandingMinor(
      context.command.tenant_id,
      sourceVoucherType,
      sourceVoucherNo,
    );
    const sourceLabel = sourceVoucherType === "Credit Note" ? "customer credit" : "advance";
    if (sourceRemaining <= 0 || sourceBaseRemaining < 0) {
      throw errors.reference(`Source ${sourceVoucherType} has no remaining ${sourceLabel}`);
    }
    const targetDoctype = input.party_type === "Customer" ? "Sales Invoice" : "Purchase Invoice";
    const sourceRate = typeof source.data.source_exchange_rate_micros === "number"
      ? source.data.source_exchange_rate_micros
      : typeof source.data.conversion_rate_micros === "number"
        ? source.data.conversion_rate_micros
        : 1_000_000;
    const seen = new Set<string>();
    const references: PaymentReference[] = [];
    let total = 0;
    let totalTargetBase = 0;
    for (const [index, reference] of input.references.entries()) {
      if (reference.reference_doctype !== targetDoctype) {
        throw errors.validation(`Only ${targetDoctype} references are allowed`);
      }
      if (seen.has(reference.reference_name)) throw errors.validation(`Duplicate invoice reference at row ${index + 1}`);
      seen.add(reference.reference_name);
      const allocated = toScaledInt(reference.allocated_amount, transactionScale, `references[${index}].allocated_amount`);
      if (allocated <= 0) throw errors.validation(`Allocated amount must be positive at row ${index + 1}`);
      const invoice = await requireSubmitted<JsonObject>(context as unknown as ControllerContext<JsonObject>, targetDoctype, reference.reference_name);
      const invoiceParty = input.party_type === "Customer" ? invoice.data.customer : invoice.data.supplier;
      const invoiceAccount = input.party_type === "Customer" ? invoice.data.debit_to : invoice.data.credit_to;
      if (invoiceParty !== input.party || invoice.data.company !== input.company || invoice.data.currency !== input.currency || invoiceAccount !== input.party_account) {
        throw errors.reference(`${targetDoctype} ${reference.reference_name} does not match allocation context`);
      }
      const outstanding = await context.reader.getOutstandingMinor(context.command.tenant_id, targetDoctype, reference.reference_name);
      const baseOutstanding = await context.reader.getBaseOutstandingMinor(context.command.tenant_id, targetDoctype, reference.reference_name);
      if (outstanding < 0 || baseOutstanding < 0) {
        throw errors.ledger(`${targetDoctype} ${reference.reference_name} has an invalid settlement balance`);
      }
      if (allocated > outstanding) throw errors.reference(`Allocated amount exceeds outstanding for ${reference.reference_name}`);

      const invoiceScale = typeof invoice.data.currency_scale === "number" ? invoice.data.currency_scale : transactionScale;
      const invoiceRate = typeof invoice.data.conversion_rate_micros === "number"
        ? invoice.data.conversion_rate_micros
        : 1_000_000;
      const targetHistoricalBase = convertMinor(
        allocated,
        invoiceScale,
        invoiceRate,
        companyScale,
        `references[${index}].target_base_allocated_amount`,
      );
      const targetBaseAllocated = allocated === outstanding
        ? baseOutstanding
        : Math.min(targetHistoricalBase, baseOutstanding);

      total = addMinor([total, allocated], "total allocated amount");
      totalTargetBase = addMinor([totalTargetBase, targetBaseAllocated], "total target base allocated amount");
      references.push({
        ...reference,
        row_id: reference.row_id || `ROW-${index + 1}`,
        allocated_amount_minor: allocated,
        allocated_amount: fromScaledInt(allocated, transactionScale),
        base_allocated_amount_minor: targetBaseAllocated,
        base_allocated_amount: fromScaledInt(targetBaseAllocated, companyScale),
      });
    }

    if (total > sourceRemaining) {
      throw errors.reference(`Payment Allocation exceeds remaining source ${sourceLabel}`, {
        source_voucher_type: sourceVoucherType,
        source_voucher_no: sourceVoucherNo,
        source_remaining_minor: sourceRemaining,
        requested_minor: total,
      });
    }

    const desiredSourceBase = total === sourceRemaining
      ? sourceBaseRemaining
      : Math.min(
        convertMinor(total, transactionScale, sourceRate, companyScale, "total source base allocated amount"),
        sourceBaseRemaining,
      );
    let cumulativeAllocated = 0;
    let cumulativeSourceBase = 0;
    for (const [index, reference] of references.entries()) {
      cumulativeAllocated = addMinor(
        [cumulativeAllocated, reference.allocated_amount_minor ?? 0],
        "cumulative source allocation",
      );
      const cumulativeTargetBase = index === references.length - 1
        ? desiredSourceBase
        : Math.min(
          convertMinor(
            cumulativeAllocated,
            transactionScale,
            sourceRate,
            companyScale,
            `references[${index}].cumulative_source_base_allocated_amount`,
          ),
          desiredSourceBase,
        );
      const sourceBaseAllocated = cumulativeTargetBase - cumulativeSourceBase;
      if (sourceBaseAllocated < 0) {
        throw errors.ledger("Payment Allocation source base distribution became negative");
      }
      reference.source_base_allocated_amount_minor = sourceBaseAllocated;
      reference.source_base_allocated_amount = fromScaledInt(sourceBaseAllocated, companyScale);
      cumulativeSourceBase = cumulativeTargetBase;
    }
    const totalSourceBase = cumulativeSourceBase;
    if (totalSourceBase > sourceBaseRemaining) {
      throw errors.reference(`Payment Allocation exceeds remaining source ${sourceLabel} base balance`, {
        source_voucher_type: sourceVoucherType,
        source_voucher_no: sourceVoucherNo,
        source_base_remaining_minor: sourceBaseRemaining,
        requested_source_base_minor: totalSourceBase,
      });
    }

    const exchangeDifference = totalSourceBase - totalTargetBase;
    let exchangeGainLossAccount = "";
    const companyCurrency = typeof source.data.company_currency === "string"
      ? source.data.company_currency
      : input.currency;
    if (exchangeDifference !== 0) {
      const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
      exchangeGainLossAccount = typeof company?.exchange_gain_loss_account === "string"
        ? company.exchange_gain_loss_account.trim()
        : "";
      if (context.command.action === "submit") {
        if (!exchangeGainLossAccount) {
          throw errors.reference(`Company ${input.company} must define exchange_gain_loss_account for Payment Allocation FX difference`);
        }
        await assertMaster(context as unknown as ControllerContext<JsonObject>, "Account", exchangeGainLossAccount);
      }
    }

    if (context.command.action === "submit") {
      await assertUnlocked(context as unknown as ControllerContext<JsonObject>, input.company, input.posting_at);
    }
    return {
      ...input,
      ...(sourcePaymentEntry ? { source_payment_entry: sourcePaymentEntry } : {}),
      ...(sourceCreditNote ? { source_credit_note: sourceCreditNote } : {}),
      source_voucher_type: sourceVoucherType,
      source_voucher_no: sourceVoucherNo,
      references,
      currency_scale: transactionScale,
      company_currency: companyCurrency,
      company_currency_scale: companyScale,
      total_allocated_amount_minor: total,
      total_allocated_amount: fromScaledInt(total, transactionScale),
      total_base_allocated_amount_minor: totalTargetBase,
      total_base_allocated_amount: fromScaledInt(totalTargetBase, companyScale),
      total_source_base_allocated_amount_minor: totalSourceBase,
      total_source_base_allocated_amount: fromScaledInt(totalSourceBase, companyScale),
      ...(exchangeGainLossAccount ? { exchange_gain_loss_account: exchangeGainLossAccount } : {}),
      exchange_difference_minor: exchangeDifference,
      exchange_difference: fromScaledInt(exchangeDifference, companyScale),
    };
  }

  private ledger(
    context: ControllerContext<PaymentAllocationData>,
    data: PaymentAllocationData,
  ): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    if (context.command.action !== "submit" && context.command.action !== "cancel") {
      return { gl: [], payment: [] };
    }
    const accountType = data.party_type === "Customer" ? "Receivable" : "Payable";
    const scale = data.currency_scale ?? 2;
    const companyScale = data.company_currency_scale ?? scale;
    const companyCurrency = data.company_currency ?? data.currency;
    const normalPayment = data.references.flatMap((reference, index): PaymentLedgerEntry[] => {
      const amount = reference.allocated_amount_minor ?? toScaledInt(reference.allocated_amount, scale);
      const sourceBase = reference.source_base_allocated_amount_minor
        ?? reference.base_allocated_amount_minor
        ?? 0;
      const targetBase = reference.base_allocated_amount_minor ?? 0;
      const row = reference.row_id || `ROW-${index + 1}`;
      return [
        {
          line_key: `SOURCE-${row}`,
          account_type: accountType,
          party_type: data.party_type,
          party: data.party,
          account: data.party_account,
          amount_minor: amount,
          base_amount_minor: sourceBase,
          currency: data.currency,
          currency_scale: scale,
          against_voucher_type: data.source_voucher_type ?? (data.source_credit_note ? "Credit Note" : "Payment Entry"),
          against_voucher_no: data.source_voucher_no ?? data.source_credit_note ?? data.source_payment_entry!,
          posting_at: data.posting_at,
        },
        {
          line_key: `TARGET-${row}`,
          account_type: accountType,
          party_type: data.party_type,
          party: data.party,
          account: data.party_account,
          amount_minor: -amount,
          base_amount_minor: -targetBase,
          currency: data.currency,
          currency_scale: scale,
          against_voucher_type: reference.reference_doctype,
          against_voucher_no: reference.reference_name,
          posting_at: data.posting_at,
        },
      ];
    });

    const difference = data.exchange_difference_minor
      ?? ((data.total_source_base_allocated_amount_minor ?? 0) - (data.total_base_allocated_amount_minor ?? 0));
    const normalGl: GeneralLedgerEntry[] = [];
    if (difference !== 0) {
      if (!data.exchange_gain_loss_account) {
        throw errors.validation("exchange_gain_loss_account is required for Payment Allocation exchange difference");
      }
      const customer = data.party_type === "Customer";
      const partyDebit = customer ? Math.max(difference, 0) : Math.max(-difference, 0);
      const partyCredit = customer ? Math.max(-difference, 0) : Math.max(difference, 0);
      normalGl.push(
        {
          line_key: "PARTY-EXCHANGE-DIFFERENCE",
          account: data.party_account,
          party_type: data.party_type,
          party: data.party,
          debit_minor: partyDebit,
          credit_minor: partyCredit,
          currency: companyCurrency,
          currency_scale: companyScale,
          posting_at: data.posting_at,
          remarks: `Payment Allocation realized FX for ${data.source_voucher_type ?? (data.source_credit_note ? "Credit Note" : "Payment Entry")} ${data.source_voucher_no ?? data.source_credit_note ?? data.source_payment_entry}`,
        },
        {
          line_key: "EXCHANGE-DIFFERENCE",
          account: data.exchange_gain_loss_account,
          debit_minor: partyCredit,
          credit_minor: partyDebit,
          currency: companyCurrency,
          currency_scale: companyScale,
          posting_at: data.posting_at,
          remarks: "Payment Allocation realized exchange gain/loss",
        },
      );
    }

    return context.command.action === "cancel"
      ? { gl: reverseGl(normalGl), payment: reversePayment(normalPayment) }
      : { gl: normalGl, payment: normalPayment };
  }
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}
