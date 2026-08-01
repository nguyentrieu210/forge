import type { DocField, DocTypeMeta, DocTypeView } from "../types/meta.js";

const BULK_UNSAFE_FIELD_TYPES = new Set([
  "Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button",
  "Table", "Table MultiSelect", "Attach", "Attach Image", "Signature", "Password",
]);

export interface BulkRenderPolicy {
  enabled: boolean;
  columns: DocField[];
  editable: Set<string>;
  allowPaste: boolean;
  allowFillDown: boolean;
  pageSize: number;
}

function legacyBulkView(meta: DocTypeMeta): DocTypeView | undefined {
  // Compatibility bridge for brief-built packages while the short brief compiler catches up
  // with the canonical viewPolicy.bulk key. App-source packages should declare bulk directly.
  const mobile = meta.viewPolicy?.mobile;
  const candidate = mobile && typeof mobile === "object" ? mobile.bulk : undefined;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as DocTypeView
    : undefined;
}

function editableField(field: DocField): boolean {
  return !BULK_UNSAFE_FIELD_TYPES.has(field.fieldtype)
    && field.surface !== "internal"
    && field.hidden !== 1
    && field.read_only !== 1
    && field.serverEnforced !== true
    && !["readonly", "hidden", "set_once", "immutable_after_submit"].includes(field.editMode ?? "editable");
}

/**
 * Canonical composition point for the spreadsheet-like Bulk renderer.
 *
 * Bulk v1 intentionally only accepts `document_update`. Transactions, submitted documents,
 * stock ledgers and child-table orchestration need purpose-built method-backed workspaces;
 * allowing them through a generic mass editor would bypass the invariants their controllers own.
 */
export function resolveBulkRenderPolicy(meta: DocTypeMeta): BulkRenderPolicy {
  const view = meta.viewPolicy?.bulk ?? legacyBulkView(meta);
  if (!view?.enabled || view.commitStrategy !== "document_update") {
    return { enabled: false, columns: [], editable: new Set(), allowPaste: false, allowFillDown: false, pageSize: 100 };
  }
  if (meta.kind && meta.kind !== "master") {
    return { enabled: false, columns: [], editable: new Set(), allowPaste: false, allowFillDown: false, pageSize: 100 };
  }
  if (meta.istable === 1 || meta.issingle === 1 || meta.is_submittable === 1) {
    return { enabled: false, columns: [], editable: new Set(), allowPaste: false, allowFillDown: false, pageSize: 100 };
  }

  const byName = new Map(meta.fields.map((field) => [field.fieldname, field]));
  const columnNames = Array.isArray(view.columns) ? view.columns : [];
  const editableNames = new Set(Array.isArray(view.editableFields) ? view.editableFields : []);
  const columns = columnNames
    .map((name) => byName.get(name))
    .filter((field): field is DocField => Boolean(field) && field!.surface !== "internal" && field!.hidden !== 1);
  const visibleNames = new Set(columns.map((field) => field.fieldname));
  const editable = new Set(
    [...editableNames].filter((name) => {
      const field = byName.get(name);
      return visibleNames.has(name) && Boolean(field && editableField(field));
    }),
  );

  return {
    enabled: columns.length > 0 && editable.size > 0,
    columns,
    editable,
    allowPaste: view.allowPaste !== false,
    allowFillDown: view.allowFillDown !== false,
    pageSize: Number.isInteger(view.pageSize) ? Math.min(500, Math.max(20, Number(view.pageSize))) : 100,
  };
}
