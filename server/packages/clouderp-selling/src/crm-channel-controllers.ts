import type { CanonicalDocument, ChildRow, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { CrmActivityData } from "./crm-types.js";
import type {
  CrmChannelPartnerData,
  CrmChannelPartnerStatus,
  CrmChannelPartnerType,
  CrmFieldCheckInData,
  CrmFieldCheckInResult,
  CrmSalesRouteData,
  CrmSalesRouteStatus,
  CrmSalesRouteStopData,
  CrmSellOutLine,
  CrmSellOutReportData,
  CrmSellOutStatus,
} from "./crm-channel-types.js";

const PARTNER_TYPES = new Set<CrmChannelPartnerType>(["Distributor", "Dealer"]);
const PARTNER_STATUSES = new Set<CrmChannelPartnerStatus>(["Active", "Inactive"]);
const ROUTE_STATUSES = new Set<CrmSalesRouteStatus>(["Draft", "Active", "Closed"]);
const SELL_OUT_STATUSES = new Set<CrmSellOutStatus>(["Draft", "Confirmed", "Cancelled"]);

abstract class ChannelRecordController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;
  abstract eventTypes(context: ControllerContext<T>, data: T): string[];
  abstract eventPayload(context: ControllerContext<T>, data: T, type: string): JsonObject;
  protected recordStatus(data: T): string { return typeof data.status === "string" && data.status ? data.status : "Active"; }
  protected children(_data: T): ChildRow[] { return []; }

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (["submit", "cancel", "delete", "amend"].includes(context.command.action)) {
      throw errors.lifecycle(`${this.doctype} uses its own CRM lifecycle and cannot use ${context.command.action}`);
    }
    const data = await this.normalize(context);
    const status = this.recordStatus(data);
    const document: CanonicalDocument<T> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: this.children(data),
    };
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: this.eventTypes(context, data).map((type) => domainEvent({
        type,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: this.eventPayload(context, data, type),
      })),
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus: 0, status },
    };
  }
}

export class CrmChannelPartnerController extends ChannelRecordController<CrmChannelPartnerData> {
  readonly doctype = "CRM Channel Partner";

  async normalize(context: ControllerContext<CrmChannelPartnerData>): Promise<CrmChannelPartnerData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Channel Partners");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableField(context, "company", input.company);
    input.partner_name = requiredText(input.partner_name, "Partner name");
    input.partner_type = normalizeEnum(input.partner_type, PARTNER_TYPES, "Partner type");
    input.customer = requiredText(input.customer, "Customer");
    assertStableField(context, "customer", input.customer);
    input.territory = optionalText(input.territory);
    input.assigned_to = optionalText(input.assigned_to);
    input.notes = optionalText(input.notes);
    input.status = normalizeEnum(input.status ?? "Active", PARTNER_STATUSES, "Partner status");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, "Customer", input.customer);
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    if (input.assigned_to) await assertRecord(context, "User", input.assigned_to);

    const hasLat = input.latitude !== undefined && input.latitude !== null && input.latitude !== "";
    const hasLon = input.longitude !== undefined && input.longitude !== null && input.longitude !== "";
    if (hasLat !== hasLon) throw errors.validation("Channel Partner latitude and longitude must be configured together");
    if (hasLat && hasLon) {
      const latitude = finiteNumber(input.latitude, "Latitude");
      const longitude = finiteNumber(input.longitude, "Longitude");
      if (latitude < -90 || latitude > 90) throw errors.validation("Latitude must be between -90 and 90");
      if (longitude < -180 || longitude > 180) throw errors.validation("Longitude must be between -180 and 180");
      input.latitude = String(latitude);
      input.longitude = String(longitude);
      const radius = finiteNumber(input.checkin_radius_m ?? 200, "Check-in radius");
      if (radius <= 0 || radius > 50_000) throw errors.validation("Check-in radius must be greater than 0 and at most 50000 metres");
      input.checkin_radius_m = String(radius);
    } else {
      delete input.latitude;
      delete input.longitude;
      delete input.checkin_radius_m;
    }

    if (input.status === "Active") {
      const partners = await context.reader.listDocumentsByDoctype<CrmChannelPartnerData>(context.command.tenant_id, this.doctype);
      const conflict = partners.find((candidate) => candidate.name !== context.command.aggregate.name
        && candidate.data.company === input.company
        && candidate.data.customer === input.customer
        && (candidate.data.status ?? "Active") === "Active");
      if (conflict) throw errors.validation(`Customer ${input.customer} is already mapped to active CRM Channel Partner ${conflict.name}`);
    }
    return input;
  }

  eventTypes(context: ControllerContext<CrmChannelPartnerData>, data: CrmChannelPartnerData): string[] {
    const events = [context.command.action === "create" ? "crm.channel_partner.created" : "crm.channel_partner.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Inactive") events.push("crm.channel_partner.deactivated");
    if (before === "Inactive" && data.status === "Active") events.push("crm.channel_partner.reactivated");
    return events;
  }

  eventPayload(context: ControllerContext<CrmChannelPartnerData>, data: CrmChannelPartnerData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      partner_type: data.partner_type,
      customer: data.customer,
      status: data.status ?? "Active",
      ...(data.territory ? { territory: data.territory } : {}),
    };
  }
}

