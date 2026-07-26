/**
 * Kernel `DocTypeMeta` → Frappe DocType bundle.
 *
 * Three naming differences matter and are easy to get silently wrong:
 *
 * - Frappe spells the flags `issingle` / `istable`; the kernel spells them
 *   `is_single` / `is_child`.
 * - Frappe spells "mandatory" as `reqd`, not `required`.
 * - Frappe booleans on the wire are the integers 0/1, and `precision` is a
 *   STRING. The client's field types encode all of this (`reqd?: 0 | 1`), so a
 *   stray `true` or numeric precision would be read as absent.
 *
 * `search_fields` is a comma-separated string in Frappe, not an array.
 */

import type { JsonObject } from "../../contracts/src/index.js";
import type { DocFieldMeta, DocPermissionMeta, DocTypeMeta, WorkflowMeta } from "../../frappe-model/src/index.js";

type Flag = 0 | 1;

const flag = (value: unknown): Flag => (value ? 1 : 0);

/**
 * One DocField row.
 *
 * `depends_on`, `fetch_from`, `mandatory_depends_on` and `read_only_depends_on`
 * are passed through verbatim and deliberately: the kernel stores them but never
 * evaluates them, while the client DOES (safe-eval allowlist for `depends_on`, a
 * resolver for `fetch_from`). Serving them is what makes them live.
 */
export function toFrappeDocField(field: DocFieldMeta): JsonObject {
  const row: JsonObject = {
    fieldname: field.fieldname,
    label: field.label,
    fieldtype: field.fieldtype,
    idx: field.idx ?? 0,
    reqd: flag(field.required),
    read_only: flag(field.read_only),
    hidden: flag(field.hidden),
    allow_on_submit: flag(field.allow_on_submit),
    no_copy: flag(field.no_copy),
    unique: flag(field.unique),
    in_list_view: flag(field.in_list_view),
    in_standard_filter: flag(field.in_standard_filter),
    search_index: flag(field.search_index),
    permlevel: field.permlevel ?? 0,
  };
  if (field.options !== undefined) row.options = field.options;
  if (field.default !== undefined) row.default = field.default;
  // Frappe carries precision as a string ("2"), and an empty value means
  // "inherit the currency/float default" — so 0 must not be emitted as "0".
  if (field.precision !== undefined) row.precision = String(field.precision);
  if (field.length !== undefined) row.length = field.length;
  if (field.fetch_from !== undefined) row.fetch_from = field.fetch_from;
  if (field.depends_on !== undefined) row.depends_on = field.depends_on;
  if (field.mandatory_depends_on !== undefined) row.mandatory_depends_on = field.mandatory_depends_on;
  if (field.read_only_depends_on !== undefined) row.read_only_depends_on = field.read_only_depends_on;
  if (field.description !== undefined) row.description = field.description;
  return row;
}

/** One DocPerm row. Frappe keys permission types dynamically, all as 0/1. */
export function toFrappeDocPerm(permission: DocPermissionMeta): JsonObject {
  return {
    role: permission.role,
    permlevel: permission.permlevel ?? 0,
    read: flag(permission.read),
    write: flag(permission.write),
    create: flag(permission.create),
    // The kernel has no separate delete permission; deleting a document is a
    // write-class action, so it inherits `write` rather than being reported as
    // permanently denied (which would grey out the UI action for everyone).
    delete: flag(permission.write),
    submit: flag(permission.submit),
    cancel: flag(permission.cancel),
    amend: flag(permission.amend),
    print: flag(permission.print),
    email: flag(permission.email),
    report: flag(permission.report),
    import: flag(permission.import),
    export: flag(permission.export),
    share: flag(permission.share),
    if_owner: flag(permission.if_owner),
  };
}

export interface MetaBundleInput {
  meta: DocTypeMeta;
  /** Child DocType metas referenced by Table fields, for `with_parent=1`. */
  children?: DocTypeMeta[];
  workflow?: WorkflowMeta | null;
  /** Fieldnames whose VALUES were redacted by permlevel — schema stays visible. */
  maskedFields?: string[];
}

