import type { JsonObject } from "../../contracts/src/index.js";
import type { ConnectorProviderAdapter, ProviderSyncContext } from "./adapter.js";
import { validateConnectorConnection, type ConnectorConnection } from "./connection.js";
import {
  LAZADA_MARKETPLACE_ADAPTER,
  SHOPEE_MARKETPLACE_ADAPTER,
  TIKTOK_SHOP_MARKETPLACE_ADAPTER,
} from "./marketplace-connectors.js";
import {
  createLazadaSignedRequestExecutor,
  createShopeeSignedRequestExecutor,
  createTikTokShopSignedRequestExecutor,
  type LazadaSignerCredentials,
  type ShopeeSignerCredentials,
  type SignerOptions,
  type TikTokShopSignerCredentials,
} from "./marketplace-signing.js";

export type MarketplaceCredentialMaterial =
  | ({ provider: "shopee" } & ShopeeSignerCredentials)
  | ({ provider: "lazada" } & LazadaSignerCredentials)
  | ({ provider: "tiktok_shop" } & TikTokShopSignerCredentials);

/**
 * Implemented by WS11. The Integration Hub passes only a reference and the credential
 * scope; plaintext material crosses this boundary once, is captured by a signer closure,
 * and is never returned in connection config, logs or adapter context.
 */
export interface MarketplaceCredentialResolver {
  resolve(input: {
    tenant_id: string;
    connection_id: string;
    secret_ref: string;
    provider: MarketplaceCredentialMaterial["provider"];
  }): Promise<MarketplaceCredentialMaterial>;
}

export interface PreparedMarketplaceSyncRuntime {
  adapter: ConnectorProviderAdapter;
  context: ProviderSyncContext;
}

export async function prepareMarketplaceSyncRuntime(
  connection: ConnectorConnection,
  cursor: string | null,
  limit: number,
  credentials: MarketplaceCredentialResolver,
  signerOptions: SignerOptions = {},
): Promise<PreparedMarketplaceSyncRuntime> {
  const adapter = marketplaceAdapter(connection.connector_key, connection.connector_version);
  validateConnectorConnection(connection, adapter.manifest);
  if (connection.status !== "active") throw new Error("Marketplace connector connection is not active");
  if (connection.auth_kind !== "oauth2" || !connection.secret_ref) throw new Error("Marketplace connector requires OAuth2 secret_ref");
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 500) throw new Error("Marketplace sync limit is invalid");
  if (cursor !== null && (typeof cursor !== "string" || cursor.length > 4_096 || /[\r\n\0]/.test(cursor))) throw new Error("Marketplace sync cursor is invalid");

  const provider = marketplaceProvider(adapter.manifest.provider);
  const material = await credentials.resolve({
    tenant_id: connection.tenant_id,
    connection_id: connection.connection_id,
    secret_ref: connection.secret_ref,
    provider,
  });
  if (material.provider !== provider) throw new Error("Marketplace credential provider does not match connector provider");
  assertCredentialScopeMatchesConfig(provider, material, connection.config);

  const signedRequest = provider === "shopee"
    ? createShopeeSignedRequestExecutor(material as Extract<MarketplaceCredentialMaterial, { provider: "shopee" }>, signerOptions)
    : provider === "lazada"
      ? createLazadaSignedRequestExecutor(material as Extract<MarketplaceCredentialMaterial, { provider: "lazada" }>, signerOptions)
      : createTikTokShopSignedRequestExecutor(material as Extract<MarketplaceCredentialMaterial, { provider: "tiktok_shop" }>, signerOptions);

  return {
    adapter,
    context: {
      tenant_id: connection.tenant_id,
      connection_id: connection.connection_id,
      stream: "orders",
      cursor,
      limit,
      credential_headers: {},
      config: structuredClone(connection.config),
      signed_request: signedRequest,
    },
  };
}

export function marketplaceAdapter(connectorKey: string, version: string): ConnectorProviderAdapter {
  if (version !== "1.0.0") throw new Error(`Unsupported marketplace connector version ${version}`);
  if (connectorKey === SHOPEE_MARKETPLACE_ADAPTER.manifest.connector_key) return SHOPEE_MARKETPLACE_ADAPTER;
  if (connectorKey === LAZADA_MARKETPLACE_ADAPTER.manifest.connector_key) return LAZADA_MARKETPLACE_ADAPTER;
  if (connectorKey === TIKTOK_SHOP_MARKETPLACE_ADAPTER.manifest.connector_key) return TIKTOK_SHOP_MARKETPLACE_ADAPTER;
  throw new Error(`Unsupported marketplace connector ${connectorKey}`);
}

function marketplaceProvider(value: string): MarketplaceCredentialMaterial["provider"] {
  if (value === "shopee" || value === "lazada" || value === "tiktok_shop") return value;
  throw new Error(`Unsupported marketplace provider ${value}`);
}

function assertCredentialScopeMatchesConfig(
  provider: MarketplaceCredentialMaterial["provider"],
  material: MarketplaceCredentialMaterial,
  config: JsonObject,
): void {
  if (provider === "shopee") {
    const shopId = scalarText(config.shop_id, "Shopee config shop_id");
    if ((material as Extract<MarketplaceCredentialMaterial, { provider: "shopee" }>).shop_id !== shopId) {
      throw new Error("Shopee credential shop scope does not match connection config");
    }
  }
}

function scalarText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${field} is required`);
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 300 || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
