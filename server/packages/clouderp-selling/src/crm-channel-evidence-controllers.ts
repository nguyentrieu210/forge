import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { CrmCampaignData } from "./crm-marketing-types.js";
import type { CrmChannelPartnerData, CrmFieldCheckInData } from "./crm-channel-types.js";
import type { CrmPromotionExecutionData, CrmPromotionExecutionStatus, CrmSellInSnapshotData } from "./crm-channel-evidence-types.js";
import type { SalesOrderData } from "./types.js";

const PROMOTION_STATUSES = new Set<CrmPromotionExecutionStatus>(["Planned", "Executed", "Cancelled"]);

export class CrmSellInSnapshotController implements DocumentController<CrmSellInSnapshotData> {
  readonly doctype = "CRM Sell In Snapshot";

  async buildPlan(context: ControllerContext<CrmSellInSnapshotData>): Promise<MutationPlan<CrmSellInSnapshotData>> {
    if (context.command.action !== "create") throw errors.lifecycle("CRM Sell In Snapshot is immutable evidence; record a new Sales Order version snapshot instead");
    const data = await this.normalize(context);
    return simplePlan(context, this.doctype, data, "Recorded", "crm.sell_in.recorded", {
      company: data.company,
      partner: data.partner,
      sales_order: data.sales_order,
      sales_order_version: data.sales_order_version ?? 0,
      order_status: data.order_status ?? "",
      order_docstatus: data.order_docstatus ?? 0,
      currency: data.currency ?? "",
      order_total: data.order_total ?? "0",
      recorded_at: data.recorded_at ?? context.now,
    });
  }

  async normalize(context: ControllerContext<CrmSellInSnapshotData>): Promise<CrmSellInSnapshotData> {
    const company = requiredText(context.command.document.company, "Company");
    const partnerName = requiredText(context.command.document.partner, "CRM Channel Partner");
    const salesOrderName = requiredText(context.command.document.sales_order, "Sales Order");
    const partner = await requireDocument<CrmChannelPartnerData>(context, "CRM Channel Partner", partnerName);
    if (partner.data.company !== company || (partner.data.status ?? "Active") !== "Active") throw errors.reference("CRM Channel Partner is inactive or belongs to another company");
    const order = await requireDocument<SalesOrderData>(context, "Sales Order", salesOrderName);
    if (order.data.company !== company) throw errors.reference("Sales Order belongs to another company");
    if (order.data.customer !== partner.data.customer) throw errors.reference("Sales Order customer does not match CRM Channel Partner customer");
    const snapshots = await context.reader.listDocumentsByDoctype<CrmSellInSnapshotData>(context.command.tenant_id, this.doctype);
    const duplicate = snapshots.find((candidate) => candidate.data.sales_order === salesOrderName && candidate.data.sales_order_version === order.version);
    if (duplicate) throw errors.validation(`Sales Order ${salesOrderName} version ${order.version} is already snapshotted as ${duplicate.name}`);
    return {
      company,
      partner: partnerName,
      sales_order: salesOrderName,
      sales_order_version: order.version,
      order_status: order.status,
      order_docstatus: order.docstatus,
      currency: requiredText(order.data.currency, "Sales Order currency"),
      order_total: requiredText(order.data.grand_total ?? "0", "Sales Order grand total"),
      recorded_at: context.now,
    };
  }
}

export class CrmPromotionExecutionController implements DocumentController<CrmPromotionExecutionData> {
  readonly doctype = "CRM Promotion Execution";

  async buildPlan(context: ControllerContext<CrmPromotionExecutionData>): Promise<MutationPlan<CrmPromotionExecutionData>> {
    if (context.command.action === "submit" || context.command.action === "cancel") throw errors.lifecycle("CRM Promotion Execution uses its own lifecycle states");
    const data = await this.normalize(context);
    const status = data.status ?? "Planned";
    const before = context.existing?.data.status;
    const events = [context.command.action === "create" ? "crm.promotion_execution.created" : "crm.promotion_execution.updated"];
    if (before !== status && status === "Executed") events.push("crm.promotion_execution.executed");
    if (before !== status && status === "Cancelled") events.push("crm.promotion_execution.cancelled");
    return planWithEvents(context, this.doctype, data, status, events, {
      company: data.company,
      campaign: data.campaign,
      partner: data.partner,
      salesperson: data.salesperson,
      planned_date: data.planned_date,
      status,
      ...(data.field_check_in ? { field_check_in: data.field_check_in } : {}),
      ...(data.executed_at ? { executed_at: data.executed_at } : {}),
    });
  }

