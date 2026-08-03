import type { CanonicalDocument, ChildRow, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { LeadData, OpportunityData } from "./crm-types.js";
import { SalesOrderController } from "./controllers.js";
import type { QuotationData } from "./quotation-types.js";
import type { SalesOrderData, SalesItem, TaxRow } from "./types.js";

/** Reuses SalesOrder normalization so quotation and order share one pricing/UOM/tax path. */
export class QuotationController implements DocumentController<QuotationData> {
  readonly doctype = "Quotation";
  private readonly salesOrder = new SalesOrderController();

  async buildPlan(context: ControllerContext<QuotationData>): Promise<MutationPlan<QuotationData>> {
    const data = context.command.action === "cancel" ? structuredClone(requireExisting(context).data) : await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action);
    const status = docstatus === 0 ? "Draft" : docstatus === 1 ? "Quoted" : "Cancelled";
    const document: CanonicalDocument<QuotationData> = {
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
      children: quotationChildren(data),
    };
    const type = context.command.action === "submit"
      ? "quotation.submitted"
      : context.command.action === "cancel"
        ? "quotation.cancelled"
        : context.command.action === "create" ? "quotation.created" : "quotation.updated";
    return {
      command: context.command,
      document,
      gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [],
      events: [domainEvent({
        type,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          status,
          customer: data.customer ?? "",
          company: data.company,
          currency: data.currency,
          grand_total: data.grand_total ?? "0",
          revision_no: data.revision_no ?? 1,
          ...(data.crm_deal ? { crm_deal: data.crm_deal } : {}),
          ...(context.command.amended_from ? { amended_from: context.command.amended_from } : {}),
        },
      })],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }

  async normalize(context: ControllerContext<QuotationData>): Promise<QuotationData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableField(context, "company", input.company);
    input.currency = requiredText(input.currency, "Currency");
    assertStableField(context, "currency", input.currency);
    input.transaction_date = requiredText(input.transaction_date, "Quotation date");
    input.valid_till = requiredText(input.valid_till, "Valid till");
    assertDate(input.transaction_date, "Quotation date");
    assertDate(input.valid_till, "Valid till");
    if (input.valid_till < input.transaction_date) throw errors.validation("Quotation valid_till cannot precede transaction_date");
    if (!Array.isArray(input.items) || input.items.length === 0) throw errors.validation("Quotation requires at least one item");
    input.items = input.items.map((row, index) => normalizeItemIdentity(row, index));
    input.taxes = (input.taxes ?? []).map((row, index) => normalizeTaxIdentity(row, index));

    input.crm_deal = optionalText(input.crm_deal);
    input.customer = optionalText(input.customer);
    const customer = await resolveQuotationCustomer(context, input.crm_deal, input.customer, input.company);
    input.customer = customer;
    assertStableField(context, "customer", customer);
    if (context.existing) assertStableField(context, "crm_deal", input.crm_deal);

    input.revision_no = await resolveRevision(context, customer, input.company, input.currency);
    const commercial = await this.salesOrder.normalize(asSalesOrderContext(context, input, customer));
    const { delivered_percentage: _delivered, billed_percentage: _billed, transaction_date: _orderDate, ...shared } = commercial;
    return {
      ...input,
      ...shared,
      customer,
      transaction_date: input.transaction_date,
      valid_till: input.valid_till,
      revision_no: input.revision_no,
      ...(input.crm_deal ? { crm_deal: input.crm_deal } : {}),
    };
  }
}

function asSalesOrderContext(context: ControllerContext<QuotationData>, input: QuotationData, customer: string): ControllerContext<SalesOrderData> {
  const document: SalesOrderData = {
    customer,
    company: input.company,
    currency: input.currency,
    transaction_date: input.transaction_date,
    ...(input.selling_price_list ? { selling_price_list: input.selling_price_list } : {}),
    ...(input.customer_group ? { customer_group: input.customer_group } : {}),
    ...(input.apply_discount_on ? { apply_discount_on: input.apply_discount_on } : {}),
    ...(input.additional_discount_percentage !== undefined ? { additional_discount_percentage: input.additional_discount_percentage } : {}),
    ...(input.discount_amount !== undefined ? { discount_amount: input.discount_amount } : {}),
    items: structuredClone(input.items),
    taxes: structuredClone(input.taxes ?? []),
  };
  return { command: { ...context.command, document }, existing: null, nextVersion: context.nextVersion, reader: context.reader, now: context.now };
}

