import type { DomainEvent } from "../../../packages/contracts/src/index.js";
import type { ForgeAiBinding } from "../../../packages/ai-policy/src/index.js";

/**
 * Structural Browser Run binding used by the tenant entrypoint.
 *
 * Kept structural instead of importing a Cloudflare SDK type: workerd provides the
 * binding at runtime, while the application code only needs the Quick Actions RPC
 * surface. That also keeps tests free to supply a tiny deterministic fake.
 */
export interface BrowserRunBinding {
  quickAction(action: "pdf", input: Record<string, unknown>): Promise<Response>;
}

export interface TenantEnv {
  DB: D1Database;
  AGGREGATES: DurableObjectNamespace;
  /** Tenant-wide hibernatable Frappe room hub. */
  REALTIME?: DurableObjectNamespace;
  OUTBOX_QUEUE?: Queue<DomainEvent>;
  FILES?: R2Bucket;
  /** Cloudflare Browser Run Quick Actions binding for trusted server-side PDF rendering. */
  BROWSER?: BrowserRunBinding;
  TENANT_ID?: string;
  AUTH_MODE?: "development" | "production";
  DEV_ACTOR_JSON?: string;
  // In the hardened deployment this is the tenant's own derived key and
  // INTERNAL_AUTH_KEY_ID names its generation; if the key id is absent the value
  // is treated as the platform master and the key is derived on the fly.
  INTERNAL_AUTH_SECRET: string;
  INTERNAL_AUTH_KEY_ID?: string;
  INTERNAL_AUTH_SECRET_PREVIOUS?: string;
  INTERNAL_AUTH_KEY_ID_PREVIOUS?: string;
  INTERNAL_SERVICE_TOKEN?: string;
  /**
   * Public origin of the gateway, told to app Workers so they know where to call back.
   *
   * An app that hard-coded its platform's URL would break the moment it was installed
   * on a tenant reached by a different hostname.
   */
  PUBLIC_ORIGIN?: string;
  /**
   * Optional trusted HTTPS mail relay. When absent, Email Queue rows remain durable
   * Pending work and maintenance reports configured=false; no send is pretended.
   */
  EMAIL_TRANSPORT_URL?: string;
  EMAIL_TRANSPORT_TOKEN?: string;
  EMAIL_FROM?: string;
  /** Operator-managed tenant outbound host allowlists. Missing means webhooks stay queued. */
  INTEGRATION_ALLOWED_HOSTS_JSON?: string;
  /** Secret binding: tenant -> secret reference -> headers/signing secret or OAuth identity. */
  INTEGRATION_CREDENTIALS_JSON?: string;
  /** Secret binding: tenant -> app id -> trusted OAuth config and client credentials. */
  CONNECTED_APPS_JSON?: string;
  /** AES-GCM 256-bit vault key as 64 hexadecimal characters; never stored in tenant data. */
  CONNECTED_APP_VAULT_KEY?: string;
  /**
   * Signing secret for Frappe-shaped `sid` cookies.
   *
   * Kept distinct from INTERNAL_AUTH_SECRET so that rotating platform-internal
   * signing does not log every user out, and so a leak of one does not forge the
   * other. Absent means cookie sessions are disabled and only bearer auth works.
   */
  SESSION_SECRET?: string;
  /**
   * Workers-for-Platforms dispatch namespace, used to deliver hook events to app
   * Workers. Absent means apps cannot carry their own logic — hooks are simply
   * never delivered rather than silently dropped, since the delivery rows remain
   * pending for the sweep.
   */
  DISPATCHER?: DispatchNamespace;
  SOCIAL_INGRESS?: Fetcher;
  SOCIAL_CREDENTIAL_KEK?: string;
  /**
   * Workers AI binding. Calls should pass through @cloudforge/ai-policy so model fallback,
   * privacy, cache and AI Gateway semantics remain centralized rather than app-specific.
   *
   * Optional: a tenant without this binding receives 501 from AI endpoints while the rest
   * of the document/runtime path remains available.
   */
  AI?: ForgeAiBinding;
  /**
   * Optional AI Gateway id. Absence intentionally preserves the existing direct Workers AI
   * path; setting this is a deployment/config decision, not something application code may
   * silently create or mutate.
   */
  AI_GATEWAY_ID?: string;
}
