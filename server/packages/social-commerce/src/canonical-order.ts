import type { Actor, JsonObject, MutationCommand } from "../../contracts/src/index.js";
import { asCloudForgeError, errors } from "../../core/src/index.js";
import { buildCommand } from "../../frappe-api/src/index.js";
import { createO2CControllerRegistry } from "../../clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../clouderp-core/src/index.js";
import { registerStockControllers } from "../../clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../clouderp-erpnext/src/index.js";
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

export interface CanonicalSocialOrderInput {
  cart_id: string;
  page_id: string;
  external_actor_id: string;
  company: string;
  customer: string;
  currency: string;
  selling_price_list: string;
  transaction_date: string;
  items: Array<{ item_code: string; quantity: number }>;
  taxes: JsonObject[];
}

export interface CanonicalSocialOrderResult {
  sales_order_name: string;
  grand_total_minor: number;
  currency: string;
  status: string;
}

export interface CanonicalDeliveryShipmentResult {
  delivery_note_name: string;
  sales_order_name: string;
  grand_total_minor: number;
  currency: string;
}

type KernelBundle = {
  store: D1RolloutPurchaseAllocationDomainStore;
  kernel: DocumentKernel;
  organizationSecurity: D1OrganizationSecurityGuard;
};

export async function ensureCanonicalSocialSalesOrder(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  input: CanonicalSocialOrderInput,
): Promise<CanonicalSocialOrderResult> {
  const name = salesOrderName(input.cart_id);
  const { store, kernel, organizationSecurity } = kernelBundle(db);
  let existing = await store.getDocument<JsonObject>(tenantId, "Sales Order", name);
  if (existing?.docstatus === 1) {
    assertExistingLineage(existing.data, input);
    return commercialResult(name, existing.data, existing.status);
  }
  if (existing?.docstatus === 2) {
    throw errors.lifecycle(`Canonical Sales Order ${name} was cancelled and cannot be reused for the same social cart`);
  }

  const requestedDocument = orderDocument(input);
  if (!existing) {
    const create = await buildCommand({
      tenantId,
      actor,
      doctype: "Sales Order",
      name,
      action: "create",
      expectedVersion: null,
      document: requestedDocument,
    });
    try {
      await executeCanonical(kernel, organizationSecurity, tenantId, actor, create);
    } catch (error) {
      // Concurrent provider deliveries may race after the same initial read. D1
      // chooses one CREATE winner; only absorb the deterministic same-document
      // conflict, then re-read and verify lineage. Every other failure escapes.
      if (asCloudForgeError(error).code !== "DOCUMENT_ALREADY_EXISTS") throw error;
    }
    existing = await store.getDocument<JsonObject>(tenantId, "Sales Order", name);
  }

  if (existing) {
    if (existing.docstatus === 1) {
      assertExistingLineage(existing.data, input);
      return commercialResult(name, existing.data, existing.status);
    }
    if (existing.docstatus !== 0) throw errors.lifecycle(`Canonical Sales Order ${name} is not resumable`);
    assertExistingLineage(existing.data, input);
    assertDraftCartShape(existing.data, input);
  }

  const draft = await store.getDocument<JsonObject>(tenantId, "Sales Order", name);
  if (!draft || draft.docstatus !== 0) throw errors.lifecycle(`Canonical Sales Order ${name} draft is unavailable for submission`);
  const submit = await buildCommand({
    tenantId,
    actor,
    doctype: "Sales Order",
    name,
    action: "submit",
    expectedVersion: draft.version,
    document: draft.data,
  });
  await executeCanonical(kernel, organizationSecurity, tenantId, actor, submit);

  const submitted = await store.getDocument<JsonObject>(tenantId, "Sales Order", name);
  if (!submitted || submitted.docstatus !== 1) throw errors.ledger(`Canonical Sales Order ${name} was not submitted`);
  assertExistingLineage(submitted.data, input);
  return commercialResult(name, submitted.data, submitted.status);
}

export async function cancelCanonicalSocialSalesOrder(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  cartId: string,
  salesOrderName: string,
): Promise<{ sales_order_name: string; status: string; idempotent_replay: boolean }> {
  const expectedName = salesOrderNameForCart(cartId);
  if (salesOrderName !== expectedName) throw errors.idempotency();
  const { store, kernel, organizationSecurity } = kernelBundle(db);
  const order = await store.getDocument<JsonObject>(tenantId, "Sales Order", salesOrderName);
  if (!order) throw errors.notFound(`Canonical Sales Order ${salesOrderName} not found`);
  if (order.data.social_cart_id !== cartId) throw errors.idempotency();
  if (order.docstatus === 2) return { sales_order_name: salesOrderName, status: order.status, idempotent_replay: true };
  if (order.docstatus !== 1) throw errors.lifecycle(`Canonical Sales Order ${salesOrderName} must be submitted before cancellation`);

  const cancel = await buildCommand({
    tenantId,
    actor,
    doctype: "Sales Order",
    name: salesOrderName,
    action: "cancel",
    expectedVersion: order.version,
    document: {},
  });
  await executeCanonical(kernel, organizationSecurity, tenantId, actor, cancel);
  const cancelled = await store.getDocument<JsonObject>(tenantId, "Sales Order", salesOrderName);
  if (!cancelled || cancelled.docstatus !== 2) throw errors.ledger(`Canonical Sales Order ${salesOrderName} cancellation did not commit`);
  return { sales_order_name: salesOrderName, status: cancelled.status, idempotent_replay: false };
}

