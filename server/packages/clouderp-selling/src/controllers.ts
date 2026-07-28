import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  FulfillmentEntry,
  JsonObject,
  MutationPlan,
  PaymentLedgerEntry,
  StockLedgerEntry,
  StockBundleUsageEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController, O2CStatusMetrics } from "../../document-kernel/src/index.js";
import { deriveO2CStatus, nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment, reverseStock } from "../../ledger/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, negateMinor, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { buildTrackedStockLines, deriveOutgoingValuation } from "../../clouderp-stock/src/index.js";
import { resolveServerPrice } from "../../clouderp-pricing/src/index.js";
import { assertCurrencyScale, calculateSalesTotals } from "./totals.js";
import type { DeliveryNoteData, PaymentEntryData, SalesInvoiceData, SalesItem, SalesOrderData } from "./types.js";

abstract class BaseController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;
  abstract ledger(context: ControllerContext<T>, data: T): Promise<{
    gl?: GeneralLedgerEntry[];
    stock?: StockLedgerEntry[];
    payment?: PaymentLedgerEntry[];
    fulfillment?: FulfillmentEntry[];
    stockBundleUsages?: StockBundleUsageEntry[];
  }> | {
    gl?: GeneralLedgerEntry[];
    stock?: StockLedgerEntry[];
    payment?: PaymentLedgerEntry[];
    fulfillment?: FulfillmentEntry[];
    stockBundleUsages?: StockBundleUsageEntry[];
  };
  abstract eventTypes(context: ControllerContext<T>): string[];

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const data = context.command.action === "cancel"
      ? structuredClone(requireExisting(context).data)
      : await this.normalize(context);
    const command = context.command;
    const docstatus = nextDocStatus(command.action);
    const status = this.status(context, data);
    const createdAt = context.existing?.created_at ?? context.now;
    const children = extractChildren(this.doctype, data);
    const ledger = await this.ledger(context, data);
    const document: CanonicalDocument<T> = {
      tenant_id: command.tenant_id,
      doctype: this.doctype,
      name: command.aggregate.name,
      owner: context.existing?.owner ?? command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: createdAt,
      modified_at: context.now,
      data,
      children,
    };
    const events = this.eventTypes(context).map((type) => domainEvent({
      type,
      tenantId: command.tenant_id,
      aggregate: command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: command.actor.user_id,
      commandId: command.command_id,
      occurredAt: context.now,
      payload: { action: command.action, status },
    }));
    return {
      command,
      document,
      gl_entries: ledger.gl ?? [],
      stock_entries: ledger.stock ?? [],
      payment_entries: ledger.payment ?? [],
      fulfillment_entries: ledger.fulfillment ?? [],
      stock_bundle_usages: ledger.stockBundleUsages ?? [],
      events,
      result: { doctype: this.doctype, name: command.aggregate.name, version: context.nextVersion, docstatus, status },
    };
  }

  protected status(context: ControllerContext<T>, data: T): string {
    return deriveO2CStatus(this.doctype, nextDocStatus(context.command.action), statusMetrics(this.doctype, data));
  }
}

/** Server-computed metrics that drive the derived O2C status label (never client input). */
function statusMetrics(doctype: string, data: JsonObject): O2CStatusMetrics {
  if (doctype === "Sales Order") {
    return {
      deliveredPercentage: Number(data.delivered_percentage ?? 0),
      billedPercentage: Number(data.billed_percentage ?? 0),
    };
  }
  if (doctype === "Sales Invoice") {
    const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
    const grand = typeof data.grand_total_minor === "number"
      ? data.grand_total_minor : toScaledInt(String(data.grand_total ?? "0"), scale);
    const outstanding = typeof data.outstanding_amount_minor === "number" ? data.outstanding_amount_minor : grand;
    return { outstandingMinor: outstanding, grandTotalMinor: grand };
  }
  return {};
}

export class SalesOrderController extends BaseController<SalesOrderData> {
  readonly doctype = "Sales Order";

  async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const input = context.command.document;
    if (!input.customer) throw errors.validation("Customer is required");
    if (!input.company) throw errors.validation("Company is required");
    if (!input.currency) throw errors.validation("Currency is required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.transaction_date);
    const currencyScale = currency.transactionScale;
    const pricedItems = await applySellingPricing(context, input.items, input.selling_price_list, input.currency, input.transaction_date, input.customer, input.customer_group);
    const totals = calculateSalesTotals(pricedItems, input.taxes ?? [], currencyScale, {
      apply_discount_on: input.apply_discount_on,
      additional_discount_percentage: input.additional_discount_percentage,
      discount_amount: input.discount_amount,
    });
    // Master-data EXISTENCE is deliberately validated at submit, not while a
    // lightweight draft is being edited. The posting gate remains authoritative.
    if (context.command.action === "submit") {
      await assertMasterData(context, [
        ["Company", input.company], ["Customer", input.customer], ["Currency", input.currency],
        ...totals.items.map((item): [string, string] => ["Item", item.item_code]),
        ...totals.taxes.map((tax): [string, string] => ["Account", tax.account]),
      ]);
    }
    return {
      ...input,
      currency_scale: currencyScale,
      ...totals,
      ...baseTotals(totals, currency, currencyScale),
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      conversion_rate: fromScaledInt(currency.rateMicros, 6),
      conversion_rate_micros: currency.rateMicros,
      // Progress is server-derived from fulfillment entries and is rehydrated on read.
      delivered_percentage: "0.00",
      billed_percentage: "0.00",
    };
  }

