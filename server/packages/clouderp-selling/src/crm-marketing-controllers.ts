import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { fromScaledInt, percentOfMinor, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { CrmContactData } from "./crm-directory-types.js";
import type {
  CrmAttributionModel,
  CrmAttributionStatus,
  CrmCampaignAttributionData,
  CrmCampaignChannel,
  CrmCampaignData,
  CrmCampaignStatus,
  CrmConsentRequirement,
  CrmMarketingConfigStatus,
  CrmMarketingListData,
  CrmMarketingListMemberData,
  CrmMarketingListStatus,
  CrmMarketingMemberSource,
  CrmMarketingMemberStatus,
  CrmSegmentData,
} from "./crm-marketing-types.js";
import type { OpportunityData } from "./crm-types.js";

const CONFIG_STATUSES = new Set<CrmMarketingConfigStatus>(["Active", "Inactive"]);
const CONSENT_REQUIREMENTS = new Set<CrmConsentRequirement>(["Any", "Granted"]);
const LIST_STATUSES = new Set<CrmMarketingListStatus>(["Draft", "Active", "Archived"]);
const MEMBER_STATUSES = new Set<CrmMarketingMemberStatus>(["Active", "Unsubscribed"]);
const MEMBER_SOURCES = new Set<CrmMarketingMemberSource>(["Manual", "Import", "Segment"]);
const CAMPAIGN_CHANNELS = new Set<CrmCampaignChannel>(["Email", "SMS", "Phone", "Social", "Other"]);
const CAMPAIGN_STATUSES = new Set<CrmCampaignStatus>(["Draft", "Active", "Paused", "Completed", "Cancelled"]);
const ATTRIBUTION_MODELS = new Set<CrmAttributionModel>(["First Touch", "Last Touch", "Influenced"]);
const ATTRIBUTION_STATUSES = new Set<CrmAttributionStatus>(["Active", "Cancelled"]);

abstract class CrmMarketingController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T> | T;
  abstract eventTypes(context: ControllerContext<T>, data: T): string[];
  abstract eventPayload(context: ControllerContext<T>, data: T, type: string): JsonObject;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle(`${this.doctype} uses CRM lifecycle states instead of submit/cancel`);
    }
    const data = await this.normalize(context);
    const status = typeof data.status === "string" && data.status ? data.status : "Active";
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
      children: [],
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
      result: {
        doctype: this.doctype,
        name: context.command.aggregate.name,
        version: context.nextVersion,
        docstatus: 0,
        status,
      },
    };
  }
}

export class CrmSegmentController extends CrmMarketingController<CrmSegmentData> {
  readonly doctype = "CRM Segment";

  async normalize(context: ControllerContext<CrmSegmentData>): Promise<CrmSegmentData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Segments");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.segment_name = requiredText(input.segment_name, "Segment name");
    input.territory = optionalText(input.territory);
    input.lead_source = optionalText(input.lead_source);
    input.consent_requirement = normalizeEnum(input.consent_requirement ?? "Granted", CONSENT_REQUIREMENTS, "Consent requirement");
    input.status = normalizeEnum(input.status ?? "Active", CONFIG_STATUSES, "Segment status");
    input.notes = optionalText(input.notes);
    await assertRecord(context, "Company", input.company);
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    if (input.lead_source) await assertRecord(context, "CRM Lead Source", input.lead_source);
    return input;
  }

  eventTypes(context: ControllerContext<CrmSegmentData>, data: CrmSegmentData): string[] {
    return [context.command.action === "create" ? "crm.segment.created" : "crm.segment.updated"];
  }

  eventPayload(context: ControllerContext<CrmSegmentData>, data: CrmSegmentData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, status: data.status ?? "Active", consent_requirement: data.consent_requirement ?? "Granted" };
  }
}

export class CrmMarketingListController extends CrmMarketingController<CrmMarketingListData> {
  readonly doctype = "CRM Marketing List";

