import type { CanonicalDocument, ChildRow, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { addMinor, fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { CrmContactData, CrmOrganizationData } from "./crm-directory-types.js";
import type { CrmActivityData, LeadData, OpportunityData } from "./crm-types.js";
import type {
  CrmCustomer360ActivityData,
  CrmCustomer360CurrencyData,
  CrmCustomer360Data,
} from "./crm-customer-360-types.js";
import type { QuotationData } from "./quotation-types.js";
import type { DeliveryNoteData, PaymentEntryData, SalesInvoiceData, SalesOrderData } from "./types.js";

const ANALYTIC_SCALE = 6;
const MAX_RECENT_ACTIVITIES = 50;

type MoneyBucket = {
  pipeline: number;
  weightedPipeline: number;
  wonDeal: number;
  quoted: number;
  ordered: number;
  invoiced: number;
  outstanding: number;
  received: number;
};

/**
 * Refreshable CRM Customer 360 read model.
 *
 * This document is deliberately a snapshot, not a second source of truth. Every
 * create/save recomputes server-owned fields from canonical tenant documents and
 * stores an explicit as_of timestamp. Currency buckets are never combined across
 * currencies, and all amount arithmetic is fixed-point at six decimal places.
 */
export class CrmCustomer360Controller implements DocumentController<CrmCustomer360Data> {
  readonly doctype = "CRM Customer 360";

  async buildPlan(context: ControllerContext<CrmCustomer360Data>): Promise<MutationPlan<CrmCustomer360Data>> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle("CRM Customer 360 is a refreshable snapshot and cannot be submitted or cancelled");
    }

    const existing = context.existing?.data;
    const company = requiredText(context.command.document.company ?? existing?.company, "Company");
    const customer = requiredText(context.command.document.customer ?? existing?.customer, "Customer");
    if (existing) {
      if (existing.company !== company) throw errors.lifecycle("CRM Customer 360 company cannot change after creation");
      if (existing.customer !== customer) throw errors.lifecycle("CRM Customer 360 customer cannot change after creation");
    }

    await assertReference(context, "Company", company);
    await assertReference(context, "Customer", customer);
    if (!context.existing) await assertUniqueSnapshot(context, company, customer);

    const data = await buildSnapshot(context, company, customer);
    const children = buildChildren(data);
    const document: CanonicalDocument<CrmCustomer360Data> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status: "Current",
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children,
    };
    const eventType = context.command.action === "create" ? "crm.customer_360.created" : "crm.customer_360.refreshed";

    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: [domainEvent({
        type: eventType,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          company,
          customer,
          as_of: data.as_of,
          organization_count: data.organization_count,
          contact_count: data.contact_count,
          open_deal_count: data.open_deal_count,
          open_activity_count: data.open_activity_count,
          currency_count: data.currency_summary.length,
        },
      })],
      result: {
        doctype: this.doctype,
        name: context.command.aggregate.name,
        version: context.nextVersion,
        docstatus: 0,
        status: "Current",
      },
    };
  }
}