  async ledger(context: ControllerContext<SalesOrderData>): Promise<Record<string, never>> {
    if (context.command.action === "cancel") {
      const used = await context.reader.getFulfilledQuantityMicros(context.command.tenant_id, context.command.aggregate.name);
      if (used !== 0) throw errors.reference("Sales Order cannot be cancelled while submitted delivery or billing documents exist");
    }
    return {};
  }

  eventTypes(context: ControllerContext<SalesOrderData>): string[] {
    if (context.command.action === "submit") return ["sales_order.submitted", "sales_order.status_changed"];
    if (context.command.action === "cancel") return ["sales_order.cancelled", "sales_order.status_changed"];
    return ["sales_order.updated"];
  }
}

export class DeliveryNoteController extends BaseController<DeliveryNoteData> {
  readonly doctype = "Delivery Note";

  async normalize(context: ControllerContext<DeliveryNoteData>): Promise<DeliveryNoteData> {
    const input = context.command.document;
    if (!input.customer || !input.company || !input.currency || !input.against_sales_order) {
      throw errors.validation("Customer, company, currency and Sales Order are required");
    }
    if (input.items.length === 0) throw errors.validation("At least one delivery item is required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.posting_at);
    const currencyScale = currency.transactionScale;
    const items = normalizeStockItems(input.items, currencyScale);
    // Negative stock disables the stock_balance_guard trigger, so it is a
    // server-authoritative decision — never trust the client-supplied flag.
    const allowNegativeStock = resolveAllowNegativeStock(context, input.allow_negative_stock);
    if (context.command.action === "submit") {
      await assertMasterData(context, [
        ["Company", input.company], ["Customer", input.customer], ["Currency", input.currency],
        ...items.map((item): [string, string] => ["Item", item.item_code]),
        ...items.map((item): [string, string] => ["Warehouse", item.warehouse!]),
      ]);
      await assertPostingUnlocked(context, input.company, input.posting_at);
      const salesOrder = await requireSubmittedDocument<SalesOrderData>(context, "Sales Order", input.against_sales_order);
      assertSameCommercialContext(input, salesOrder.data, "Delivery Note", "Sales Order");
      await assertRemainingQuantity(context, {
        source: salesOrder,
        items,
        targetParentDoctype: "Delivery Note",
        referenceField: "against_sales_order",
        referenceName: input.against_sales_order,
        label: "delivered",
      });
      if (!allowNegativeStock) {
        for (const item of items) {
          const balance = await context.reader.getStockBalanceMicros(context.command.tenant_id, item.item_code, item.warehouse!);
          if (balance < (item.qty_micros ?? 0)) {
            throw errors.reference(`Insufficient stock for ${item.item_code} in ${item.warehouse}`, {
              available_qty_micros: balance,
              requested_qty_micros: item.qty_micros ?? 0,
            });
          }
        }
      }
    }
    let valuedItems = items;
    if (context.command.action === "submit") {
      valuedItems = await Promise.all(items.map(async (item, index) => {
        const qty = item.qty_micros ?? toScaledInt(item.qty, 6);
        const valuation = await deriveOutgoingValuation(context as unknown as ControllerContext<JsonObject>, {
          itemCode: item.item_code, warehouse: item.warehouse!, qtyMicros: qty, postingAt: input.posting_at, currencyScale,
        });
        return { ...item, valuation_rate_minor: valuation.valuation_rate_minor, valuation_rate: fromScaledInt(valuation.valuation_rate_minor, currencyScale), stock_value_difference_minor: valuation.stock_value_difference_minor };
      }));
    }
    return { ...input, currency_scale: currencyScale, allow_negative_stock: allowNegativeStock, items: valuedItems };
  }

  async ledger(context: ControllerContext<DeliveryNoteData>, data: DeliveryNoteData): Promise<{ gl: GeneralLedgerEntry[]; stock: StockLedgerEntry[]; fulfillment: FulfillmentEntry[]; stockBundleUsages: StockBundleUsageEntry[] }> {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], stock: [], fulfillment: [], stockBundleUsages: [] };
    const currencyScale = data.currency_scale ?? 2;
    const normal: StockLedgerEntry[] = []; const usages: StockBundleUsageEntry[] = []; const gl: GeneralLedgerEntry[] = [];
    for (const [index,item] of data.items.entries()) {
      const qty = item.qty_micros ?? toScaledInt(item.qty,6);
      const valuationRateMinor = item.valuation_rate_minor ?? toScaledInt(item.valuation_rate ?? item.rate,currencyScale);
      const value = Math.abs(item.stock_value_difference_minor ?? multiplyScaled(item.qty,6,item.valuation_rate ?? item.rate,6,currencyScale));
      const tracked = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, { itemCode:item.item_code,warehouse:item.warehouse!,qtyMicros:qty,direction:"Outward",postingAt:data.posting_at,currency:data.currency,currencyScale,valuationRateMinor,stockValueMinor:value,lineKey:`ITEM-${item.row_id||index+1}`,...(item.serial_and_batch_bundle ? { bundleName:item.serial_and_batch_bundle } : {}),allowNegativeStock:Boolean(data.allow_negative_stock) });
      normal.push(...tracked.stock); usages.push(...tracked.usages);
      const itemMaster=await context.reader.getMasterRecordData(context.command.tenant_id,"Item",item.item_code); const company=await context.reader.getMasterRecordData(context.command.tenant_id,"Company",data.company);
      const stockAccount=await itemAccount(context as unknown as ControllerContext<JsonObject>,itemMaster,"inventory_account","default_inventory_account")
        || (typeof company?.default_inventory_account==="string"?company.default_inventory_account:"");
      const cogsAccount=await itemAccount(context as unknown as ControllerContext<JsonObject>,itemMaster,"cogs_account","default_cogs_account")
        || (typeof company?.default_cogs_account==="string"?company.default_cogs_account:"");
      if(stockAccount&&cogsAccount){gl.push({line_key:`COGS-${item.row_id||index+1}`,account:cogsAccount,debit_minor:value,credit_minor:0,currency:data.currency,currency_scale:currencyScale,posting_at:data.posting_at},{line_key:`STOCK-${item.row_id||index+1}`,account:stockAccount,debit_minor:0,credit_minor:value,currency:data.currency,currency_scale:currencyScale,posting_at:data.posting_at});}
    }
    const fulfillment = data.items.map((item, index): FulfillmentEntry => ({ line_key:`DELIVERY-${item.row_id||index+1}`,sales_order:data.against_sales_order,kind:"Delivery",item_code:item.item_code,qty_micros:item.qty_micros??toScaledInt(item.qty,6),posting_at:data.posting_at }));
    return context.command.action === "cancel" ? { gl:reverseGl(gl),stock:reverseStock(normal),fulfillment:fulfillment.map((line)=>({...line,line_key:`REV-${line.line_key}`,qty_micros:-line.qty_micros})),stockBundleUsages:usages.map((line)=>({...line,line_key:`REV-${line.line_key}`,usage_delta:-1 as const})) } : { gl,stock:normal,fulfillment,stockBundleUsages:usages };
  }

  eventTypes(context: ControllerContext<DeliveryNoteData>): string[] {
    if (context.command.action === "submit") return ["stock.posted", "delivery.updated", "sales_order.progressed"];
    if (context.command.action === "cancel") return ["stock.reversed", "delivery.cancelled", "sales_order.progressed"];
    return ["delivery.updated"];
  }
}

