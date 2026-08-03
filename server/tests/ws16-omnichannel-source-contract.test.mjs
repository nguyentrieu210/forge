import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiPath = new URL("../packages/social-commerce/src/api.ts", import.meta.url);
const bridgePath = new URL("../packages/social-commerce/src/canonical-order.ts", import.meta.url);
const logisticsPath = new URL("../packages/clouderp-erpnext/src/logistics-controllers.ts", import.meta.url);

async function sources() {
  const [api, bridge, logistics] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(bridgePath, "utf8"),
    readFile(logisticsPath, "utf8"),
  ]);
  return { api, bridge, logistics };
}

test("social cart conversion uses canonical Sales Order kernel instead of local order as source of truth", async () => {
  const { api, bridge } = await sources();
  assert.match(api, /ensureCanonicalSocialSalesOrder\(db, tenantId, actor, canonicalInput\)/);
  assert.match(api, /sales_order_name=\?3,status='confirmed'/);
  assert.match(api, /stock_reservation: "pending_ws04_generic_reservation"/);
  assert.doesNotMatch(api, /randomId\("social_order"\)/);

  assert.match(bridge, /new DocumentKernel\(registry, store, permissions\)/);
  assert.match(bridge, /new D1OrganizationSecurityGuard\(db, metadata\)/);
  assert.match(bridge, /doctype: "Sales Order"/);
  assert.match(bridge, /selling_price_list: input\.selling_price_list/);
  assert.match(bridge, /rate: "0"/);
  assert.match(bridge, /social_cart_id: input\.cart_id/);
});

test("social conversion resumes a committed draft instead of issuing a second create", async () => {
  const { bridge } = await sources();
  assert.match(bridge, /if \(!existing\) \{[\s\S]*action: "create"/);
  assert.match(bridge, /assertDraftCartShape\(existing\.data, input\)/);
  assert.match(bridge, /const draft = await store\.getDocument/);
  assert.match(bridge, /action: "submit"/);
  assert.match(bridge, /expectedVersion: draft\.version/);
  assert.match(bridge, /document: draft\.data/);
});

test("social order cancellation delegates downstream guards to canonical Sales Order", async () => {
  const { api, bridge } = await sources();
  assert.match(api, /const cancelOrder = url\.pathname\.match/);
  assert.match(api, /COD reconciliation; reverse the canonical finance settlement first/);
  assert.match(api, /cancelCanonicalSocialSalesOrder\(db, tenantId, actor, order\.cart_id, order\.sales_order_name\)/);
  assert.match(api, /UPDATE social_shipments SET status='cancelled'/);

  assert.match(bridge, /action: "cancel"/);
  assert.match(bridge, /expectedVersion: order\.version/);
  assert.match(bridge, /order\.data\.social_cart_id !== cartId/);
});

test("social shipment is a projection of canonical Delivery Note and COD cannot silently reconcile a mismatch", async () => {
  const { api, bridge } = await sources();
  assert.match(api, /const shipmentId = canonicalDelivery\.delivery_note_name/);
  assert.match(api, /cod_expected_minor[^\n]*canonicalDelivery\.grand_total_minor/);
  assert.match(api, /resolveCanonicalDeliveryShipment\(db, tenantId, actor, shipmentRow\.sales_order_name, shipmentId\)/);
  assert.match(api, /collected !== shipmentRow\.cod_expected_minor/);
  assert.match(api, /accounting_posted: false/);

  assert.match(bridge, /Submitted Delivery Note/);
  assert.match(bridge, /note\.data\.against_sales_order !== salesOrderName/);
  assert.match(bridge, /\["company", "customer", "currency"\]/);
});

test("logistics POD keeps trip immutable and correction goes through a separate submittable aggregate", async () => {
  const { logistics } = await sources();
  assert.match(logistics, /visited: false/);
  assert.match(logistics, /readonly doctype = "Proof of Delivery"/);
  assert.match(logistics, /POD-\$\{input\.delivery_trip\}-\$\{input\.stop_row_id\}/);
  assert.match(logistics, /Delivered POD requires recipient name and proof reference/);
  assert.match(logistics, /Partial POD requires recipient, proof reference and exception reason/);
  assert.match(logistics, /Failed POD requires a failure reason/);
});
