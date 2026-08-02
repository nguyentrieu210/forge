import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export interface FrappeIncrementalCursor {
  modified: string;
  name: string;
}

export interface FrappeIncrementalPageRequest {
  doctype: string;
  fields: string[];
  filters: JsonValue[];
  or_filters: JsonValue[];
  order_by: string;
  limit_page_length: number;
}

/**
 * Builds stable `(modified, name)` pagination for Frappe-shaped list APIs.
 *
 * Filtering only on `modified > last_modified` loses records when multiple rows share the
 * same timestamp at a page boundary. The pair cursor keeps rows with equal timestamps and
 * advances by `name`, while ordering by both fields makes replay deterministic.
 */
export function buildFrappeIncrementalPageRequest(input: {
  doctype: string;
  fields: string[];
  cursor?: FrappeIncrementalCursor;
  page_length?: number;
}): FrappeIncrementalPageRequest {
  const doctype = requireText(input.doctype, "doctype", 160);
  const requestedFields = input.fields.map((field, index) => requireText(field, `fields[${index}]`, 160));
  const fields = [...new Set(["name", "modified", ...requestedFields])];
  const pageLength = input.page_length ?? 200;
  if (!Number.isSafeInteger(pageLength) || pageLength < 1 || pageLength > 1000) {
    throw errors.validation("Frappe incremental page_length must be between 1 and 1000");
  }

  const filters: JsonValue[] = [];
  const orFilters: JsonValue[] = [];
  if (input.cursor) {
    const cursor = validateFrappeCursor(input.cursor);
    // `modified >= cursor.modified AND (modified > cursor.modified OR name > cursor.name)`
    // is equivalent to tuple comparison `(modified, name) > (cursor.modified, cursor.name)`.
    filters.push([doctype, "modified", ">=", cursor.modified]);
    orFilters.push([doctype, "modified", ">", cursor.modified]);
    orFilters.push([doctype, "name", ">", cursor.name]);
  }
  return {
    doctype,
    fields,
    filters,
    or_filters: orFilters,
    order_by: "modified asc, name asc",
    limit_page_length: pageLength,
  };
}

export function nextFrappeIncrementalCursor(rows: readonly JsonObject[]): FrappeIncrementalCursor | null {
  if (!rows.length) return null;
  const last = rows[rows.length - 1]!;
  return validateFrappeCursor({ modified: last.modified, name: last.name });
}

export function validateFrappeCursor(value: { modified: unknown; name: unknown }): FrappeIncrementalCursor {
  const modified = requireText(value.modified, "cursor.modified", 80);
  if (Number.isNaN(Date.parse(modified))) throw errors.validation("cursor.modified must be a valid datetime");
  const name = requireText(value.name, "cursor.name", 240);
  return { modified, name };
}

/** Converts the request to Frappe REST query parameters without embedding credentials. */
export function frappeIncrementalSearchParams(request: FrappeIncrementalPageRequest): URLSearchParams {
  const params = new URLSearchParams();
  params.set("fields", JSON.stringify(request.fields));
  if (request.filters.length) params.set("filters", JSON.stringify(request.filters));
  if (request.or_filters.length) params.set("or_filters", JSON.stringify(request.or_filters));
  params.set("order_by", request.order_by);
  params.set("limit_page_length", String(request.limit_page_length));
  return params;
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}
