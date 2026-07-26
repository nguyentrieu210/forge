/**
 * Canonical kernel document ⇄ Frappe document.
 *
 * Frappe puts framework fields alongside business fields in one flat object, and
 * child rows inline under their `parentfield` with their own framework fields.
 * The kernel keeps them apart (`data` vs `children`), which is the better model —
 * so this file is the only place the two shapes meet.
 */

import type { CanonicalDocument, ChildRow, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { toFrappeDatetime, toFrappeModified } from "./datetime.js";
import { isServerOwnedField } from "./command.js";

/** Frappe child-row framework fields, set by the server on the way out. */
interface FrappeChildRow extends JsonObject {
  name: string;
  doctype: string;
  parent: string;
  parenttype: string;
  parentfield: string;
  idx: number;
}

/**
 * Kernel document → Frappe document.
 *
 * `modified` is the concurrency token (see `datetime.ts`), not a display value:
 * it encodes the version so a stale client cannot match it.
 */
export function toFrappeDoc(document: CanonicalDocument): JsonObject {
  const doc: JsonObject = {
    ...document.data,
    doctype: document.doctype,
    name: document.name,
    owner: document.owner,
    creation: toFrappeDatetime(document.created_at),
    modified: toFrappeModified(document.modified_at, document.version),
    // Stamped by the store from the authenticated actor. Documents written before
    // the column existed have none, and fall back to the creator rather than
    // reporting an empty author.
    modified_by: document.modified_by ?? document.owner,
    docstatus: document.docstatus,
    idx: 0,
    status: document.status,
  };
  if (document.amended_from) doc.amended_from = document.amended_from;
  for (const [fieldname, rows] of groupChildren(document).entries()) {
    doc[fieldname] = rows.map((row) => toFrappeChildRow(document, fieldname, row));
  }
  return doc;
}

/** List-row projection: no children, no redundant framework fields. */
export function toFrappeListRow(row: JsonObject): JsonObject {
  const output: JsonObject = { ...row };
  if (typeof output.modified_at === "string" && typeof output.version === "number") {
    output.modified = toFrappeModified(output.modified_at, output.version);
  }
  if (typeof output.created_at === "string") output.creation = toFrappeDatetime(output.created_at);
  delete output.modified_at;
  delete output.created_at;
  delete output.version;
  delete output.doc_key;
  delete output.tenant_id;
  return output;
}

/**
 * Frappe document → kernel document payload.
 *
 * Server-owned fields are dropped (a client must not be able to name its own
 * owner or docstatus), and child rows are rewritten to the kernel's `row_id`
 * convention. A row that arrives without a name is a new row: leaving `row_id`
 * unset lets the kernel mint one.
 */
export function fromFrappeDoc(document: JsonObject, tableFields: ReadonlySet<string>): JsonObject {
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(document)) {
    if (isServerOwnedField(key)) continue;
    if (tableFields.has(key)) {
      output[key] = Array.isArray(value) ? value.map((row) => fromFrappeChildRow(row)) : [];
      continue;
    }
    output[key] = value;
  }
  return output;
}

function fromFrappeChildRow(row: JsonValue): JsonObject {
  if (!row || typeof row !== "object" || Array.isArray(row)) return {};
  const input = row as JsonObject;
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    // `name` on a child row is its row identity; everything else Frappe attaches
    // (parent, parenttype, parentfield, idx, doctype) is derived server-side.
    if (["doctype", "parent", "parenttype", "parentfield", "idx", "owner", "creation", "modified", "modified_by", "docstatus"].includes(key)) continue;
    if (key.startsWith("__")) continue;
    if (key === "name") {
      // A locally-created row carries a temporary client id ("new-xyz-1"); it
      // must not become a durable row_id, so only real ids are carried over.
      if (typeof value === "string" && value && !value.startsWith("new-")) output.row_id = value;
      continue;
    }
    output[key] = value;
  }
  return output;
}

function toFrappeChildRow(document: CanonicalDocument, fieldname: string, row: ChildRow): FrappeChildRow {
  return {
    ...row.data,
    name: row.row_id,
    doctype: row.child_doctype,
    parent: document.name,
    parenttype: document.doctype,
    parentfield: fieldname,
    idx: row.idx,
  };
}

function groupChildren(document: CanonicalDocument): Map<string, ChildRow[]> {
  const grouped = new Map<string, ChildRow[]>();
  for (const row of document.children) {
    const existing = grouped.get(row.fieldname);
    if (existing) existing.push(row);
    else grouped.set(row.fieldname, [row]);
  }
  for (const rows of grouped.values()) rows.sort((left, right) => left.idx - right.idx);
  return grouped;
}