export class CrmSalesRouteController extends ChannelRecordController<CrmSalesRouteData> {
  readonly doctype = "CRM Sales Route";

  async normalize(context: ControllerContext<CrmSalesRouteData>): Promise<CrmSalesRouteData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Sales Routes");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableField(context, "company", input.company);
    input.route_name = requiredText(input.route_name, "Route name");
    input.salesperson = requiredText(input.salesperson, "Salesperson");
    assertStableField(context, "salesperson", input.salesperson);
    input.territory = optionalText(input.territory);
    input.start_date = requiredText(input.start_date, "Route start date");
    input.end_date = requiredText(input.end_date, "Route end date");
    input.notes = optionalText(input.notes);
    assertDate(input.start_date, "Route start date");
    assertDate(input.end_date, "Route end date");
    if (input.end_date < input.start_date) throw errors.validation("Route end date cannot precede start date");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, "User", input.salesperson);
    if (input.territory) await assertRecord(context, "Territory", input.territory);

    const nextStatus = normalizeEnum(input.status ?? "Draft", ROUTE_STATUSES, "Sales Route status");
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Draft", ROUTE_STATUSES, "Existing Sales Route status")
      : undefined;
    if (!previousStatus && nextStatus !== "Draft") throw errors.lifecycle("CRM Sales Route must be created Draft");
    if (previousStatus && previousStatus !== nextStatus) {
      const allowed: Record<CrmSalesRouteStatus, ReadonlySet<CrmSalesRouteStatus>> = {
        Draft: new Set(["Active"]), Active: new Set(["Closed"]), Closed: new Set(),
      };
      if (!allowed[previousStatus].has(nextStatus)) throw errors.lifecycle(`CRM Sales Route cannot move from ${previousStatus} to ${nextStatus}`);
    }

    if (nextStatus === "Active") {
      const stops = (await context.reader.listDocumentsByDoctype<CrmSalesRouteStopData>(context.command.tenant_id, "CRM Sales Route Stop"))
        .filter((candidate) => candidate.data.sales_route === context.command.aggregate.name);
      if (!stops.length) throw errors.lifecycle("CRM Sales Route requires at least one stop before activation");
      for (const stop of stops) {
        const partner = await requireDocumentData<CrmChannelPartnerData>(context, "CRM Channel Partner", stop.data.partner);
        if (partner.company !== input.company || (partner.status ?? "Active") !== "Active") {
          throw errors.reference(`Route stop ${stop.name} points to an inactive or cross-company partner`);
        }
      }
      const routes = await context.reader.listDocumentsByDoctype<CrmSalesRouteData>(context.command.tenant_id, this.doctype);
      const overlap = routes.find((candidate) => candidate.name !== context.command.aggregate.name
        && candidate.data.company === input.company
        && candidate.data.salesperson === input.salesperson
        && candidate.data.status === "Active"
        && rangesOverlap(input.start_date, input.end_date, candidate.data.start_date, candidate.data.end_date));
      if (overlap) throw errors.validation(`CRM Sales Route overlaps active route ${overlap.name} for ${input.salesperson}`);
    }
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmSalesRouteData>, data: CrmSalesRouteData): string[] {
    const events = [context.command.action === "create" ? "crm.sales_route.created" : "crm.sales_route.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Active") events.push("crm.sales_route.activated");
    if (before !== data.status && data.status === "Closed") events.push("crm.sales_route.closed");
    return events;
  }

  eventPayload(context: ControllerContext<CrmSalesRouteData>, data: CrmSalesRouteData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, salesperson: data.salesperson, status: data.status ?? "Draft", start_date: data.start_date, end_date: data.end_date };
  }
}

export class CrmSalesRouteStopController extends ChannelRecordController<CrmSalesRouteStopData> {
  readonly doctype = "CRM Sales Route Stop";
  protected recordStatus(): string { return "Planned"; }

