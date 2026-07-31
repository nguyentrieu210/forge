import {
  APP_CALLBACK_HEADER,
  createTrustedIdentity,
  deriveAppCallKey,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
  stripUntrustedPlatformHeaders,
  verifyTrustedIdentity,
} from "../../../packages/auth/src/index.js";
import { errorResponse, errors, randomId, timingSafeEqualString } from "../../../packages/core/src/index.js";

interface Env {
  TENANT: Fetcher;
  TENANT_ID: string;
  INTERNAL_AUTH_SECRET: string;
}

const CALLBACK_PREFIX = "/_app/";

/**
 * Local-only stand-in for the production Gateway's app callback boundary.
 *
 * Wrangler can run the tenant and Alumdoor service-bound Workers locally, but there is
 * no Workers-for-Platforms Gateway between them. Calling the tenant directly would omit
 * the one header that tells the Frappe surface to authenticate a callback from its signed
 * identity rather than from a browser cookie.
 *
 * This adapter deliberately repeats the production proofs instead of trusting local
 * traffic: per-(tenant, app) credential, platform-signed identity, path rewrite, fresh
 * identity minting and stripping of caller-supplied platform headers. It has no public or
 * production config and is used only by the Purchase authenticated QA topology.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(CALLBACK_PREFIX)) {
        throw errors.notFound("Unknown local app callback path");
      }

      const appId = request.headers.get("x-cloudforge-app") ?? "";
      if (!appId) throw errors.authentication("App callback is missing its app id");

      const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const expected = await deriveAppCallKey(env.INTERNAL_AUTH_SECRET, env.TENANT_ID, appId);
      if (!timingSafeEqualString(presented, expected)) {
        throw errors.authentication("App callback credential is not valid for this tenant");
      }

      const asserted = await verifyTrustedIdentity(request, {
        tenantId: env.TENANT_ID,
        masterSecret: env.INTERNAL_AUTH_SECRET,
      });
      const trusted = await createTrustedIdentity({
        tenantId: env.TENANT_ID,
        actor: asserted.actor,
        traceId,
        masterSecret: env.INTERNAL_AUTH_SECRET,
        keyId: "k1",
      });

      const target = new URL(url);
      target.pathname = `/api/${url.pathname.slice(CALLBACK_PREFIX.length)}`;

      const headers = new Headers(request.headers);
      stripUntrustedPlatformHeaders(headers);
      headers.delete("authorization");
      headers.delete("cookie");
      headers.set("x-cloudforge-tenant", env.TENANT_ID);
      headers.set("x-cloudforge-trace-id", traceId);
      headers.set(IDENTITY_HEADER, trusted.encoded);
      headers.set(IDENTITY_SIGNATURE_HEADER, trusted.signature);
      headers.set(APP_CALLBACK_HEADER, appId);

      return env.TENANT.fetch(new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: request.redirect,
      }));
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};