async function buildSnapshot(
  context: ControllerContext<CrmCustomer360Data>,
  company: string,
  customer: string,
): Promise<CrmCustomer360Data> {
  const tenantId = context.command.tenant_id;
  const [leads, deals, activities, organizations, contacts, quotations, orders, deliveries, invoices, payments] = await Promise.all([
    context.reader.listDocumentsByDoctype<LeadData>(tenantId, "CRM Lead"),
    context.reader.listDocumentsByDoctype<OpportunityData>(tenantId, "CRM Deal"),
    context.reader.listDocumentsByDoctype<CrmActivityData>(tenantId, "CRM Activity"),
    context.reader.listDocumentsByDoctype<CrmOrganizationData>(tenantId, "CRM Organization"),
    context.reader.listDocumentsByDoctype<CrmContactData>(tenantId, "CRM Contact"),
    context.reader.listDocumentsByDoctype<QuotationData>(tenantId, "Quotation"),
    context.reader.listDocumentsByDoctype<SalesOrderData>(tenantId, "Sales Order"),
    context.reader.listDocumentsByDoctype<DeliveryNoteData>(tenantId, "Delivery Note"),
    context.reader.listDocumentsByDoctype<SalesInvoiceData>(tenantId, "Sales Invoice"),
    context.reader.listDocumentsByDoctype<PaymentEntryData>(tenantId, "Payment Entry"),
  ]);

  const relatedLeads = leads.filter((document) => document.data.company === company && document.data.converted_customer === customer);
  const relatedLeadNames = new Set(relatedLeads.map((document) => document.name));
  const relatedDeals = deals.filter((document) => document.data.company === company && (
    (document.data.party_type === "Customer" && document.data.party === customer)
    || (document.data.party_type === "CRM Lead" && relatedLeadNames.has(document.data.party))
  ));
  const relatedDealNames = new Set(relatedDeals.map((document) => document.name));

  const relatedActivities = activities.filter((document) => document.data.company === company && (
    (document.data.reference_doctype === "Customer" && document.data.reference_name === customer)
    || (document.data.reference_doctype === "CRM Lead" && relatedLeadNames.has(document.data.reference_name))
    || (document.data.reference_doctype === "CRM Deal" && relatedDealNames.has(document.data.reference_name))
  ));
  const activeOrganizations = organizations.filter((document) => document.data.company === company
    && document.data.linked_customer === customer && (document.data.status ?? "Active") === "Active");
  const activeContacts = contacts.filter((document) => document.data.company === company
    && document.data.linked_customer === customer && (document.data.status ?? "Active") === "Active");
  const submittedQuotations = quotations.filter((document) => document.docstatus === 1
    && document.data.company === company && document.data.customer === customer);
  const submittedOrders = orders.filter((document) => document.docstatus === 1
    && document.data.company === company && document.data.customer === customer);
  const submittedDeliveries = deliveries.filter((document) => document.docstatus === 1
    && document.data.company === company && document.data.customer === customer);
  const submittedInvoices = invoices.filter((document) => document.docstatus === 1
    && document.data.company === company && document.data.customer === customer);
  const submittedPayments = payments.filter((document) => document.docstatus === 1
    && document.data.company === company && document.data.payment_type === "Receive"
    && document.data.party_type === "Customer" && document.data.party === customer);

  const recentActivities = relatedActivities
    .slice()
    .sort((left, right) => activityAt(right).localeCompare(activityAt(left)) || right.name.localeCompare(left.name))
    .slice(0, MAX_RECENT_ACTIVITIES)
    .map((document): CrmCustomer360ActivityData => ({
      row_id: document.name,
      activity: document.name,
      activity_type: document.data.activity_type,
      subject: document.data.subject,
      status: document.data.status ?? "Open",
      reference_doctype: document.data.reference_doctype,
      reference_name: document.data.reference_name,
      activity_at: activityAt(document),
      ...(document.data.due_at ? { due_at: document.data.due_at } : {}),
      ...(document.data.assigned_to ? { assigned_to: document.data.assigned_to } : {}),
    }));

  const buckets = new Map<string, MoneyBucket>();
  for (const document of relatedDeals) {
    const bucket = moneyBucket(buckets, requiredText(document.data.currency, `CRM Deal ${document.name} currency`));
    if ((document.data.status ?? "Open") === "Open") {
      bucket.pipeline = addAmount(bucket.pipeline, document.data.opportunity_amount, `CRM Deal ${document.name} pipeline`);
      bucket.weightedPipeline = addAmount(bucket.weightedPipeline, document.data.weighted_value ?? "0", `CRM Deal ${document.name} weighted pipeline`);
    } else if (document.data.status === "Won") {
      bucket.wonDeal = addAmount(bucket.wonDeal, document.data.opportunity_amount, `CRM Deal ${document.name} won value`);
    }
  }
  for (const document of submittedQuotations) {
    const bucket = moneyBucket(buckets, requiredText(document.data.currency, `Quotation ${document.name} currency`));
    bucket.quoted = addAmount(bucket.quoted, document.data.grand_total ?? "0", `Quotation ${document.name} total`);
  }
  for (const document of submittedOrders) {
    const bucket = moneyBucket(buckets, requiredText(document.data.currency, `Sales Order ${document.name} currency`));
    bucket.ordered = addAmount(bucket.ordered, document.data.grand_total ?? "0", `Sales Order ${document.name} total`);
  }

  const invoiceOutstanding = await Promise.all(submittedInvoices.map(async (document) => ({
    document,
    outstanding: await context.reader.getOutstandingMinor(tenantId, "Sales Invoice", document.name),
  })));
  for (const { document, outstanding } of invoiceOutstanding) {
    const currency = requiredText(document.data.currency, `Sales Invoice ${document.name} currency`);
    const bucket = moneyBucket(buckets, currency);
    const grand = toScaledInt(document.data.grand_total ?? "0", ANALYTIC_SCALE, `Sales Invoice ${document.name} total`);
    bucket.invoiced = addMinor([bucket.invoiced, isReturn(document.data) ? -grand : grand], `Customer 360 invoiced ${currency}`);
    const sourceScale = currencyScale(document.data.currency_scale);
    const analyticOutstanding = toScaledInt(fromScaledInt(outstanding, sourceScale), ANALYTIC_SCALE, `Sales Invoice ${document.name} outstanding`);
    bucket.outstanding = addMinor([bucket.outstanding, analyticOutstanding], `Customer 360 outstanding ${currency}`);
  }
  for (const document of submittedPayments) {
    const currency = requiredText(document.data.currency, `Payment Entry ${document.name} currency`);
    const bucket = moneyBucket(buckets, currency);
    bucket.received = addAmount(bucket.received, document.data.paid_amount, `Payment Entry ${document.name} received`);
  }

  const currencySummary = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, bucket]): CrmCustomer360CurrencyData => ({
      row_id: currency,
      currency,
      pipeline_amount: fromScaledInt(bucket.pipeline, ANALYTIC_SCALE),
      weighted_pipeline_amount: fromScaledInt(bucket.weightedPipeline, ANALYTIC_SCALE),
      won_deal_amount: fromScaledInt(bucket.wonDeal, ANALYTIC_SCALE),
      quoted_amount: fromScaledInt(bucket.quoted, ANALYTIC_SCALE),
      ordered_amount: fromScaledInt(bucket.ordered, ANALYTIC_SCALE),
      invoiced_amount: fromScaledInt(bucket.invoiced, ANALYTIC_SCALE),
      outstanding_amount: fromScaledInt(bucket.outstanding, ANALYTIC_SCALE),
      received_amount: fromScaledInt(bucket.received, ANALYTIC_SCALE),
    }));

  const openActivities = relatedActivities.filter((document) => (document.data.status ?? "Open") === "Open");
  const overdueActivities = openActivities.filter((document) => document.data.due_at
    && Date.parse(document.data.due_at) < Date.parse(context.now));

  return {
    company,
    customer,
    as_of: context.now,
    status: "Current",
    organization_count: activeOrganizations.length,
    contact_count: activeContacts.length,
    open_deal_count: relatedDeals.filter((document) => (document.data.status ?? "Open") === "Open").length,
    won_deal_count: relatedDeals.filter((document) => document.data.status === "Won").length,
    lost_deal_count: relatedDeals.filter((document) => document.data.status === "Lost").length,
    open_activity_count: openActivities.length,
    overdue_activity_count: overdueActivities.length,
    quotation_count: submittedQuotations.length,
    sales_order_count: submittedOrders.length,
    delivery_count: submittedDeliveries.length,
    sales_invoice_count: submittedInvoices.length,
    payment_count: submittedPayments.length,
    ...(recentActivities[0] ? { last_activity_at: recentActivities[0].activity_at } : {}),
    currency_summary: currencySummary,
    recent_activities: recentActivities,
  };
}

