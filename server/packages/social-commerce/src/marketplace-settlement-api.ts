import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../core/src/index.js";
import { routeMarketplaceBiApi } from "./marketplace-bi-api.js";
import {
  listMarketplaceSettlements,
  reconcileMarketplaceSettlement,
  type MarketplaceSettlementInput,
} from "./marketplace-settlement.js";

const SETTLEMENT_ROLES = new Set([
  "System Manager",
  "Social Commerce Manager",
  "Sales Manager",
  "Accounts Manager",
  "Accounts User",
]);

export async function routeMarketplaceSettlementApi(
  request: Request,
  url: URL,
  db: D1Database,
  tenantId: string,
  actor: Actor,
): Promise<Response | null> {
  const bi = await routeMarketplaceBiApi(request, url, db, tenantId, actor);
  if (bi) return bi;

  if (url.pathname === "/api/v1/social/marketplace/settlements" && request.method === "GET") {
    requireSettlementRole(actor);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    return jsonResponse({ settlements: await listMarketplaceSettlements(db, tenantId, limit) });
  }
  if (url.pathname === "/api/v1/social/marketplace/settlements/reconcile" && request.method === "POST") {
    requireSettlementRole(actor);
    const body = await readJson<JsonObject>(request, 32_000);
    const result = await reconcileMarketplaceSettlement(
      db,
      tenantId,
      actor,
      body as unknown as MarketplaceSettlementInput,
    );
    return jsonResponse(result, 201);
  }
  return null;
}

function requireSettlementRole(actor: Actor): void {
  if (!actor.roles.some((role) => SETTLEMENT_ROLES.has(role))) {
    throw errors.permission("Marketplace settlement permission is required");
  }
}
