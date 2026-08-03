import type { DomainEvent } from "../../../packages/contracts/src/index.js";
import type { ForgeAiBinding } from "../../../packages/ai-policy/src/index.js";

export interface TenantEnv {
  DB: D1Database;
  AGGREGATES: DurableObjectNamespace;
  OUTBOX_QUEUE?: Queue<DomainEvent>;
  FILES?: R2Bucket;
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
