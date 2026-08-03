import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { LeadData } from "./crm-types.js";
import type { CrmLeadScoreFact, CrmLeadScoreOperator, CrmLeadScoreRuleData, CrmLeadScoreRuleStatus, CrmLeadScoreSnapshotData } from "./crm-scoring-types.js";

const FACTS = new Set<CrmLeadScoreFact>(["Lead Source", "Territory", "Status", "Sales Team", "Has Email", "Has Mobile"]);
const OPERATORS = new Set<CrmLeadScoreOperator>(["Equals", "Present", "Absent"]);
const RULE_STATUSES = new Set<CrmLeadScoreRuleStatus>(["Active", "Inactive"]);

export class CrmLeadScoreRuleController implements DocumentController<CrmLeadScoreRuleData> {
  readonly doctype = "CRM Lead Score Rule";

  async buildPlan(context: ControllerContext<CrmLeadScoreRuleData>): Promise<MutationPlan<CrmLeadScoreRuleData>> {
    if (context.command.action === "submit" || context.command.action === "cancel") throw errors.lifecycle("CRM Lead Score Rule is configuration and cannot be submitted or cancelled");
    assertSalesManager(context.command.actor.roles, "Only a Sales Manager may manage CRM Lead Score Rules");
    const data = await this.normalize(context);
    return simplePlan(context, this.doctype, data, data.status ?? "Active", context.command.action === "create" ? "crm.lead_score_rule.created" : "crm.lead_score_rule.updated", {
      company: data.company,
      fact: data.fact,
      operator: data.operator,
      points: data.points,
      status: data.status ?? "Active",
      effective_from: data.effective_from,
      ...(data.effective_to ? { effective_to: data.effective_to } : {}),
    });
  }

  async normalize(context: ControllerContext<CrmLeadScoreRuleData>): Promise<CrmLeadScoreRuleData> {
    const input = mergeExisting(context);
    input.company = requiredText(input.company, "Company");
    assertStable(context, "company", input.company);
    input.rule_name = requiredText(input.rule_name, "Rule name");
    input.fact = normalizeEnum(input.fact, FACTS, "Lead score fact");
    input.operator = normalizeEnum(input.operator, OPERATORS, "Lead score operator");
    input.match_value = optionalText(input.match_value);
    input.points = boundedInteger(input.points, -1000, 1000, "Lead score points");
    input.effective_from = requiredText(input.effective_from, "Effective from");
    input.effective_to = optionalText(input.effective_to);
    input.status = normalizeEnum(input.status ?? "Active", RULE_STATUSES, "Lead score rule status");
    input.notes = optionalText(input.notes);
    assertDate(input.effective_from, "Effective from");
    if (input.effective_to) {
      assertDate(input.effective_to, "Effective to");
      if (input.effective_to < input.effective_from) throw errors.validation("Lead score rule effective_to cannot precede effective_from");
    }
    await assertRecord(context, "Company", input.company);
    if (input.operator === "Equals") input.match_value = requiredText(input.match_value, "Match value");
    else delete input.match_value;

    if (input.status === "Active") {
      const rules = await context.reader.listDocumentsByDoctype<CrmLeadScoreRuleData>(context.command.tenant_id, this.doctype);
      const duplicate = rules.find((candidate) => candidate.name !== context.command.aggregate.name
        && candidate.data.company === input.company
        && candidate.data.status === "Active"
        && candidate.data.fact === input.fact
        && candidate.data.operator === input.operator
        && (candidate.data.match_value ?? "") === (input.match_value ?? "")
        && rangesOverlap(input.effective_from, input.effective_to, candidate.data.effective_from, candidate.data.effective_to));
      if (duplicate) throw errors.validation(`CRM Lead Score Rule overlaps active rule ${duplicate.name} for the same predicate`);
    }
    return input;
  }
}

export class CrmLeadScoreSnapshotController implements DocumentController<CrmLeadScoreSnapshotData> {
  readonly doctype = "CRM Lead Score Snapshot";

  async buildPlan(context: ControllerContext<CrmLeadScoreSnapshotData>): Promise<MutationPlan<CrmLeadScoreSnapshotData>> {
    if (context.command.action !== "create") throw errors.lifecycle("CRM Lead Score Snapshot is immutable evidence; create a new snapshot to rescore");
    const data = await this.normalize(context);
    return simplePlan(context, this.doctype, data, "Scored", "crm.lead_score.scored", {
      company: data.company,
      lead: data.lead,
      score: data.score ?? 0,
      matched_rule_count: data.matched_rule_count ?? 0,
      scored_at: data.scored_at ?? context.now,
    });
  }

