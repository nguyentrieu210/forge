import type { Actor } from "../../contracts/src/index.js";
import type { MarketplaceCredentialResolver } from "../../integration-hub/src/marketplace-runtime.js";
import { resolveConfiguredMarketplaceSync } from "./marketplace-sync-config.js";
import { runMarketplaceOrderSync } from "./marketplace-sync-runner.js";

interface ChannelProfileRow {
  name: string;
  payload_json: string;
}

export interface MarketplaceMaintenanceFailure {
  channel_profile: string;
  code:
    | "duplicate_connection_profile"
    | "connection_invalid"
    | "credential_unavailable"
    | "provider_auth"
    | "provider_rate_limit"
    | "mapping_blocked"
    | "sync_failed";
}

export interface MarketplaceMaintenanceResult {
  enabled: true;
  selected: number;
  succeeded: number;
  skipped: number;
  failed: number;
  pages: number;
  records: number;
  idempotent_replays: number;
  failures: MarketplaceMaintenanceFailure[];
}

export interface MarketplaceMaintenanceOptions {
  max_profiles?: number;
  page_size?: number;
  max_pages_per_profile?: number;
  actor?: Actor;
}

/**
 * Run a fair, bounded marketplace polling sweep for one tenant.
 *
 * Profiles are ordered by the connection checkpoint's oldest updated_at so a tenant with
 * many shops rotates through them instead of always serving the alphabetically first few.
 * One broken provider/shop never fails the tenant's whole maintenance cycle: its own sync
 * lease records retry/error state and this sweep emits only a non-secret failure code.
 */
export async function runMarketplaceMaintenance(
  db: D1Database,
  tenantId: string,
  credentials: MarketplaceCredentialResolver,
  options: MarketplaceMaintenanceOptions = {},
): Promise<MarketplaceMaintenanceResult> {
  const maxProfiles = bounded(options.max_profiles ?? 25, 1, 100, "max_profiles");
  const pageSize = bounded(options.page_size ?? 50, 1, 100, "page_size");
  const maxPages = bounded(options.max_pages_per_profile ?? 3, 1, 20, "max_pages_per_profile");
  const actor = options.actor ?? SYSTEM_ACTOR;

  const duplicateRows = await db.prepare(`
    SELECT json_extract(payload_json,'$.connection_id') AS connection_id
    FROM documents
    WHERE tenant_id=?1 AND doctype='Commerce Channel Profile' AND docstatus<>2
      AND COALESCE(json_extract(payload_json,'$.disabled'),0)=0
      AND COALESCE(json_extract(payload_json,'$.sync_orders'),1)<>0
      AND COALESCE(json_extract(payload_json,'$.connection_id'),'')<>''
    GROUP BY json_extract(payload_json,'$.connection_id')
    HAVING COUNT(*)>1
    LIMIT 200
  `).bind(tenantId).all<{ connection_id: string }>();
  const duplicateConnections = new Set((duplicateRows.results ?? []).map((row) => row.connection_id));

  const rows = await db.prepare(`
    SELECT p.name,p.payload_json
    FROM documents p
    LEFT JOIN marketplace_sync_state s
      ON s.tenant_id=p.tenant_id
     AND s.connection_id=json_extract(p.payload_json,'$.connection_id')
     AND s.stream='orders'
    WHERE p.tenant_id=?1 AND p.doctype='Commerce Channel Profile' AND p.docstatus<>2
      AND COALESCE(json_extract(p.payload_json,'$.disabled'),0)=0
      AND COALESCE(json_extract(p.payload_json,'$.sync_orders'),1)<>0
    ORDER BY COALESCE(s.updated_at,'') ASC,p.name ASC
    LIMIT ?2
  `).bind(tenantId, maxProfiles).all<ChannelProfileRow>();

  const failures: MarketplaceMaintenanceFailure[] = [];
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  let pages = 0;
  let records = 0;
  let idempotentReplays = 0;

  for (const row of rows.results ?? []) {
    const connectionId = profileConnectionId(row.payload_json);
    if (connectionId && duplicateConnections.has(connectionId)) {
      failed += 1;
      failures.push({ channel_profile: row.name, code: "duplicate_connection_profile" });
      continue;
    }
    try {
      const configured = await resolveConfiguredMarketplaceSync(db, tenantId, row.name);
      const result = await runMarketplaceOrderSync(
        db,
        tenantId,
        actor,
        configured.connection,
        configured.channel_profile,
        credentials,
        { page_size: pageSize, max_pages: maxPages },
      );
      pages += result.pages;
      records += result.records;
      idempotentReplays += result.idempotent_replays;
      if (result.status === "skipped") skipped += 1;
      else succeeded += 1;
    } catch (error) {
      failed += 1;
      failures.push({ channel_profile: row.name, code: failureCode(error) });
    }
  }

  return {
    enabled: true,
    selected: (rows.results ?? []).length,
    succeeded,
    skipped,
    failed,
    pages,
    records,
    idempotent_replays: idempotentReplays,
    failures,
  };
}

const SYSTEM_ACTOR: Actor = { user_id: "Administrator", roles: ["System Manager"] };

function profileConnectionId(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { connection_id?: unknown };
    if (typeof parsed.connection_id !== "string") return null;
    const value = parsed.connection_id.trim();
    return value && value.length <= 160 && !/[\r\n\0]/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function failureCode(error: unknown): MarketplaceMaintenanceFailure["code"] {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (text.includes("credential") || text.includes("secret_ref") || text.includes("kek")) return "credential_unavailable";
  if (text.includes("http 401") || text.includes("http 403") || text.includes("oauth") || text.includes("authorization")) return "provider_auth";
  if (text.includes("http 429") || text.includes("rate limit")) return "provider_rate_limit";
  if (text.includes("sku") || text.includes("mapping")) return "mapping_blocked";
  if (text.includes("connection") || text.includes("channel profile") || text.includes("provider") || text.includes("config")) return "connection_invalid";
  return "sync_failed";
}

function bounded(value: number, min: number, max: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Marketplace maintenance ${field} is invalid`);
  return value;
}
