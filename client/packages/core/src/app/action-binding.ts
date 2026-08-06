import type { AppActionField } from "./manifest.js";
import type { AppActionInputTable } from "./action-input-table.js";
import { buildMetadataDefaults } from "../meta/intelligence.js";
import type { Doc, DocField, DocTypeMeta } from "../types/meta.js";
import type { Fieldtype } from "../types/fieldtype.js";

function isLayout(fieldtype: string): boolean {
  return ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button", "Table", "Table MultiSelect"].includes(fieldtype);
}

/**
 * Resolve one action input against canonical DocType metadata.
 *
 * When a canonical field exists, security/semantics come from that field. The action declaration
 * may provide a user-facing label/description for the task surface, but it does not become a
 * second source for fieldtype/options/required/default/read-only rules. Synthetic action-only
 * fields keep the legacy explicit declaration.
 */
export function bindActionField(declared: AppActionField, meta?: DocTypeMeta): DocField {
  const canonical = meta?.fields.find((field) => field.fieldname === declared.fieldname && !isLayout(field.fieldtype));
  if (canonical) {
    return {
      ...canonical,
      label: declared.label || canonical.label,
      ...(declared.description ? { description: declared.description } : {}),
    };
  }
  return {
    fieldname: declared.fieldname,
    label: declared.label,
    fieldtype: declared.fieldtype as Fieldtype,
    ...(declared.options ? { options: declared.options } : {}),
    ...(declared.required ? { reqd: 1 as const } : {}),
    ...(declared.default == null ? {} : { default: declared.default }),
    ...(declared.description ? { description: declared.description } : {}),
  } as DocField;
}

/** Primary action-table columns in declared order, with canonical semantics where bound. */
export function bindActionTableColumns(table: AppActionInputTable, meta?: DocTypeMeta): DocField[] {
  return table.columns.map((column) => {
    const bound = bindActionField(column, meta);
    // Legacy packages may have link_filters only on the action column. Preserve them only when
    // canonical metadata has not declared its own rule; new packages should declare on DocField.
    const legacyFilters = typeof column.link_filters === "string" && !bound.link_filters
      ? { link_filters: column.link_filters }
      : {};
    return { ...bound, ...legacyFilters, in_list_view: 1 as const };
  });
}

/**
 * New action row = canonical child defaults first, legacy action defaults only as fallback.
 * Today/Now therefore match normal Form/Child behavior.
 */
export function buildActionTableRow(meta: DocTypeMeta, table: AppActionInputTable, name: string): Doc {
  const row = {
    name,
    doctype: meta.name,
    ...buildMetadataDefaults(meta),
  } as Doc;
  for (const column of table.columns) {
    if (column.default == null || column.default === "") continue;
    if (row[column.fieldname] == null || row[column.fieldname] === "") row[column.fieldname] = column.default;
  }
  return row;
}