/**
 * The `getdoctype` response.
 *
 * `docs` must contain the requested DocType findable BY NAME. The client looks it
 * up by name rather than taking `docs[0]`, because Frappe answers a query about a
 * child DocType with the parent's whole bundle, parent first — taking the first
 * element there yields the wrong meta entirely.
 */
export function toFrappeMetaBundle(input: MetaBundleInput): JsonObject {
  const docs = [toFrappeDocType(input.meta, input.workflow ?? null), ...(input.children ?? []).map((child) => toFrappeDocType(child, null))];
  const body: JsonObject = { docs, user_settings: "{}" };
  if (input.maskedFields && input.maskedFields.length) body.masked_fields = input.maskedFields;
  return body;
}

export function toFrappeDocType(meta: DocTypeMeta, workflow: WorkflowMeta | null): JsonObject {
  const doc: JsonObject = {
    doctype: "DocType",
    name: meta.name,
    module: meta.module,
    custom: flag(meta.custom),
    issingle: flag(meta.is_single),
    istable: flag(meta.is_child),
    is_submittable: flag(meta.is_submittable),
    track_changes: flag(meta.track_changes),
    track_seen: flag(meta.track_seen),
    allow_rename: flag(meta.allow_rename),
    sort_order: meta.sort_order ?? "DESC",
    fields: meta.fields.map(toFrappeDocField),
    permissions: meta.permissions.map(toFrappeDocPerm),
    // Not part of Frappe's DocType, but the client tolerates extra keys and the
    // builder needs the revision to detect a concurrent metadata edit.
    revision: meta.revision,
  };
  if (meta.autoname !== undefined) doc.autoname = meta.autoname;
  if (meta.title_field !== undefined) doc.title_field = meta.title_field;
  if (meta.image_field !== undefined) doc.image_field = meta.image_field;
  if (meta.sort_field !== undefined) doc.sort_field = meta.sort_field;
  if (meta.search_fields !== undefined) doc.search_fields = meta.search_fields.join(",");
  if (meta.modified_at !== undefined) doc.modified = meta.modified_at;
  if (workflow) doc.__workflow_docs = [toFrappeWorkflow(workflow)];
  return doc;
}

/** Workflow in Frappe's `Workflow` DocType shape, for `__workflow_docs`. */
export function toFrappeWorkflow(workflow: WorkflowMeta): JsonObject {
  return {
    doctype: "Workflow",
    name: workflow.name,
    document_type: workflow.document_type,
    workflow_state_field: workflow.state_field,
    is_active: flag(workflow.is_active),
    states: workflow.states.map((state, index) => ({
      doctype: "Workflow Document State",
      idx: index + 1,
      state: state.state,
      doc_status: String(state.docstatus),
      ...(state.allow_edit === undefined ? {} : { allow_edit: state.allow_edit }),
      ...(state.style === undefined ? {} : { style: state.style }),
    })),
    transitions: workflow.transitions.map((transition, index) => ({
      doctype: "Workflow Transition",
      idx: index + 1,
      state: transition.state,
      action: transition.action,
      next_state: transition.next_state,
      allowed: transition.allowed_role,
      allow_self_approval: flag(transition.allow_self_approval),
      ...(transition.condition === undefined ? {} : { condition: transition.condition }),
    })),
  };
}

/** Fieldnames present in the full meta but absent after permlevel filtering. */
export function maskedFieldNames(full: DocTypeMeta, filtered: DocTypeMeta): string[] {
  const visible = new Set(filtered.fields.map((field) => field.fieldname));
  return full.fields.filter((field) => !visible.has(field.fieldname)).map((field) => field.fieldname);
}

/** Fieldnames of Table / Table MultiSelect fields — needed to unpack child rows. */
export function tableFieldNames(meta: DocTypeMeta): Set<string> {
  return new Set(meta.fields.filter((field) => field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect").map((field) => field.fieldname));
}

/** Child DocType names referenced by this meta's Table fields. */
export function childDocTypeNames(meta: DocTypeMeta): string[] {
  const names = new Set<string>();
  for (const field of meta.fields) {
    if ((field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") && field.options) names.add(field.options);
  }
  return [...names];
}