  async normalize(context: ControllerContext<CrmSalesRouteStopData>): Promise<CrmSalesRouteStopData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Sales Route Stops");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableField(context, "company", input.company);
    input.sales_route = requiredText(input.sales_route, "Sales Route");
    assertStableField(context, "sales_route", input.sales_route);
    input.partner = requiredText(input.partner, "Channel Partner");
    input.sequence = positiveInteger(input.sequence, "Route stop sequence");
    input.planned_date = requiredText(input.planned_date, "Planned date");
    input.notes = optionalText(input.notes);
    assertDate(input.planned_date, "Planned date");

    const route = await requireDocumentData<CrmSalesRouteData>(context, "CRM Sales Route", input.sales_route);
    if (route.company !== input.company) throw errors.reference("CRM Sales Route belongs to another company");
    if ((route.status ?? "Draft") !== "Draft") throw errors.lifecycle("CRM Sales Route Stops may be changed only while the route is Draft");
    if (input.planned_date < route.start_date || input.planned_date > route.end_date) throw errors.validation("Route stop planned date must fall inside the route date range");
    const partner = await requireDocumentData<CrmChannelPartnerData>(context, "CRM Channel Partner", input.partner);
    if (partner.company !== input.company || (partner.status ?? "Active") !== "Active") throw errors.reference("CRM Channel Partner is inactive or belongs to another company");
    if (route.territory && partner.territory && route.territory !== partner.territory) throw errors.reference("CRM Channel Partner territory does not match Sales Route territory");

    const stops = await context.reader.listDocumentsByDoctype<CrmSalesRouteStopData>(context.command.tenant_id, this.doctype);
    const conflict = stops.find((candidate) => candidate.name !== context.command.aggregate.name
      && candidate.data.sales_route === input.sales_route
      && (candidate.data.sequence === input.sequence || candidate.data.partner === input.partner));
    if (conflict) throw errors.validation(`CRM Sales Route Stop conflicts with ${conflict.name} by sequence or partner`);
    return input;
  }

  eventTypes(context: ControllerContext<CrmSalesRouteStopData>): string[] {
    return [context.command.action === "create" ? "crm.sales_route_stop.created" : "crm.sales_route_stop.updated"];
  }

  eventPayload(context: ControllerContext<CrmSalesRouteStopData>, data: CrmSalesRouteStopData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, sales_route: data.sales_route, partner: data.partner, sequence: data.sequence, planned_date: data.planned_date };
  }
}

export class CrmFieldCheckInController extends ChannelRecordController<CrmFieldCheckInData> {
  readonly doctype = "CRM Field Check-In";
  protected recordStatus(data: CrmFieldCheckInData): string { return data.result ?? "Location Unconfigured"; }

  async normalize(context: ControllerContext<CrmFieldCheckInData>): Promise<CrmFieldCheckInData> {
    if (context.command.action !== "create") throw errors.lifecycle("CRM Field Check-In is immutable evidence; create a new record for corrections");
    const input = structuredClone(context.command.document);
    input.company = requiredText(input.company, "Company");
    input.partner = requiredText(input.partner, "Channel Partner");
    input.salesperson = requiredText(input.salesperson, "Salesperson");
    input.sales_route = optionalText(input.sales_route);
    input.route_stop = optionalText(input.route_stop);
    input.crm_activity = optionalText(input.crm_activity);
    input.notes = optionalText(input.notes);
    const actorIsManager = isSalesManager(context.command.actor.roles);
    if (!actorIsManager && input.salesperson !== context.command.actor.user_id) throw errors.permission("Sales User may create field check-in evidence only for themselves");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, "User", input.salesperson);

    const partner = await requireDocumentData<CrmChannelPartnerData>(context, "CRM Channel Partner", input.partner);
    if (partner.company !== input.company || (partner.status ?? "Active") !== "Active") throw errors.reference("CRM Channel Partner is inactive or belongs to another company");
    input.checked_in_at = context.now;
    const date = context.now.slice(0, 10);

