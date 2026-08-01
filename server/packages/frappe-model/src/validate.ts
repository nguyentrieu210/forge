import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocFieldMeta, DocPermissionMeta, DocTypeKind, DocTypeMeta, DocTypeView, DocTypeViewPolicy, MetaFieldType, WorkflowMeta } from "./types.js";
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
/**
 * Names the kernel owns. A DocType that declares one of these loses it silently.
 *
 * `status` is here after it cost a live tenant its data. The kernel derives a `status`
 * column from docstatus and workflow state, and that name collides in THREE places at
 * once: the write path replaces a submitted value with the field default, the document
 * serialiser used to overwrite it with "Draft", and the list projection omits it. So an
 * app declaring `status:Select(Đang học,Tạm nghỉ,…)` got a column that could not be
 * written, read back differently on two endpoints, and displayed a value its own options
 * did not contain — with no error anywhere.
 *
 * Refusing the NAME is the smallest fix that cannot be wrong. Making `status` a usable
 * business field means changing all three paths in a shared kernel, and Frappe/ERPNext
 * do use one (Sales Order, Task, Issue), so that remains worth doing — but it is a
 * change to the document engine, not a patch, and it needs its own reproduction and
 * regression suite. Until then an app names the field `<thing>_status`, which works
 * today and reads no worse.
 */
const SYSTEM_FIELDS = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "version", "status"]);
const DOCTYPE_KINDS = new Set<DocTypeKind>(["transaction", "master", "child_table", "single", "tree", "virtual", "system"]);
const VALUE_SOURCES = new Set(["user", "default", "link", "formula", "system", "workflow"]);
const EDIT_MODES = new Set(["editable", "readonly", "set_once", "immutable_after_submit", "hidden"]);
const FIELD_SURFACES = new Set(["quick", "expanded", "internal"]);

