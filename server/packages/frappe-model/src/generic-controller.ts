import type { CanonicalDocument, ChildRow, JsonObject, JsonValue, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/controller.js";
import { nextDocStatus } from "../../document-kernel/src/lifecycle.js";
import { domainEvent } from "../../outbox/src/index.js";
import type { MetadataStore } from "./store.js";
import type { DocFieldMeta, DocTypeMeta, WorkflowMeta } from "./types.js";
import { isLayoutField } from "./validate.js";
import { evaluateFieldCondition } from "./field-condition.js";
import { canWriteField } from "./permission.js";

export class GenericMetadataController implements DocumentController<JsonObject> {
  readonly doctype = "*";
  constructor(private readonly metadata: MetadataStore) {}

  async buildPlan(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    const doctype = context.command.aggregate.doctype;
    const meta = await this.metadata.getDocType(context.command.tenant_id, doctype);
    if (!meta || meta.is_child) throw errors.validation(`No executable DocType metadata for ${doctype}`);
    if ((context.command.action === "submit" || context.command.action === "cancel") && !meta.is_submittable) {
      throw errors.lifecycle(`${doctype} is not submittable`);
    }
    const existing = context.existing;
    const data = context.command.action === "cancel"
      ? { ...structuredClone(requireExisting(context).data), ...(context.command.document.workflow_state === undefined ? {} : { workflow_state: context.command.document.workflow_state }) }
      : await normalizeDocument(context, meta);
    const workflow = await this.metadata.getWorkflow(context.command.tenant_id, doctype);
    const workflowResult = workflow?.is_active ? applyWorkflow(context, data, workflow) : null;
    const docstatus = workflowResult?.docstatus ?? (meta.is_submittable ? nextDocStatus(context.command.action) : 0);
    const status = docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled";
    const workflowState = workflowResult?.state ?? (typeof data.workflow_state === "string" ? data.workflow_state : undefined);
    if (workflowState) data[workflow?.state_field ?? "workflow_state"] = workflowState;
    const document: CanonicalDocument<JsonObject> = {
      tenant_id: context.command.tenant_id,
      doctype,
      name: context.command.aggregate.name,
      owner: existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status: workflowState ?? status,
      version: context.nextVersion,
      created_at: existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: extractChildren(meta, data),
    };
    const event = domainEvent({
      type: `${slug(doctype)}.${context.command.action === "create" ? "created" : context.command.action === "save" ? "updated" : context.command.action === "submit" ? "submitted" : "cancelled"}`,
      tenantId: context.command.tenant_id,
      aggregate: context.command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: context.command.actor.user_id,
      commandId: context.command.command_id,
      occurredAt: context.now,
      payload: { action: context.command.action, metadata_revision: meta.revision, status: document.status },
    });
    return {
      command: context.command,
      document,
      gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [], events: [event],
      result: { doctype, name: document.name, version: document.version, docstatus, status: document.status, metadata_revision: meta.revision },
    };
  }
}

async function normalizeDocument(context: ControllerContext<JsonObject>, meta: DocTypeMeta): Promise<JsonObject> {
  const input = context.command.document;
  const output: JsonObject = {};
  const known = new Map(meta.fields.map((field) => [field.fieldname, field]));
  for (const key of Object.keys(input)) {
    if (key.startsWith("_") || ["workflow_state"].includes(key)) continue;
    if (!known.has(key)) throw errors.validation(`Unknown field ${meta.name}.${key}`);
  }
  for (const field of meta.fields) {
    if (isLayoutField(field)) continue;
    const provided = input[field.fieldname];
    const prior = context.existing?.data[field.fieldname];
    const changed = provided !== undefined && !sameJsonValue(provided, prior);
    if (changed && !canWriteField(meta, field, context.command.actor, context.existing ? "save" : "create", context.existing?.owner ?? context.command.actor.user_id)) {
      throw errors.permission(`Field permission denied: ${field.fieldname}`);
    }
    const readOnly = Boolean(field.read_only) || (context.existing?.docstatus === 1 && !field.allow_on_submit);
    let value: JsonValue | undefined;
    if (readOnly && prior !== undefined) value = structuredClone(prior);
    else if (readOnly && provided !== undefined && prior === undefined) throw errors.validation(`Field is read-only: ${field.fieldname}`);
    else if (provided !== undefined) value = normalizeValue(field, provided, context.command.action);
    else if (prior !== undefined && context.command.action === "save") value = structuredClone(prior);
    else if (field.default !== undefined) value = structuredClone(field.default);
    if (field.required && isEmpty(value)) throw errors.validation(`${field.label} is required`);
    // `mandatory_depends_on` is enforced HERE, on the server. The client evaluates
    // the same expression to drive its UI, but a client-side check is a hint, not
    // a rule: a direct API call would otherwise submit a document missing a field
    // the business logic treats as required.
    if (!field.required && isEmpty(value) && field.mandatory_depends_on
      && evaluateFieldCondition(field.mandatory_depends_on, input, context.existing?.data)) {
      throw errors.validation(`${field.label} is required`, { fieldname: field.fieldname });
    }
    if (value !== undefined) output[field.fieldname] = value;
    if (context.command.action === "submit") await validateReference(context, field, value);
  }
  if (input.workflow_state !== undefined) output.workflow_state = input.workflow_state;
  output._metadata_revision = meta.revision;
  return output;
}

function normalizeValue(field: DocFieldMeta, value: JsonValue, action: string): JsonValue {
  if (value === null) return null;
  switch (field.fieldtype) {
    case "Data": case "Small Text": case "Text": case "Long Text": case "Code": case "Select": case "Link": case "Dynamic Link": case "Attach": case "Attach Image": {
      if (typeof value !== "string") throw errors.validation(`${field.label} must be a string`);
      if (field.length && value.length > field.length) throw errors.validation(`${field.label} exceeds ${field.length} characters`);
      if (field.fieldtype === "Select" && field.options) {
        const options = field.options.split("\n").map((entry) => entry.trim()).filter(Boolean);
        if (value && !options.includes(value)) throw errors.validation(`${field.label} must be one of the configured options`);
      }
      return value;
    }
    case "Int": {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw errors.validation(`${field.label} must be an integer`); return value;
    }
    case "Float": case "Currency": case "Percent": {
      if ((typeof value !== "number" || !Number.isFinite(value)) && (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value))) throw errors.validation(`${field.label} must be numeric`); return typeof value === "number" ? String(value) : value;
    }
    case "Check": {
      if (typeof value === "boolean") return value; if (value === 0 || value === 1) return value === 1; throw errors.validation(`${field.label} must be true or false`);
    }
    case "Date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw errors.validation(`${field.label} must be YYYY-MM-DD`); return value;
    }
    case "Datetime": {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw errors.validation(`${field.label} must be an ISO datetime`); return value;
    }
    case "Time": {
      if (typeof value !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) throw errors.validation(`${field.label} must be HH:MM[:SS]`); return value;
    }
    case "JSON": {
      if (!value || typeof value !== "object") throw errors.validation(`${field.label} must be JSON`); return value;
    }
    case "Table": case "Table MultiSelect": {
      if (!Array.isArray(value)) throw errors.validation(`${field.label} must be a table`);
      if (value.length > 1000) throw errors.validation(`${field.label} exceeds the child-row limit`);
      return value.map((row, index) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`${field.label} row ${index + 1} must be an object`);
        const object = structuredClone(row) as JsonObject;
        if (typeof object.row_id !== "string" || !object.row_id) object.row_id = crypto.randomUUID();
        object.idx = index + 1; return object;
      });
    }
    default:
      if (action === "submit" && !isLayoutField(field)) throw errors.validation(`Unsupported executable field type ${field.fieldtype}`);
      return value;
  }
}

