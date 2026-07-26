/**
 * The customisation overlay: Custom Field and Property Setter.
 *
 * A tenant adapts a standard DocType by adding overlay rows, never by editing the
 * standard definition. That is what keeps upgrades possible: the standard
 * definition can be replaced wholesale and the customer's changes still apply on
 * top of the new one.
 *
 * The merge happens on read, so every consumer — controllers, permission checks,
 * list projections, the Frappe metadata endpoint — sees one effective schema and
 * none of them needs to know customisation exists.
 */

import { errors } from "../../core/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import type { DocFieldMeta, DocTypeMeta } from "./types.js";
import { parseDocTypeMeta } from "./validate.js";

export interface CustomFieldRecord {
  name: string;
  dt: string;
  fieldname: string;
  field: DocFieldMeta;
  insert_after: string | null;
}

export interface PropertySetterRecord {
  name: string;
  doc_type: string;
  doctype_or_field: "DocField" | "DocType";
  field_name: string;
  property: string;
  property_type: string;
  value: string | null;
}

/**
 * DocField properties a Property Setter may change.
 *
 * Deliberately a whitelist. `fieldname` and `fieldtype` are absent: changing a
 * fieldname would orphan every stored value under the old key, and changing a
 * fieldtype would reinterpret data already written under the old type — both
 * silently corrupt existing documents rather than customising a form.
 */
const FIELD_PROPERTIES: Record<string, "text" | "flag" | "int"> = {
  label: "text",
  options: "text",
  default: "text",
  description: "text",
  depends_on: "text",
  mandatory_depends_on: "text",
  read_only_depends_on: "text",
  fetch_from: "text",
  reqd: "flag",
  read_only: "flag",
  hidden: "flag",
  allow_on_submit: "flag",
  no_copy: "flag",
  unique: "flag",
  in_list_view: "flag",
  in_standard_filter: "flag",
  search_index: "flag",
  precision: "int",
  length: "int",
  permlevel: "int",
};

/**
 * DocType properties a Property Setter may change.
 *
 * `is_submittable` is absent: turning submission on or off for a doctype that
 * already has documents would leave those documents in a docstatus the lifecycle
 * no longer recognises.
 */
const DOCTYPE_PROPERTIES: Record<string, "text" | "flag"> = {
  title_field: "text",
  image_field: "text",
  sort_field: "text",
  sort_order: "text",
  autoname: "text",
  allow_rename: "flag",
  track_changes: "flag",
  track_seen: "flag",
};

/** Maps a Frappe DocField property name onto the kernel's field metadata key. */
const FIELD_KEY_ALIAS: Record<string, keyof DocFieldMeta> = {
  reqd: "required",
};

export interface MergeInput {
  base: DocTypeMeta;
  customFields: CustomFieldRecord[];
  propertySetters: PropertySetterRecord[];
  /** Combined revision of the overlay, so a cache can key on the merged result. */
  customizationRevision: number;
}

/**
 * Produces the effective DocType.
 *
 * The result is re-validated through `parseDocTypeMeta`, so a customisation
 * cannot produce a schema the platform would otherwise reject — for instance a
 * `mandatory_depends_on` the server cannot enforce, or a Select without options.
 * Validating the merged output (rather than only the overlay) is what makes that
 * guarantee hold for combinations, not just for each change in isolation.
 */
export function mergeCustomizations(input: MergeInput): DocTypeMeta {
  const fields = input.base.fields.map((field) => ({ ...field }));
  const byName = new Map(fields.map((field) => [field.fieldname, field]));

  for (const custom of input.customFields) {
    if (byName.has(custom.fieldname)) {
      // A custom field colliding with a standard one is refused rather than
      // silently overriding it: the standard field carries business meaning that
      // controllers depend on, and Property Setter is the supported way to adjust it.
      throw errors.validation(`Custom field ${custom.fieldname} collides with a standard field on ${input.base.name}`);
    }
    const field: DocFieldMeta = { ...custom.field, fieldname: custom.fieldname };
    const position = custom.insert_after ? fields.findIndex((entry) => entry.fieldname === custom.insert_after) : -1;
    if (position >= 0) fields.splice(position + 1, 0, field);
    else fields.push(field);
    byName.set(custom.fieldname, field);
  }

  const merged: DocTypeMeta = { ...input.base, fields };

  for (const setter of input.propertySetters) {
    if (setter.doctype_or_field === "DocField") {
      const target = byName.get(setter.field_name);
      // A setter pointing at a field that no longer exists is skipped, not fatal:
      // a standard definition may drop a field, and one stale overlay row must not
      // make the whole doctype unreadable.
      if (!target) continue;
      applyFieldProperty(target, setter);
      continue;
    }
    applyDocTypeProperty(merged, setter);
  }

  const validated = parseDocTypeMeta({ ...merged, revision: merged.revision } as unknown as JsonObject);
  return {
    ...validated,
    // The effective revision folds in the overlay, so any customisation change
    // invalidates a cache keyed on it.
    revision: merged.revision,
    ...(merged.modified_at === undefined ? {} : { modified_at: merged.modified_at }),
    effective_revision: `${merged.revision}.${input.customizationRevision}`,
  } as DocTypeMeta;
}

