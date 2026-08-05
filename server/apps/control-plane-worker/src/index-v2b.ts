import baseControl from "./index.js";
import {
  deriveInternalServiceTokenV2,
  deriveTenantAuthSecretV2,
} from "../../../packages/auth/src/security-v2.js";
import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { errorResponse, errors, jsonResponse, randomId, readJson } from "../../../packages/core/src/index.js";

type BaseControlEnv = Parameters<typeof baseControl.fetch>[1];
type ControlV2Env = BaseControlEnv & {
  INTERNAL_AUTH_SECRET_V2?: string;
  INTERNAL_SERVICE_TOKEN_V2?: string;
};

const API_BASE = "https://api.cloudflare.com/client/v4";
const PROVIDER_AUTHORITY_KEY = "cloudflare-account";
const SECURITY_KEY_PREFIX = "__security__:";
const SECURITY_GENERATION = 2;
const SECURITY_KEY_ID = "k2";
const DISPATCH_NAMESPACE = "cloudforge-production";

interface SecurityProfileRow {
  tenant_id: string;
  generation: number;
  key_id: string;
  worker_name: string;
  source_sha: string;
  modified_at: string;
}

export default {
  async fetch(request: Request, env: ControlV2Env): Promise<Response> {
    const url = new URL(request.url);
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      if (request.method === "POST" && url.pathname === "/v1/provider/bootstrap") {
        return await bootstrapProviderAuthority(request, env);
      }
      if (request.method === "POST" && url.pathname.startsWith("/v1/provider/tenant-secrets/")) {
        const tenant = requireTenant(decodeURIComponent(url.pathname.slice("/v1/provider/tenant-secrets/".length)));
        return await provisionTenantSecurityV2(request, env, tenant, traceId);
      }
      if (request.method === "PUT" && url.pathname.startsWith("/v1/provider/routes/")) {
        const routeKey = requireRouteKey(decodeURIComponent(url.pathname.slice("/v1/provider/routes/".length)));
        return await publishProviderRouteV2(request, env, routeKey, traceId);
      }
      return baseControl.fetch(request, env);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};

/**
 * One-time account authority initialization. The caller proves it holds a Cloudflare
 * token that can read the canonical gateway in the supplied account. Once initialized,
 * the account id is immutable through this endpoint; changing it is a separate provider
 * migration, not something a tenant provisioning request may do.
 */
export async function bootstrapProviderAuthority(request: Request, env: ControlV2Env): Promise<Response> {
  const body = await readJson<JsonObject>(request, 4_000);
  const accountId = requireAccountId(body.account_id);
  const sourceSha = requireSourceSha(body.source_sha);
  await verifyProviderToken(request, accountId);

  const existing = await loadProviderAuthority(env.CONTROL_DB);
  if (existing && existing !== accountId) throw errors.authentication("Provider account authority already belongs to another account");
  if (existing) return jsonResponse({ account_id: accountId, unchanged: true });

  const now = new Date().toISOString();
  await env.CONTROL_DB.prepare(
    `INSERT INTO provider_authority(authority_key,account_id,modified_at) VALUES(?1,?2,?3)`,
  ).bind(PROVIDER_AUTHORITY_KEY, accountId, now).run();
  await env.CONTROL_DB.prepare(
    `INSERT INTO tenant_security_profile_audit_events(
       event_id,trace_id,tenant_id,action,generation,key_id,worker_name,source_sha,created_at
     ) VALUES(?1,?2,'__platform__','security.v2.provider_bootstrap',2,'k2','cloudforge-control-plane',?3,?4)`,
  ).bind(randomId("security-audit"), request.headers.get("x-cloudforge-trace-id") ?? randomId("trace"), sourceSha, now).run();
  return jsonResponse({ account_id: accountId, initialized: true });
}

export async function provisionTenantSecurityV2(
  request: Request,
  env: ControlV2Env,
  tenant: string,
  traceId = randomId("trace"),
): Promise<Response> {
  const body = await readJson<JsonObject>(request, 12_000);
  const accountId = requireAccountId(body.account_id);
  const namespace = requireExactString(body.namespace, "namespace", DISPATCH_NAMESPACE);
  const workerName = requireExactString(body.worker_name, "worker_name", `cloudforge-tenant-${tenant}`);
  const sourceSha = requireSourceSha(body.source_sha);
  const providerToken = await authorizeProviderRequest(request, env, accountId);

  const existing = await loadSecurityProfile(env.CONTROL_DB, tenant);
  if (existing) {
    if (existing.generation !== SECURITY_GENERATION || existing.key_id !== SECURITY_KEY_ID || existing.worker_name !== workerName) {
      throw errors.misconfigured("Existing tenant security profile does not match generation V2");
    }
    const names = await listDispatchSecrets(providerToken, accountId, namespace, workerName);
    const missing = ["INTERNAL_AUTH_SECRET", "INTERNAL_SERVICE_TOKEN", "SESSION_SECRET"].filter((name) => !names.has(name));
    if (missing.length === 0) {
      await projectSecurityProfile(env.ROUTES, existing);
      return jsonResponse({ tenant_id: tenant, generation: SECURITY_GENERATION, key_id: SECURITY_KEY_ID, unchanged: true });
    }
    const activeRoute = await env.CONTROL_DB.prepare(
      "SELECT status FROM tenant_routes WHERE tenant_id=?1",
    ).bind(tenant).first<{ status: string }>();
    if (activeRoute?.status === "active") {
      throw errors.misconfigured("Active V2 tenant is missing required secret bindings; refusing automatic session/key rotation");
    }
  }

  const authMaster = requireRuntimeSecret(env.INTERNAL_AUTH_SECRET_V2, "INTERNAL_AUTH_SECRET_V2");
  const serviceMaster = requireRuntimeSecret(env.INTERNAL_SERVICE_TOKEN_V2, "INTERNAL_SERVICE_TOKEN_V2");
  const tenantAuthRoot = await deriveTenantAuthSecretV2(authMaster, tenant);
  const tenantServiceToken = await deriveInternalServiceTokenV2(serviceMaster, tenant);
  const sessionSecret = randomSecret();

  // Partial provider failure is retry-safe while no profile is committed: a retry simply
  // overwrites all three tenant-scoped bindings with a consistent fresh set.
  await putDispatchSecret(providerToken, accountId, namespace, workerName, "INTERNAL_AUTH_SECRET", tenantAuthRoot);
  await putDispatchSecret(providerToken, accountId, namespace, workerName, "INTERNAL_SERVICE_TOKEN", tenantServiceToken);
  await putDispatchSecret(providerToken, accountId, namespace, workerName, "SESSION_SECRET", sessionSecret);

  const now = new Date().toISOString();
  const profile: SecurityProfileRow = {
    tenant_id: tenant,
    generation: SECURITY_GENERATION,
    key_id: SECURITY_KEY_ID,
    worker_name: workerName,
    source_sha: sourceSha,
    modified_at: now,
  };
  await env.CONTROL_DB.batch([
    env.CONTROL_DB.prepare(
      `INSERT INTO tenant_security_profiles(tenant_id,generation,key_id,worker_name,source_sha,created_at,modified_at)
       VALUES(?1,?2,?3,?4,?5,?6,?6)
       ON CONFLICT(tenant_id) DO UPDATE SET generation=excluded.generation,key_id=excluded.key_id,
         worker_name=excluded.worker_name,source_sha=excluded.source_sha,modified_at=excluded.modified_at`,
    ).bind(tenant, SECURITY_GENERATION, SECURITY_KEY_ID, workerName, sourceSha, now),
    env.CONTROL_DB.prepare(
      `INSERT INTO tenant_security_profile_audit_events(event_id,trace_id,tenant_id,action,generation,key_id,worker_name,source_sha,created_at)
       VALUES(?1,?2,?3,'security.v2.provision',?4,?5,?6,?7,?8)`,
    ).bind(randomId("security-audit"), traceId, tenant, SECURITY_GENERATION, SECURITY_KEY_ID, workerName, sourceSha, now),
  ]);
  await projectSecurityProfile(env.ROUTES, profile);
  return jsonResponse({ tenant_id: tenant, generation: SECURITY_GENERATION, key_id: SECURITY_KEY_ID, provisioned: true });
}

async function publishProviderRouteV2(
  request: Request,
  env: ControlV2Env,
  routeKey: string,
  traceId: string,
): Promise<Response> {
  const body = await readJson<JsonObject>(request, 16_000);
  const accountId = requireAccountId(body.account_id);
  await authorizeProviderRequest(request, env, accountId);
  const tenant = requireTenant(body.tenant_id);
  const workerName = requireExactString(body.worker_name, "worker_name", `cloudforge-tenant-${tenant}`);
  const profile = await loadSecurityProfile(env.CONTROL_DB, tenant);
  if (!profile || profile.generation !== SECURITY_GENERATION || profile.key_id !== SECURITY_KEY_ID || profile.worker_name !== workerName) {
    throw errors.misconfigured("V2 security profile must be provisioned before route publication");
  }
  const controlToken = requireRuntimeSecret(env.CONTROL_TOKEN, "CONTROL_TOKEN");
  const internalBody = {
    tenant_id: tenant,
    worker_name: workerName,
    status: requireEnum(body.status, "status", ["active", "suspended", "provisioning"]),
    plan: requireEnum(body.plan, "plan", ["free", "pro", "enterprise"]),
    reason: requireNonEmptyString(body.reason, "reason", 500),
  };
  const internal = new Request(`https://control.internal/v1/routes/${encodeURIComponent(routeKey)}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${controlToken}`,
      "content-type": "application/json",
      "x-cloudforge-trace-id": traceId,
    },
    body: JSON.stringify(internalBody),
  });
  return baseControl.fetch(internal, env);
}