  async normalize(context: ControllerContext<CrmMarketingListData>): Promise<CrmMarketingListData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Marketing Lists");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.list_name = requiredText(input.list_name, "Marketing list name");
    input.segment = optionalText(input.segment);
    input.notes = optionalText(input.notes);
    await assertRecord(context, "Company", input.company);
    if (input.segment) {
      const segment = await requireDocumentData<CrmSegmentData>(context, "CRM Segment", input.segment);
      if (segment.company !== input.company) throw errors.reference("CRM Segment belongs to another company");
      if ((segment.status ?? "Active") !== "Active") throw errors.lifecycle("CRM Segment must be Active while attached to a marketing list");
    }
    const nextStatus = normalizeEnum(input.status ?? "Draft", LIST_STATUSES, "Marketing list status");
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Draft", LIST_STATUSES, "Existing marketing list status")
      : undefined;
    assertListTransition(context.command.action, previousStatus, nextStatus);
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmMarketingListData>, data: CrmMarketingListData): string[] {
    const events = [context.command.action === "create" ? "crm.marketing_list.created" : "crm.marketing_list.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Active") events.push("crm.marketing_list.activated");
    if (before !== data.status && data.status === "Archived") events.push("crm.marketing_list.archived");
    return events;
  }

  eventPayload(context: ControllerContext<CrmMarketingListData>, data: CrmMarketingListData, _type: string): JsonObject {
    return { action: context.command.action, company: data.company, status: data.status ?? "Draft", ...(data.segment ? { segment: data.segment } : {}) };
  }
}

export class CrmMarketingListMemberController extends CrmMarketingController<CrmMarketingListMemberData> {
  readonly doctype = "CRM Marketing List Member";

  async normalize(context: ControllerContext<CrmMarketingListMemberData>): Promise<CrmMarketingListMemberData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.marketing_list = requiredText(input.marketing_list, "Marketing list");
    input.contact = requiredText(input.contact, "CRM Contact");
    input.source = normalizeEnum(input.source ?? "Manual", MEMBER_SOURCES, "Marketing member source");
    input.unsubscribed_reason = optionalText(input.unsubscribed_reason);

    await assertRecord(context, "Company", input.company);
    const list = await requireDocumentData<CrmMarketingListData>(context, "CRM Marketing List", input.marketing_list);
    if (list.company !== input.company) throw errors.reference("CRM Marketing List belongs to another company");
    if ((list.status ?? "Draft") === "Archived") throw errors.lifecycle("Cannot change membership of an archived CRM Marketing List");
    const contact = await requireDocumentData<CrmContactData>(context, "CRM Contact", input.contact);
    if (contact.company !== input.company) throw errors.reference("CRM Contact belongs to another company");

    const nextStatus = normalizeEnum(input.status ?? "Active", MEMBER_STATUSES, "Marketing member status");
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Active", MEMBER_STATUSES, "Existing marketing member status")
      : undefined;
    if (!context.existing) {
      assertSalesManager(context.command.actor.roles, "Only a Sales Manager may add CRM Marketing List members");
      if (nextStatus !== "Active") throw errors.lifecycle("CRM Marketing List Member must be created Active and unsubscribed through a separate action");
      input.added_at = context.now;
      const existing = await context.reader.listDocumentsByDoctype<CrmMarketingListMemberData>(context.command.tenant_id, this.doctype);
      const duplicate = existing.find((candidate) => candidate.data.marketing_list === input.marketing_list && candidate.data.contact === input.contact);
      if (duplicate) throw errors.validation(`CRM Contact is already represented in this marketing list by ${duplicate.name}`);
    } else {
      assertImmutableField(context, "marketing_list");
      assertImmutableField(context, "contact");
      assertImmutableField(context, "source");
      assertImmutableField(context, "added_at");
      input.added_at = requiredText(context.existing.data.added_at, "Existing member added_at");
      assertMemberTransition(context, previousStatus!, nextStatus);
    }

    if (nextStatus === "Active") {
      assertContactEligible(contact, list, context);
      delete input.unsubscribed_at;
      delete input.unsubscribed_reason;
    } else {
      if (previousStatus !== "Unsubscribed") {
        input.unsubscribed_reason = requiredText(context.command.document.unsubscribed_reason, "Unsubscribe reason");
        input.unsubscribed_at = context.now;
      } else {
        input.unsubscribed_at = requiredText(context.existing?.data.unsubscribed_at, "Existing unsubscribe time");
        input.unsubscribed_reason = requiredText(context.existing?.data.unsubscribed_reason, "Existing unsubscribe reason");
      }
    }
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmMarketingListMemberData>, data: CrmMarketingListMemberData): string[] {
    const events = [context.command.action === "create" ? "crm.marketing_member.added" : "crm.marketing_member.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status && data.status === "Unsubscribed") events.push("crm.marketing_member.unsubscribed");
    if (before === "Unsubscribed" && data.status === "Active") events.push("crm.marketing_member.resubscribed");
    return events;
  }

  eventPayload(context: ControllerContext<CrmMarketingListMemberData>, data: CrmMarketingListMemberData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      marketing_list: data.marketing_list,
      contact: data.contact,
      status: data.status ?? "Active",
      source: data.source ?? "Manual",
    };
  }
}

