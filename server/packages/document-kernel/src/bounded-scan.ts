import { errors } from "../../core/src/index.js";

/**
 * Command-side document scans are intentionally bounded so one mutation cannot
 * turn into an unbounded tenant-wide query. A bound is safe only if exceeding it
 * fails closed: silently returning the first N rows makes absence checks and
 * aggregate invariants incorrect for larger tenants.
 */
export const CONTROLLER_DOCUMENT_SCAN_LIMIT = 5_000;

export function assertControllerDocumentScanCount(
  count: number,
  label: string,
  limit = CONTROLLER_DOCUMENT_SCAN_LIMIT,
): void {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isInteger(limit) || limit < 1) {
    throw errors.database("Controller scan bound is misconfigured");
  }
  if (count > limit) {
    throw errors.database(
      `Controller-side scan for ${label} contains ${count} rows and exceeds the safe bound of ${limit}; use a targeted reader instead of a truncated scan`,
    );
  }
}
