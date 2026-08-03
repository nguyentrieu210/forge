import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { CrmDealController, CrmLeadController } from "./crm-controllers.js";
import type { LeadData, OpportunityData } from "./crm-types.js";
import type { CrmSalesTeamData, CrmSalesTeamMemberData, CrmSalesTeamMemberRole, CrmSalesTeamMemberStatus, CrmSalesTeamStatus } from "./crm-team-types.js";

const TEAM_STATUSES = new Set<CrmSalesTeamStatus>(["Active", "Inactive"]);
const MEMBER_STATUSES = new Set<CrmSalesTeamMemberStatus>(["Active", "Inactive"]);
const MEMBER_ROLES = new Set<CrmSalesTeamMemberRole>(["Manager", "Member"]);

abstract class TeamConfigController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T>;

  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    if (context.command.action === "submit" || context.command.action === "cancel") throw errors.lifecycle(`${this.doctype} is configuration and cannot be submitted or cancelled`);
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
      gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [],
      events: [domainEvent({
        type: `crm.${this.doctype === "CRM Sales Team" ? "sales_team" : "sales_team_member"}.${context.command.action === "create" ? "created" : "updated"}`,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: this.eventPayload(data),
      })],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus: 0, status },
    };
  }

  protected abstract eventPayload(data: T): JsonObject;
}

export class CrmSalesTeamController extends TeamConfigController<CrmSalesTeamData> {
  readonly doctype = "CRM Sales Team";

  async normalize(context: ControllerContext<CrmSalesTeamData>): Promise<CrmSalesTeamData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Sales Teams");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStable(context, "company", input.company);
    input.team_name = requiredText(input.team_name, "Team name");
    input.manager = requiredText(input.manager, "Team manager");
    input.territory = optionalText(input.territory);
    input.notes = optionalText(input.notes);
    input.status = normalizeEnum(input.status ?? "Active", TEAM_STATUSES, "Sales Team status");
    await assertRecord(context, "Company", input.company);
    await assertRecord(context, "User", input.manager);
    if (input.territory) await assertRecord(context, "Territory", input.territory);
    return input;
  }

  protected eventPayload(data: CrmSalesTeamData): JsonObject {
    return { company: data.company, manager: data.manager, status: data.status ?? "Active", ...(data.territory ? { territory: data.territory } : {}) };
  }
}

export class CrmSalesTeamMemberController extends TeamConfigController<CrmSalesTeamMemberData> {
  readonly doctype = "CRM Sales Team Member";

  async normalize(context: ControllerContext<CrmSalesTeamMemberData>): Promise<CrmSalesTeamMemberData> {
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Sales Team Members");
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStable(context, "company", input.company);
    input.sales_team = requiredText(input.sales_team, "Sales Team");
    assertStable(context, "sales_team", input.sales_team);
    input.user = requiredText(input.user, "Team member user");
    assertStable(context, "user", input.user);
    input.member_role = normalizeEnum(input.member_role ?? "Member", MEMBER_ROLES, "Team member role");
    input.status = normalizeEnum(input.status ?? "Active", MEMBER_STATUSES, "Team member status");
    input.notes = optionalText(input.notes);
    const team = await requireDocumentData<CrmSalesTeamData>(context, "CRM Sales Team", input.sales_team);
    if (team.company !== input.company) throw errors.reference("CRM Sales Team belongs to another company");
    await assertRecord(context, "User", input.user);
    if (input.status === "Active" && (team.status ?? "Active") !== "Active") throw errors.lifecycle("Cannot activate a member in an inactive CRM Sales Team");
    if (input.member_role === "Manager" && input.user !== team.manager) throw errors.reference("CRM Sales Team Manager member must match the team's configured manager");

    if (input.status === "Active") {
      const members = await context.reader.listDocumentsByDoctype<CrmSalesTeamMemberData>(context.command.tenant_id, this.doctype);
      const duplicate = members.find((candidate) => candidate.name !== context.command.aggregate.name
        && candidate.data.sales_team === input.sales_team
        && candidate.data.user === input.user
        && (candidate.data.status ?? "Active") === "Active");
      if (duplicate) throw errors.validation(`User ${input.user} is already active in CRM Sales Team ${input.sales_team} as ${duplicate.name}`);
    }
    return input;
  }

  protected eventPayload(data: CrmSalesTeamMemberData): JsonObject {
    return { company: data.company, sales_team: data.sales_team, user: data.user, member_role: data.member_role ?? "Member", status: data.status ?? "Active" };
  }
}

export class CrmTeamAwareLeadController extends CrmLeadController {
  async normalize(context: ControllerContext<LeadData>): Promise<LeadData> {
    const data = await super.normalize(context);
    await assertTeamAssignment(context, data.company, optionalText(data.sales_team), optionalText(data.assigned_to));
    return data;
  }
}

export class CrmTeamAwareDealController extends CrmDealController {
  async normalize(context: ControllerContext<OpportunityData>): Promise<OpportunityData> {
    const data = await super.normalize(context);
    await assertTeamAssignment(context, data.company, optionalText(data.sales_team), optionalText(data.assigned_to));
    return data;
  }
}

async function assertTeamAssignment<T extends JsonObject>(context: ControllerContext<T>, company: string, teamName: string | undefined, assignedTo: string | undefined): Promise<void> {
  if (!teamName) return;
  const team = await requireDocumentData<CrmSalesTeamData>(context, "CRM Sales Team", teamName);
  if (team.company !== company) throw errors.reference("CRM Sales Team belongs to another company");
  if ((team.status ?? "Active") !== "Active") throw errors.lifecycle("CRM Sales Team must be Active for assignment");
  if (!assignedTo) return;
  const members = await context.reader.listDocumentsByDoctype<CrmSalesTeamMemberData>(context.command.tenant_id, "CRM Sales Team Member");
  const member = members.find((candidate) => candidate.data.sales_team === teamName
    && candidate.data.user === assignedTo
    && (candidate.data.status ?? "Active") === "Active");
  if (!member && assignedTo !== team.manager) throw errors.reference(`Assigned user ${assignedTo} is not active in CRM Sales Team ${teamName}`);
}

async function assertRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  if (await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) return;
  if (await context.reader.getDocument(context.command.tenant_id, doctype, name)) return;
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

function assertStable<T extends JsonObject>(context: ControllerContext<T>, field: string, next: unknown): void {
  if (!context.existing) return;
  if (JSON.stringify(context.existing.data[field]) !== JSON.stringify(next)) throw errors.lifecycle(`${context.command.aggregate.doctype}.${field} cannot change after creation`);
}

function requiredText(value: unknown, label: string): string {
  const valueText = optionalText(value);
  if (!valueText) throw errors.validation(`${label} is required`);
  return valueText;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation("CRM team text fields must be strings");
  const text = value.trim();
  return text || undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`);
  return value as T;
}

function assertSalesManager(roles: string[], message: string): void {
  if (!roles.some((role) => role === "Sales Manager" || role === "System Manager")) throw errors.permission(message);
}