  async normalize(context: ControllerContext<CrmLeadScoreSnapshotData>): Promise<CrmLeadScoreSnapshotData> {
    const company = requiredText(context.command.document.company, "Company");
    const leadName = requiredText(context.command.document.lead, "CRM Lead");
    const lead = await requireDocumentData<LeadData>(context, "CRM Lead", leadName);
    if (lead.company !== company) throw errors.reference("CRM Lead belongs to another company");
    const today = context.now.slice(0, 10);
    const rules = await context.reader.listDocumentsByDoctype<CrmLeadScoreRuleData>(context.command.tenant_id, "CRM Lead Score Rule");
    const matched = rules
      .filter((rule) => rule.data.company === company
        && (rule.data.status ?? "Active") === "Active"
        && rule.data.effective_from <= today
        && (!rule.data.effective_to || rule.data.effective_to >= today)
        && ruleMatches(rule.data, lead))
      .sort((a, b) => a.name.localeCompare(b.name));
    const score = matched.reduce((sum, rule) => sum + rule.data.points, 0);
    if (!Number.isSafeInteger(score)) throw errors.validation("Lead score exceeds safe integer range");
    return {
      company,
      lead: leadName,
      score,
      matched_rule_count: matched.length,
      matched_rules: matched.map((rule) => rule.name).join("\n"),
      scored_at: context.now,
    };
  }
}

function ruleMatches(rule: CrmLeadScoreRuleData, lead: LeadData): boolean {
  const value = leadFact(rule.fact, lead);
  if (rule.operator === "Present") return value !== undefined && value !== "";
  if (rule.operator === "Absent") return value === undefined || value === "";
  return normalizeIdentity(value) === normalizeIdentity(rule.match_value);
}

function leadFact(fact: CrmLeadScoreFact, lead: LeadData): string | undefined {
  if (fact === "Lead Source") return optionalText(lead.lead_source);
  if (fact === "Territory") return optionalText(lead.territory);
  if (fact === "Status") return optionalText(lead.status);
  if (fact === "Sales Team") return optionalText(lead.sales_team);
  if (fact === "Has Email") return optionalText(lead.email_id) ? "yes" : undefined;
  if (fact === "Has Mobile") return optionalText(lead.mobile_no) ? "yes" : undefined;
  return undefined;
}

function simplePlan<T extends JsonObject>(context: ControllerContext<T>, doctype: string, data: T, status: string, eventType: string, payload: JsonObject): MutationPlan<T> {
  const document: CanonicalDocument<T> = {
    tenant_id: context.command.tenant_id, doctype, name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id, docstatus: 0, status, version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now, modified_at: context.now, data, children: [],
  };
  return {
    command: context.command, document, gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [],
    events: [domainEvent({ type: eventType, tenantId: context.command.tenant_id, aggregate: context.command.aggregate, aggregateVersion: context.nextVersion, actor: context.command.actor.user_id, commandId: context.command.command_id, occurredAt: context.now, payload })],
    result: { doctype, name: document.name, version: document.version, docstatus: 0, status },
  };
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
function mergeExisting<T extends JsonObject>(context: ControllerContext<T>): T { return { ...(context.existing ? structuredClone(context.existing.data) : {}), ...structuredClone(context.command.document) } as T; }
function assertStable<T extends JsonObject>(context: ControllerContext<T>, field: string, next: unknown): void { if (context.existing && JSON.stringify(context.existing.data[field]) !== JSON.stringify(next)) throw errors.lifecycle(`${context.command.aggregate.doctype}.${field} cannot change after creation`); }
function requiredText(value: unknown, label: string): string { const text = optionalText(value); if (!text) throw errors.validation(`${label} is required`); return text; }
function optionalText(value: unknown): string | undefined { if (value === undefined || value === null || value === "") return undefined; if (typeof value !== "string") throw errors.validation("CRM scoring text fields must be strings"); const text = value.trim(); return text || undefined; }
function normalizeIdentity(value: unknown): string { return optionalText(value)?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() ?? ""; }
function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== "string" || !allowed.has(value as T)) throw errors.validation(`${label} must be one of ${[...allowed].join(", ")}`); return value as T; }
function boundedInteger(value: unknown, min: number, max: number, label: string): number { const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN; if (!Number.isSafeInteger(number) || number < min || number > max) throw errors.validation(`${label} must be an integer from ${min} to ${max}`); return number; }
function assertDate(value: string, label: string): void { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) throw errors.validation(`${label} must use YYYY-MM-DD`); const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))); if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw errors.validation(`${label} is not a valid date`); }
function rangesOverlap(startA: string, endA: string | undefined, startB: string, endB: string | undefined): boolean { return startA <= (endB ?? "9999-12-31") && startB <= (endA ?? "9999-12-31"); }
function assertSalesManager(roles: string[], message: string): void { if (!roles.some((role) => role === "Sales Manager" || role === "System Manager")) throw errors.permission(message); }