async function validateReference(context: ControllerContext<JsonObject>, field: DocFieldMeta, value: JsonValue | undefined): Promise<void> {
  if (value === undefined || value === null || value === "") return;
  if (field.fieldtype === "Link" && field.options) {
    const exists = await context.reader.hasMasterRecord(context.command.tenant_id, field.options, String(value))
      || Boolean(await context.reader.getDocument(context.command.tenant_id, field.options, String(value)));
    if (!exists) throw errors.reference(`${field.options} reference is invalid or unavailable`);
  }
  if (field.fieldtype === "Dynamic Link" && field.options) {
    // The target doctype is named by ANOTHER field on the same document. This was
    // previously unvalidated entirely: a Dynamic Link could point at a doctype
    // that does not exist, or at a record that does not, and nothing objected.
    const targetDoctype = context.command.document[field.options];
    if (typeof targetDoctype !== "string" || !targetDoctype) {
      throw errors.reference(`${field.label} needs ${field.options} to name its target doctype`, { fieldname: field.options });
    }
    const exists = await context.reader.hasMasterRecord(context.command.tenant_id, targetDoctype, String(value))
      || Boolean(await context.reader.getDocument(context.command.tenant_id, targetDoctype, String(value)));
    if (!exists) throw errors.reference(`${targetDoctype} reference is invalid or unavailable`, { fieldname: field.fieldname });
  }
  if (field.fieldtype === "Table" && field.options && Array.isArray(value)) {
    for (const row of value) if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`${field.label} contains an invalid child row`);
  }
}