export function parseDocTypeMeta(value: unknown, expectedName?: string): DocTypeMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("DocType metadata must be an object");
  const input = value as Record<string, unknown>;
  const name = text(input.name, "name", 160);
  if (expectedName && name !== expectedName) throw errors.validation("DocType name does not match route");
  const moduleName = text(input.module ?? "Custom", "module", 120);
  const fields = array(input.fields, "fields").map((field, index) => parseField(field, index));
  const permissions = array(input.permissions ?? [], "permissions").map((permission, index) => parsePermission(permission, index));
  const revision = safeInt(input.revision ?? 1, "revision", 1, Number.MAX_SAFE_INTEGER);
  const kind = input.kind === undefined ? undefined : text(input.kind, "kind", 32) as DocTypeKind;
  if (kind && !DOCTYPE_KINDS.has(kind)) throw errors.validation(`Unknown DocType kind: ${kind}`);
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
    ...(kind ? { kind } : {}),
    // Nhãn đi cùng metadata, không chỉ đi vào menu — xem `DocTypeMeta.label`.
    ...(input.label === undefined ? {} : { label: text(input.label, "label", 160) }),
    module: moduleName,
    custom: bool(input.custom, false),
    is_child: bool(input.is_child, false),
    is_tree: bool(input.is_tree, false),
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
    ...(input.viewPolicy === undefined ? {} : { viewPolicy: parseViewPolicy(input.viewPolicy, fields) }),
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
  const formWidth = input.form_width === undefined ? undefined : text(input.form_width, `fields[${index}].form_width`, 16);
  if (formWidth !== undefined && !["full", "half", "third"].includes(formWidth)) {
    throw errors.validation(`fields[${index}].form_width must be full, half, or third`);
  }
  const valueSource = input.valueSource === undefined ? undefined : text(input.valueSource, `fields[${index}].valueSource`, 24);
  const editMode = input.editMode === undefined ? undefined : text(input.editMode, `fields[${index}].editMode`, 32);
  const surface = input.surface === undefined ? undefined : text(input.surface, `fields[${index}].surface`, 24);
  const dirtyGuard = input.dirtyGuard === undefined ? undefined : text(input.dirtyGuard, `fields[${index}].dirtyGuard`, 32);
  if (input.required !== undefined && input.reqd !== undefined && bool(input.required, false) !== bool(input.reqd, false)) {
    throw errors.validation(`fields[${index}] has conflicting required and reqd values`);
  }
  const required = input.required === undefined ? bool(input.reqd, false) : bool(input.required, false);
  if (valueSource && !VALUE_SOURCES.has(valueSource)) throw errors.validation(`fields[${index}].valueSource is not recognised: ${valueSource}`);
  if (editMode && !EDIT_MODES.has(editMode)) throw errors.validation(`fields[${index}].editMode is not recognised: ${editMode}`);
  if (surface && !FIELD_SURFACES.has(surface)) throw errors.validation(`fields[${index}].surface is not recognised: ${surface}`);
  if (dirtyGuard && dirtyGuard !== "preserve_user_value") throw errors.validation(`fields[${index}].dirtyGuard is not recognised: ${dirtyGuard}`);
  if (editMode === "editable" && bool(input.read_only, false)) throw errors.validation(`fields[${index}] cannot be editable and read_only`);
  if (editMode === "readonly" && !bool(input.read_only, false)) throw errors.validation(`fields[${index}].editMode readonly requires read_only=true`);
  if (editMode === "set_once" && !bool(input.set_only_once, false)) throw errors.validation(`fields[${index}].editMode set_once requires set_only_once=true`);
  if (editMode === "hidden" && !bool(input.hidden, false)) throw errors.validation(`fields[${index}].editMode hidden requires hidden=true`);
  if (surface === "internal" && editMode === "editable") throw errors.validation(`fields[${index}] cannot be internal and editable`);
  if (valueSource === "link" && input.fetch_from === undefined) throw errors.validation(`fields[${index}].valueSource link requires fetch_from`);
  if (valueSource === "default" && input.default === undefined) throw errors.validation(`fields[${index}].valueSource default requires default`);
  return {
    fieldname,
    label,
    fieldtype,
    ...(input.options === undefined ? {} : { options: text(input.options, `fields[${index}].options`, 5000) }),
    required,
    read_only: bool(input.read_only, false),
    hidden: bool(input.hidden, false),
    list_only: bool(input.list_only, false),
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
    ...(formWidth === undefined ? {} : { form_width: formWidth as "full" | "half" | "third" }),
    ...(valueSource ? { valueSource: valueSource as NonNullable<DocFieldMeta["valueSource"]> } : {}),
    ...(editMode ? { editMode: editMode as NonNullable<DocFieldMeta["editMode"]> } : {}),
    ...(surface ? { surface: surface as NonNullable<DocFieldMeta["surface"]> } : {}),
    serverEnforced: bool(input.serverEnforced, false),
    ...(dirtyGuard ? { dirtyGuard: "preserve_user_value" as const } : {}),
    // Value rules the SERVER enforces. Grouped here rather than scattered so it stays
    // obvious which properties change behaviour and which only change appearance.
    set_only_once: bool(input.set_only_once, false),
    non_negative: bool(input.non_negative, false),
    not_nullable: bool(input.not_nullable, false),
    print_hide: bool(input.print_hide, false),
    print_hide_if_no_value: bool(input.print_hide_if_no_value, false),
    ...presentation(input, index),
    idx: index + 1,
  };
}

