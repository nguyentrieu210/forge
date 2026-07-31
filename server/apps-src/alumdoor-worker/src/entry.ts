import baseWorker from "./index.js";
import { validateItemCatalogInvariants } from "./item-catalog-invariants.js";

type WorkerEnv = Parameters<typeof baseWorker.fetch>[1];
type WorkerContext = Parameters<typeof baseWorker.fetch>[2];

/**
 * Entrypoint triển khai của Alumdoor.
 *
 * Item đi qua cả validator lịch sử và các invariant catalog mới. Hai phép kiểm chạy song
 * song; mọi route khác được chuyển nguyên vẹn sang Worker cũ.
 */
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/hooks/validate" || request.method !== "POST") {
      return baseWorker.fetch(request, env, ctx);
    }

    const invariantRequest = request.clone();
    const body = await invariantRequest.clone().json().catch(() => null) as { doctype?: string } | null;
    if (body?.doctype !== "Item") return baseWorker.fetch(request, env, ctx);

    const [baseResponse, invariantResponse] = await Promise.all([
      baseWorker.fetch(request, env, ctx),
      validateItemCatalogInvariants(invariantRequest, env),
    ]);
    return baseResponse.ok ? invariantResponse : baseResponse;
  },
};
