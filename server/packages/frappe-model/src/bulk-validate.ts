import { errors } from "../../core/src/index.js";
import type { DocFieldMeta, DocTypeKind, DocTypeView } from "./types.js";

export interface BulkMetaContext {
  kind?: DocTypeKind;
  isChild: boolean;
  isTree: boolean;
  isSingle: boolean;
  isSubmittable: boolean;
}

/**
 * Parse the canonical top-level `viewPolicy.bulk` contract.
 *
 * The client already understands this shape. Keeping the parser here prevents the server
 * from silently dropping it before `getdoctype` transports metadata back to the client.
 * Enabled canonical Bulk also fails closed under the same master-only rule as the client.
 */
export function parseBulkViewPolicy(value: unknown, fields: DocFieldMeta[], context: BulkMetaContext): DocTypeView {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("viewPolicy.bulk must be an object");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["enabled", "columns", "editableFields", "commitStrategy", "allowPaste", "allowFillDown", "pageSize"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw errors.validation(`viewPolicy.bulk has unknown property: ${key}`);

  const known = new Map(fields.map((field) => [field.fieldname, field]));
  const columns = names(input.columns, "viewPolicy.bulk.columns", known);
  const editableFields = names(input.editableFields, "viewPolicy.bulk.editableFields", known);
  const columnSet = new Set(columns ?? []);
  for (const fieldname of editableFields ?? []) {
    if (!columnSet.has(fieldname)) throw errors.validation(`viewPolicy.bulk.editableFields must be a subset of columns: ${fieldname}`);
    const field = known.get(fieldname)!;
    if (field.read_only || field.read_only_depends_on || field.serverEnforced || field.surface === "internal") {
      throw errors.validation(`viewPolicy.bulk.editableFields targets readonly or server-owned field: ${fieldname}`);
    }
    if (["readonly", "hidden", "set_once", "immutable_after_submit"].includes(field.editMode ?? "editable")) {
      throw errors.validation(`viewPolicy.bulk.editableFields targets unsafe editMode: ${fieldname}`);
    }
  }

  let commitStrategy;
  if (input.commitStrategy !== undefined) {
    if (input.commitStrategy !== "document_update") throw errors.validation("viewPolicy.bulk.commitStrategy must be document_update");
    commitStrategy = "document_update" as const;
  }

  const enabled = boolean(input.enabled, "viewPolicy.bulk.enabled", false);
  if (enabled) {
    if (commitStrategy !== "document_update") throw errors.validation("viewPolicy.bulk enabled policy requires commitStrategy=document_update");
    if (!columns?.length) throw errors.validation("viewPolicy.bulk enabled policy requires at least one column");
    if (!editableFields?.length) throw errors.validation("viewPolicy.bulk enabled policy requires at least one editable field");
    if (!genericDocumentUpdateSafe(context)) {
      throw errors.validation("viewPolicy.bulk cannot use document_update for transaction, child, tree, single, or submittable metadata");
    }
  }

  return {
    enabled,
    ...(columns ? { columns } : {}),
    ...(editableFields ? { editableFields } : {}),
    ...(commitStrategy ? { commitStrategy } : {}),
    ...(input.allowPaste === undefined ? {} : { allowPaste: boolean(input.allowPaste, "viewPolicy.bulk.allowPaste", false) }),
    ...(input.allowFillDown === undefined ? {} : { allowFillDown: boolean(input.allowFillDown, "viewPolicy.bulk.allowFillDown", false) }),
    ...(input.pageSize === undefined ? {} : { pageSize: integer(input.pageSize, "viewPolicy.bulk.pageSize", 20, 500) }),
  };
}

function genericDocumentUpdateSafe(context: BulkMetaContext): boolean {
  if (context.kind && context.kind !== "master") return false;
  return !context.isChild && !context.isTree && !context.isSingle && !context.isSubmittable;
}

function names(value: unknown, path: string, known: Map<string, DocFieldMeta>): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw errors.validation(`${path} must be an array`);
  const result = value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim() || entry.length > 160) throw errors.validation(`${path}[${index}] must be a fieldname`);
    const name = entry.trim();
    if (!known.has(name)) throw errors.validation(`${path} names unknown field: ${name}`);
    return name;
  });
  const seen = new Set<string>();
  for (const name of result) {
    if (seen.has(name)) throw errors.validation(`${path} contains duplicate field: ${name}`);
    seen.add(name);
  }
  return result;
}

function boolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw errors.validation(`${path} must be true or false`);
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw errors.validation(`${path} must be an integer from ${min} to ${max}`);
  }
  return value;
}
