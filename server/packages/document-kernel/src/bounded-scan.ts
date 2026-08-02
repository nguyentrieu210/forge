import { errors } from "../../core/src/index.js";

/**
 * Command-side document scans are intentionally bounded so one mutation cannot
 * turn into an unbounded tenant-wide query. A bound is safe only if exceeding it
 * fails closed: silently returning the first N rows makes absence checks and
 * aggregate invariants incorrect for larger tenants.
 */
export const CONTROLLER_DOCUMENT_SCAN_LIMIT = 5_000;

export function assertCompleteBoundedScan<T>(
  rows: T[],
  label: string,
  limit = CONTROLLER_DOCUMENT_SCAN_LIMIT,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw errors.database("Controller scan limit is misconfigured");
  }
  if (rows.length > limit) {
    throw errors.database(
      `Controller-side scan for ${label} exceeded the safe bound of ${limit}; use a targeted reader instead of a truncated scan`,
    );
  }
  return rows;
}