export class SalesInvoiceController extends BaseController<SalesInvoiceData> {
  readonly doctype = "Sales Invoice";

  async normalize(context: ControllerContext<SalesInvoiceData>): Promise<SalesInvoiceData> {
    const input = context.command.document;
    if (!input.customer || !input.company || !input.currency) throw errors.validation("Customer, company and currency are required");
    if (!input.debit_to || !input.default_income_account) throw errors.validation("Receivable and income accounts are required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.posting_at);
    const currencyScale = currency.transactionScale;
    const pricedItems = await applySellingPricing(context, input.items, input.selling_price_list, input.currency, input.posting_at, input.customer, input.customer_group);
    const totals = calculateSalesTotals(pricedItems, input.taxes ?? [], currencyScale, {
      apply_discount_on: input.apply_discount_on,
      additional_discount_percentage: input.additional_discount_percentage,
      discount_amount: input.discount_amount,
    });
    if (totals.rounding_adjustment_minor !== 0 && !input.round_off_account) {
      throw errors.validation("round_off_account is required when rounding adjustment is non-zero");
    }
    if (context.command.action === "submit") {
      const accountRecords: Array<[string, string]> = [
        ["Account", input.debit_to], ["Account", input.default_income_account],
        ...totals.taxes.map((tax): [string, string] => ["Account", tax.account]),
      ];
      if (input.round_off_account) accountRecords.push(["Account", input.round_off_account]);
      await assertMasterData(context, [
        ["Company", input.company], ["Customer", input.customer], ["Currency", input.currency],
        ...accountRecords,
        ...totals.items.map((item): [string, string] => ["Item", item.item_code]),
      ]);
      await assertPostingUnlocked(context, input.company, input.posting_at);
    }
    if (context.command.action === "submit" && input.against_sales_order) {
      const salesOrder = await requireSubmittedDocument<SalesOrderData>(context, "Sales Order", input.against_sales_order);
      assertSameCommercialContext(input, salesOrder.data, "Sales Invoice", "Sales Order");
      await assertRemainingQuantity(context, {
        source: salesOrder,
        items: totals.items,
        targetParentDoctype: "Sales Invoice",
        referenceField: "against_sales_order",
        referenceName: input.against_sales_order,
        label: "billed",
      });
    }
    return {
      ...input,
      currency_scale: currencyScale,
      ...totals,
      ...baseTotals(totals, currency, currencyScale),
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      conversion_rate: fromScaledInt(currency.rateMicros, 6),
      conversion_rate_micros: currency.rateMicros,
      outstanding_amount_minor: totals.grand_total_minor,
      outstanding_amount: totals.grand_total,
    };
  }

  async ledger(context: ControllerContext<SalesInvoiceData>, data: SalesInvoiceData): Promise<{ gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[]; fulfillment: FulfillmentEntry[] }> {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [], fulfillment: [] };
    const transactionScale = data.currency_scale ?? 2;
    const companyScale = data.company_currency_scale ?? transactionScale;
    const companyCurrency = data.company_currency ?? data.currency;
    const rateMicros = data.conversion_rate_micros ?? 1_000_000;
    const grandMinor = data.grand_total_minor ?? toScaledInt(data.grand_total ?? "0", transactionScale);
    if (context.command.action === "cancel") {
      const outstanding = await context.reader.getOutstandingMinor(context.command.tenant_id, "Sales Invoice", context.command.aggregate.name);
      if (outstanding !== grandMinor) {
        throw errors.reference("Sales Invoice cannot be cancelled while active Payment Entries are allocated", {
          outstanding_minor: outstanding,
          invoice_total_minor: grandMinor,
        });
      }
    }
    const netMinor = data.net_total_minor ?? toScaledInt(data.net_total ?? "0", transactionScale);
    const baseGrand = data.base_grand_total_minor ?? convertMinor(grandMinor, transactionScale, rateMicros, companyScale, "base grand total");
    const baseNet = data.base_net_total_minor ?? convertMinor(netMinor, transactionScale, rateMicros, companyScale, "base net total");
    const normal: GeneralLedgerEntry[] = [
      {
        line_key: "RECEIVABLE", account: data.debit_to, party_type: "Customer", party: data.customer,
        debit_minor: baseGrand, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      },
      {
        line_key: "INCOME", account: data.default_income_account,
        debit_minor: 0, credit_minor: baseNet, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      },
    ];
    let componentCredits = baseNet;
    for (const [index, tax] of (data.taxes ?? []).entries()) {
      const transactionTax = tax.tax_amount_minor ?? toScaledInt(tax.tax_amount ?? "0", transactionScale);
      if (transactionTax === 0) continue;
      const baseTax = convertMinor(Math.abs(transactionTax), transactionScale, rateMicros, companyScale, `taxes[${index}].base_tax`);
      componentCredits += transactionTax > 0 ? baseTax : -baseTax;
      normal.push({
        line_key: `TAX-${tax.row_id || index + 1}`, account: tax.account,
        debit_minor: transactionTax < 0 ? baseTax : 0,
        credit_minor: transactionTax > 0 ? baseTax : 0,
        currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      });
    }
    const balanceDifference = baseGrand - componentCredits;
    if (balanceDifference !== 0) {
      if (!data.round_off_account) throw errors.validation("round_off_account is required to balance invoice rounding");
      normal.push({
        line_key: "ROUND-OFF", account: data.round_off_account,
        debit_minor: balanceDifference < 0 ? -balanceDifference : 0,
        credit_minor: balanceDifference > 0 ? balanceDifference : 0,
        currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at,
      });
    }
    const payment: PaymentLedgerEntry[] = [{
      line_key: "RECEIVABLE",
      account_type: "Receivable",
      party_type: "Customer",
      party: data.customer,
      account: data.debit_to,
      amount_minor: grandMinor,
      base_amount_minor: baseGrand,
      currency: data.currency,
      currency_scale: transactionScale,
      against_voucher_type: "Sales Invoice",
      against_voucher_no: context.command.aggregate.name,
      posting_at: data.posting_at,
    }];
    const fulfillment: FulfillmentEntry[] = data.against_sales_order
      ? data.items.map((item, index) => ({
        line_key: `BILLING-${item.row_id || index + 1}`,
        sales_order: data.against_sales_order!,
        kind: "Billing",
        item_code: item.item_code,
        qty_micros: item.qty_micros ?? toScaledInt(item.qty, 6),
        posting_at: data.posting_at,
      }))
      : [];
    return context.command.action === "cancel"
      ? {
        gl: reverseGl(normal),
        payment: reversePayment(payment),
        fulfillment: fulfillment.map((line) => ({ ...line, line_key: `REV-${line.line_key}`, qty_micros: -line.qty_micros })),
      }
      : { gl: normal, payment, fulfillment };
  }

