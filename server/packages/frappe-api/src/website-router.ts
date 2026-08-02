import { errors } from "../../core/src/index.js";
import { readFrappeArgs } from "./args.js";
import { faultResponse, methodResponse } from "./envelope.js";
import {
  routeFrappeApi as routeCoreFrappeApi,
  isFrappePath,
  FORGE_CONTRACT_VERSION,
  type FrappeRouterContext,
} from "./router.js";
import { WEBSITE_MANIFEST, WEBSITE_PAGE, websiteManifest, websitePage } from "./website.js";

export { isFrappePath, FORGE_CONTRACT_VERSION };
export type { FrappeRouterContext };

/**
 * Adds the tiny unauthenticated Website/CMS read surface without widening the core
 * router's generic document API. Keeping this as a wrapper also keeps the already-large
 * Frappe façade focused on Frappe compatibility while website publishing remains a
 * bounded Forge capability.
 */
export async function routeFrappeApi(
  request: Request,
  url: URL,
  context: FrappeRouterContext,
): Promise<Response | null> {
  if (url.pathname !== WEBSITE_MANIFEST && url.pathname !== WEBSITE_PAGE) {
    return routeCoreFrappeApi(request, url, context);
  }

  try {
    if (request.method.toUpperCase() !== "GET") {
      throw errors.validation("Website public API only accepts GET");
    }
    if (!context.webForms) throw errors.notFound("This deployment has no public surface");
    const website = { db: context.webForms.db, tenantId: context.tenantId };
    if (url.pathname === WEBSITE_MANIFEST) return methodResponse(await websiteManifest(website));

    const args = await readFrappeArgs(request, url);
    return methodResponse(await websitePage(website, args.text("slug") ?? "home"));
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}