    if (input.sales_route) {
      const route = await requireDocumentData<CrmSalesRouteData>(context, "CRM Sales Route", input.sales_route);
      if (route.company !== input.company || route.status !== "Active") throw errors.reference("CRM Sales Route is not active for this company");
      if (route.salesperson !== input.salesperson) throw errors.reference("Field check-in salesperson does not match CRM Sales Route");
      if (date < route.start_date || date > route.end_date) throw errors.lifecycle("Field check-in time is outside the active Sales Route date range");
    }
    if (input.route_stop) {
      if (!input.sales_route) throw errors.validation("Route stop requires a Sales Route reference");
      const stop = await requireDocumentData<CrmSalesRouteStopData>(context, "CRM Sales Route Stop", input.route_stop);
      if (stop.sales_route !== input.sales_route || stop.partner !== input.partner || stop.company !== input.company) throw errors.reference("CRM Sales Route Stop does not match route, partner or company");
    }
    if (input.crm_activity) {
      const activity = await requireDocumentData<CrmActivityData>(context, "CRM Activity", input.crm_activity);
      if (activity.company !== input.company) throw errors.reference("CRM Activity belongs to another company");
    }

    const latitude = finiteNumber(input.latitude, "Check-in latitude");
    const longitude = finiteNumber(input.longitude, "Check-in longitude");
    if (latitude < -90 || latitude > 90) throw errors.validation("Check-in latitude must be between -90 and 90");
    if (longitude < -180 || longitude > 180) throw errors.validation("Check-in longitude must be between -180 and 180");
    input.latitude = String(latitude);
    input.longitude = String(longitude);

    const partnerHasLocation = partner.latitude !== undefined && partner.longitude !== undefined;
    let result: CrmFieldCheckInResult = "Location Unconfigured";
    delete input.distance_m;
    if (partnerHasLocation) {
      const distance = haversineMetres(latitude, longitude, finiteNumber(partner.latitude, "Partner latitude"), finiteNumber(partner.longitude, "Partner longitude"));
      const radius = finiteNumber(partner.checkin_radius_m ?? 200, "Partner check-in radius");
      input.distance_m = distance.toFixed(2);
      result = distance <= radius ? "Inside Radius" : "Outside Radius";
    }
    input.result = result;
    return input;
  }

  eventTypes(): string[] { return ["crm.field_check_in.recorded"]; }

  eventPayload(_context: ControllerContext<CrmFieldCheckInData>, data: CrmFieldCheckInData, _type: string): JsonObject {
    return {
      company: data.company,
      partner: data.partner,
      salesperson: data.salesperson,
      result: data.result ?? "Location Unconfigured",
      ...(data.distance_m ? { distance_m: data.distance_m } : {}),
      ...(data.sales_route ? { sales_route: data.sales_route } : {}),
      ...(data.route_stop ? { route_stop: data.route_stop } : {}),
      ...(data.crm_activity ? { crm_activity: data.crm_activity } : {}),
    };
  }
}

export class CrmSellOutReportController extends ChannelRecordController<CrmSellOutReportData> {
  readonly doctype = "CRM Sell Out Report";
  protected children(data: CrmSellOutReportData): ChildRow[] {
    return data.lines.map((line, index) => ({ fieldname: "lines", child_doctype: "CRM Sell Out Line", row_id: line.row_id, idx: index + 1, data: line }));
  }

  async normalize(context: ControllerContext<CrmSellOutReportData>): Promise<CrmSellOutReportData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableField(context, "company", input.company);
    input.partner = requiredText(input.partner, "Channel Partner");
    assertStableField(context, "partner", input.partner);
    input.report_date = requiredText(input.report_date, "Sell-out report date");
    assertDate(input.report_date, "Sell-out report date");
    input.currency = requiredText(input.currency, "Currency");
    assertStableField(context, "currency", input.currency);
    input.notes = optionalText(input.notes);
    if (!Array.isArray(input.lines) || !input.lines.length) throw errors.validation("CRM Sell Out Report requires at least one line");
    await assertRecord(context, "Company", input.company);
    const partner = await requireDocumentData<CrmChannelPartnerData>(context, "CRM Channel Partner", input.partner);
    if (partner.company !== input.company || (partner.status ?? "Active") !== "Active") throw errors.reference("CRM Channel Partner is inactive or belongs to another company");
    const scale = await currencyScale(context, input.currency);
    const seenItems = new Set<string>();
    const lines: CrmSellOutLine[] = [];
    for (const [index, raw] of input.lines.entries()) {
      const itemCode = requiredText(raw.item_code, `lines[${index}].item_code`);
      if (seenItems.has(itemCode)) throw errors.validation(`Duplicate sell-out item ${itemCode}`);
      seenItems.add(itemCode);
      await assertRecord(context, "Item", itemCode);
      const qtyMicros = toScaledInt(raw.qty, 6, `lines[${index}].qty`);
      if (qtyMicros <= 0) throw errors.validation(`Sell-out quantity must be positive at row ${index + 1}`);
      const priceMinor = toScaledInt(raw.unit_price, scale, `lines[${index}].unit_price`);
      if (priceMinor < 0) throw errors.validation(`Sell-out unit price cannot be negative at row ${index + 1}`);
      const amountMinor = multiplyScaled(fromScaledInt(qtyMicros, 6), 6, fromScaledInt(priceMinor, scale), scale, scale, `lines[${index}].amount`);
      lines.push({
        ...raw,
        row_id: typeof raw.row_id === "string" && raw.row_id ? raw.row_id : `ROW-${index + 1}`,
        item_code: itemCode,
        qty: fromScaledInt(qtyMicros, 6), qty_micros: qtyMicros,
        unit_price: fromScaledInt(priceMinor, scale), unit_price_minor: priceMinor,
        amount: fromScaledInt(amountMinor, scale), amount_minor: amountMinor,
      });
    }
    input.lines = lines;
    const total = addMinor(lines.map((line) => line.amount_minor ?? 0), "sell-out total");
    input.total_amount_minor = total;
    input.total_amount = fromScaledInt(total, scale);