function applyFieldProperty(field: DocFieldMeta, setter: PropertySetterRecord): void {
  const kind = FIELD_PROPERTIES[setter.property];
  if (!kind) {
    throw errors.validation(`Property ${setter.property} cannot be customised on a field`, { fieldname: setter.field_name });
  }
  const key = FIELD_KEY_ALIAS[setter.property] ?? (setter.property as keyof DocFieldMeta);
  const value = coerce(kind, setter.value);
  if (value === undefined) delete field[key];
  else (field as Record<string, JsonValue>)[key as string] = value;
}

function applyDocTypeProperty(meta: DocTypeMeta, setter: PropertySetterRecord): void {
  const kind = DOCTYPE_PROPERTIES[setter.property];
  if (!kind) throw errors.validation(`Property ${setter.property} cannot be customised on a doctype`);
  const value = coerce(kind, setter.value);
  if (value === undefined) delete (meta as Record<string, unknown>)[setter.property];
  else (meta as Record<string, JsonValue>)[setter.property] = value;
}

/**
 * Property Setter values are always stored as text (that is Frappe's schema), so
 * they are coerced back to the type the metadata expects. An empty value clears
 * the property rather than setting it to a falsy value, which is how a
 * customisation is undone.
 */
function coerce(kind: "text" | "flag" | "int", raw: string | null): JsonValue | undefined {
  if (raw === null || raw === "") return kind === "flag" ? false : undefined;
  if (kind === "flag") return ["1", "true", "yes"].includes(raw.trim().toLowerCase());
  if (kind === "int") {
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) throw errors.validation(`Property value must be an integer: ${raw}`);
    return parsed;
  }
  return raw;
}

/**
 * Validates a Custom Field definition.
 *
 * Custom fieldnames must not collide with the framework's own columns, and are
 * confined to a conservative identifier shape because the fieldname becomes a JSON
 * key and a SQL projection alias.
 */
export function parseCustomField(value: unknown, expectedDoctype?: string): CustomFieldRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("Custom Field must be an object");
  const input = value as JsonObject;
  const dt = requireText(input.dt, "dt", 160);
  if (expectedDoctype && dt !== expectedDoctype) throw errors.validation("Custom Field dt does not match the route");
  const fieldname = requireText(input.fieldname, "fieldname", 140);
  if (!/^[a-z][a-z0-9_]*$/.test(fieldname)) {
    throw errors.validation("A custom fieldname must be lowercase letters, digits and underscores");
  }
  if (RESERVED_FIELDNAMES.has(fieldname)) throw errors.validation(`Fieldname is reserved: ${fieldname}`);

  // The field definition is validated by running it through the DocType parser as
  // a one-field doctype: the same rules apply, so there is no second code path to
  // keep in step.
  const probe = parseDocTypeMeta({
    name: `${dt} Custom ${fieldname}`,
    module: "Custom",
    fields: [{ ...(input.field as JsonObject ?? {}), fieldname }],
    permissions: [{ role: "System Manager", read: true }],
    revision: 1,
  } as unknown as JsonObject);
  const field = probe.fields[0];
  if (!field) throw errors.validation("Custom Field requires a field definition");

  const insertAfter = input.insert_after;
  return {
    name: typeof input.name === "string" && input.name ? input.name : `${dt}-${fieldname}`,
    dt,
    fieldname,
    field,
    insert_after: typeof insertAfter === "string" && insertAfter ? insertAfter : null,
  };
}

export function parsePropertySetter(value: unknown, expectedDoctype?: string): PropertySetterRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("Property Setter must be an object");
  const input = value as JsonObject;
  const docType = requireText(input.doc_type, "doc_type", 160);
  if (expectedDoctype && docType !== expectedDoctype) throw errors.validation("Property Setter doc_type does not match the route");
  const target = input.doctype_or_field === "DocType" ? "DocType" as const : "DocField" as const;
  const fieldName = target === "DocField" ? requireText(input.field_name, "field_name", 140) : "";
  const property = requireText(input.property, "property", 140);

  if (target === "DocField" && !FIELD_PROPERTIES[property]) {
    throw errors.validation(`Property ${property} cannot be customised on a field`);
  }
  if (target === "DocType" && !DOCTYPE_PROPERTIES[property]) {
    throw errors.validation(`Property ${property} cannot be customised on a doctype`);
  }

  return {
    name: typeof input.name === "string" && input.name ? input.name : `${docType}-${fieldName || "main"}-${property}`,
    doc_type: docType,
    doctype_or_field: target,
    field_name: fieldName,
    property,
    property_type: typeof input.property_type === "string" && input.property_type ? input.property_type : "Data",
    value: input.value === null || input.value === undefined ? null : String(input.value),
  };
}

/** Framework-owned names a custom field must never shadow. */
const RESERVED_FIELDNAMES = new Set([
  "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "version",
  "parent", "parenttype", "parentfield", "amended_from", "status", "naming_series",
]);

export const CUSTOMISABLE_FIELD_PROPERTIES = Object.freeze({ ...FIELD_PROPERTIES });
export const CUSTOMISABLE_DOCTYPE_PROPERTIES = Object.freeze({ ...DOCTYPE_PROPERTIES });

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${field} is required and must be at most ${max} characters`);
  }
  return value.trim();
}