async function resolveQuotationCustomer(context: ControllerContext<QuotationData>, dealName: string | undefined, suppliedCustomer: string | undefined, company: string): Promise<string> {
  if (!dealName) return requiredText(suppliedCustomer, "Customer or CRM Deal");
  const deal = await requireDocument<OpportunityData>(context, "CRM Deal", dealName);
  if (deal.data.company !== company) throw errors.reference(`CRM Deal ${dealName} belongs to another company`);
  let derived: string;
  if (deal.data.party_type === "Customer") {
    derived = requiredText(deal.data.party, `CRM Deal ${dealName} Customer`);
  } else if (deal.data.party_type === "CRM Lead") {
    const leadName = requiredText(deal.data.party, `CRM Deal ${dealName} Lead`);
    const lead = await requireDocument<LeadData>(context, "CRM Lead", leadName);
    if (lead.data.company !== company) throw errors.reference(`CRM Lead ${leadName} belongs to another company`);
    derived = requiredText(lead.data.converted_customer, `CRM Lead ${leadName} converted Customer`);
    if (lead.data.converted_deal && lead.data.converted_deal !== dealName) throw errors.reference(`CRM Lead ${leadName} was converted through another CRM Deal`);
  } else {
    throw errors.reference(`CRM Deal ${dealName} has no supported customer party`);
  }
  if (suppliedCustomer && suppliedCustomer !== derived) throw errors.reference("Quotation customer does not match CRM Deal customer");
  return derived;
}

async function resolveRevision(context: ControllerContext<QuotationData>, customer: string, company: string, currency: string): Promise<number> {
  if (context.existing) {
    const revision = context.existing.data.revision_no ?? 1;
    if (!Number.isInteger(revision) || revision < 1) throw errors.reference(`Quotation ${context.existing.name} has an invalid revision number`);
    return revision;
  }
  const amendedFrom = context.command.amended_from;
  if (!amendedFrom) return 1;
  if (amendedFrom === context.command.aggregate.name) throw errors.validation("Quotation cannot amend itself");
  const previous = await requireDocument<QuotationData>(context, "Quotation", amendedFrom);
  if (previous.docstatus !== 2) throw errors.lifecycle("A revised Quotation may amend only a cancelled Quotation");
  if (previous.data.customer !== customer || previous.data.company !== company || previous.data.currency !== currency) {
    throw errors.reference("Revised Quotation must keep the same customer, company and currency as the cancelled version");
  }
  const previousRevision = previous.data.revision_no ?? 1;
  if (!Number.isInteger(previousRevision) || previousRevision < 1) throw errors.reference(`Quotation ${amendedFrom} has an invalid revision number`);
  return previousRevision + 1;
}

function normalizeItemIdentity(row: SalesItem, index: number): SalesItem {
  return { ...row, row_id: typeof row.row_id === "string" && row.row_id ? row.row_id : `ROW-${index + 1}` };
}

function normalizeTaxIdentity(row: TaxRow, index: number): TaxRow {
  return { ...row, row_id: typeof row.row_id === "string" && row.row_id ? row.row_id : `TAX-${index + 1}` };
}

function quotationChildren(data: QuotationData): ChildRow[] {
  const rows: ChildRow[] = [];
  for (const [fieldname, childDoctype, values] of [["items", "Quotation Item", data.items], ["taxes", "Quotation Tax", data.taxes ?? []]] as const) {
    for (const [index, value] of values.entries()) {
      const object = value as JsonObject;
      rows.push({ fieldname, child_doctype: childDoctype, row_id: typeof object.row_id === "string" && object.row_id ? object.row_id : `${fieldname}-${index + 1}`, idx: index + 1, data: object });
    }
  }
  return rows;
}

async function requireDocument<R extends JsonObject, T extends JsonObject = JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<CanonicalDocument<R>> {
  const document = await context.reader.getDocument<R>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
  return document;
}

function mergeExisting<T extends JsonObject>(context: ControllerContext<T>): T {
  return { ...(context.existing ? structuredClone(context.existing.data) : {}), ...structuredClone(context.command.document) } as T;
}

function assertStableField<T extends JsonObject>(context: ControllerContext<T>, field: string, next: unknown): void {
  if (!context.existing) return;
  if (JSON.stringify(context.existing.data[field]) !== JSON.stringify(next)) throw errors.lifecycle(`${context.command.aggregate.doctype}.${field} cannot change after creation`);
}

function requiredText(value: unknown, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${label} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation("Quotation text fields must be strings");
  const normalized = value.trim();
  return normalized || undefined;
}

function assertDate(value: string, label: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw errors.validation(`${label} is not a valid date`);
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}
