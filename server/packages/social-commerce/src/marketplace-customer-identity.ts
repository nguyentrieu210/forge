import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { asCloudForgeError, errors } from "../../core/src/index.js";
import {
  crmCustomerExternalIdentityDocumentName,
  crmCustomerExternalIdentityKey,
  crmCustomerExternalScopeKey,
  createO2CControllerRegistry,
  type CrmCustomerExternalIdentityData,
} from "../../clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../clouderp-core/src/index.js";
import { registerStockControllers } from "../../clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../clouderp-erpnext/src/index.js";
import { buildCommand } from "../../frappe-api/src/index.js";
import {
  D1RolloutPurchaseAllocationDomainStore,
  DocumentKernel,
} from "../../document-kernel/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  GenericMetadataController,
  MetadataPermissionService,
} from "../../frappe-model/src/index.js";
import { D1OrganizationSecurityGuard } from "../../organization-security/src/index.js";
import {
  marketplaceChannelId,
  marketplaceCustomerIdentityKeyFromLineage,
  marketplaceOrderSourceKey,
  type MarketplaceProvider,
} from "./marketplace-order.js";
import type { ResolvedMarketplaceOrder } from "./marketplace-profile.js";

export type MarketplaceCustomerIdentityStatus = "anonymous" | "unmapped" | "linked" | "historical";

export interface MarketplaceCustomerIdentityResolution {
  status: MarketplaceCustomerIdentityStatus;
  customer: string;
  identity_key: string | null;
  crm_contact: string | null;
}

export interface MarketplaceOrderIdentityLinkResult extends MarketplaceCustomerIdentityResolution {
  identity_document: string;
  channel_profile: string;
  provider: MarketplaceProvider;
  idempotent_replay: boolean;
}

interface DocumentRow {
  name: string;
  docstatus: number;
  payload_json: string;
}

/**
 * Resolve an external marketplace actor to canonical Customer by an exact, opaque
 * CRM fingerprint. No name/email/phone matching is performed here.
 *
 * If the same external order already produced a canonical Sales Order, replay keeps
 * the Customer stored on that order even if the identity mapping was added later.
 */
export async function resolveMarketplaceCustomerIdentity(
  db: D1Database,
  tenantId: string,
  resolved: ResolvedMarketplaceOrder,
): Promise<{ resolved: ResolvedMarketplaceOrder; identity: MarketplaceCustomerIdentityResolution }> {
  const externalBuyer = resolved.order.external_buyer_id;
  if (!externalBuyer) {
    return {
      resolved,
      identity: { status: "anonymous", customer: resolved.order.customer, identity_key: null, crm_contact: null },
    };
  }

  const identityKey = await crmCustomerExternalIdentityKey(
    resolved.order.provider,
    resolved.order.shop_id,
    externalBuyer,
  );
  const existingOrder = await readExistingMarketplaceSalesOrder(db, tenantId, resolved);
  if (existingOrder) {
    const customer = requiredPayloadText(existingOrder, "customer", 160, "Existing marketplace Sales Order customer");
    const mapping = await readIdentityDocument(db, tenantId, identityKey);
    const current = mapping && mapping.identity_status === "Active" && mapping.linked_customer === customer;
    return {
      resolved: withCustomer(resolved, customer),
      identity: {
        status: current ? "linked" : "historical",
        customer,
        identity_key: identityKey,
        crm_contact: current ? mapping.crm_contact ?? null : null,
      },
    };
  }

  const mapping = await readIdentityDocument(db, tenantId, identityKey);
  if (!mapping || mapping.identity_status !== "Active") {
    return {
      resolved,
      identity: { status: "unmapped", customer: resolved.order.customer, identity_key: identityKey, crm_contact: null },
    };
  }
  await assertMappingContext(resolved, mapping);
  return {
    resolved: withCustomer(resolved, mapping.linked_customer),
    identity: {
      status: "linked",
      customer: mapping.linked_customer,
      identity_key: identityKey,
      crm_contact: mapping.crm_contact ?? null,
    },
  };
}

/**
 * Link the external buyer behind an existing marketplace order to ERP Customer.
 * The client never sends provider buyer id. New Sales Orders contain only an opaque
 * CRM identity fingerprint; legacy raw lineages are accepted only for compatibility.
 */