  async normalize(context: ControllerContext<CrmPromotionExecutionData>): Promise<CrmPromotionExecutionData> {
    const input = { ...(context.existing ? structuredClone(context.existing.data) : {}), ...structuredClone(context.command.document) } as CrmPromotionExecutionData;
    input.company = requiredText(input.company, "Company");
    stable(context, "company", input.company);
    input.campaign = requiredText(input.campaign, "CRM Campaign");
    stable(context, "campaign", input.campaign);
    input.partner = requiredText(input.partner, "CRM Channel Partner");
    stable(context, "partner", input.partner);
    input.salesperson = requiredText(input.salesperson, "Salesperson");
    stable(context, "salesperson", input.salesperson);
    input.planned_date = requiredText(input.planned_date, "Planned date");
    assertDate(input.planned_date, "Planned date");
    input.field_check_in = optionalText(input.field_check_in);
    input.notes = optionalText(input.notes);

    const partner = await requireDocument<CrmChannelPartnerData>(context, "CRM Channel Partner", input.partner);
    if (partner.data.company !== input.company || (partner.data.status ?? "Active") !== "Active") throw errors.reference("CRM Channel Partner is inactive or belongs to another company");
    const campaign = await requireDocument<CrmCampaignData>(context, "CRM Campaign", input.campaign);
    if (campaign.data.company !== input.company) throw errors.reference("CRM Campaign belongs to another company");
    await assertRecord(context, "User", input.salesperson);
    if (context.command.action === "create" && !isSalesManager(context.command.actor.roles)) throw errors.permission("Only a Sales Manager may plan CRM Promotion Execution");

    const next = enumValue(input.status ?? "Planned", PROMOTION_STATUSES, "Promotion execution status");
    const previous = context.existing ? enumValue(context.existing.data.status ?? "Planned", PROMOTION_STATUSES, "Existing promotion execution status") : undefined;
    if (!previous && next !== "Planned") throw errors.lifecycle("CRM Promotion Execution must be created Planned");
    if (previous === "Cancelled") throw errors.lifecycle("Cancelled CRM Promotion Execution is immutable");
    if (previous === "Executed" && next === "Executed") throw errors.lifecycle("Executed CRM Promotion Execution is immutable; cancel it before correction");
    if (previous && previous !== next) {
      if (previous === "Planned" && next === "Executed") {
        if (!isSalesManager(context.command.actor.roles) && context.command.actor.user_id !== input.salesperson) throw errors.permission("Only the assigned salesperson or Sales Manager may execute a promotion");
        if (campaign.data.status !== "Active") throw errors.lifecycle("CRM Campaign must be Active when promotion execution is recorded");
        input.field_check_in = requiredText(input.field_check_in, "Field check-in evidence");
        const checkin = await requireDocument<CrmFieldCheckInData>(context, "CRM Field Check-In", input.field_check_in);
        if (checkin.data.company !== input.company || checkin.data.partner !== input.partner || checkin.data.salesperson !== input.salesperson) throw errors.reference("Field check-in evidence does not match promotion company, partner or salesperson");
        if (checkin.data.result === "Outside Radius") throw errors.lifecycle("Promotion execution cannot use an Outside Radius field check-in");
        input.executed_at = context.now;
      } else if ((previous === "Planned" || previous === "Executed") && next === "Cancelled") {
        if (!isSalesManager(context.command.actor.roles)) throw errors.permission("Only a Sales Manager may cancel CRM Promotion Execution");
      } else {
        throw errors.lifecycle(`CRM Promotion Execution cannot move from ${previous} to ${next}`);
      }
    }
    if (next !== "Executed") delete input.executed_at;
    input.status = next;
    return input;
  }
}

function simplePlan<T extends JsonObject>(context: ControllerContext<T>, doctype: string, data: T, status: string, eventType: string, payload: JsonObject): MutationPlan<T> {
  return planWithEvents(context, doctype, data, status, [eventType], payload);
}
function planWithEvents<T extends JsonObject>(context: ControllerContext<T>, doctype: string, data: T, status: string, eventTypes: string[], payload: JsonObject): MutationPlan<T> {
  const document: CanonicalDocument<T> = { tenant_id: context.command.tenant_id, doctype, name: context.command.aggregate.name, owner: context.existing?.owner ?? context.command.actor.user_id, docstatus: 0, status, version: context.nextVersion, created_at: context.existing?.created_at ?? context.now, modified_at: context.now, data, children: [] };
  return { command: context.command, document, gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [], events: eventTypes.map((type) => domainEvent({ type, tenantId: context.command.tenant_id, aggregate: context.command.aggregate, aggregateVersion: context.nextVersion, actor: context.command.actor.user_id, commandId: context.command.command_id, occurredAt: context.now, payload })), result: { doctype, name: document.name, version: document.version, docstatus: 0, status } };
}
async function requireDocument<R extends JsonObject, T extends JsonObject = JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<CanonicalDocument<R>> { const doc = await context.reader.getDocument<R>(context.command.tenant_id, doctype, name); if (!doc) throw errors.reference(`${doctype} ${name} does not exist or is unavailable`); return doc; }
async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> { if (await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) return; if (await context.reader.getDocument(context.command.tenant_id, doctype, name)) return; throw errors.reference(`${doctype} ${name} does not exist or is unavailable`); }
function stable<T extends JsonObject>(context: ControllerContext<T>, field: string, next: unknown): void { if (context.existing && JSON.stringify(context.existing.data[field]) !== JSON.stringify(next)) throw errors.lifecycle(`${context.command.aggregate.doctype}.${field} cannot change after creation`); }
function requiredText(value: unknown, label: string): string { const text = optionalText(value); if (!text) throw errors.validation(`${label} is required`); return text; }
function optionalText(value: unknown): string | undefined { if (value === undefined || value === null || value === "") return undefined; if (typeof value !== "string") throw errors.validation("CRM evidence text fields must be strings"); const text = value.trim(); return text || undefined; }
function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`); return value as T; }
function assertDate(value: string, label: string): void { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`); const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))); if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw errors.validation(`${label} is not a valid date`); }
function isSalesManager(roles: string[]): boolean { return roles.some((role) => role === "Sales Manager" || role === "System Manager"); }
