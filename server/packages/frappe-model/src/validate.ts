import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocFieldMeta, DocPermissionMeta, DocTypeMeta, MetaFieldType, WorkflowMeta } from "./types.js";
import { assertFieldConditionSupported } from "./field-condition.js";

/**
 * Every fieldtype this platform will accept in a DocType.
 *
 * A name is only added here once `normalizeValue` knows what a valid value looks like
 * and `listType` knows whether it can be queried. Adding one without those makes the
 * document saveable and then unsubmittable — the generic controller refuses an unknown
 * type on submit — which is a far worse failure than refusing the DocType outright.
 */
const FIELD_TYPES = new Set<MetaFieldType>([
  "Data", "Small Text", "Text", "Long Text", "Code", "Int", "Float", "Currency", "Percent", "Check",
  "Date", "Datetime", "Time", "Select", "Link", "Dynamic Link", "Table", "Table MultiSelect", "JSON",
  "Attach", "Attach Image", "Heading", "Section Break", "Column Break", "HTML",
  "Text Editor", "Markdown Editor", "HTML Editor", "Password", "Phone", "Color", "Icon",
  "Signature", "Barcode", "Autocomplete", "Image", "Read Only", "Duration", "Rating",
  "Geolocation", "Tab Break", "Fold", "Button",
]);
/**
 * Fieldtypes that carry no value.
 *
 * They are skipped when a document is normalised and exempt from the "unsupported
 * executable field type" refusal on submit — a layout marker must never be able to fail
 * a submit, because there is nothing about it that could be wrong.
 */
const LAYOUT_FIELDS = new Set<MetaFieldType>([
  "Heading", "Section Break", "Column Break", "HTML",
  // `Button` triggers a client action and stores nothing; `Tab Break` and `Fold` are
  // purely visual grouping.
  "Tab Break", "Fold", "Button",
]);
const SYSTEM_FIELDS = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "version"]);

export function parseDocTypeMeta(value: unknown, expectedName?: string): DocTypeMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("DocType metadata must be an object");
  const input = value as Record<string, unknown>;
  const name = text(input.name, "name", 160);
  if (expectedName && name !== expectedName) throw errors.validation("DocType name does not match route");
  const moduleName = text(input.module ?? "Custom", "module", 120);
  const fields = array(input.fields, "fields").map((field, index) => parseField(field, index));
  const permissions = array(input.permissions ?? [], "permissions").map((permission, index) => parsePermission(permission, index));
  const revision = safeInt(input.revision ?? 1, "revision", 1, Number.MAX_SAFE_INTEGER);
  assertUnique(fields.map((field) => field.fieldname), "fieldname");
  for (const field of fields) {
    if (SYSTEM_FIELDS.has(field.fieldname)) throw errors.validation(`Field name is reserved: ${field.fieldname}`);
    if ((field.fieldtype === "Link" || field.fieldtype === "Table") && !field.options) {
      throw errors.validation(`${field.fieldtype} field ${field.fieldname} requires options`);
    }
    if (field.fieldtype === "Select" && !field.options) throw errors.validation(`Select field ${field.fieldname} requires options`);
    if (field.fieldtype === "Dynamic Link") {
      // The target doctype is read from another field, so that field must exist —
      // otherwise the link can never be validated and would accept anything.
      if (!field.options) throw errors.validation(`Dynamic Link field ${field.fieldname} requires options naming the doctype field`);
      if (!fields.some((entry) => entry.fieldname === field.options)) {
        throw errors.validation(`Dynamic Link field ${field.fieldname} points at unknown field ${field.options}`);
      }
    }
    // Refused at save time, not ignored at runtime: a condition the server cannot
    // evaluate would be a validation rule that appears to exist but never fires.
    if (field.mandatory_depends_on) assertFieldConditionSupported(field.mandatory_depends_on, field.fieldname, "mandatory_depends_on");
  }
  if (!permissions.length) permissions.push({ role: "System Manager", read: true, write: true, create: true, submit: true, cancel: true, amend: true, print: true, email: true, report: true, import: true, export: true, share: true });
  const searchFields = input.search_fields === undefined ? undefined : array(input.search_fields, "search_fields").map((entry, index) => text(entry, `search_fields[${index}]`, 160));
  for (const field of searchFields ?? []) if (!fields.some((entry) => entry.fieldname === field)) throw errors.validation(`Unknown search field: ${field}`);
  const sortField = input.sort_field === undefined ? undefined : text(input.sort_field, "sort_field", 160);
  if (sortField && !["modified_at", "created_at", "name", "docstatus", "status"].includes(sortField) && !fields.some((field) => field.fieldname === sortField)) {
    throw errors.validation(`Unknown sort field: ${sortField}`);
  }
  const meta: DocTypeMeta = {
    name,
    module: moduleName,
    custom: bool(input.custom, false),
    is_child: bool(input.is_child, false),
    is_single: bool(input.is_single, false),
    is_submittable: bool(input.is_submittable, false),
    track_changes: bool(input.track_changes, true),
    track_seen: bool(input.track_seen, false),
    allow_rename: bool(input.allow_rename, false),
    ...(input.autoname === undefined ? {} : { autoname: text(input.autoname, "autoname", 240) }),
    ...(input.title_field === undefined ? {} : { title_field: text(input.title_field, "title_field", 160) }),
    ...(input.image_field === undefined ? {} : { image_field: text(input.image_field, "image_field", 160) }),
    ...(sortField ? { sort_field: sortField } : {}),
    sort_order: input.sort_order === "ASC" ? "ASC" : "DESC",
    ...(searchFields ? { search_fields: searchFields } : {}),
    fields: fields.map((field, index) => ({ ...field, idx: index + 1 })),
    permissions,
    revision,
  };
  return meta;
}

