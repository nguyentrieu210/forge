import { errors } from "../../core/src/index.js";

export type ScanSymbology = "CODE128" | "EAN13" | "QR" | "DATA_MATRIX" | "UNKNOWN";

export interface InventoryScanInput {
  raw: string;
  symbology?: ScanSymbology;
  scanned_at?: string;
}

export interface NormalizedInventoryScan {
  value: string;
  symbology: ScanSymbology;
  scanned_at?: string;
}

function timestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw errors.validation("scanned_at must be a valid timestamp");
  return new Date(parsed).toISOString();
}

/**
 * Canonicalizes scanner input before entity resolution. It intentionally does not guess
 * whether a code is Item/Batch/Serial/Warehouse: that lookup is permission-aware domain work.
 */
export function normalizeInventoryScan(input: InventoryScanInput, maxLength = 512): NormalizedInventoryScan {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 4096) {
    throw errors.validation("maxLength must be an integer between 1 and 4096");
  }
  if (typeof input.raw !== "string") throw errors.validation("scan raw value is required");
  const value = input.raw.normalize("NFC").trim();
  if (!value) throw errors.validation("scan value is empty");
  if (value.length > maxLength) throw errors.validation(`scan value exceeds ${maxLength} characters`);
  if (/\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw errors.validation("scan value contains unsupported control characters");
  }
  const symbology = input.symbology ?? "UNKNOWN";
  if (!["CODE128", "EAN13", "QR", "DATA_MATRIX", "UNKNOWN"].includes(symbology)) {
    throw errors.validation(`Unsupported scan symbology ${String(symbology)}`);
  }
  return {
    value,
    symbology,
    ...(input.scanned_at ? { scanned_at: timestamp(input.scanned_at) } : {}),
  };
}
