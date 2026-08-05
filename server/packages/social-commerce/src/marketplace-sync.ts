import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  assertProviderAdapterConformance,
  type ConnectorProviderAdapter,
  type ProviderSyncContext,
} from "../../integration-hub/src/adapter.js";
import type { MarketplaceProvider } from "./marketplace-order.js";
import { ingestMarketplaceProviderRecord } from "./provider-order-ingest.js";

export interface MarketplaceSyncOrderResult {
  external_index: number;
  order_id: string;
  sales_order_name: string;
  idempotent_replay: boolean;
}

export interface MarketplaceSyncPageResult {
  provider: MarketplaceProvider;
  channel_profile: string;
  records: MarketplaceSyncOrderResult[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * WS16 consumer for WS10 provider pages. Cursor ownership stays in Integration Hub/WS12:
 * this function returns a next cursor only after every record in the page has reached the
 * canonical ERP path. On any record failure it throws, so the caller keeps the old cursor
 * and retries; already accepted orders replay idempotently by provider source key.
 */
export async function ingestMarketplaceSyncPage(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  adapter: ConnectorProviderAdapter,
  context: ProviderSyncContext,
  channelProfile: string,
): Promise<MarketplaceSyncPageResult> {
  const conformance = assertProviderAdapterConformance(adapter);
  if (!conformance.sync || typeof adapter.fetchPage !== "function") throw errors.misconfigured("Marketplace connector does not support pull sync");
  if (adapter.manifest.category !== "marketplace") throw errors.misconfigured("Connector is not a marketplace connector");
  const provider = marketplaceProvider(adapter.manifest.provider);
  adapter.validateConfig(context.config ?? {});
  const page = await adapter.fetchPage(context);
  if (page.records.length > context.limit) throw errors.validation("Marketplace connector returned more records than requested");

  const records: MarketplaceSyncOrderResult[] = [];
  for (const [index, record] of page.records.entries()) {
    try {
      const result = await ingestMarketplaceProviderRecord(db, tenantId, actor, {
        provider,
        channel_profile: channelProfile,
        record,
      });
      records.push({
        external_index: index,
        order_id: result.order_id,
        sales_order_name: result.sales_order_name,
        idempotent_replay: result.reservation.idempotent_replay,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 320) : "Marketplace record ingest failed";
      throw errors.reference(`Marketplace ${provider} page cannot advance at record ${index + 1}`, {
        provider,
        channel_profile: channelProfile,
        external_index: index,
        reason,
      });
    }
  }

  return {
    provider,
    channel_profile: channelProfile,
    records,
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  };
}

function marketplaceProvider(value: string): MarketplaceProvider {
  if (value === "shopee" || value === "lazada" || value === "tiktok_shop") return value;
  throw errors.misconfigured(`Unsupported marketplace provider ${value}`);
}