function extractChildren(meta: DocTypeMeta, data: JsonObject): ChildRow[] {
  const children: ChildRow[] = [];
  for (const field of meta.fields) {
    if (field.fieldtype !== "Table" && field.fieldtype !== "Table MultiSelect") continue;
    const rows = data[field.fieldname]; if (!Array.isArray(rows)) continue;
    rows.forEach((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const row = value as JsonObject;
      children.push({ fieldname: field.fieldname, child_doctype: field.options ?? `${meta.name} ${field.label}`, row_id: String(row.row_id ?? crypto.randomUUID()), idx: index + 1, data: structuredClone(row) });
    });
  }
  return children;
}

function applyWorkflow(context: ControllerContext<JsonObject>, data: JsonObject, workflow: WorkflowMeta): { state: string; docstatus: 0 | 1 | 2 } {
  if (!workflow.states.length) throw errors.validation(`Workflow ${workflow.name} has no states`);
  const stateField = workflow.state_field;
  const current = context.existing ? String(context.existing.data[stateField] ?? workflow.states[0]!.state) : null;
  const requestedRaw = data[stateField] ?? data.workflow_state;
  const requested = typeof requestedRaw === "string" && requestedRaw ? requestedRaw : (current ?? workflow.states[0]!.state);
  const target = workflow.states.find((state) => state.state === requested);
  if (!target) throw errors.validation(`Unknown workflow state: ${requested}`);
  if (!context.existing) {
    const initial = workflow.states[0]!;
    if (requested !== initial.state || initial.docstatus !== 0) throw errors.validation(`New ${workflow.document_type} must start in workflow state ${initial.state}`);
    if (context.command.action !== "create") throw errors.lifecycle("Workflow document must be created before transition");
    return { state: initial.state, docstatus: initial.docstatus };
  }
  if (requested === current) {
    const currentState = workflow.states.find((state) => state.state === current);
    if (!currentState) throw errors.validation(`Current workflow state is invalid: ${current}`);
    if (context.command.action !== "save") throw errors.lifecycle(`Workflow action is required to ${context.command.action} from ${current}`);
    if (currentState.allow_edit && !context.command.actor.roles.includes(currentState.allow_edit) && !isAdministrator(context)) throw errors.permission(`Role cannot edit workflow state ${current}`);
    return { state: current, docstatus: currentState.docstatus };
  }
  const transitions = workflow.transitions.filter((transition) => transition.state === current && transition.next_state === requested);
  const transition = transitions.find((entry) => context.command.actor.roles.includes(entry.allowed_role) || isAdministrator(context));
  if (!transition) throw errors.permission(`No permitted workflow transition from ${current} to ${requested}`);
  if (!transition.allow_self_approval && context.existing.owner === context.command.actor.user_id && target.docstatus > context.existing.docstatus) {
    throw errors.permission("Self approval is not allowed for this transition");
  }
  if (transition.condition && !evaluateCondition(transition.condition, data)) throw errors.validation(`Workflow condition is not satisfied for ${transition.action}`);
  const expectedAction = target.docstatus === 2 ? "cancel" : target.docstatus === 1 && context.existing.docstatus === 0 ? "submit" : "save";
  if (context.command.action !== expectedAction) throw errors.lifecycle(`Transition to ${requested} requires ${expectedAction}`);
  return { state: requested, docstatus: target.docstatus };
}

function evaluateCondition(condition: string, data: JsonObject): boolean {
  const trimmed = condition.trim();
  const match = trimmed.match(/^(?:doc\.)?([a-zA-Z][a-zA-Z0-9_]*)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|(true|false|null))$/);
  if (!match) throw errors.validation("Workflow condition uses unsupported syntax");
  const left = data[match[1]!];
  const literal = match[3] ?? match[4] ?? match[5] ?? match[6];
  let right: JsonValue = literal as string;
  if (match[5] !== undefined) right = Number(match[5]);
  else if (literal === "true") right = true;
  else if (literal === "false") right = false;
  else if (literal === "null") right = null;
  switch (match[2]) {
    case "==": return left === right;
    case "!=": return left !== right;
    case ">": return Number(left) > Number(right);
    case "<": return Number(left) < Number(right);
    case ">=": return Number(left) >= Number(right);
    case "<=": return Number(left) <= Number(right);
    default: return false;
  }
}
function isAdministrator(context: ControllerContext<JsonObject>): boolean { return context.command.actor.user_id === "Administrator" || context.command.actor.roles.includes("Administrator") || context.command.actor.roles.includes("System Manager"); }

function requireExisting(context: ControllerContext<JsonObject>): CanonicalDocument<JsonObject> { if (!context.existing) throw errors.notFound(); return context.existing; }
function sameJsonValue(left: JsonValue | undefined, right: JsonValue | undefined): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function isEmpty(value: JsonValue | undefined): boolean { return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
