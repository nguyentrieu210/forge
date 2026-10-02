import { ConnectedAppService, importConnectedAppKey, type ConnectedAppConfig, type ConnectedAppIdentity } from "../../../packages/integration-hub/src/connected-app.js";
import { D1ConnectedAppStore } from "../../../packages/integration-hub/src/connected-app-store.js";
import { D1WebhookDeliveryStore, runDurableWebhookDeliveries } from "../../../packages/integration-hub/src/durable-delivery.js";
import type { ResolvedWebhookCredential, WebhookCredentialResolver, WebhookTransport } from "../../../packages/integration-hub/src/executor.js";
import { assertAllowedWebhookTarget } from "../../../packages/integration-hub/src/index.js";
import type { TenantEnv } from "./env.js";
import type { IntegrationApi } from "../../../packages/frappe-api/src/integration-methods.js";
import type { JsonObject } from "../../../packages/contracts/src/index.js";

/** Secret/config bindings are provisioned by operators; subscription documents cannot expand them. */
function bindingObject(raw: string | undefined): Record<string, unknown> {
  if (!raw || raw.length > 256_000) throw new Error("Integration binding is unavailable or exceeds bounds");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Invalid integration binding JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid integration binding");
  return value as Record<string, unknown>;
}
function tenantBinding(raw: string | undefined, tenantId: string): Record<string, unknown> {
  const root = bindingObject(raw);
  if (!Object.hasOwn(root, tenantId)) throw new Error("Tenant integration binding is unavailable");
  const value = root[tenantId];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid tenant integration binding");
  return value as Record<string, unknown>;
}
export function operatorWebhookHosts(env: Pick<TenantEnv, "INTEGRATION_ALLOWED_HOSTS_JSON">, tenantId: string): string[] | null {
  if (!env.INTEGRATION_ALLOWED_HOSTS_JSON) return null;
  const root = bindingObject(env.INTEGRATION_ALLOWED_HOSTS_JSON);
  if (!Object.hasOwn(root, tenantId)) return null;
  const hosts = root[tenantId];
  if (!Array.isArray(hosts) || hosts.length > 64 || hosts.some(host => typeof host !== "string" || !host || host.length > 253 || host.includes("*"))) {
    throw new Error("Invalid operator webhook allowlist");
  }
  return hosts as string[];
}
export function runtimeWebhookTransport(hosts: readonly string[], fetcher: typeof fetch = fetch): WebhookTransport {
  return { async fetch(input, init) {
    assertAllowedWebhookTarget(input, [...hosts]);
    return fetcher(input, { ...init, redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15_000) });
  } };
}

interface RegisteredConnectedApp extends ConnectedAppConfig { clientId: string; clientSecret: string }
function registeredApp(env: TenantEnv, tenantId: string, appId: string): RegisteredConnectedApp {
  const apps = tenantBinding(env.CONNECTED_APPS_JSON, tenantId);
  if (!Object.hasOwn(apps, appId)) throw new Error("Connected app is not registered for this tenant");
  const value = apps[appId];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid registered connected app");
  const app = value as RegisteredConnectedApp;
  if (app.appId !== appId || typeof app.clientId !== "string" || !app.clientId || typeof app.clientSecret !== "string" || !app.clientSecret
    || !Array.isArray(app.allowedHosts) || !Array.isArray(app.scopes)) throw new Error("Invalid registered connected app");
  return app;
}
export async function connectedAppRuntime(env: TenantEnv, tenantId: string, userId: string, appId: string) {
  const config = registeredApp(env, tenantId, appId);
  const encodedKey = env.CONNECTED_APP_VAULT_KEY;
  if (!encodedKey || !/^[a-f0-9]{64}$/i.test(encodedKey)) throw new Error("Connected app vault is unavailable");
  const key = await importConnectedAppKey(Uint8Array.from(encodedKey.match(/../g)!, value => parseInt(value, 16)));
  const store = new D1ConnectedAppStore(env.DB);
  const service = new ConnectedAppService({ store, encryptionKey: key,
    credentials: async () => ({ clientId: config.clientId, clientSecret: config.clientSecret }),
    fetch: async (input, init) => fetch(input, { ...init, redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15_000) }),
  });
  const identity: ConnectedAppIdentity = { tenantId, userId, appId };
  return { config, identity, service, store };
}

