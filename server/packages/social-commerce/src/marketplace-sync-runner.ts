import type { Actor } from "../../contracts/src/index.js";
import { randomId } from "../../core/src/index.js";
import type { ConnectorConnection } from "../../integration-hub/src/connection.js";
import {
  prepareMarketplaceSyncRuntime,
  type MarketplaceCredentialResolver,
} from "../../integration-hub/src/marketplace-runtime.js";
import { D1MarketplaceSyncStateStore } from "../../integration-hub/src/marketplace-sync-store.js";
import { computeRetryDelaySeconds, normalizeRetryPolicy, type IntegrationRetryPolicy } from "../../integration-hub/src/index.js";
import { ingestMarketplaceSyncPage } from "./marketplace-sync.js";

export interface MarketplaceOrderSyncRunResult {
  status: "succeeded" | "skipped";
  reason?: "connection_inactive" | "lease_unavailable";
  run_id: string | null;
  pages: number;
  records: number;
  idempotent_replays: number;
  checkpoint: number | null;
  cursor: string | null;
  has_more: boolean;
}

export interface MarketplaceOrderSyncRunOptions {
  page_size?: number;
  max_pages?: number;
  retry_policy?: Partial<IntegrationRetryPolicy>;
  now?: () => Date;
  run_id?: string;
}

/**
 * Runs one bounded marketplace order polling lease.
 *
 * Provider credentials are resolved once behind WS11 and captured only by the signer
 * closure. Each provider page must finish canonical ERP ingestion before its cursor is
 * compare-and-swapped in D1. A crash therefore replays, never skips, a page; canonical
 * marketplace order identity/reservation make that replay idempotent.
 */
export async function runMarketplaceOrderSync(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  connection: ConnectorConnection,
  channelProfile: string,
  credentials: MarketplaceCredentialResolver,
  options: MarketplaceOrderSyncRunOptions = {},
): Promise<MarketplaceOrderSyncRunResult> {
  if (connection.tenant_id !== tenantId) throw new Error("Marketplace sync connection tenant mismatch");
  if (!channelProfile || channelProfile.length > 160 || /[\r\n\0]/.test(channelProfile)) throw new Error("Marketplace channel profile is invalid");
  if (connection.status !== "active") {
    return {
      status: "skipped",
      reason: "connection_inactive",
      run_id: null,
      pages: 0,
      records: 0,
      idempotent_replays: 0,
      checkpoint: null,
      cursor: null,
      has_more: false,
    };
  }

  const pageSize = boundedInteger(options.page_size ?? 50, 1, 100, "page_size");
  const maxPages = boundedInteger(options.max_pages ?? 10, 1, 100, "max_pages");
  const policy = normalizeRetryPolicy(options.retry_policy);
  const clock = options.now ?? (() => new Date());
  const runId = options.run_id ?? randomId("marketplace_sync");
  const state = new D1MarketplaceSyncStateStore(db);
  const claimed = await state.claim({
    tenant_id: tenantId,
    connector_key: connection.connector_key,
    connection_id: connection.connection_id,
    stream: "orders",
    run_id: runId,
    now: clock(),
  });
  if (!claimed) {
    const observed = await state.get(tenantId, connection.connection_id, "orders");
    return {
      status: "skipped",
      reason: "lease_unavailable",
      run_id: null,
      pages: 0,
      records: 0,
      idempotent_replays: 0,
      checkpoint: observed?.cursor.checkpoint ?? null,
      cursor: observed?.cursor.cursor ?? null,
      has_more: false,
    };
  }

  let checkpoint = claimed.cursor.checkpoint;
  let cursor = claimed.cursor.cursor;
  let pages = 0;
  let records = 0;
  let idempotentReplays = 0;
  let hasMore = false;
  try {
    const prepared = await prepareMarketplaceSyncRuntime(connection, cursor, pageSize, credentials);
    while (pages < maxPages) {
      const page = await ingestMarketplaceSyncPage(
        db,
        tenantId,
        actor,
        prepared.adapter,
        { ...prepared.context, cursor },
        channelProfile,
      );
      pages += 1;
      records += page.records.length;
      idempotentReplays += page.records.filter((record) => record.idempotent_replay).length;
      hasMore = page.has_more;

      const advanced = await state.advance({
        tenant_id: tenantId,
        connection_id: connection.connection_id,
        stream: "orders",
        run_id: runId,
        expected_checkpoint: checkpoint,
        next_cursor: page.next_cursor,
        now: clock(),
      });
      checkpoint = advanced.checkpoint;
      cursor = advanced.cursor;
      if (!page.has_more) break;
    }

    await state.complete({
      tenant_id: tenantId,
      connection_id: connection.connection_id,
      stream: "orders",
      run_id: runId,
      now: clock(),
    });
    return {
      status: "succeeded",
      run_id: runId,
      pages,
      records,
      idempotent_replays: idempotentReplays,
      checkpoint,
      cursor,
      has_more: hasMore,
    };
  } catch (error) {
    const attempt = claimed.status.attempts;
    const retryAfter = attempt >= policy.max_attempts
      ? undefined
      : computeRetryDelaySeconds(attempt, policy);
    const code = syncErrorCode(error);
    try {
      await state.fail({
        tenant_id: tenantId,
        connection_id: connection.connection_id,
        stream: "orders",
        run_id: runId,
        error_code: code,
        ...(retryAfter === undefined ? {} : { retry_after_seconds: retryAfter }),
        now: clock(),
      });
    } catch (stateError) {
      throw new AggregateError([error, stateError], "Marketplace sync failed and its lease state could not be recorded");
    }
    throw error;
  }
}

function boundedInteger(value: number, min: number, max: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Marketplace sync ${field} is invalid`);
  return value;
}

function syncErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("credential") || normalized.includes("oauth") || normalized.includes("http 401") || normalized.includes("http 403")) {
    return "provider_auth";
  }
  if (normalized.includes("sku") || normalized.includes("reference") || normalized.includes("mapping")) return "mapping_blocked";
  if (normalized.includes("cursor") || normalized.includes("checkpoint") || normalized.includes("lease")) return "cursor_conflict";
  if (normalized.includes("http 429") || normalized.includes("rate limit")) return "provider_rate_limit";
  if (normalized.includes("http 5") || normalized.includes("network") || normalized.includes("fetch")) return "provider_transient";
  return "sync_failed";
}