export class CrmCampaignController extends CrmMarketingController<CrmCampaignData> {
  readonly doctype = "CRM Campaign";

  async normalize(context: ControllerContext<CrmCampaignData>): Promise<CrmCampaignData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Campaigns");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.campaign_name = requiredText(input.campaign_name, "Campaign name");
    input.marketing_list = requiredText(input.marketing_list, "Marketing list");
    input.channel = normalizeEnum(input.channel, CAMPAIGN_CHANNELS, "Campaign channel");
    input.currency = requiredText(input.currency, "Currency");
    input.budget = normalizeNonNegativeDecimal(input.budget, "Campaign budget");
    input.start_date = requiredText(input.start_date, "Campaign start date");
    input.end_date = requiredText(input.end_date, "Campaign end date");
    input.owner_user = optionalText(input.owner_user);
    input.notes = optionalText(input.notes);
    assertDate(input.start_date, "Campaign start date");
    assertDate(input.end_date, "Campaign end date");
    if (input.end_date < input.start_date) throw errors.validation("Campaign end date cannot precede start date");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, "Currency", input.currency);
    if (input.owner_user) await assertRecord(context, "User", input.owner_user);

    const list = await requireDocumentData<CrmMarketingListData>(context, "CRM Marketing List", input.marketing_list);
    if (list.company !== input.company) throw errors.reference("CRM Marketing List belongs to another company");
    const nextStatus = normalizeEnum(input.status ?? "Draft", CAMPAIGN_STATUSES, "Campaign status");
    const previousStatus = context.existing
      ? normalizeEnum(context.existing.data.status ?? "Draft", CAMPAIGN_STATUSES, "Existing campaign status")
      : undefined;
    assertCampaignTransition(context.command.action, previousStatus, nextStatus);
    if (nextStatus === "Active") {
      if ((list.status ?? "Draft") !== "Active") throw errors.lifecycle("CRM Campaign requires an Active marketing list");
      const members = await context.reader.listDocumentsByDoctype<CrmMarketingListMemberData>(context.command.tenant_id, "CRM Marketing List Member");
      let eligible = 0;
      for (const member of members) {
        if (member.data.marketing_list !== input.marketing_list || member.data.status !== "Active") continue;
        const memberContact = await context.reader.getDocument<CrmContactData>(context.command.tenant_id, "CRM Contact", member.data.contact);
        if (!memberContact || memberContact.data.status !== "Active" || memberContact.data.consent_status === "Withdrawn") continue;
        eligible += 1;
      }
      if (!eligible) throw errors.lifecycle("CRM Campaign cannot activate without at least one currently eligible marketing contact");
    }
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmCampaignData>, data: CrmCampaignData): string[] {
    const events = [context.command.action === "create" ? "crm.campaign.created" : "crm.campaign.updated"];
    const before = context.existing?.data.status;
    if (before !== data.status) events.push(`crm.campaign.${String(data.status).toLowerCase()}`);
    return events;
  }

  eventPayload(context: ControllerContext<CrmCampaignData>, data: CrmCampaignData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      status: data.status ?? "Draft",
      channel: data.channel,
      marketing_list: data.marketing_list,
      budget: data.budget,
      currency: data.currency,
      start_date: data.start_date,
      end_date: data.end_date,
    };
  }
}

export class CrmCampaignAttributionController extends CrmMarketingController<CrmCampaignAttributionData> {
  readonly doctype = "CRM Campaign Attribution";

  async normalize(context: ControllerContext<CrmCampaignAttributionData>): Promise<CrmCampaignAttributionData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Campaign Attribution");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStableCompany(context, input.company);
    input.campaign = requiredText(input.campaign, "CRM Campaign");
    input.deal = requiredText(input.deal, "CRM Deal");
    input.model = normalizeEnum(input.model, ATTRIBUTION_MODELS, "Attribution model");
    input.attribution_percent = normalizePositivePercent(input.attribution_percent, "Attribution percent");
    input.notes = optionalText(input.notes);
    await assertRecord(context, "Company", input.company);

