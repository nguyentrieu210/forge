export const D1_BOOKMARK_HEADER = "x-d1-bookmark";
export const D1_SERVED_BY_REGION_HEADER = "x-d1-served-by-region";
export const D1_SERVED_BY_PRIMARY_HEADER = "x-d1-served-by-primary";

const MAX_BOOKMARK_LENGTH = 1024;

export type D1SessionPolicy = "authoritative" | "replica-safe";

export interface D1SessionObservation {
  bookmark: string | null;
  served_by_region: string | null;
  served_by_primary: boolean | null;
}

/** Opaque D1 bookmarks are only transport-sanitized here; D1 validates their database/session semantics. */
export function normalizeD1Bookmark(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_BOOKMARK_LENGTH) return null;
  if (candidate.includes("\r") || candidate.includes("\n")) return null;
  return candidate;
}

/**
 * One policy seam for D1 Sessions.
 * - authoritative paths begin primary-first.
 * - replica-safe paths inherit a bookmark when supplied, otherwise may begin unconstrained.
 */
export function openD1Session(
  database: D1Database,
  policy: D1SessionPolicy,
  bookmark?: string | null,
): D1Database | D1DatabaseSession {
  if (!database.withSession) return database;
  if (policy === "authoritative") return database.withSession("first-primary");
  return database.withSession(normalizeD1Bookmark(bookmark) ?? "first-unconstrained");
}

export function currentD1Bookmark(database: D1Database | D1DatabaseSession): string | null {
  return typeof (database as D1DatabaseSession).getBookmark === "function"
    ? (database as D1DatabaseSession).getBookmark()
    : null;
}

/** Harmless same-session read used only to surface Cloudflare routing metadata. */
export async function observeD1Session(
  database: D1Database | D1DatabaseSession,
): Promise<D1SessionObservation> {
  const result = await database.prepare("SELECT 1 AS cf01_consistency_probe").all<{ cf01_consistency_probe: number }>();
  const meta = (result.meta ?? {}) as Record<string, unknown>;
  return {
    bookmark: currentD1Bookmark(database),
    served_by_region: typeof meta.served_by_region === "string" ? meta.served_by_region : null,
    served_by_primary: typeof meta.served_by_primary === "boolean" ? meta.served_by_primary : null,
  };
}

export function appendD1ObservationHeaders(headers: Headers, observation: D1SessionObservation): Headers {
  if (observation.bookmark) headers.set(D1_BOOKMARK_HEADER, observation.bookmark);
  if (observation.served_by_region) headers.set(D1_SERVED_BY_REGION_HEADER, observation.served_by_region);
  if (observation.served_by_primary !== null) {
    headers.set(D1_SERVED_BY_PRIMARY_HEADER, observation.served_by_primary ? "true" : "false");
  }
  return headers;
}