  eventTypes(context: ControllerContext<SalesInvoiceData>): string[] {
    if (context.command.action === "submit") return ["gl.posted", "receivable.updated", "sales_invoice.submitted", "sales_order.progressed"];
    if (context.command.action === "cancel") return ["gl.reversed", "receivable.updated", "sales_invoice.cancelled", "sales_order.progressed"];
    return ["sales_invoice.updated"];
  }
}

export class PaymentEntryController extends BaseController<PaymentEntryData> {
  readonly doctype = "Payment Entry";

  async normalize(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
    const input = context.command.document;
    const receive = input.payment_type === "Receive";
    const pay = input.payment_type === "Pay";
    if (!receive && !pay) throw errors.validation("Payment Entry supports Receive or Pay");
    const expectedPartyType = receive ? "Customer" : "Supplier";
    const referenceDoctype = receive ? "Sales Invoice" : "Purchase Invoice";
    if (input.party_type !== expectedPartyType) throw errors.validation(`${input.payment_type} payment requires ${expectedPartyType} party type`);
    if (!input.party || !input.company || !input.paid_from || !input.paid_to || !input.currency) {
      throw errors.validation("Company, party, accounts and currency are required");
    }
    if (input.references.length === 0) throw errors.validation("At least one payment reference is required");
    const currency = await resolveCurrencyContext(context, input.company, input.currency, input.posting_at);
    const transactionScale = currency.transactionScale;
    const partyAccount = receive ? input.paid_from : input.paid_to;
    const bankAccount = receive ? input.paid_to : input.paid_from;
    if (context.command.action === "submit") {
      const records: Array<[string, string]> = [
        ["Company", input.company], [expectedPartyType, input.party], ["Currency", input.currency],
        ["Account", partyAccount], ["Account", bankAccount],
      ];
      if (input.exchange_gain_loss_account) records.push(["Account", input.exchange_gain_loss_account]);
      await assertMasterData(context, records);
      await assertPostingUnlocked(context, input.company, input.posting_at);
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
    const bankMinor = basePaidMinor;
    const seen = new Set<string>();
    const references = [];
    let baseAllocatedTotal = 0;
    for (const [index, reference] of input.references.entries()) {
      if (reference.reference_doctype !== referenceDoctype) throw errors.validation(`Only ${referenceDoctype} references are supported for ${input.payment_type}`);
      const key = `${reference.reference_doctype}:${reference.reference_name}`;
      if (seen.has(key)) throw errors.validation(`Duplicate payment reference at row ${index + 1}`);
      seen.add(key);
      const allocatedMinor = toScaledInt(reference.allocated_amount, transactionScale, `references[${index}].allocated_amount`);
      if (allocatedMinor <= 0) throw errors.validation(`Allocated amount must be positive at row ${index + 1}`);
      let baseAllocated = convertMinor(allocatedMinor, transactionScale, currency.rateMicros, currency.companyScale, `references[${index}].base_allocated_amount`);
      if (context.command.action === "submit") {
        const invoice = await requireSubmittedDocument<JsonObject>(context, referenceDoctype, reference.reference_name);
        const invoiceParty = receive ? invoice.data.customer : invoice.data.supplier;
        if (invoiceParty !== input.party) throw errors.reference(`${referenceDoctype} ${reference.reference_name} belongs to another ${expectedPartyType.toLowerCase()}`);
        if (invoice.data.company !== input.company) throw errors.reference(`${referenceDoctype} ${reference.reference_name} belongs to another company`);
        if (invoice.data.currency !== input.currency) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another currency`);
        if ((invoice.data.company_currency ?? invoice.data.currency) !== currency.companyCurrency) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another company currency`);
        const invoicePartyAccount = receive ? invoice.data.debit_to : invoice.data.credit_to;
        if (invoicePartyAccount !== partyAccount) throw errors.reference(`${referenceDoctype} ${reference.reference_name} uses another ${receive ? "receivable" : "payable"} account`);
        const outstanding = await context.reader.getOutstandingMinor(context.command.tenant_id, referenceDoctype, reference.reference_name);
        const baseOutstanding = await context.reader.getBaseOutstandingMinor(context.command.tenant_id, referenceDoctype, reference.reference_name);
        if (allocatedMinor > outstanding) throw errors.reference(`Allocated amount exceeds outstanding for ${reference.reference_name}`, { outstanding_minor: outstanding, allocated_minor: allocatedMinor });
        const invoiceScale = typeof invoice.data.currency_scale === "number" ? invoice.data.currency_scale : transactionScale;
        const invoiceRate = typeof invoice.data.conversion_rate_micros === "number" ? invoice.data.conversion_rate_micros : 1_000_000;
        const historicalBase = convertMinor(allocatedMinor, invoiceScale, invoiceRate, currency.companyScale, `references[${index}].historical_base_allocated_amount`);
        baseAllocated = allocatedMinor === outstanding ? baseOutstanding : Math.min(historicalBase, baseOutstanding);
      }
      baseAllocatedTotal = addMinor([baseAllocatedTotal, baseAllocated], "base allocated amount");
      references.push({ ...reference, allocated_amount_minor: allocatedMinor, allocated_amount: fromScaledInt(allocatedMinor, transactionScale), base_allocated_amount_minor: baseAllocated, base_allocated_amount: fromScaledInt(baseAllocated, currency.companyScale) });
    }
    const allocatedMinor = addMinor(references.map((reference) => reference.allocated_amount_minor), "allocated amount");
    if (allocatedMinor !== paidMinor) throw errors.validation("Commercial payments require the full paid amount to be allocated", { paid_minor: paidMinor, allocated_minor: allocatedMinor });
    const differenceMinor = receive ? baseAllocatedTotal - bankMinor : bankMinor - baseAllocatedTotal;
    if (differenceMinor !== 0 && !input.exchange_gain_loss_account) throw errors.validation("exchange_gain_loss_account is required when historical liability and bank amount differ");
    return {
      ...input,
      currency_scale: transactionScale,
      company_currency: currency.companyCurrency,
      company_currency_scale: currency.companyScale,
      source_exchange_rate: fromScaledInt(currency.rateMicros, 6), source_exchange_rate_micros: currency.rateMicros,
      paid_amount_minor: paidMinor, paid_amount: fromScaledInt(paidMinor, transactionScale),
      base_paid_amount_minor: basePaidMinor, base_paid_amount: fromScaledInt(basePaidMinor, currency.companyScale),
      base_party_amount_minor: baseAllocatedTotal, base_party_amount: fromScaledInt(baseAllocatedTotal, currency.companyScale),
      ...(receive ? { base_receivable_amount_minor: baseAllocatedTotal, base_receivable_amount: fromScaledInt(baseAllocatedTotal, currency.companyScale) }
        : { base_payable_amount_minor: baseAllocatedTotal, base_payable_amount: fromScaledInt(baseAllocatedTotal, currency.companyScale) }),
      received_amount_minor: bankMinor, received_amount: fromScaledInt(bankMinor, currency.companyScale),
      difference_amount_minor: differenceMinor, difference_amount: fromScaledInt(differenceMinor, currency.companyScale),
      references, unallocated_amount_minor: 0, unallocated_amount: fromScaledInt(0, transactionScale),
    };
  }

