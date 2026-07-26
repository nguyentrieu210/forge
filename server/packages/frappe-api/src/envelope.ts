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
};

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

/** `/api/method/*` success: the payload always sits under `message`. */
export function methodResponse(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ message: value ?? null }), { status, headers: { ...JSON_HEADERS, ...headers } });
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
