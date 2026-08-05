import baseJobs from "./index.js";
import { deriveInternalServiceTokenV2 } from "../../../packages/auth/src/security-v2.js";

type QueueEnv = Parameters<typeof baseJobs.queue>[1];
type JobsV2Env = QueueEnv & { INTERNAL_SERVICE_TOKEN_V2?: string };

interface SecurityProfile {
  tenant_id: string;
  generation: number;
  key_id: string;
}

export default {
  async queue(batch: Parameters<typeof baseJobs.queue>[0], env: JobsV2Env): Promise<void> {
    return baseJobs.queue(batch, withSecurityAwareDispatcher(env));
  },

  async scheduled(
    controller: Parameters<typeof baseJobs.scheduled>[0],
    env: JobsV2Env,
    ctx: Parameters<typeof baseJobs.scheduled>[2],
  ): Promise<void> {
    return baseJobs.scheduled(controller, withSecurityAwareDispatcher(env), ctx);
  },
};

/**
 * The legacy jobs implementation still creates the request and owns delivery semantics.
 * This adapter changes only the Authorization header for generation-2 tenants.
 */
export function withSecurityAwareDispatcher(env: JobsV2Env): JobsV2Env {
  if (!env.DISPATCHER || !env.ROUTES) return env;
  const upstream = env.DISPATCHER;

  const dispatcher = {
    get(workerName: string) {
      const target = upstream.get(workerName);
      return {
        async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
          const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
          const tenantId = request.headers.get("x-cloudforge-tenant")?.trim() ?? "";
          if (!tenantId) return target.fetch(request);

          const profile = await loadSecurityProfile(env.ROUTES!, tenantId);
          if (!profile || profile.generation !== 2) return target.fetch(request);
          if (profile.key_id !== "k2") throw new Error("Unsupported tenant security key id");

          const master = env.INTERNAL_SERVICE_TOKEN_V2?.trim();
          if (!master) throw new Error("INTERNAL_SERVICE_TOKEN_V2 is not configured");
          const token = await deriveInternalServiceTokenV2(master, tenantId);
          const headers = new Headers(request.headers);
          headers.set("authorization", `Bearer ${token}`);
          return target.fetch(new Request(request, { headers }));
        },
      } as Fetcher;
    },
  } as DispatchNamespace;

  return { ...env, DISPATCHER: dispatcher };
}

async function loadSecurityProfile(routes: KVNamespace, tenantId: string): Promise<SecurityProfile | null> {
  const raw = await routes.get(`__security__:${tenantId}`);
  if (!raw) return null;
  try {
    const profile = JSON.parse(raw) as Partial<SecurityProfile>;
    if (profile.tenant_id !== tenantId || profile.generation !== 2 || profile.key_id !== "k2") return null;
    return profile as SecurityProfile;
  } catch {
    return null;
  }
}