  ledger(context: ControllerContext<PaymentEntryData>, data: PaymentEntryData): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [] };
    const receive = data.payment_type === "Receive";
    const transactionScale = data.currency_scale ?? 2;
    const companyScale = data.company_currency_scale ?? transactionScale;
    const companyCurrency = data.company_currency ?? data.currency;
    const baseParty = data.base_party_amount_minor ?? data.base_receivable_amount_minor ?? data.base_payable_amount_minor
      ?? addMinor(data.references.map((reference) => reference.base_allocated_amount_minor ?? 0), "base party amount");
    const bank = data.received_amount_minor ?? toScaledInt(data.received_amount, companyScale);
    const difference = data.difference_amount_minor ?? (receive ? baseParty - bank : bank - baseParty);
    const partyAccount = receive ? data.paid_from : data.paid_to;
    const bankAccount = receive ? data.paid_to : data.paid_from;
    const normal: GeneralLedgerEntry[] = receive ? [
      { line_key: "BANK", account: bankAccount, debit_minor: bank, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
      { line_key: data.party_type === "Supplier" ? "PAYABLE" : "RECEIVABLE", account: partyAccount, party_type: data.party_type, party: data.party, debit_minor: 0, credit_minor: baseParty, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
    ] : [
      { line_key: data.party_type === "Supplier" ? "PAYABLE" : "RECEIVABLE", account: partyAccount, party_type: data.party_type, party: data.party, debit_minor: baseParty, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
      { line_key: "BANK", account: bankAccount, debit_minor: 0, credit_minor: bank, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at },
    ];
    if (difference !== 0) {
      if (!data.exchange_gain_loss_account) throw errors.validation("exchange_gain_loss_account is required for exchange difference");
      normal.push({ line_key: "EXCHANGE-DIFFERENCE", account: data.exchange_gain_loss_account, debit_minor: difference > 0 ? difference : 0, credit_minor: difference < 0 ? -difference : 0, currency: companyCurrency, currency_scale: companyScale, posting_at: data.posting_at });
    }
    const payment = data.references.map((reference): PaymentLedgerEntry => ({
      line_key: `ALLOC-${reference.row_id}`,
      account_type: receive ? "Receivable" : "Payable",
      party_type: data.party_type, party: data.party, account: partyAccount,
      amount_minor: negateMinor(reference.allocated_amount_minor ?? toScaledInt(reference.allocated_amount, transactionScale)),
      base_amount_minor: negateMinor(reference.base_allocated_amount_minor ?? 0), currency: data.currency, currency_scale: transactionScale,
      against_voucher_type: reference.reference_doctype, against_voucher_no: reference.reference_name, posting_at: data.posting_at,
    }));
    return context.command.action === "cancel" ? { gl: reverseGl(normal), payment: reversePayment(payment) } : { gl: normal, payment };
  }

  eventTypes(context: ControllerContext<PaymentEntryData>): string[] {
    if (context.command.action === "submit") return ["gl.posted", "payment_ledger.posted", "outstanding.updated"];
    if (context.command.action === "cancel") return ["gl.reversed", "payment_ledger.reversed", "outstanding.updated"];
    return ["payment_entry.updated"];
  }
}

function normalizeStockItems(items: SalesItem[], currencyScale: number): SalesItem[] {
  return items.map((item, index) => {
    if (!item.item_code) throw errors.validation(`Item code is required at row ${index + 1}`);
    if (!item.warehouse) throw errors.validation(`Warehouse is required at row ${index + 1}`);
    const qtyMicros = toScaledInt(item.qty, 6, `items[${index}].qty`);
    if (qtyMicros <= 0) throw errors.validation(`Quantity must be positive at row ${index + 1}`);
    const rateMicros = toScaledInt(item.rate, 6, `items[${index}].rate`);
    const valuation = item.valuation_rate ?? item.rate;
    const valuationMicros = toScaledInt(valuation, 6, `items[${index}].valuation_rate`);
    if (rateMicros < 0 || valuationMicros < 0) throw errors.validation(`Rate cannot be negative at row ${index + 1}`);
    return {
      ...item,
      qty: fromScaledInt(qtyMicros, 6),
      rate: fromScaledInt(rateMicros, 6),
      qty_micros: qtyMicros,
      rate_minor: toScaledInt(item.rate, currencyScale),
      valuation_rate: fromScaledInt(valuationMicros, 6),
      valuation_rate_minor: toScaledInt(valuation, currencyScale),
    };
  });
}

async function requireSubmittedDocument<T extends JsonObject>(
  context: ControllerContext<JsonObject>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist`);
  if (document.docstatus !== 1) throw errors.reference(`${doctype} ${name} must be submitted`);
  return document;
}

function assertSameCommercialContext(
  target: { customer: string; company: string; currency: string },
  source: { customer: string; company: string; currency: string },
  targetLabel: string,
  sourceLabel: string,
): void {
  if (target.customer !== source.customer) throw errors.reference(`${targetLabel} customer does not match ${sourceLabel}`);
  if (target.company !== source.company) throw errors.reference(`${targetLabel} company does not match ${sourceLabel}`);
  if (target.currency !== source.currency) throw errors.reference(`${targetLabel} currency does not match ${sourceLabel}`);
}

async function assertRemainingQuantity(
  context: ControllerContext<JsonObject>,
  input: {
    source: CanonicalDocument<SalesOrderData>;
    items: SalesItem[];
    targetParentDoctype: string;
    referenceField: string;
    referenceName: string;
    label: string;
  },
): Promise<void> {
  const orderByItem = aggregateItemQuantity(input.source.data.items);
  const currentByItem = aggregateItemQuantity(input.items);
  for (const [itemCode, requestedMicros] of currentByItem) {
    const orderedMicros = orderByItem.get(itemCode);
    if (orderedMicros === undefined) throw errors.reference(`Item ${itemCode} is not present in Sales Order ${input.referenceName}`);
    const alreadySubmitted = await context.reader.sumSubmittedChildQuantityMicros({
      tenantId: context.command.tenant_id,
      parentDoctype: input.targetParentDoctype,
      referenceField: input.referenceField,
      referenceName: input.referenceName,
      itemCode,
      excludeName: context.command.aggregate.name,
    });
    if (alreadySubmitted + requestedMicros > orderedMicros) {
      throw errors.reference(`Quantity ${input.label} for ${itemCode} exceeds Sales Order quantity`, {
        ordered_qty_micros: orderedMicros,
        already_submitted_qty_micros: alreadySubmitted,
        requested_qty_micros: requestedMicros,
      });
    }
  }
}

function aggregateItemQuantity(items: SalesItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    const micros = item.qty_micros ?? toScaledInt(item.qty, 6, `${item.item_code}.qty`);
    result.set(item.item_code, (result.get(item.item_code) ?? 0) + micros);
  }
  return result;
}

interface ResolvedCurrencyContext {
  transactionScale: number;
  companyCurrency: string;
  companyScale: number;
  rateMicros: number;
}

async function applySellingPricing<T extends SalesItem>(context: ControllerContext<JsonObject>, items: T[], priceList: string | undefined, currency: string, postingDate: string, customer: string, customerGroup?: string): Promise<T[]> {
  if (!priceList) return items;
  return Promise.all(items.map(async (item) => {
    const qtyMicros = item.qty_micros ?? toScaledInt(item.qty, 6);
    const price = await resolveServerPrice(context, { itemCode:item.item_code, qtyMicros, postingDate, priceList, documentCurrency:currency, partyType:"Customer", party:customer, ...(customerGroup?{customerGroup}:{}) });
    return { ...item, rate:price.rate, rate_minor:price.rate_minor, item_price:price.item_price, ...(price.pricing_rule?{pricing_rule:price.pricing_rule}:{}), ...(price.discount_percentage?{discount_percentage:price.discount_percentage}:{}) };
  }));
}

async function resolveCurrencyContext(
  context: ControllerContext<JsonObject>,
  company: string,
  documentCurrency: string,
  postingAt: string,
): Promise<ResolvedCurrencyContext> {
  const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", documentCurrency);
  const transactionScale = masterCurrencyScale(currencyData, documentCurrency, context.command.action === "submit");

  const companyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", company);
  const configuredCurrency = companyData?.default_currency;
  const companyCurrency = typeof configuredCurrency === "string" && configuredCurrency
    ? configuredCurrency
    : documentCurrency;
  if (context.command.action === "submit" && (!companyData || typeof configuredCurrency !== "string" || !configuredCurrency)) {
    throw errors.reference(`Company ${company} must define default_currency`);
  }

  const companyCurrencyData = companyCurrency === documentCurrency
    ? currencyData
    : await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", companyCurrency);
  const companyScale = masterCurrencyScale(companyCurrencyData, companyCurrency, context.command.action === "submit");
  if (companyCurrency === documentCurrency) {
    return { transactionScale, companyCurrency, companyScale, rateMicros: 1_000_000 };
  }

  const postingDate = postingAt.slice(0, 10);
  const names = [`${documentCurrency}:${companyCurrency}:${postingDate}`, `${documentCurrency}:${companyCurrency}`];
  for (const name of names) {
    const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    if (!data) continue;
    const raw = data.rate;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const rateMicros = toScaledInt(raw, 6, `Exchange Rate ${name}`);
    if (rateMicros <= 0) throw errors.reference(`Exchange Rate ${name} must be positive`);
    return { transactionScale, companyCurrency, companyScale, rateMicros };
  }
  throw errors.reference(`Exchange Rate ${documentCurrency}:${companyCurrency} does not exist or is disabled`);
}

function masterCurrencyScale(data: JsonObject | null, currency: string, required: boolean): number {
  const raw = data?.currency_scale;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 && raw <= 6) return raw;
  if (required) throw errors.reference(`Currency ${currency} must define currency_scale`);
  // Drafts may be incomplete, but precision never comes from client input.
  return 2;
}

function convertMinor(
  amountMinor: number,
  sourceScale: number,
  rateMicros: number,
  targetScale: number,
  field: string,
): number {
  return multiplyScaled(fromScaledInt(amountMinor, sourceScale), sourceScale, fromScaledInt(rateMicros, 6), 6, targetScale, field);
}

function baseTotals(
  totals: { net_total_minor: number; total_taxes_and_charges_minor: number; grand_total_minor: number },
  currency: ResolvedCurrencyContext,
  sourceScale: number,
): Pick<SalesOrderData, "base_net_total" | "base_net_total_minor" | "base_total_taxes_and_charges" | "base_total_taxes_and_charges_minor" | "base_grand_total" | "base_grand_total_minor"> {
  const baseNet = convertMinor(totals.net_total_minor, sourceScale, currency.rateMicros, currency.companyScale, "base net total");
  const baseTax = convertMinor(totals.total_taxes_and_charges_minor, sourceScale, currency.rateMicros, currency.companyScale, "base tax total");
  const baseGrand = convertMinor(totals.grand_total_minor, sourceScale, currency.rateMicros, currency.companyScale, "base grand total");
  return {
    base_net_total_minor: baseNet, base_net_total: fromScaledInt(baseNet, currency.companyScale),
    base_total_taxes_and_charges_minor: baseTax, base_total_taxes_and_charges: fromScaledInt(baseTax, currency.companyScale),
    base_grand_total_minor: baseGrand, base_grand_total: fromScaledInt(baseGrand, currency.companyScale),
  };
}

async function assertMasterData(context: ControllerContext<JsonObject>, records: Array<[string, string]>): Promise<void> {
  const unique = new Set(records.map(([type, name]) => `${type}:${name}`));
  for (const key of unique) {
    const separator = key.indexOf(":");
    const recordType = key.slice(0, separator);
    const name = key.slice(separator + 1);
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, recordType, name)) {
      throw errors.reference(`${recordType} ${name} does not exist or is disabled`);
    }
  }
}

/**
 * Tài khoản theo thứ tự Item → nhóm gần nhất → nhóm cha.
 *
 * Item Group là cây nên mặc định kế toán phải kế thừa. Chỉ khai field trên form mà không
 * đọc nó ở bút toán sẽ tạo cảm giác đã cấu hình trong khi sổ vẫn âm thầm dùng Company.
 */
async function itemAccount(
  context: ControllerContext<JsonObject>,
  item: JsonObject | null,
  itemField: string,
  groupField: string,
): Promise<string> {
  const direct = item?.[itemField];
  if (typeof direct === "string" && direct) return direct;
  let groupName = typeof item?.item_group === "string" ? item.item_group : "";
  const seen = new Set<string>();
  for (let depth = 0; groupName && depth < 24 && !seen.has(groupName); depth += 1) {
    seen.add(groupName);
    const group = await context.reader.getMasterRecordData(context.command.tenant_id, "Item Group", groupName);
    if (!group) break;
    const account = group[groupField];
    if (typeof account === "string" && account) return account;
    groupName = typeof group.parent_item_group === "string" ? group.parent_item_group : "";
  }
  return "";
}

async function assertPostingUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lockDate = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (!lockDate) return;
  const postingDate = postingAt.slice(0, 10);
  if (postingDate <= lockDate) {
    throw errors.validation(`Posting date ${postingDate} is locked for ${company}`, { lock_date: lockDate });
  }
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}

/**
 * Negative stock bypasses the stock_balance_guard DB trigger, so only a
 * privileged operator may enable it. An ordinary submitter attempting to set
 * the flag is rejected rather than silently downgraded, to avoid confusion
 * over whether the invariant is in force.
 */
function resolveAllowNegativeStock(context: ControllerContext<JsonObject>, requested: boolean | undefined): boolean {
  if (requested !== true) return false;
  const actor = context.command.actor;
  const privileged = actor.user_id === "Administrator"
    || actor.roles.includes("Administrator")
    || actor.roles.includes("System Manager")
    || actor.roles.includes("Stock Manager");
  if (!privileged) throw errors.permission("Only Stock Manager or System Manager may allow negative stock");
  return true;
}

function extractChildren(parentDoctype: string, data: JsonObject): ChildRow[] {
  const rows: ChildRow[] = [];
  for (const [fieldname, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    for (const [index, candidate] of value.entries()) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const object = candidate as JsonObject;
      const rowId = typeof object.row_id === "string" ? object.row_id : `${fieldname}-${index + 1}`;
      rows.push({ fieldname, child_doctype: childDoctype(parentDoctype, fieldname), row_id: rowId, idx: index + 1, data: object });
    }
  }
  return rows;
}

function childDoctype(parentDoctype: string, fieldname: string): string {
  const mapping: Record<string, Record<string, string>> = {
    "Sales Order": { items: "Sales Order Item", taxes: "Sales Taxes and Charges" },
    "Delivery Note": { items: "Delivery Note Item" },
    "Sales Invoice": { items: "Sales Invoice Item", taxes: "Sales Taxes and Charges" },
    "Payment Entry": { references: "Payment Entry Reference" },
  };
  return mapping[parentDoctype]?.[fieldname] ?? "Dynamic Child";
}
