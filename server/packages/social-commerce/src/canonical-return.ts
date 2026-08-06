import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore } from "../../document-kernel/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, MetadataPermissionService } from "../../frappe-model/src/index.js";

export interface CanonicalSalesStockReturnResult {
  sales_order_name: string;
  delivery_note_name: string;
  stock_return_name: string;
}

/**
 * Commerce never marks an order returned from provider status alone. A submitted
 * canonical Stock Return must exist and point at the Delivery Note that fulfilled the
 * same Sales Order; the Stock Return controller remains the quantity/stock authority.
 */
export async function resolveCanonicalSalesStockReturn(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  salesOrderName: string,
  deliveryNoteName: string,
  stockReturnName: string,
): Promise<CanonicalSalesStockReturnResult> {
  const metadata = new D1MetadataStore(db);
  const access = new D1DocumentAccessStore(db);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const store = new D1RolloutPurchaseAllocationDomainStore(db);
  const order = await store.getDocument<JsonObject>(tenantId, "Sales Order", salesOrderName);
  const delivery = await store.getDocument<JsonObject>(tenantId, "Delivery Note", deliveryNoteName);
  const returned = await store.getDocument<JsonObject>(tenantId, "Stock Return", stockReturnName);

  if (!order || order.docstatus !== 1) throw errors.reference(`Submitted Sales Order ${salesOrderName} is required`);
  if (!delivery || delivery.docstatus !== 1) throw errors.reference(`Submitted Delivery Note ${deliveryNoteName} is required`);
  if (!returned || returned.docstatus !== 1) throw errors.reference(`Submitted Stock Return ${stockReturnName} is required`);

  await permissions.assert({ actor, tenantId, doctype: "Sales Order", name: salesOrderName, owner: order.owner, data: order.data, action: "read" });
  await permissions.assert({ actor, tenantId, doctype: "Delivery Note", name: deliveryNoteName, owner: delivery.owner, data: delivery.data, action: "read" });
  await permissions.assert({ actor, tenantId, doctype: "Stock Return", name: stockReturnName, owner: returned.owner, data: returned.data, action: "read" });

  if (delivery.data.against_sales_order !== salesOrderName) {
    throw errors.reference(`Delivery Note ${deliveryNoteName} does not fulfill Sales Order ${salesOrderName}`);
  }
  if (returned.data.return_type !== "Sales" || returned.data.return_against !== deliveryNoteName) {
    throw errors.reference(`Stock Return ${stockReturnName} is not a sales return against Delivery Note ${deliveryNoteName}`);
  }
  if (returned.data.company !== order.data.company || returned.data.currency !== order.data.currency) {
    throw errors.reference(`Stock Return ${stockReturnName} commercial context does not match Sales Order ${salesOrderName}`);
  }
  if (returned.data.party !== order.data.customer) {
    throw errors.reference(`Stock Return ${stockReturnName} customer does not match Sales Order ${salesOrderName}`);
  }

  return {
    sales_order_name: salesOrderName,
    delivery_note_name: deliveryNoteName,
    stock_return_name: stockReturnName,
  };
}