    const nextStatus = normalizeEnum(input.status ?? "Active", ATTRIBUTION_STATUSES, "Attribution status");
    if (!context.existing) {
      if (nextStatus !== "Active") throw errors.lifecycle("CRM Campaign Attribution must be created Active and cancelled as a correction");
      const campaign = await requireDocumentData<CrmCampaignData>(context, "CRM Campaign", input.campaign);
      if (campaign.company !== input.company) throw errors.reference("CRM Campaign belongs to another company");
      if (campaign.status === "Cancelled") throw errors.lifecycle("Cannot attribute revenue to a cancelled CRM Campaign");
      const deal = await requireDocumentData<OpportunityData>(context, "CRM Deal", input.deal);
      if (deal.company !== input.company) throw errors.reference("CRM Deal belongs to another company");
      input.deal_amount = normalizeNonNegativeDecimal(deal.opportunity_amount, "CRM Deal amount");
      input.currency = requiredText(deal.currency, "CRM Deal currency");
      input.deal_status = requiredText(deal.status ?? "Open", "CRM Deal status");
      input.attributed_value = derivePercentAmount(input.deal_amount, input.attribution_percent);

      const attributions = await context.reader.listDocumentsByDoctype<CrmCampaignAttributionData>(context.command.tenant_id, this.doctype);
      const existingPercentScaled = attributions
        .filter((candidate) => candidate.data.deal === input.deal && candidate.data.status !== "Cancelled")
        .reduce((total, candidate) => total + toScaledInt(candidate.data.attribution_percent, 6, "Existing attribution percent"), 0);
      const nextScaled = toScaledInt(input.attribution_percent, 6, "Attribution percent");
      if (existingPercentScaled + nextScaled > 100_000_000) throw errors.validation("Active campaign attribution for one CRM Deal cannot exceed 100%");
    } else {
      if ((context.existing.data.status ?? "Active") === "Cancelled") throw errors.lifecycle("Cancelled CRM Campaign Attribution is immutable");
      if (nextStatus !== "Cancelled" && nextStatus !== "Active") throw errors.lifecycle("CRM Campaign Attribution supports only Active or Cancelled");
      for (const field of ["campaign", "deal", "model", "attribution_percent", "deal_amount", "currency", "deal_status", "attributed_value"]) {
        assertImmutableField(context, field);
      }
      input.deal_amount = requiredText(context.existing.data.deal_amount, "Existing attributed deal amount");
      input.currency = requiredText(context.existing.data.currency, "Existing attribution currency");
      input.deal_status = requiredText(context.existing.data.deal_status, "Existing attributed deal status");
      input.attributed_value = requiredText(context.existing.data.attributed_value, "Existing attributed value");
    }
    input.status = nextStatus;
    return input;
  }

  eventTypes(context: ControllerContext<CrmCampaignAttributionData>, data: CrmCampaignAttributionData): string[] {
    const events = [context.command.action === "create" ? "crm.campaign_attribution.created" : "crm.campaign_attribution.updated"];
    if (context.existing?.data.status !== data.status && data.status === "Cancelled") events.push("crm.campaign_attribution.cancelled");
    return events;
  }

  eventPayload(context: ControllerContext<CrmCampaignAttributionData>, data: CrmCampaignAttributionData, _type: string): JsonObject {
    return {
      action: context.command.action,
      company: data.company,
      campaign: data.campaign,
      deal: data.deal,
      model: data.model,
      attribution_percent: data.attribution_percent,
      attributed_value: data.attributed_value ?? "0",
      currency: data.currency ?? "",
      deal_status: data.deal_status ?? "Open",
      status: data.status ?? "Active",
    };
  }
}

function assertContactEligible<T extends JsonObject>(contact: CrmContactData, list: CrmMarketingListData, context: ControllerContext<T>): void {
  if ((contact.status ?? "Active") !== "Active") throw errors.lifecycle("Only Active CRM Contacts may be active marketing members");
  if (contact.consent_status === "Withdrawn") throw errors.lifecycle("CRM Contact has withdrawn marketing consent");
  if (!list.segment) return;
  void context;
  // Segment validity is checked on the list. Membership additionally enforces the
  // strictest consent rule below in normalizeContactAgainstSegment.
}

function assertMemberTransition(
  context: ControllerContext<CrmMarketingListMemberData>,
  previous: CrmMarketingMemberStatus,
  next: CrmMarketingMemberStatus,
): void {
  if (previous === next) {
    if (previous === "Unsubscribed" && Object.keys(context.command.document).some((key) => key !== "status")) {
      throw errors.lifecycle("Unsubscribed marketing membership is immutable until explicitly resubscribed");
    }
    return;
  }
  if (previous === "Active" && next === "Unsubscribed") return;
  if (previous === "Unsubscribed" && next === "Active") {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may resubscribe a marketing member");
    return;
  }
  throw errors.lifecycle(`CRM Marketing List Member cannot move from ${previous} to ${next}`);
}