function buildChildren(data: CrmCustomer360Data): ChildRow[] {
  return [
    ...data.currency_summary.map((row, index): ChildRow => ({
      fieldname: "currency_summary",
      child_doctype: "CRM Customer 360 Currency",
      row_id: row.row_id,
      idx: index + 1,
      data: row,
    })),
    ...data.recent_activities.map((row, index): ChildRow => ({
      fieldname: "recent_activities",
      child_doctype: "CRM Customer 360 Activity",
      row_id: row.row_id,
      idx: index + 1,
      data: row,
    })),
  ];
}

async function assertUniqueSnapshot(context: ControllerContext<CrmCustomer360Data>, company: string, customer: string): Promise<void> {
  const snapshots = await context.reader.listDocumentsByDoctype<CrmCustomer360Data>(context.command.tenant_id, "CRM Customer 360");
  const duplicate = snapshots.find((candidate) => candidate.data.company === company && candidate.data.customer === customer);
  if (duplicate) throw errors.validation(`CRM Customer 360 already exists as ${duplicate.name} for this company and customer`);
}

async function assertReference(context: ControllerContext<CrmCustomer360Data>, doctype: string, name: string): Promise<void> {
  if (await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) return;
  if (await context.reader.getDocument(context.command.tenant_id, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

function moneyBucket(buckets: Map<string, MoneyBucket>, currency: string): MoneyBucket {
  const existing = buckets.get(currency);
  if (existing) return existing;
  const created: MoneyBucket = {
    pipeline: 0,
    weightedPipeline: 0,
    wonDeal: 0,
    quoted: 0,
    ordered: 0,
    invoiced: 0,
    outstanding: 0,
    received: 0,
  };
  buckets.set(currency, created);
  return created;
}

function addAmount(current: number, value: unknown, label: string): number {
  const normalized = value === undefined || value === null || value === "" ? "0" : String(value);
  const delta = toScaledInt(normalized, ANALYTIC_SCALE, label);
  return addMinor([current, delta], label);
}

function activityAt(document: CanonicalDocument<CrmActivityData>): string {
  return document.data.activity_at || document.modified_at;
}

function currencyScale(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6 ? value : 2;
}

function isReturn(data: SalesInvoiceData | JsonObject): boolean {
  const value = (data as JsonObject).is_return;
  return value === true || value === 1 || value === "1";
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  return value.trim();
}
