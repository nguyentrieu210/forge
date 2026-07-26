import type { DocumentListDefinition, FieldDef, FieldType } from "../../document-kernel/src/document-list.js";
import type { DocFieldMeta, DocTypeMeta } from "./types.js";

const COMMON: Record<string, FieldDef> = {
  name: { type: "string", source: { column: "name" } },
  status: { type: "string", source: { column: "status" } },
  docstatus: { type: "int", source: { column: "docstatus" } },
  version: { type: "int", source: { column: "version" } },
  owner: { type: "string", source: { column: "owner" } },
  created_at: { type: "date", source: { column: "created_at" } },
  modified_at: { type: "date", source: { column: "modified_at" } },
};

export function metadataToListDefinition(meta: DocTypeMeta): DocumentListDefinition {
  const fields: Record<string, FieldDef> = { ...COMMON };
  for (const field of meta.fields) {
    const type = listType(field);
    if (!type) continue;
    fields[field.fieldname] = { type, source: { json: `$.${field.fieldname}` } };
  }
  const listFields = meta.fields.filter((field) => field.in_list_view && Object.hasOwn(fields, field.fieldname)).map((field) => field.fieldname);
  const defaultFields = ["name", ...(meta.title_field && Object.hasOwn(fields, meta.title_field) ? [meta.title_field] : []), ...listFields, "status", "docstatus", "version", "modified_at"];
  const searchFields = [...new Set(["name", ...(meta.search_fields ?? []), ...meta.fields.filter((field) => field.search_index).map((field) => field.fieldname)])].filter((field) => Object.hasOwn(fields, field));
  // A tree's parent field is structurally filterable — walking the tree IS a
  // filter on it. Requiring the author to also flag it `in_standard_filter` turns
  // a correct tree definition into a "filter field is not allowed" error, so it is
  // included whenever the conventional field exists.
  const treeParentField = `parent_${meta.name.toLowerCase().replace(/ /g, "_")}`;
  const filterFields = [
    "docstatus", "status",
    ...(Object.hasOwn(fields, treeParentField) ? [treeParentField] : []),
    ...meta.fields.filter((field) => field.in_standard_filter || field.in_list_view).map((field) => field.fieldname),
  ].filter((field) => Object.hasOwn(fields, field));
  const sortField = meta.sort_field && Object.hasOwn(fields, meta.sort_field) ? meta.sort_field : "modified_at";
  return {
    doctype: meta.name,
    table: "documents",
    fields,
    defaultFields: [...new Set(defaultFields)].slice(0, 40),
    searchFields: searchFields.length ? searchFields : ["name"],
    filterFields: [...new Set(filterFields)],
    sortFields: [...new Set(["modified_at", "created_at", "name", "docstatus", sortField, ...meta.fields.filter((field) => field.in_list_view).map((field) => field.fieldname)])].filter((field) => Object.hasOwn(fields, field)),
    defaultSort: [{ field: sortField, direction: meta.sort_order === "ASC" ? "asc" : "desc" }],
  };
}

function listType(field: DocFieldMeta): FieldType | null {
  if (["Data", "Small Text", "Text", "Long Text", "Code", "Select", "Link", "Dynamic Link", "Attach", "Attach Image", "Currency", "Float", "Percent"].includes(field.fieldtype)) return "string";
  if (["Int", "Check"].includes(field.fieldtype)) return "int";
  if (["Date", "Datetime", "Time"].includes(field.fieldtype)) return "date";
  return null;
}