export async function linkMarketplaceOrderCustomerIdentity(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  input: {
    order_id: string;
    customer: string;
    crm_contact?: string;
    change_reason?: string;
  },
): Promise<MarketplaceOrderIdentityLinkResult> {
  const orderId = requiredText(input.order_id, "order_id", 240);
  const customer = requiredText(input.customer, "customer", 160);
  const crmContact = optionalText(input.crm_contact, 160);
  const reason = optionalText(input.change_reason, 500);
  const operational = await db.prepare(`
    SELECT sales_order_name FROM social_orders
    WHERE tenant_id=?1 AND order_id=?2 AND cart_id LIKE 'marketplace:%'
    LIMIT 1
  `).bind(tenantId, orderId).first<{ sales_order_name: string | null }>();
  if (!operational?.sales_order_name) throw errors.notFound(`Marketplace order ${orderId} has no canonical Sales Order`);

  const salesOrder = await readDocument(db, tenantId, "Sales Order", operational.sales_order_name);
  if (!salesOrder || salesOrder.docstatus === 2) throw errors.reference(`Active Sales Order ${operational.sales_order_name} is required`);
  const salesPayload = parsePayload(salesOrder.payload_json, "Sales Order");
  const actorLineage = requiredText(salesPayload.social_external_actor_id, "Marketplace buyer identity", 320);
  if (isGuestLineage(actorLineage)) throw errors.validation("Anonymous marketplace order cannot be linked to a customer identity");
  const channelId = requiredText(salesPayload.social_page_id, "Marketplace channel id", 240);
  const profile = await resolveProfileFromChannelId(db, tenantId, channelId);
  const identityKey = await identityKeyFromActorLineage(actorLineage, profile);
  const scopeKey = await crmCustomerExternalScopeKey(profile.provider, profile.shop_id);
  const identityName = crmCustomerExternalIdentityDocumentName(identityKey);
  const existing = await readDocument(db, tenantId, "CRM Customer External Identity", identityName);

  if (existing) {
    const current = parseIdentity(existing);
    if (current.identity_status === "Active" && current.linked_customer === customer && (current.crm_contact ?? null) === (crmContact ?? null)) {
      return {
        status: "linked",
        customer,
        identity_key: identityKey,
        crm_contact: crmContact ?? null,
        identity_document: identityName,
        channel_profile: profile.channel_profile,
        provider: profile.provider,
        idempotent_replay: true,
      };
    }
    if (!reason) throw errors.validation("Reassigning or reactivating a marketplace customer identity requires change_reason");
  }

  const { store, kernel, organizationSecurity } = identityKernelBundle(db);
  const document: JsonObject = {
    company: profile.company,
    provider: profile.provider,
    scope_key: scopeKey,
    identity_key: identityKey,
    scope_label: profile.channel_profile,
    linked_customer: customer,
    ...(crmContact ? { crm_contact: crmContact } : {}),
    identity_status: "Active",
    source: `marketplace:${profile.channel_profile}`,
    ...(existing && reason ? { change_reason: reason } : {}),
  };
  const command = await buildCommand({
    tenantId,
    actor,
    doctype: "CRM Customer External Identity",
    name: identityName,
    action: existing ? "save" : "create",
    expectedVersion: existing ? await currentVersion(store, tenantId, identityName) : null,
    document,
  });
  try {
    await organizationSecurity.assertMutation(tenantId, actor, command);
    await kernel.execute(command);
  } catch (error) {
    if (!existing && asCloudForgeError(error).code === "DOCUMENT_ALREADY_EXISTS") {
      const raced = await readIdentityDocument(db, tenantId, identityKey);
      if (raced?.identity_status === "Active" && raced.linked_customer === customer && (raced.crm_contact ?? null) === (crmContact ?? null)) {
        return {
          status: "linked",
          customer,
          identity_key: identityKey,
          crm_contact: crmContact ?? null,
          identity_document: identityName,
          channel_profile: profile.channel_profile,
          provider: profile.provider,
          idempotent_replay: true,
        };
      }
    }
    throw error;
  }

  return {
    status: "linked",
    customer,
    identity_key: identityKey,
    crm_contact: crmContact ?? null,
    identity_document: identityName,
    channel_profile: profile.channel_profile,
    provider: profile.provider,
    idempotent_replay: false,
  };
}