    const nextStatus = normalizeEnum(input.status ?? "Draft", SELL_OUT_STATUSES, "Sell-out status");
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Draft", SELL_OUT_STATUSES, "Existing sell-out status")
      : undefined;
    if (!previousStatus && nextStatus !== "Draft") throw errors.lifecycle("CRM Sell Out Report must be created Draft");
    if (previousStatus === "Cancelled") throw errors.lifecycle("Cancelled CRM Sell Out Report is immutable");
    if (previousStatus === "Confirmed" && nextStatus === "Confirmed") throw errors.lifecycle("Confirmed CRM Sell Out Report is immutable; cancel it before correction");
    if (previousStatus && previousStatus !== nextStatus) {
      if (previousStatus === "Draft" && (nextStatus === "Confirmed" || nextStatus === "Cancelled")) {
        assertSalesManager(context.command.actor.roles, "Only a Sales Manager may confirm or cancel CRM Sell Out Reports");
      } else if (previousStatus === "Confirmed" && nextStatus === "Cancelled") {
        assertSalesManager(context.command.actor.roles, "Only a Sales Manager may cancel confirmed CRM Sell Out Reports");
      } else {
        throw errors.lifecycle(`CRM Sell Out Report cannot move from ${previousStatus} to ${nextStatus}`);
      }
    }
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmSellOutReportData>, data: CrmSellOutReportData): string[] {
    const events = [context.command.action === "create" ? "crm.sell_out.created" : "crm.sell_out.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Confirmed") events.push("crm.sell_out.confirmed");
    if (before !== data.status && data.status === "Cancelled") events.push("crm.sell_out.cancelled");
    return events;
  }

  eventPayload(context: ControllerContext<CrmSellOutReportData>, data: CrmSellOutReportData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      partner: data.partner,
      report_date: data.report_date,
      currency: data.currency,
      total_amount: data.total_amount ?? "0",
      status: data.status ?? "Draft",
      line_count: data.lines.length,
    };
  }
}

async function currencyScale<T extends JsonObject>(context: ControllerContext<T>, currency: string): Promise<number> {
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = master?.currency_scale;
  if (typeof scale !== "number" || !Number.isSafeInteger(scale) || scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} must define currency_scale`);
  return scale;
}

async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  const tenantId = context.command.tenant_id;
  if (await context.reader.hasMasterRecord(tenantId, doctype, name)) return;
  if (await context.reader.getDocument(tenantId, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

async function requireDocumentData<R extends JsonObject, T extends JsonObject = JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<R> {
  const document = await context.reader.getDocument<R>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
  return document.data;
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
  if (typeof value !== "string") throw errors.validation("CRM channel text fields must be strings");
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`);
  return value as T;
}

function finiteNumber(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) throw errors.validation(`${label} must be a finite number`);
  return number;
}

function positiveInteger(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isSafeInteger(number) || number <= 0) throw errors.validation(`${label} must be a positive integer`);
  return number;
}

function assertDate(value: string, label: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw errors.validation(`${label} is not a valid date`);
}

function rangesOverlap(startA: string, endA: string, startB: unknown, endB: unknown): boolean {
  return typeof startB === "string" && typeof endB === "string" && startA <= endB && startB <= endA;
}

function isSalesManager(roles: string[]): boolean {
  return roles.some((role) => role === "Sales Manager" || role === "System Manager");
}

function assertSalesManager(roles: string[], message: string): void {
  if (!isSalesManager(roles)) throw errors.permission(message);
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