function parseField(value: unknown, index: number): DocFieldMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`fields[${index}] must be an object`);
  const input = value as Record<string, unknown>;
  const fieldname = identifier(input.fieldname, `fields[${index}].fieldname`);
  const fieldtype = text(input.fieldtype, `fields[${index}].fieldtype`, 64) as MetaFieldType;
  if (!FIELD_TYPES.has(fieldtype)) throw errors.validation(`Unsupported field type: ${fieldtype}`);
  const label = input.label === undefined ? fieldname.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : text(input.label, `fields[${index}].label`, 160);
  const precision = input.precision === undefined ? undefined : safeInt(input.precision, `fields[${index}].precision`, 0, 9);
  const length = input.length === undefined ? undefined : safeInt(input.length, `fields[${index}].length`, 1, 1_000_000);
  const permlevel = input.permlevel === undefined ? 0 : safeInt(input.permlevel, `fields[${index}].permlevel`, 0, 9);
  return {
    fieldname,
    label,
    fieldtype,
    ...(input.options === undefined ? {} : { options: text(input.options, `fields[${index}].options`, 5000) }),
    required: bool(input.required, false),
    read_only: bool(input.read_only, false),
    hidden: bool(input.hidden, false),
    allow_on_submit: bool(input.allow_on_submit, false),
    no_copy: bool(input.no_copy, false),
    unique: bool(input.unique, false),
    ...(input.default === undefined ? {} : { default: input.default as JsonValue }),
    ...(precision === undefined ? {} : { precision }),
    ...(length === undefined ? {} : { length }),
    in_list_view: bool(input.in_list_view, false),
    in_standard_filter: bool(input.in_standard_filter, false),
    search_index: bool(input.search_index, false),
    ...(input.fetch_from === undefined ? {} : { fetch_from: text(input.fetch_from, `fields[${index}].fetch_from`, 240) }),
    ...(input.depends_on === undefined ? {} : { depends_on: text(input.depends_on, `fields[${index}].depends_on`, 500) }),
    ...(input.mandatory_depends_on === undefined ? {} : { mandatory_depends_on: text(input.mandatory_depends_on, `fields[${index}].mandatory_depends_on`, 500) }),
    ...(input.read_only_depends_on === undefined ? {} : { read_only_depends_on: text(input.read_only_depends_on, `fields[${index}].read_only_depends_on`, 500) }),
    permlevel,
    ...(input.description === undefined ? {} : { description: text(input.description, `fields[${index}].description`, 2000) }),
    idx: index + 1,
  };
}