export async function revokeMarketplaceOrderCustomerIdentity(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  input: { order_id: string; change_reason: string },
): Promise<MarketplaceOrderIdentityLinkResult> {
  const reason = requiredText(input.change_reason, "change_reason", 500);
  const context = await identityContextForOrder(db, tenantId, input.order_id);
  const existing = await readDocument(db, tenantId, "CRM Customer External Identity", context.identity_name);
  if (!existing) throw errors.notFound("Marketplace customer identity is not linked");
  const current = parseIdentity(existing);
  if (current.identity_status === "Revoked") {
    return {
      status: "unmapped",
      customer: current.linked_customer,
      identity_key: current.identity_key,
      crm_contact: current.crm_contact ?? null,
      identity_document: context.identity_name,
      channel_profile: context.profile.channel_profile,
      provider: context.profile.provider,
      idempotent_replay: true,
    };
  }

  const { store, kernel, organizationSecurity } = identityKernelBundle(db);
  const command = await buildCommand({
    tenantId,
    actor,
    doctype: "CRM Customer External Identity",
    name: context.identity_name,
    action: "save",
    expectedVersion: await currentVersion(store, tenantId, context.identity_name),
    document: {
      ...current,
      identity_status: "Revoked",
      change_reason: reason,
    },
  });
  await organizationSecurity.assertMutation(tenantId, actor, command);
  await kernel.execute(command);
  return {
    status: "unmapped",
    customer: current.linked_customer,
    identity_key: current.identity_key,
    crm_contact: current.crm_contact ?? null,
    identity_document: context.identity_name,
    channel_profile: context.profile.channel_profile,
    provider: context.profile.provider,
    idempotent_replay: false,
  };
}

async function identityContextForOrder(db: D1Database, tenantId: string, orderIdInput: string): Promise<{
  identity_name: string;
  profile: MarketplaceProfileContext;
}> {
  const orderId = requiredText(orderIdInput, "order_id", 240);
  const operational = await db.prepare(`
    SELECT sales_order_name FROM social_orders
    WHERE tenant_id=?1 AND order_id=?2 AND cart_id LIKE 'marketplace:%'
    LIMIT 1
  `).bind(tenantId, orderId).first<{ sales_order_name: string | null }>();
  if (!operational?.sales_order_name) throw errors.notFound(`Marketplace order ${orderId} has no canonical Sales Order`);
  const salesOrder = await readDocument(db, tenantId, "Sales Order", operational.sales_order_name);
  if (!salesOrder) throw errors.notFound(`Sales Order ${operational.sales_order_name} not found`);
  const payload = parsePayload(salesOrder.payload_json, "Sales Order");
  const actorLineage = requiredText(payload.social_external_actor_id, "Marketplace buyer identity", 320);
  if (isGuestLineage(actorLineage)) throw errors.validation("Anonymous marketplace order has no customer identity mapping");
  const channelId = requiredText(payload.social_page_id, "Marketplace channel id", 240);
  const profile = await resolveProfileFromChannelId(db, tenantId, channelId);
  const key = await identityKeyFromActorLineage(actorLineage, profile);
  return { identity_name: crmCustomerExternalIdentityDocumentName(key), profile };
}

async function identityKeyFromActorLineage(
  actorLineage: string,
  profile: MarketplaceProfileContext,
): Promise<string> {
  const opaque = marketplaceCustomerIdentityKeyFromLineage(actorLineage);
  if (opaque) return opaque;
  // Backward compatibility for marketplace Sales Orders created before opaque lineage.
  return crmCustomerExternalIdentityKey(profile.provider, profile.shop_id, actorLineage);
}

function isGuestLineage(value: string): boolean {
  return /^marketplace:(shopee|lazada|tiktok_shop):guest$/.test(value);
}

async function readExistingMarketplaceSalesOrder(
  db: D1Database,
  tenantId: string,
  resolved: ResolvedMarketplaceOrder,
): Promise<JsonObject | null> {
  const sourceKey = await marketplaceOrderSourceKey(resolved.order.provider, resolved.order.shop_id, resolved.order.external_order_id);
  const cartId = `marketplace:${sourceKey}`;
  const row = await db.prepare(`
    SELECT payload_json FROM documents
    WHERE tenant_id=?1 AND doctype='Sales Order'
      AND json_extract(payload_json,'$.social_cart_id')=?2
      AND docstatus IN (0,1,2)
    LIMIT 1
  `).bind(tenantId, cartId).first<{ payload_json: string }>();
  return row ? parsePayload(row.payload_json, "Sales Order") : null;
}

async function readIdentityDocument(
  db: D1Database,
  tenantId: string,
  identityKey: string,
): Promise<CrmCustomerExternalIdentityData | null> {
  const row = await readDocument(db, tenantId, "CRM Customer External Identity", crmCustomerExternalIdentityDocumentName(identityKey));
  if (!row || row.docstatus === 2) return null;
  const identity = parseIdentity(row);
  if (identity.identity_key !== identityKey) throw errors.reference("CRM customer external identity fingerprint mismatch");
  return identity;
}

