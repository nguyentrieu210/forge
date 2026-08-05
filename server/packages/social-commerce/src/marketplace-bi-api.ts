import type { Actor } from "../../contracts/src/index.js";
import { errors, jsonResponse } from "../../core/src/index.js";
import { buildMarketplaceBiReport } from "./marketplace-bi.js";

const BI_ROLES = new Set([
  "System Manager",
  "Social Commerce Manager",
  "Sales Manager",
  "Accounts Manager",
  "Accounts User",
]);

export async function routeMarketplaceBiApi(
  request: Request,
  url: URL,
  db: D1Database,
  tenantId: string,
  actor: Actor,
): Promise<Response | null> {
  if (request.method !== "GET" || url.pathname !== "/api/v1/social/marketplace/bi") return null;
  requireBiRole(actor);
  const days = parseDays(url.searchParams.get("days"));
  return jsonResponse(await buildMarketplaceBiReport(db, tenantId, days));
}

function parseDays(value: string | null): number | null {
  if (value === "all") return null;
  if (value === null || value === "") return 30;
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    throw errors.validation("days must be an integer from 1 to 3650 or 'all'");
  }
  return days;
}

function requireBiRole(actor: Actor): void {
  if (!actor.roles.some((role) => BI_ROLES.has(role))) {
    throw errors.permission("Marketplace BI permission is required");
  }
}
