import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, ControllerRegistry, DocumentController } from "../../document-kernel/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { parseApprovalPlan } from "./bpm-approval.js";
import { parseApprovalTimerPlan } from "./bpm-timer.js";
import { parseBpmTriggerSet } from "./bpm-trigger.js";
import { parseDecisionRuleSet } from "./bpm-rule.js";
import { parseFormulaRuleSet } from "./bpm-formula.js";

export type AppFactoryDefinitionKind = "Process" | "Decision Rules" | "Formula Rules";
export type AppFactoryDefinitionStatus = "Draft" | "Active" | "Retired";

export interface AppFactoryDefinitionData extends JsonObject {
  definition_key: string;
  definition_kind: AppFactoryDefinitionKind;
  target_doctype: string;
  version_no: number;
  definition_json: JsonObject;
  effective_from: string;
  effective_to?: string;
  status: AppFactoryDefinitionStatus;
  status_reason?: string;
}

const KINDS = new Set<AppFactoryDefinitionKind>(["Process", "Decision Rules", "Formula Rules"]);
const STATUSES = new Set<AppFactoryDefinitionStatus>(["Draft", "Active", "Retired"]);
const KEY = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_DEFINITIONS = 5_000;

function text(value: unknown, field: string, max = 320): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function optionalText(value: unknown, field: string, max = 1_000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, max);
}

function date(value: unknown, field: string): string {
  const normalized = text(value, field, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw errors.validation(`${field} must be YYYY-MM-DD`);
  }
  return normalized;
}

function parseJsonObject(value: unknown, field: string): JsonObject {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); }
    catch { throw errors.validation(`${field} must be valid JSON`); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.validation(`${field} must be a JSON object`);
  return parsed as JsonObject;
}

function kind(value: unknown): AppFactoryDefinitionKind {
  const normalized = text(value, "definition_kind", 64) as AppFactoryDefinitionKind;
  if (!KINDS.has(normalized)) throw errors.validation("definition_kind must be Process, Decision Rules or Formula Rules");
  return normalized;
}

function status(value: unknown): AppFactoryDefinitionStatus {
  const normalized = text(value, "status", 32) as AppFactoryDefinitionStatus;
  if (!STATUSES.has(normalized)) throw errors.validation("status must be Draft, Active or Retired");
  return normalized;
}

function validateDefinitionPayload(
  definitionKind: AppFactoryDefinitionKind,
  definition: JsonObject,
  knownFields: ReadonlySet<string>,
): JsonObject {
  if (definitionKind === "Decision Rules") {
    return parseDecisionRuleSet(definition, knownFields) as unknown as JsonObject;
  }
  if (definitionKind === "Formula Rules") {
    return parseFormulaRuleSet(definition, knownFields) as unknown as JsonObject;
  }

  const approvalValue = definition.approval_plan;
  if (approvalValue === undefined) throw errors.validation("Process definition requires approval_plan");
  const approvalPlan = parseApprovalPlan(approvalValue);
  const timerPlan = definition.timer_plan === undefined
    ? undefined
    : parseApprovalTimerPlan(definition.timer_plan, approvalPlan);
  const triggerSet = definition.trigger_set === undefined
    ? undefined
    : parseBpmTriggerSet(definition.trigger_set, undefined, knownFields);
  const allowed = new Set(["approval_plan", "timer_plan", "trigger_set"]);
  for (const property of Object.keys(definition)) {
    if (!allowed.has(property)) throw errors.validation(`Process definition property is not supported: ${property}`);
  }
  return {
    approval_plan: approvalPlan as unknown as JsonObject,
    ...(timerPlan ? { timer_plan: timerPlan as unknown as JsonObject } : {}),
    ...(triggerSet ? { trigger_set: triggerSet as unknown as JsonObject } : {}),
  };
}

function assertStatusTransition(
  current: AppFactoryDefinitionStatus,
  next: AppFactoryDefinitionStatus,
  reason: string | undefined,
): void {
  if (current === next) return;
  if (!reason) throw errors.validation("status_reason is required when App Factory Definition status changes");
  const allowed = current === "Draft" && next === "Active"
    || current === "Active" && next === "Retired";
  if (!allowed) throw errors.lifecycle(`App Factory Definition cannot change ${current} -> ${next}`);
}

export class AppFactoryDefinitionController implements DocumentController<AppFactoryDefinitionData> {
  readonly doctype = "App Factory Definition";

  constructor(private readonly metadata: MetadataStore) {}

