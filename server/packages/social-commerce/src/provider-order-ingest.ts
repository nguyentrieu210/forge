import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { asCloudForgeError } from "../../core/src/index.js";
import {
  mappingExceptionFromErrorDetails,
  recordMarketplaceMappingException,
  resolveMarketplaceMappingExceptions,
} from "./marketplace-mapping-exception.js";
import type { MarketplaceProvider } from "./marketplace-order.js";
import { ingestResolvedMarketplaceOrder, type MarketplaceOperationalOrderResult } from "./marketplace-operations.js";
import {
  observeMarketplaceProviderOrderEvent,
  type MarketplaceProviderOrderEventState,
} from "./marketplace-provider-order-state.js";
import { resolveMarketplaceOrderFromMetadata, type ResolvedMarketplaceOrder } from "./marketplace-profile.js";
import { normalizeMarketplaceProviderOrderRecord } from "./provider-order-normalization.js";

/**
 * Trusted WS10/WS12 bridge after provider auth/signature, dedup and retry policy.
 * Provider records are reduced to provider-owned identities only; ERP Item/Company/
 * Customer/Currency/Price List/Warehouse are resolved from tenant metadata afterwards.
 */
export async function ingestMarketplaceProviderRecord(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  input: {
    provider: MarketplaceProvider;
    channel_profile: string;
    record: JsonObject;
  },
): Promise<MarketplaceOperationalOrderResult & {
  channel_profile: string;
  warehouse: string;
  provider_event_state: MarketplaceProviderOrderEventState;
}> {
  const normalized = normalizeMarketplaceProviderOrderRecord(input.provider, input.channel_profile, input.record);
  let resolved: ResolvedMarketplaceOrder;
  try {
    resolved = await resolveMarketplaceOrderFromMetadata(db, tenantId, normalized);
  } catch (error) {
    const mappingException = mappingExceptionFromErrorDetails(asCloudForgeError(error).details);
    if (mappingException) await recordMarketplaceMappingException(db, tenantId, mappingException);
    throw error;
  }
  if (resolved.order.provider !== input.provider) {
    throw new Error(`Provider record ${input.provider} does not match Commerce Channel Profile ${resolved.channel_profile}`);
  }

  // Once metadata resolution succeeds, any previously-open exception for these
  // exact SKU/variant identities is resolved. The Marketplace SKU Mapping document
  // remains the authority; this table is only an operator inbox projection.
  await resolveMarketplaceMappingExceptions(db, tenantId, {
    provider: resolved.order.provider,
    channel_profile: resolved.channel_profile,
    items: normalized.items,
  });

  const result = await ingestResolvedMarketplaceOrder(db, tenantId, actor, resolved);

  // Persist external lifecycle evidence only after canonical acceptance. If this
  // write fails, provider retry replays the canonical order idempotently and can
  // repair the watermark without skipping ERP document creation.
  const providerEventState = await observeMarketplaceProviderOrderEvent(db, tenantId, resolved.order);
  return {
    channel_profile: resolved.channel_profile,
    warehouse: resolved.warehouse,
    provider_event_state: providerEventState,
    ...result,
  };
}
