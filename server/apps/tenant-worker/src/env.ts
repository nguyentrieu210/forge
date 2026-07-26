import type { DomainEvent } from "../../../packages/contracts/src/index.js";

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
   * Signing secret for Frappe-shaped `sid` cookies.
   *
   * Kept distinct from INTERNAL_AUTH_SECRET so that rotating platform-internal
   * signing does not log every user out, and so a leak of one does not forge the
   * other. Absent means cookie sessions are disabled and only bearer auth works.
   */
  SESSION_SECRET?: string;
}