function parseIdentity(row: DocumentRow): CrmCustomerExternalIdentityData {
  const payload = parsePayload(row.payload_json, "CRM Customer External Identity") as CrmCustomerExternalIdentityData;
  if (typeof payload.identity_key !== "string" || !/^[a-f0-9]{64}$/.test(payload.identity_key)) throw errors.reference("CRM external identity key is invalid");
  if (typeof payload.scope_key !== "string" || !/^[a-f0-9]{64}$/.test(payload.scope_key)) throw errors.reference("CRM external identity scope is invalid");
  if (typeof payload.linked_customer !== "string" || !payload.linked_customer) throw errors.reference("CRM external identity Customer is invalid");
  if (payload.identity_status !== "Active" && payload.identity_status !== "Revoked") throw errors.reference("CRM external identity status is invalid");
  return payload;
}

async function assertMappingContext(resolved: ResolvedMarketplaceOrder, mapping: CrmCustomerExternalIdentityData): Promise<void> {
  if (mapping.provider !== resolved.order.provider || mapping.company !== resolved.order.company) {
    throw errors.reference("CRM external identity does not belong to this marketplace provider/company");
  }
  const expectedScope = await crmCustomerExternalScopeKey(resolved.order.provider, resolved.order.shop_id);
  if (mapping.scope_key !== expectedScope) throw errors.reference("CRM external identity does not belong to this marketplace shop scope");
}

function withCustomer(resolved: ResolvedMarketplaceOrder, customer: string): ResolvedMarketplaceOrder {
  return {
    ...resolved,
    order: {
      ...resolved.order,
      customer,
    },
  };
}

type MarketplaceProfileContext = {
  channel_profile: string;
  provider: MarketplaceProvider;
  shop_id: string;
  company: string;
};

async function resolveProfileFromChannelId(
  db: D1Database,
  tenantId: string,
  channelId: string,
): Promise<MarketplaceProfileContext> {
  const rows = await db.prepare(`
    SELECT name,docstatus,payload_json FROM documents
    WHERE tenant_id=?1 AND doctype='Commerce Channel Profile' AND docstatus!=2
  `).bind(tenantId).all<DocumentRow>();
  for (const row of rows.results ?? []) {
    const payload = parsePayload(row.payload_json, "Commerce Channel Profile");
    if (truthy(payload.disabled)) continue;
    const provider = marketplaceProvider(payload.provider);
    const connectionId = requiredText(payload.connection_id, "connection_id", 160);
    const shopId = requiredText(payload.external_shop_id, "external_shop_id", 240);
    const candidate = await marketplaceChannelId(provider, connectionId, shopId);
    if (candidate !== channelId) continue;
    return {
      channel_profile: row.name,
      provider,
      shop_id: shopId,
      company: requiredText(payload.company, "company", 160),
    };
  }
  throw errors.reference("No active Commerce Channel Profile matches canonical marketplace channel lineage");
}

function identityKernelBundle(db: D1Database): {
  store: D1RolloutPurchaseAllocationDomainStore;
  kernel: DocumentKernel;
  organizationSecurity: D1OrganizationSecurityGuard;
} {
  const metadata = new D1MetadataStore(db);
  const access = new D1DocumentAccessStore(db);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  ).setFallback(new GenericMetadataController(metadata));
  const store = new D1RolloutPurchaseAllocationDomainStore(db);
  return {
    store,
    kernel: new DocumentKernel(registry, store, permissions),
    organizationSecurity: new D1OrganizationSecurityGuard(db, metadata),
  };
}

async function currentVersion(
  store: D1RolloutPurchaseAllocationDomainStore,
  tenantId: string,
  name: string,
): Promise<number> {
  const document = await store.getDocument<JsonObject>(tenantId, "CRM Customer External Identity", name);
  if (!document) throw errors.notFound(`CRM Customer External Identity ${name} not found`);
  return document.version;
}

async function readDocument(
  db: D1Database,
  tenantId: string,
  doctype: string,
  name: string,
): Promise<DocumentRow | null> {
  return db.prepare(`
    SELECT name,docstatus,payload_json FROM documents
    WHERE tenant_id=?1 AND doctype=?2 AND name=?3 LIMIT 1
  `).bind(tenantId, doctype, name).first<DocumentRow>();
}

function parsePayload(payload: string, label: string): JsonObject {
  try {
    const value = JSON.parse(payload) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value as JsonObject;
  } catch {
    throw errors.reference(`${label} payload is invalid`);
  }
}

function requiredPayloadText(payload: JsonObject, field: string, max: number, label: string): string {
  return requiredText(payload[field], label, max);
}

function marketplaceProvider(value: unknown): MarketplaceProvider {
  if (value === "shopee" || value === "lazada" || value === "tiktok_shop") return value;
  throw errors.reference("Commerce Channel Profile provider is invalid for marketplace identity");
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation("Marketplace identity text field must be a string");
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation("Marketplace identity text field is invalid");
  return normalized;
}

function requiredText(value: unknown, field: string, max: number): string {
  const normalized = optionalText(value, max);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}