function parsePermission(value: unknown, index: number): DocPermissionMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`permissions[${index}] must be an object`);
  const input = value as Record<string, unknown>;
  return {
    role: text(input.role, `permissions[${index}].role`, 120),
    read: bool(input.read, false),
    write: bool(input.write, false),
    create: bool(input.create, false),
    submit: bool(input.submit, false),
    cancel: bool(input.cancel, false),
    amend: bool(input.amend, false),
    print: bool(input.print, false),
    email: bool(input.email, false),
    report: bool(input.report, false),
    import: bool(input.import, false),
    export: bool(input.export, false),
    share: bool(input.share, false),
    if_owner: bool(input.if_owner, false),
    permlevel: input.permlevel === undefined ? 0 : safeInt(input.permlevel, `permissions[${index}].permlevel`, 0, 9),
  };
}

export function validateWorkflow(value: unknown, expectedDoctype?: string): WorkflowMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("Workflow must be an object");
  const input = value as Record<string, unknown>;
  const documentType = text(input.document_type, "document_type", 160);
  if (expectedDoctype && documentType !== expectedDoctype) throw errors.validation("Workflow document_type does not match route");
  const states = array(input.states, "states").map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw errors.validation(`states[${index}] must be an object`);
    const state = entry as Record<string, unknown>;
    return {
      state: text(state.state, `states[${index}].state`, 120),
      docstatus: safeInt(state.docstatus, `states[${index}].docstatus`, 0, 2) as 0 | 1 | 2,
      ...(state.allow_edit === undefined ? {} : { allow_edit: text(state.allow_edit, `states[${index}].allow_edit`, 120) }),
      ...(state.style === undefined ? {} : { style: text(state.style, `states[${index}].style`, 80) }),
    };
  });
  const transitions = array(input.transitions, "transitions").map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw errors.validation(`transitions[${index}] must be an object`);
    const transition = entry as Record<string, unknown>;
    return {
      state: text(transition.state, `transitions[${index}].state`, 120),
      action: text(transition.action, `transitions[${index}].action`, 120),
      next_state: text(transition.next_state, `transitions[${index}].next_state`, 120),
      allowed_role: text(transition.allowed_role, `transitions[${index}].allowed_role`, 120),
      ...(transition.condition === undefined ? {} : { condition: text(transition.condition, `transitions[${index}].condition`, 1000) }),
      allow_self_approval: bool(transition.allow_self_approval, false),
    };
  });
  const stateNames = new Set(states.map((state) => state.state));
  for (const transition of transitions) {
    if (!stateNames.has(transition.state) || !stateNames.has(transition.next_state)) throw errors.validation(`Workflow transition references unknown state: ${transition.action}`);
  }
  return {
    name: text(input.name, "name", 160),
    document_type: documentType,
    state_field: identifier(input.state_field ?? "workflow_state", "state_field"),
    is_active: bool(input.is_active, true),
    states,
    transitions,
    revision: safeInt(input.revision ?? 1, "revision", 1, Number.MAX_SAFE_INTEGER),
  };
}

export function isLayoutField(field: DocFieldMeta): boolean { return LAYOUT_FIELDS.has(field.fieldtype); }
export function isSystemField(fieldname: string): boolean { return SYSTEM_FIELDS.has(fieldname); }

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw errors.validation(`${field} must be an array`);
  return value;
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} must be a non-empty string up to ${max} characters`);
  return value.trim();
}
function identifier(value: unknown, field: string): string {
  const result = text(value, field, 160);
  if (!/^[a-z][a-z0-9_]*$/i.test(result)) throw errors.validation(`${field} must be an identifier`);
  return result;
}
function safeInt(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw errors.validation(`${field} must be an integer from ${min} to ${max}`);
  return value;
}
function bool(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw errors.validation("Boolean metadata property must be true or false");
  return value;
}
function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw errors.validation(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}
