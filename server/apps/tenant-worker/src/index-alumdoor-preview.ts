import platformWorker from "./index-cf6.js";
import type { TenantEnv } from "./env.js";
import { assertInternalService, D1UserStore } from "../../../packages/auth/src/index.js";
import { AppInstaller } from "../../../packages/app-registry/src/index.js";
import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";
import { jsonResponse, readJson } from "../../../packages/core/src/index.js";

export * from "./index-cf6.js";

type PreviewEnv = TenantEnv & { PREVIEW_BOOTSTRAP_TOKEN?: string };
const INSTALL_PATH = "/internal/preview/install-app";

export default {
  async fetch(request: Request, env: PreviewEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== INSTALL_PATH) return platformWorker.fetch(request, env, ctx);
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    assertInternalService(request, env.PREVIEW_BOOTSTRAP_TOKEN);
    const tenantId = env.TENANT_ID ?? "preview";
    const body = await readJson<JsonObject>(request, 4_000_000);
    const app = body.app;
    const provisionStandard = body.provision_standard === true;
    if (!app) return jsonResponse({ ok: false, message: "app package is required" }, 400);

    const now = new Date().toISOString();
    const metadata = new D1MetadataStore(env.DB);
    if (provisionStandard) {
      await metadata.provisionStandardCatalog(tenantId, "preview-bootstrap", now);
    }
    const installer = new AppInstaller(env.DB, metadata, new D1UserStore(env.DB));
    const result = await installer.install(tenantId, app, "preview-bootstrap", now);
    return jsonResponse({ ok: true, result: result as unknown as JsonObject });
  },

  scheduled(controller: unknown, env: PreviewEnv, ctx: ExecutionContext): Promise<void> | void {
    return platformWorker.scheduled?.(controller, env, ctx);
  },
};