export function runtimeWebhookCredentials(env: TenantEnv, tenantId: string): WebhookCredentialResolver {
  return { async resolve(subscription) {
    if (subscription.tenant_id !== tenantId) throw new Error("Webhook credential tenant mismatch");
    if (!subscription.secret_ref) {
      if (subscription.auth_kind !== "none") throw new Error("Webhook credential reference required");
      return {};
    }
    const refs = tenantBinding(env.INTEGRATION_CREDENTIALS_JSON, tenantId);
    if (!Object.hasOwn(refs, subscription.secret_ref)) throw new Error("Webhook credential is unavailable");
    const value = refs[subscription.secret_ref];
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid webhook credential binding");
    const entry = value as Record<string, unknown>;
    if (subscription.auth_kind === "oauth2") {
      if (typeof entry.appId !== "string" || typeof entry.userId !== "string") throw new Error("Invalid OAuth webhook binding");
      const runtime = await connectedAppRuntime(env, tenantId, entry.userId, entry.appId);
      return { headers: { authorization: `Bearer ${await runtime.service.getAccessToken(runtime.identity, runtime.config)}` } };
    }
    if (entry.headers !== undefined && (!entry.headers || typeof entry.headers !== "object" || Array.isArray(entry.headers)
      || Object.values(entry.headers).some(value => typeof value !== "string"))) throw new Error("Invalid webhook authentication headers");
    if (entry.signing_secret !== undefined && typeof entry.signing_secret !== "string") throw new Error("Invalid webhook signing credential");
    return { ...(entry.headers ? { headers: entry.headers as Record<string, string> } : {}),
      ...(typeof entry.signing_secret === "string" ? { signing_secret: entry.signing_secret } : {}) } satisfies ResolvedWebhookCredential;
  } };
}

export async function runTenantWebhooks(env: TenantEnv, tenantId: string, now: string) {
  const hosts = operatorWebhookHosts(env, tenantId);
  if (!hosts?.length) return { configured: false, claimed: 0, delivered: 0, retry: 0, dead_letter: 0 };
  return { configured: true, ...await runDurableWebhookDeliveries({ tenant_id: tenantId,
    store: new D1WebhookDeliveryStore(env.DB), credential_resolver: runtimeWebhookCredentials(env, tenantId),
    transport: runtimeWebhookTransport(hosts), now: new Date(now), limit: 25 }) };
}

export function createIntegrationApi(env: TenantEnv, tenantId: string, userId: string): IntegrationApi {
  return {
    async start(appId) { const r = await connectedAppRuntime(env, tenantId, userId, appId); return r.service.start(r.identity, r.config); },
    async callback(appId, state, code) { const r = await connectedAppRuntime(env, tenantId, userId, appId); return r.service.callback(r.identity, r.config, state, code); },
    async status(appId) {
      const r = await connectedAppRuntime(env, tenantId, userId, appId);
      const connection = await r.store.getConnection(r.identity);
      return { app_id: appId, connected: Boolean(connection?.tokenCiphertext), expires_at: connection?.expiresAt ?? null };
    },
    async disconnect(appId) {
      const r = await connectedAppRuntime(env, tenantId, userId, appId);
      await r.service.disconnect(r.identity);
      return { app_id: appId, connected: false };
    },
    async deliveries(limit) {
      const result = await env.DB.prepare(
        "SELECT delivery_id,subscription_id,event_id,state,attempts,replay_count,next_attempt_at,http_status,reason,created_at,updated_at FROM integration_webhook_deliveries WHERE tenant_id=?1 ORDER BY updated_at DESC,delivery_id LIMIT ?2",
      ).bind(tenantId, limit).all<JsonObject>();
      return { deliveries: result.results ?? [] };
    },
    async replay(deliveryId, reason) {
      return { replayed: await new D1WebhookDeliveryStore(env.DB).replay(tenantId, deliveryId, userId, reason) };
    },
  };
}