  async buildPlan(context: ControllerContext<AppFactoryDefinitionData>): Promise<MutationPlan<AppFactoryDefinitionData>> {
    if (context.command.action === "submit" || context.command.action === "cancel" || context.command.action === "amend") {
      throw errors.lifecycle("App Factory Definition is lifecycle-managed, not submittable");
    }
    const existing = context.existing as CanonicalDocument<AppFactoryDefinitionData> | null;
    const input = context.command.document;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw errors.validation("App Factory Definition document is invalid");

    const definitionKey = text(input.definition_key ?? existing?.data.definition_key, "definition_key", 64);
    if (!KEY.test(definitionKey)) throw errors.validation("definition_key must be kebab-case");
    const definitionKind = kind(input.definition_kind ?? existing?.data.definition_kind);
    const targetDoctype = text(input.target_doctype ?? existing?.data.target_doctype, "target_doctype", 160);
    const targetMeta = await this.metadata.getDocType(context.command.tenant_id, targetDoctype);
    if (!targetMeta) throw errors.reference(`App Factory target DocType is not active: ${targetDoctype}`);

    const nextStatus = status(input.status ?? existing?.data.status ?? "Draft");
    if (!existing && nextStatus !== "Draft") throw errors.validation("App Factory Definition must be created as Draft");
    const reason = optionalText(input.status_reason, "status_reason");
    if (existing) assertStatusTransition(existing.data.status, nextStatus, reason);

    if (existing) {
      if (definitionKey !== existing.data.definition_key) throw errors.validation("definition_key cannot change after creation");
      if (definitionKind !== existing.data.definition_kind) throw errors.validation("definition_kind cannot change after creation");
      if (targetDoctype !== existing.data.target_doctype) throw errors.validation("target_doctype cannot change after creation");
      if (existing.data.status !== "Draft" && JSON.stringify(input.definition_json ?? existing.data.definition_json) !== JSON.stringify(existing.data.definition_json)) {
        throw errors.validation("Retire/replace an App Factory Definition before changing its active definition_json");
      }
    }

    const all = await context.reader.listDocumentsByDoctype<AppFactoryDefinitionData>(context.command.tenant_id, this.doctype);
    if (all.length > MAX_DEFINITIONS) throw errors.validation(`App Factory Definition scan exceeds ${MAX_DEFINITIONS} rows; add a targeted store before continuing`);
    const siblings = all.filter((document) => document.name !== context.command.aggregate.name
      && document.data.definition_key === definitionKey
      && document.data.definition_kind === definitionKind);
    const versionNo = existing?.data.version_no ?? (Math.max(0, ...siblings.map((document) => Number(document.data.version_no) || 0)) + 1);
    if (!Number.isSafeInteger(versionNo) || versionNo <= 0) throw errors.validation("App Factory Definition version_no is invalid");
    if (input.version_no !== undefined && Number(input.version_no) !== versionNo) throw errors.validation("version_no is server-assigned and cannot be changed");

    if (nextStatus === "Active" && siblings.some((document) => document.data.status === "Active")) {
      throw errors.validation(`Retire the active ${definitionKind} definition for ${definitionKey} before activating another version`);
    }

    const effectiveFrom = date(input.effective_from ?? existing?.data.effective_from, "effective_from");
    const effectiveTo = input.effective_to === undefined && existing?.data.effective_to === undefined
      ? undefined
      : date(input.effective_to ?? existing?.data.effective_to, "effective_to");
    if (effectiveTo && effectiveTo < effectiveFrom) throw errors.validation("effective_to must not precede effective_from");

    const definitionInput = parseJsonObject(input.definition_json ?? existing?.data.definition_json, "definition_json");
    const knownFields = new Set(["name", "owner", "status", "docstatus", ...targetMeta.fields.map((field) => field.fieldname)]);
    const definitionJson = validateDefinitionPayload(definitionKind, definitionInput, knownFields);

    const data: AppFactoryDefinitionData = {
      definition_key: definitionKey,
      definition_kind: definitionKind,
      target_doctype: targetDoctype,
      version_no: versionNo,
      definition_json: definitionJson,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      status: nextStatus,
      ...(reason ? { status_reason: reason } : existing?.data.status_reason ? { status_reason: existing.data.status_reason } : {}),
    };
    const statusChanged = existing !== null && existing.data.status !== nextStatus;
    const eventType = context.command.action === "create"
      ? "app_factory_definition.created"
      : statusChanged && nextStatus === "Active"
        ? "app_factory_definition.activated"
        : statusChanged && nextStatus === "Retired"
          ? "app_factory_definition.retired"
          : "app_factory_definition.updated";
    const document: CanonicalDocument<AppFactoryDefinitionData> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status: nextStatus,
      version: context.nextVersion,
      created_at: existing?.created_at ?? context.now,
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
      events: [domainEvent({
        type: eventType,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          definition_key: definitionKey,
          definition_kind: definitionKind,
          version_no: versionNo,
          status: nextStatus,
          ...(statusChanged && reason ? { reason } : {}),
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        definition_key: definitionKey,
        definition_kind: definitionKind,
        definition_version: versionNo,
        status: nextStatus,
      },
    };
  }
}

/** Composition helper for WS00's canonical ControllerRegistry hotspot. */
export function registerAppFactoryControllers(registry: ControllerRegistry, metadata: MetadataStore): ControllerRegistry {
  return registry.register(new AppFactoryDefinitionController(metadata));
}
