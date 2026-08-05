import { errors } from "../../core/src/index.js";
import {
  MARKETPLACE_PROVIDERS,
  marketplaceOrderSourceKey,
  type MarketplaceOrderInput,
  type MarketplaceProvider,
} from "./marketplace-order.js";

export interface MarketplaceProviderOrderEventState {
  source_key: string;
  provider: MarketplaceProvider;
  latest_external_status: string;
  latest_occurred_at: string;
  observed_at: string;
  event_count: number;
  stale_event_count: number;
  duplicate_event_count: number;
  conflict_event_count: number;
  incoming_is_latest: boolean;
}

interface MarketplaceProviderOrderStateRow {
  source_key: string;
  provider: MarketplaceProvider;
  latest_external_status: string;
  latest_occurred_at: string;
  observed_at: string;
  event_count: number;
  stale_event_count: number;
  duplicate_event_count: number;
  conflict_event_count: number;
}

/**
 * Record provider lifecycle evidence without mutating canonical ERP lifecycle.
 *
 * The provider timestamp is a monotonic watermark only. Older retries/out-of-order
 * records increment stale_event_count and cannot overwrite the latest observed status.
 * Equal-timestamp duplicates are counted; equal-timestamp status disagreements are
 * counted as conflicts and preserve the first accepted value. No provider status is
 * translated into Sales Order, Delivery Note, Stock Return or Finance state here.
 */
export async function observeMarketplaceProviderOrderEvent(
  db: D1Database,
  tenantId: string,
  input: Pick<MarketplaceOrderInput, "provider" | "shop_id" | "external_order_id" | "external_status" | "occurred_at">,
  now = new Date(),
): Promise<MarketplaceProviderOrderEventState> {
  if (!MARKETPLACE_PROVIDERS.includes(input.provider)) throw errors.validation("Unsupported marketplace provider");
  const sourceKey = await marketplaceOrderSourceKey(input.provider, input.shop_id, input.external_order_id);
  const externalStatus = requiredText(input.external_status, "external_status", 120);
  const occurredAt = isoDateTime(input.occurred_at, "occurred_at");
  if (!Number.isFinite(now.getTime())) throw errors.validation("Marketplace provider observation time is invalid");
  const observedAt = now.toISOString();

  const result = await db.prepare(`
    INSERT INTO marketplace_provider_order_state(
      tenant_id,source_key,provider,latest_external_status,latest_occurred_at,observed_at,
      event_count,stale_event_count,duplicate_event_count,conflict_event_count
    ) VALUES(?1,?2,?3,?4,?5,?6,1,0,0,0)
    ON CONFLICT(tenant_id,source_key) DO UPDATE SET
      event_count=marketplace_provider_order_state.event_count+1,
      stale_event_count=marketplace_provider_order_state.stale_event_count+
        CASE WHEN excluded.latest_occurred_at < marketplace_provider_order_state.latest_occurred_at THEN 1 ELSE 0 END,
      duplicate_event_count=marketplace_provider_order_state.duplicate_event_count+
        CASE WHEN excluded.latest_occurred_at = marketplace_provider_order_state.latest_occurred_at
          AND excluded.latest_external_status = marketplace_provider_order_state.latest_external_status THEN 1 ELSE 0 END,
      conflict_event_count=marketplace_provider_order_state.conflict_event_count+
        CASE WHEN excluded.latest_occurred_at = marketplace_provider_order_state.latest_occurred_at
          AND excluded.latest_external_status <> marketplace_provider_order_state.latest_external_status THEN 1 ELSE 0 END,
      latest_external_status=CASE
        WHEN excluded.latest_occurred_at > marketplace_provider_order_state.latest_occurred_at
        THEN excluded.latest_external_status ELSE marketplace_provider_order_state.latest_external_status END,
      latest_occurred_at=CASE
        WHEN excluded.latest_occurred_at > marketplace_provider_order_state.latest_occurred_at
        THEN excluded.latest_occurred_at ELSE marketplace_provider_order_state.latest_occurred_at END,
      observed_at=excluded.observed_at
    WHERE marketplace_provider_order_state.provider=excluded.provider
  `).bind(
    tenantId,
    sourceKey,
    input.provider,
    externalStatus,
    occurredAt,
    observedAt,
  ).run();
  if ((result.meta?.changes ?? 0) !== 1) throw errors.idempotency();

  const row = await db.prepare(`
    SELECT source_key,provider,latest_external_status,latest_occurred_at,observed_at,
           event_count,stale_event_count,duplicate_event_count,conflict_event_count
    FROM marketplace_provider_order_state
    WHERE tenant_id=?1 AND source_key=?2
    LIMIT 1
  `).bind(tenantId, sourceKey).first<MarketplaceProviderOrderStateRow>();
  if (!row || row.provider !== input.provider) throw errors.idempotency();

  return {
    source_key: row.source_key,
    provider: row.provider,
    latest_external_status: row.latest_external_status,
    latest_occurred_at: row.latest_occurred_at,
    observed_at: row.observed_at,
    event_count: Number(row.event_count),
    stale_event_count: Number(row.stale_event_count),
    duplicate_event_count: Number(row.duplicate_event_count),
    conflict_event_count: Number(row.conflict_event_count),
    incoming_is_latest: row.latest_occurred_at === occurredAt && row.latest_external_status === externalStatus,
  };
}

function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function isoDateTime(value: string, field: string): string {
  const normalized = requiredText(value, field, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be an ISO date-time`);
  return new Date(parsed).toISOString();
}
