import type { JsonObject } from "../../contracts/src/index.js";

export class CloudForgeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: JsonObject | undefined;

  constructor(code: string, message: string, status = 500, retryable = false, details?: JsonObject) {
    super(message);
    this.name = "CloudForgeError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

export const errors = {
  validation: (message: string, details?: JsonObject) => new CloudForgeError("VALIDATION_ERROR", message, 422, false, details),
  authentication: (message = "Authentication required") => new CloudForgeError("AUTHENTICATION_REQUIRED", message, 401),
  permission: (message = "Permission denied") => new CloudForgeError("PERMISSION_DENIED", message, 403),
  notFound: (message = "Document not found") => new CloudForgeError("DOCUMENT_NOT_FOUND", message, 404),
  exists: (message = "Document already exists") => new CloudForgeError("DOCUMENT_ALREADY_EXISTS", message, 409),
  lifecycle: (message: string, details?: JsonObject) => new CloudForgeError("INVALID_LIFECYCLE_TRANSITION", message, 409, false, details),
  reference: (message: string, details?: JsonObject) => new CloudForgeError("REFERENCE_VALIDATION_FAILED", message, 422, false, details),
  version: (currentVersion?: number) => new CloudForgeError(
    "VERSION_CONFLICT",
    "The document changed after it was loaded",
    409,
    false,
    currentVersion === undefined ? undefined : { current_version: currentVersion },
  ),
  idempotency: () => new CloudForgeError("IDEMPOTENCY_KEY_REUSED", "Command ID was reused with a different payload", 422),
  ledger: (message: string) => new CloudForgeError("LEDGER_INVARIANT_FAILED", message, 422),
  overloaded: (message = "Storage is temporarily overloaded") => new CloudForgeError("D1_OVERLOADED", message, 503, true),
  database: (message = "Storage operation failed") => new CloudForgeError("DATABASE_ERROR", message, 500, false),
} as const;

export function asCloudForgeError(value: unknown): CloudForgeError {
  if (value instanceof CloudForgeError) return value;
  // A CloudForgeError thrown across a Durable Object RPC boundary loses its class
  // identity but keeps its own enumerable fields; reconstruct from those so the
  // structured code/status survive instead of collapsing to INTERNAL_ERROR.
  const structured = asStructuredError(value);
  if (structured) return structured;
  if (value instanceof TypeError) return errors.validation(value.message);
  const message = value instanceof Error ? value.message : "Unknown failure";
  if (message.includes("VERSION_CONFLICT")) return errors.version();
  if (message.includes("DOCUMENT_NOT_FOUND")) return errors.notFound();
  if (message.includes("DOCUMENT_ALREADY_EXISTS")) return errors.exists();
  if (message.includes("IDEMPOTENCY_KEY_REUSED") || message.includes("UNIQUE constraint failed: mutation_receipts")) return errors.idempotency();
  if (/REFERENCE_SOURCE_NOT_FOUND|REFERENCE_ITEM_NOT_FOUND|REFERENCE_QUANTITY_NEGATIVE|REFERENCE_QUANTITY_EXCEEDED|OUTSTANDING_EXCEEDED|ACTIVE_FULFILLMENT_EXISTS|ACTIVE_PAYMENT_ALLOCATIONS|NEGATIVE_STOCK|BANK_TRANSACTION_NOT_SUBMITTED|BANK_RECONCILIATION_NEGATIVE|BANK_RECONCILIATION_OVER_ALLOCATED|SALARY_SLIP_ALREADY_IN_PAYROLL|E_INVOICE_ALREADY_SUBMITTED/.test(message)) {
    return errors.reference(message.replace(/^.*?(REFERENCE_|OUTSTANDING_|ACTIVE_)/, "$1"));
  }
  if (message.includes("INVALID_LIFECYCLE_TRANSITION")) return errors.lifecycle("Invalid document lifecycle transition");
  // Fallback paths must not reflect raw internal/DB text (schema, constraint or
  // config details) to the client. Use fixed generic messages; errorResponse
  // logs the original detail server-side keyed by trace_id.
  if (/overloaded|too many requests|database is locked|SQLITE_BUSY|D1_DB_ERROR.*(?:busy|overload)/i.test(message)) return errors.overloaded();
  if (/constraint failed|CHECK constraint|FOREIGN KEY constraint|SQLITE_CONSTRAINT/i.test(message)) return errors.database();
  return new CloudForgeError("INTERNAL_ERROR", "Internal error", 500, false);
}

/** Reconstructs a CloudForgeError that crossed an RPC boundary as a plain object
 * (class identity lost) but still carries a string `code` and numeric `status`. */
function asStructuredError(value: unknown): CloudForgeError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { code?: unknown; status?: unknown; message?: unknown; retryable?: unknown; details?: unknown };
  if (typeof candidate.code !== "string" || typeof candidate.status !== "number") return undefined;
  return new CloudForgeError(
    candidate.code,
    typeof candidate.message === "string" ? candidate.message : candidate.code,
    candidate.status,
    candidate.retryable === true,
    candidate.details && typeof candidate.details === "object" && !Array.isArray(candidate.details)
      ? candidate.details as JsonObject
      : undefined,
  );
}
