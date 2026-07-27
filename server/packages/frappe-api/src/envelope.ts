/**
 * Frappe response and error shapes.
 *
 * The client's error normaliser reads `exc_type` FIRST and only falls back to
 * the HTTP status, so the exception name is the load-bearing field — not the
 * status. It also parses `_server_messages` (a JSON string holding an array of
 * JSON strings) and lifts any `fieldname` into per-control field errors, which
 * is how a validation failure lands on the right input instead of a toast.
 *
 * Frappe maps its whole ValidationError family to HTTP 417, not 4xx-by-meaning.
 * We reproduce that rather than "fixing" it: the client was built and live-tested
 * against the real thing.
 */

import type { JsonObject } from "../../contracts/src/index.js";
import { asCloudForgeError } from "../../core/src/index.js";

/** Frappe exception names the client recognises. */
export type FrappeExcType =
  | "AuthenticationError"
  | "SessionExpired"
  | "PermissionError"
  | "DoesNotExistError"
  | "ValidationError"
  | "MandatoryError"
  | "LinkValidationError"
  | "LinkExistsError"
  | "DuplicateEntryError"
  | "TimestampMismatchError"
  | "CSRFTokenError";

interface FrappeFault {
  exc_type: FrappeExcType;
  status: number;
}

/**
 * Kernel error code → Frappe fault. Every mapping is deliberate:
 *
 * - `VERSION_CONFLICT` becomes `TimestampMismatchError`, the only exception the
 *   client maps to `kind: "conflict"` — that is what drives the "record changed,
 *   reload" path instead of a generic validation message.
 * - `REFERENCE_VALIDATION_FAILED` becomes `LinkValidationError` so a bad Link
 *   value reads as a link problem rather than an unexplained rejection.
 * - Anything the client has no mapping for falls through to its HTTP-status
 *   branch, so the status must still be meaningful on its own.
 */
const FAULTS: Record<string, FrappeFault> = {
  AUTHENTICATION_REQUIRED: { exc_type: "AuthenticationError", status: 401 },
  PERMISSION_DENIED: { exc_type: "PermissionError", status: 403 },
  DOCUMENT_NOT_FOUND: { exc_type: "DoesNotExistError", status: 404 },
  VERSION_CONFLICT: { exc_type: "TimestampMismatchError", status: 417 },
  DOCUMENT_ALREADY_EXISTS: { exc_type: "DuplicateEntryError", status: 417 },
  VALIDATION_ERROR: { exc_type: "ValidationError", status: 417 },
  REFERENCE_VALIDATION_FAILED: { exc_type: "LinkValidationError", status: 417 },
  INVALID_LIFECYCLE_TRANSITION: { exc_type: "ValidationError", status: 417 },
  IDEMPOTENCY_KEY_REUSED: { exc_type: "ValidationError", status: 417 },
  LEDGER_INVARIANT_FAILED: { exc_type: "ValidationError", status: 417 },
  // Keep the familiar Frappe envelope while preserving HTTP 429 so clients,
  // gateways and monitoring can apply retry/backoff semantics correctly.
  RATE_LIMITED: { exc_type: "ValidationError", status: 429 },
};

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

/**
 * `/api/method/*` success: the payload sits under `message`.
 *
 * True for methods that RETURN a value — which is nearly all of them, but not all.
 * See `responseFieldsResponse` for the exceptions, and do not assume this one.
 */
export function methodResponse(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ message: value ?? null }), { status, headers: { ...JSON_HEADERS, ...headers } });
}

/**
 * `/api/method/*` success for the methods that write onto `frappe.response` instead
 * of returning a value. Their keys land at the TOP LEVEL, with no `message` wrapper.
 *
 * From Frappe v16.19.0 itself — `frappe/desk/form/load.py`:
 *
 *     frappe.response["user_settings"] = get_user_settings(parent_dt or doctype)
 *     frappe.response.docs.extend(docs)          # getdoctype
 *     frappe.response["docinfo"] = docinfo       # get_docinfo, used by getdoc
 *
 * and `frappe/desk/form/save.py`: `frappe.response.docs.append(d)`.
 *
 * Wrapping these in `message` breaks every real Frappe client, and breaks it
 * SILENTLY. The Desk reads `r.docs` straight off the body; against a wrapped
 * response that is `undefined`, so its adapter raises DoesNotExistError on an HTTP
 * 200. Nothing logs an error. The list view renders a single `ID` column with a
 * generic "could not load" message and never issues a list query at all, because its
 * query is gated on the metadata having loaded.
 *
 * Server-side tests cannot catch this by calling the payload builders directly — the
 * defect lives in the envelope, not the payload — and a smoke test that unwraps
 * `message` will assert the bug rather than the contract.
 */
export function responseFieldsResponse(fields: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(fields ?? {}), { status, headers: { ...JSON_HEADERS, ...headers } });
}

/** `/api/resource/*` success: the payload always sits under `data`. */
export function resourceResponse(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ data: value ?? null }), { status, headers: { ...JSON_HEADERS, ...headers } });
}

/**
 * Kernel error → Frappe fault response.
 *
 * 5xx bodies never carry the original text: `asCloudForgeError` has already
 * replaced internal/database detail with a generic message, and the caller logs
 * the real one against the trace id.
 */
export function faultResponse(error: unknown, traceId: string): Response {
  const normalized = asCloudForgeError(error);
  const fault = FAULTS[normalized.code] ?? {
    exc_type: "ValidationError" as const,
    status: normalized.status >= 500 ? normalized.status : 417,
  };
  const status = normalized.status >= 500 ? normalized.status : fault.status;
  const body: JsonObject = {
    exc_type: fault.exc_type,
    exception: `frappe.exceptions.${fault.exc_type}: ${normalized.message}`,
    _server_messages: serverMessages(normalized.message, normalized.details),
    // Kept so a client reading `.message` directly (rather than the normaliser)
    // still sees something useful.
    message: normalized.message,
    _trace_id: traceId,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "x-cloudforge-trace-id": traceId },
  });
}

/**
 * Builds `_server_messages`: a JSON string whose entries are themselves JSON
 * strings. Nested exactly like Frappe, because the client parses two levels.
 *
 * When the kernel reports a field (`details.fieldname`), it is carried through so
 * the message lands on that control.
 */
export function serverMessages(message: string, details?: JsonObject): string {
  const entry: JsonObject = { message };
  const fieldname = details?.fieldname;
  if (typeof fieldname === "string" && fieldname) entry.fieldname = fieldname;
  return JSON.stringify([JSON.stringify(entry)]);
}

/** A Frappe fault raised by the façade itself rather than by the kernel. */
export function frappeFault(excType: FrappeExcType, message: string, status: number): Response {
  return new Response(JSON.stringify({
    exc_type: excType,
    exception: `frappe.exceptions.${excType}: ${message}`,
    _server_messages: serverMessages(message),
    message,
  }), { status, headers: JSON_HEADERS });
}
