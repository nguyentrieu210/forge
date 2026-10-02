import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { readFrappeArgs } from "./args.js";
import { methodResponse } from "./envelope.js";
import type { FrappeRouterContext } from "./router.js";

export interface IntegrationApi {
  start(appId: string): Promise<JsonObject>;
  callback(appId: string, state: string, code: string): Promise<JsonObject>;
  status(appId: string): Promise<JsonObject>;
  disconnect(appId: string): Promise<JsonObject>;
  deliveries(limit: number): Promise<JsonObject>;
  replay(deliveryId: string, reason: string): Promise<JsonObject>;
}
const PREFIX = "/api/method/forge.integrations.";
const METHODS = new Set(["start", "callback", "status", "disconnect", "deliveries", "replay"]);

/** Authenticated control surface. Provider URLs, credential material and target identity are never request arguments. */
export async function routeIntegrationMethod(request: Request, url: URL, context: FrappeRouterContext): Promise<Response | null> {
  if (!url.pathname.startsWith(PREFIX)) return null;
  const method = url.pathname.slice(PREFIX.length);
  if (!METHODS.has(method)) return null;
  if (!context.integrations) throw errors.notFound("Integrations are unavailable");
  if (!context.actor.user_id || context.actor.user_id === "Guest") throw errors.authentication();
  if (["start", "callback", "status", "disconnect"].includes(method) && !context.establishedSession) {
    throw errors.permission("A browser session is required for connected apps");
  }
  const http = request.method.toUpperCase();
  const mutation = ["start", "disconnect", "replay"].includes(method);
  if (http !== (mutation ? "POST" : "GET")) throw errors.validation(`Integration ${method} requires ${mutation ? "POST" : "GET"}`);
  if (["deliveries", "replay"].includes(method) && context.actor.user_id !== "Administrator"
    && !context.actor.roles.includes("System Manager") && !context.actor.roles.includes("Administrator")) {
    throw errors.permission("System Manager is required to inspect or replay webhook deliveries");
  }
  const args = await readFrappeArgs(request, url);
  switch (method) {
    case "start": return methodResponse(await context.integrations.start(args.requireText("app_id", 160)));
    case "callback": return methodResponse(await context.integrations.callback(args.requireText("app_id", 160), args.requireText("state", 100), args.requireText("code", 4096)));
    case "status": return methodResponse(await context.integrations.status(args.requireText("app_id", 160)));
    case "disconnect": return methodResponse(await context.integrations.disconnect(args.requireText("app_id", 160)));
    case "deliveries": {
      const limit = args.int("limit", 25);
      if (limit < 1 || limit > 100) throw errors.validation("Integration delivery limit must be 1..100");
      return methodResponse(await context.integrations.deliveries(limit));
    }
    case "replay": return methodResponse(await context.integrations.replay(args.requireText("delivery_id", 160), args.requireText("reason", 1000)));
    default: return null;
  }
}
