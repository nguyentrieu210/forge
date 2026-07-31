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

    // Preserve infrastructure/auth failures from the established validator. When both
    // validators return a business validation response, the stricter catalog invariant
    // is authoritative so its field-level reason is not hidden by a broader legacy error.
    if (!baseResponse.ok && baseResponse.status !== 422) return baseResponse;
    if (!invariantResponse.ok) return invariantResponse;
    return baseResponse;
  },
};