export async function resolveCanonicalDeliveryShipment(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  salesOrderName: string,
  deliveryNoteName: string,
): Promise<CanonicalDeliveryShipmentResult> {
  const metadata = new D1MetadataStore(db);
  const access = new D1DocumentAccessStore(db);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const store = new D1RolloutPurchaseAllocationDomainStore(db);
  const order = await store.getDocument<JsonObject>(tenantId, "Sales Order", salesOrderName);
  const note = await store.getDocument<JsonObject>(tenantId, "Delivery Note", deliveryNoteName);
  if (!order || order.docstatus !== 1) throw errors.reference(`Submitted Sales Order ${salesOrderName} is required`);
  if (!note || note.docstatus !== 1) throw errors.reference(`Submitted Delivery Note ${deliveryNoteName} is required`);
  await permissions.assert({ actor, tenantId, doctype: "Sales Order", name: salesOrderName, owner: order.owner, data: order.data, action: "read" });
  await permissions.assert({ actor, tenantId, doctype: "Delivery Note", name: deliveryNoteName, owner: note.owner, data: note.data, action: "read" });
  if (note.data.against_sales_order !== salesOrderName) throw errors.reference(`Delivery Note ${deliveryNoteName} does not fulfill Sales Order ${salesOrderName}`);
  for (const field of ["company", "customer", "currency"] as const) {
    if (note.data[field] !== order.data[field]) throw errors.reference(`Delivery Note ${deliveryNoteName} ${field} does not match Sales Order ${salesOrderName}`);
  }
  const total = note.data.grand_total_minor;
  const currency = note.data.currency;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0 || typeof currency !== "string" || !currency) {
    throw errors.ledger(`Delivery Note ${deliveryNoteName} has invalid commercial totals`);
  }
  return { delivery_note_name: deliveryNoteName, sales_order_name: salesOrderName, grand_total_minor: total, currency };
}

function kernelBundle(db: D1Database): KernelBundle {
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

async function executeCanonical(
  kernel: DocumentKernel,
  organizationSecurity: D1OrganizationSecurityGuard,
  tenantId: string,
  actor: Actor,
  command: MutationCommand<JsonObject>,
): Promise<void> {
  await organizationSecurity.assertMutation(tenantId, actor, command);
  await kernel.execute(command);
}

function orderDocument(input: CanonicalSocialOrderInput): JsonObject {
  return {
    customer: input.customer,
    company: input.company,
    currency: input.currency,
    transaction_date: input.transaction_date,
    selling_price_list: input.selling_price_list,
    social_cart_id: input.cart_id,
    social_page_id: input.page_id,
    social_external_actor_id: input.external_actor_id,
    items: input.items.map((item, index) => ({ row_id: `SOC-${index + 1}`, item_code: item.item_code, qty: String(item.quantity), rate: "0" })),
    taxes: input.taxes,
  };
}

function salesOrderName(inputCartId: string): string { return salesOrderNameForCart(inputCartId); }
function salesOrderNameForCart(cartId: string): string {
  const normalized = cartId.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 160);
  if (!normalized) throw errors.validation("cart_id cannot produce a canonical Sales Order name");
  return `SOC-${normalized}`;
}
function assertExistingLineage(data: JsonObject, input: CanonicalSocialOrderInput): void {
  if (data.social_cart_id !== input.cart_id || data.company !== input.company || data.customer !== input.customer || data.currency !== input.currency) throw errors.idempotency();
}
function assertDraftCartShape(data: JsonObject, input: CanonicalSocialOrderInput): void {
  if (data.selling_price_list !== input.selling_price_list || data.transaction_date !== input.transaction_date) throw errors.idempotency();
  const actual = Array.isArray(data.items) ? data.items : [];
  if (actual.length !== input.items.length) throw errors.idempotency();
  for (let index = 0; index < input.items.length; index += 1) {
    const row = actual[index]; const expected = input.items[index]!;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.idempotency();
    const object = row as JsonObject;
    const qty = Number(object.qty_micros ?? Number(object.qty ?? 0) * 1_000_000);
    if (object.item_code !== expected.item_code || qty !== expected.quantity * 1_000_000) throw errors.idempotency();
  }
}
function commercialResult(name: string, data: JsonObject, status: string): CanonicalSocialOrderResult {
  const grandTotal = data.grand_total_minor; const currency = data.currency;
  if (typeof grandTotal !== "number" || !Number.isSafeInteger(grandTotal) || grandTotal < 0 || typeof currency !== "string" || !currency) throw errors.ledger(`Canonical Sales Order ${name} has invalid commercial totals`);
  return { sales_order_name: name, grand_total_minor: grandTotal, currency, status };
}
