import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";
import { readProductionRequestLifecycle } from "./production-request-lifecycle-api.js";
import type { ProductionPlatformCall } from "./sales-production.js";

type Json = Record<string, unknown>;

/**
 * HTTP route wrapper for the Production Request operator screen.
 * The wrapper preserves the platform callback identity and delegates lifecycle derivation.
 */
export async function handleProductionRequestLifecycle(
  request: Request,
  env: PurchaseFifoEnv,
): Promise<Response> {
  if (!request.headers.get("x-cloudforge-tenant")) {
    return answer({ message: "not a platform call" }, 403);
  }
  const body = await request.clone().json().catch(() => ({})) as { args?: Json };
  const call = platformCaller(request, env);
  return readProductionRequestLifecycle(call, body.args ?? {});
}

function platformCaller(request: Request, env: PurchaseFifoEnv): ProductionPlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  const call = (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...forwarded,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
  return Object.assign(call, { via: env.PLATFORM ? "binding" : "fetch" });
}

function answer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