function assertListTransition(action: string, previous: CrmMarketingListStatus | undefined, next: CrmMarketingListStatus): void {
  if (!previous) {
    if (action === "create" && next !== "Draft") throw errors.lifecycle("CRM Marketing List must be created Draft");
    return;
  }
  if (previous === next) return;
  const allowed: Record<CrmMarketingListStatus, ReadonlySet<CrmMarketingListStatus>> = {
    Draft: new Set(["Active", "Archived"]),
    Active: new Set(["Archived"]),
    Archived: new Set(),
  };
  if (!allowed[previous].has(next)) throw errors.lifecycle(`CRM Marketing List cannot move from ${previous} to ${next}`);
}

function assertCampaignTransition(action: string, previous: CrmCampaignStatus | undefined, next: CrmCampaignStatus): void {
  if (!previous) {
    if (action === "create" && next !== "Draft") throw errors.lifecycle("CRM Campaign must be created Draft");
    return;
  }
  if (previous === next) return;
  const allowed: Record<CrmCampaignStatus, ReadonlySet<CrmCampaignStatus>> = {
    Draft: new Set(["Active", "Cancelled"]),
    Active: new Set(["Paused", "Completed", "Cancelled"]),
    Paused: new Set(["Active", "Completed", "Cancelled"]),
    Completed: new Set(),
    Cancelled: new Set(),
  };
  if (!allowed[previous].has(next)) throw errors.lifecycle(`CRM Campaign cannot move from ${previous} to ${next}`);
}

function mergeExisting<T extends JsonObject>(context: ControllerContext<T>): T {
  return {
    ...(context.existing ? structuredClone(context.existing.data) : {}),
    ...structuredClone(context.command.document),
  } as T;
}

function assertStableCompany<T extends JsonObject>(context: ControllerContext<T>, company: string): void {
  if (!context.existing) return;
  if (context.existing.data.company !== company) throw errors.lifecycle(`${context.command.aggregate.doctype} company cannot change after creation`);
}

function assertImmutableField<T extends JsonObject>(context: ControllerContext<T>, field: string): void {
  if (!(field in context.command.document)) return;
  if (JSON.stringify(context.command.document[field]) !== JSON.stringify(context.existing?.data[field])) {
    throw errors.lifecycle(`${context.command.aggregate.doctype}.${field} is immutable after creation`);
  }
}

async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  const tenantId = context.command.tenant_id;
  if (await context.reader.hasMasterRecord(tenantId, doctype, name)) return;
  if (await context.reader.getDocument(tenantId, doctype, name)) return;
  throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
}

async function requireDocumentData<R extends JsonObject, T extends JsonObject = JsonObject>(
  context: ControllerContext<T>,
  doctype: string,
  name: string,
): Promise<R> {
  const document = await context.reader.getDocument<R>(context.command.tenant_id, doctype, name);
  if (!document) throw errors.reference(`${doctype} ${name} does not exist or is unavailable`);
  return document.data;
}

function requiredText(value: unknown, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${label} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation("CRM text fields must be strings");
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`);
  return value as T;
}

function normalizeNonNegativeDecimal(value: unknown, label: string): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw errors.validation(`${label} must be a non-negative decimal with at most 6 decimal places`);
  toScaledInt(text, 6, label);
  return text;
}

function normalizePositivePercent(value: unknown, label: string): string {
  const text = normalizeNonNegativeDecimal(value, label);
  const scaled = toScaledInt(text, 6, label);
  if (scaled <= 0 || scaled > 100_000_000) throw errors.validation(`${label} must be greater than 0 and at most 100`);
  return text;
}

function derivePercentAmount(base: string, rate: string): string {
  const baseScaled = toScaledInt(base, 6, "Attribution deal amount");
  return fromScaledInt(percentOfMinor(baseScaled, rate, 6, "Attribution percent"), 6);
}

function assertDate(value: string, label: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw errors.validation(`${label} is not a valid date`);
  }
}

function assertSalesManager(roles: string[], message: string): void {
  if (!roles.some((role) => role === "Sales Manager" || role === "System Manager")) throw errors.permission(message);
}