function parseViewPolicy(value: unknown, fields: DocFieldMeta[]): DocTypeViewPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("viewPolicy must be an object");
  const input = value as Record<string, unknown>;
  const known = new Set(fields.map((field) => field.fieldname));
  const parseView = (key: string, required = false): DocTypeView | undefined => {
    const raw = input[key];
    if (raw === undefined) {
      if (required) throw errors.validation(`viewPolicy.${key} is required`);
      return undefined;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`viewPolicy.${key} must be an object`);
    const entry = raw as Record<string, unknown>;
    const named = (property: "fields" | "columns") => entry[property] === undefined
      ? undefined
      : array(entry[property], `viewPolicy.${key}.${property}`).map((item, index) => {
          const name = text(item, `viewPolicy.${key}.${property}[${index}]`, 160);
          if (!known.has(name)) throw errors.validation(`viewPolicy.${key}.${property} names unknown field: ${name}`);
          return name;
        });
    const fieldsValue = named("fields");
    const columnsValue = named("columns");
    const fieldRef = (property: "stageField" | "startField" | "endField") => {
      if (entry[property] === undefined) return undefined;
      const name = text(entry[property], `viewPolicy.${key}.${property}`, 160);
      if (!known.has(name)) throw errors.validation(`viewPolicy.${key}.${property} names unknown field: ${name}`);
      return name;
    };
    const stageField = fieldRef("stageField");
    const startField = fieldRef("startField");
    const endField = fieldRef("endField");
    return {
      enabled: bool(entry.enabled, false),
      ...(fieldsValue ? { fields: fieldsValue } : {}),
      ...(columnsValue ? { columns: columnsValue } : {}),
      ...(stageField ? { stageField } : {}),
      ...(startField ? { startField } : {}),
      ...(endField ? { endField } : {}),
    };
  };
  const quickEntry = parseView("quickEntry");
  const kanban = parseView("kanban");
  const calendar = parseView("calendar");
  const gantt = parseView("gantt");
  const chart = parseView("chart");
  return {
    list: parseView("list", true)!,
    form: parseView("form", true)!,
    ...(quickEntry ? { quickEntry } : {}),
    ...(kanban ? { kanban } : {}),
    ...(calendar ? { calendar } : {}),
    ...(gantt ? { gantt } : {}),
    ...(chart ? { chart } : {}),
    ...(input.mobile && typeof input.mobile === "object" && !Array.isArray(input.mobile) ? { mobile: input.mobile as JsonObject } : {}),
  };
}

/**
 * Boolean presentation properties, carried through untouched.
 *
 * The parser builds an allow-listed object, so anything not named here is DROPPED. That
 * silently cost every imported Frappe DocType its entire presentation layer — column
 * widths, collapsible sections, print visibility, quick-entry flags — and the loss was
 * invisible, because the document still saved and the list still rendered. It just
 * rendered wrong, in a way no test asserted.
 *
 * These have no server behaviour and are not invented here: the names and meanings are
 * Frappe's, so a DocType exported from a Frappe site keeps working when it lands here.
 */
const PRESENTATION_FLAGS = [
  "bold", "collapsible", "in_preview", "allow_in_quick_entry", "remember_last_selected_value",
  "report_hide", "hide_border", "hide_days", "hide_seconds", "show_dashboard", "in_filter",
  "translatable", "ignore_user_permissions", "allow_bulk_edit", "ignore_xss_filter",
  "in_global_search", "show_on_timeline", "sort_options", "make_attachment_public",
  "sticky", "show_description_on_click", "is_virtual",
] as const;

const PRESENTATION_TEXT: Array<[key: string, max: number]> = [
  ["collapsible_depends_on", 500], ["placeholder", 240], ["documentation_url", 500],
  ["mask", 64], ["button_color", 32], ["alignment", 16], ["link_filters", 2000],
  ["fetch_if_empty", 8], ["oldfieldname", 140], ["oldfieldtype", 64],
];

const PRESENTATION_INT: Array<[key: string, min: number, max: number]> = [
  ["columns", 0, 11], ["width", 0, 4000], ["print_width", 0, 4000], ["max_height", 0, 4000],
];

function presentation(input: Record<string, unknown>, index: number): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const key of PRESENTATION_FLAGS) {
    if (input[key] !== undefined) out[key] = bool(input[key], false);
  }
  for (const [key, max] of PRESENTATION_TEXT) {
    if (input[key] !== undefined) out[key] = text(input[key], `fields[${index}].${key}`, max);
  }
  for (const [key, min, max] of PRESENTATION_INT) {
    if (input[key] !== undefined) out[key] = safeInt(input[key], `fields[${index}].${key}`, min, max);
  }
  return out;
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