async function authorizeProviderRequest(request: Request, env: ControlV2Env, accountId: string): Promise<string> {
  const expectedAccount = await loadProviderAuthority(env.CONTROL_DB);
  if (!expectedAccount) throw errors.misconfigured("Provider account authority is not initialized");
  if (accountId !== expectedAccount) throw errors.authentication("Provider account mismatch");
  return verifyProviderToken(request, accountId);
}

async function verifyProviderToken(request: Request, accountId: string): Promise<string> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length <= "Bearer ".length) {
    throw errors.authentication("Cloudflare provider authorization is required");
  }
  const token = authorization.slice("Bearer ".length).trim();
  const response = await fetch(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/workers/scripts/cloudforge-gateway/settings`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  let payload: { success?: boolean } | null = null;
  try { payload = await response.json() as { success?: boolean }; } catch { payload = null; }
  if (!response.ok || payload?.success === false) throw errors.authentication("Cloudflare provider authorization failed");
  return token;
}

async function loadProviderAuthority(db: D1Database): Promise<string | null> {
  const row = await db.prepare(
    "SELECT account_id FROM provider_authority WHERE authority_key=?1",
  ).bind(PROVIDER_AUTHORITY_KEY).first<{ account_id: string }>();
  return row?.account_id ?? null;
}

async function loadSecurityProfile(db: D1Database, tenant: string): Promise<SecurityProfileRow | null> {
  return db.prepare(
    `SELECT tenant_id,generation,key_id,worker_name,source_sha,modified_at
     FROM tenant_security_profiles WHERE tenant_id=?1`,
  ).bind(tenant).first<SecurityProfileRow>();
}

async function projectSecurityProfile(routes: KVNamespace, profile: SecurityProfileRow): Promise<void> {
  await routes.put(`${SECURITY_KEY_PREFIX}${profile.tenant_id}`, JSON.stringify({
    tenant_id: profile.tenant_id,
    generation: profile.generation,
    key_id: profile.key_id,
    worker_name: profile.worker_name,
    source_sha: profile.source_sha,
    modified_at: profile.modified_at,
  }));
}

async function listDispatchSecrets(token: string, accountId: string, namespace: string, workerName: string): Promise<Set<string>> {
  const result = await cloudflareRequest(token,
    `/accounts/${encodeURIComponent(accountId)}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(workerName)}/secrets`,
    { method: "GET" },
  );
  const rows = Array.isArray(result) ? result as Array<{ name?: unknown }> : [];
  return new Set(rows.map((entry) => typeof entry.name === "string" ? entry.name : "").filter(Boolean));
}

async function putDispatchSecret(
  token: string,
  accountId: string,
  namespace: string,
  workerName: string,
  name: string,
  text: string,
): Promise<void> {
  await cloudflareRequest(token,
    `/accounts/${encodeURIComponent(accountId)}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(workerName)}/secrets`,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, text, type: "secret_text" }) },
  );
}

async function cloudflareRequest(token: string, path: string, init: RequestInit): Promise<unknown> {
  const headers = new Headers(init.headers ?? {});
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  let payload: { success?: boolean; result?: unknown } | null = null;
  try { payload = await response.json() as { success?: boolean; result?: unknown }; } catch { payload = null; }
  if (!response.ok || payload?.success === false) throw errors.misconfigured(`Cloudflare provider operation failed (${response.status})`);
  return payload?.result ?? null;
}

function requireTenant(value: unknown): string {
  const tenant = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(tenant)) throw errors.validation("tenant must be a normalized lowercase identifier");
  return tenant;
}

function requireRouteKey(value: unknown): string {
  const route = String(value ?? "").trim().toLowerCase();
  if (!route || route.length > 253 || !/^[a-z0-9.-]+$/.test(route) || route.includes("..")) throw errors.validation("route_key is invalid");
  return route;
}

function requireAccountId(value: unknown): string {
  const accountId = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw errors.validation("account_id must be a 32-character Cloudflare account id");
  return accountId;
}

function requireSourceSha(value: unknown): string {
  const sha = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw errors.validation("source_sha must be an exact 40-character commit SHA");
  return sha;
}

function requireExactString(value: unknown, name: string, expected: string): string {
  const text = String(value ?? "").trim();
  if (text !== expected) throw errors.validation(`${name} must be ${expected}`);
  return text;
}

function requireNonEmptyString(value: unknown, name: string, maxLength: number): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) throw errors.validation(`${name} is required`);
  return text;
}

function requireEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  const text = String(value ?? "").trim() as T;
  if (!allowed.includes(text)) throw errors.validation(`${name} is invalid`);
  return text;
}

function requireRuntimeSecret(value: string | undefined, name: string): string {
  const secret = value?.trim() ?? "";
  if (secret.length < 32) throw errors.misconfigured(`${name} is not configured`);
  return secret;
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
