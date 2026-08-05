import { errors } from "../../core/src/index.js";
import { MARKETPLACE_PROVIDERS, type MarketplaceProvider } from "./marketplace-order.js";

export type MarketplaceMappingExceptionReason = "missing" | "disabled" | "channel_mismatch" | "sku_mismatch" | "variant_mismatch";

export interface MarketplaceMappingExceptionInput {
  provider: MarketplaceProvider;
  channel_profile: string;
  external_sku: string;
  external_variant_key: string;
  reason_code: MarketplaceMappingExceptionReason;
}

export interface MarketplaceMappingExceptionRow extends MarketplaceMappingExceptionInput {
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  resolved_at: string | null;
}

export async function recordMarketplaceMappingException(
  db: D1Database,
  tenantId: string,
  input: MarketplaceMappingExceptionInput,
  now = new Date(),
): Promise<void> {
  const normalized = normalize(input);
  if (!Number.isFinite(now.getTime())) throw errors.validation("Marketplace mapping exception time is invalid");
  const observedAt = now.toISOString();
  await db.prepare(`
    INSERT INTO marketplace_mapping_exceptions(
      tenant_id,channel_profile,provider,external_sku,external_variant_key,reason_code,
      first_seen_at,last_seen_at,occurrence_count,resolved_at
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?7,1,NULL)
    ON CONFLICT(tenant_id,channel_profile,provider,external_sku,external_variant_key) DO UPDATE SET
      reason_code=excluded.reason_code,
      last_seen_at=excluded.last_seen_at,
      occurrence_count=marketplace_mapping_exceptions.occurrence_count+1,
      resolved_at=NULL
  `).bind(
    tenantId,
    normalized.channel_profile,
    normalized.provider,
    normalized.external_sku,
    normalized.external_variant_key,
    normalized.reason_code,
    observedAt,
  ).run();
}

export async function resolveMarketplaceMappingExceptions(
  db: D1Database,
  tenantId: string,
  input: {
    provider: MarketplaceProvider;
    channel_profile: string;
    items: Array<{ external_sku: string; external_variant_key?: string }>;
  },
  now = new Date(),
): Promise<number> {
  if (!MARKETPLACE_PROVIDERS.includes(input.provider)) throw errors.validation("Unsupported marketplace provider");
  const channelProfile = text(input.channel_profile, "channel_profile", 240);
  if (!Array.isArray(input.items) || input.items.length > 500) throw errors.validation("Marketplace mapping resolution items are invalid");
  if (!Number.isFinite(now.getTime())) throw errors.validation("Marketplace mapping resolution time is invalid");
  const resolvedAt = now.toISOString();
  let resolved = 0;
  for (const item of input.items) {
    const sku = text(item.external_sku, "external_sku", 200);
    const variant = normalizeVariant(item.external_variant_key);
    const result = await db.prepare(`
      UPDATE marketplace_mapping_exceptions
      SET resolved_at=?6
      WHERE tenant_id=?1 AND channel_profile=?2 AND provider=?3
        AND external_sku=?4 AND external_variant_key=?5 AND resolved_at IS NULL
    `).bind(tenantId, channelProfile, input.provider, sku, variant, resolvedAt).run();
    resolved += result.meta?.changes ?? 0;
  }
  return resolved;
}

export async function listOpenMarketplaceMappingExceptions(
  db: D1Database,
  tenantId: string,
  limit = 100,
): Promise<MarketplaceMappingExceptionRow[]> {
  const bounded = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  const result = await db.prepare(`
    SELECT channel_profile,provider,external_sku,external_variant_key,reason_code,
           first_seen_at,last_seen_at,occurrence_count,resolved_at
    FROM marketplace_mapping_exceptions
    WHERE tenant_id=?1 AND resolved_at IS NULL
    ORDER BY last_seen_at DESC,channel_profile ASC,external_sku ASC,external_variant_key ASC
    LIMIT ?2
  `).bind(tenantId, bounded).all<MarketplaceMappingExceptionRow>();
  return (result.results ?? []).map((row) => ({
    channel_profile: row.channel_profile,
    provider: row.provider,
    external_sku: row.external_sku,
    external_variant_key: row.external_variant_key,
    reason_code: row.reason_code,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    occurrence_count: Number(row.occurrence_count),
    resolved_at: row.resolved_at,
  }));
}

export function mappingExceptionFromErrorDetails(value: unknown): MarketplaceMappingExceptionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Record<string, unknown>;
  const reason = details.marketplace_mapping_reason;
  const provider = details.provider;
  const channelProfile = details.channel_profile;
  const sku = details.external_sku;
  const variant = details.external_variant_key;
  if (!isReason(reason) || !isProvider(provider)) return null;
  if (typeof channelProfile !== "string" || typeof sku !== "string" || typeof variant !== "string") return null;
  return normalize({
    reason_code: reason,
    provider,
    channel_profile: channelProfile,
    external_sku: sku,
    external_variant_key: variant,
  });
}

function normalize(input: MarketplaceMappingExceptionInput): MarketplaceMappingExceptionInput {
  if (!MARKETPLACE_PROVIDERS.includes(input.provider)) throw errors.validation("Unsupported marketplace provider");
  if (!isReason(input.reason_code)) throw errors.validation("Marketplace mapping exception reason is invalid");
  return {
    provider: input.provider,
    channel_profile: text(input.channel_profile, "channel_profile", 240),
    external_sku: text(input.external_sku, "external_sku", 200),
    external_variant_key: normalizeVariant(input.external_variant_key),
    reason_code: input.reason_code,
  };
}

function isProvider(value: unknown): value is MarketplaceProvider {
  return typeof value === "string" && MARKETPLACE_PROVIDERS.includes(value as MarketplaceProvider);
}
function isReason(value: unknown): value is MarketplaceMappingExceptionReason {
  return value === "missing" || value === "disabled" || value === "channel_mismatch" || value === "sku_mismatch" || value === "variant_mismatch";
}
function normalizeVariant(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return "BASE";
  return text(value, "external_variant_key", 200);
}
function text(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}
