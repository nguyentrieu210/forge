import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiPath = new URL("../packages/social-commerce/src/api.ts", import.meta.url);
const bridgePath = new URL("../packages/social-commerce/src/canonical-order.ts", import.meta.url);

test("social convert keeps the existing empty-body dashboard compatible through page profile defaults", async () => {
  const api = await readFile(apiPath, "utf8");
  assert.match(api, /const profile = await socialCommerceProfile\(db, tenantId, cart\.page_id\)/);
  assert.match(api, /optionalText\(body\.company[^\n]+\?\? profile\.company/);
  assert.match(api, /optionalText\(body\.customer[^\n]+\?\? profile\.default_customer/);
  assert.match(api, /optionalText\(body\.currency[^\n]+\?\? profile\.currency/);
  assert.match(api, /optionalText\(body\.selling_price_list[^\n]+\?\? profile\.selling_price_list/);
  assert.match(api, /doctype='Social Commerce Profile'/);
  assert.match(api, /Social Commerce Profile is required for page/);
});

test("canonical social Sales Order only absorbs deterministic create/submit concurrency losers", async () => {
  const bridge = await readFile(bridgePath, "utf8");
  assert.match(bridge, /asCloudForgeError\(error\)\.code !== "DOCUMENT_ALREADY_EXISTS"/);
  assert.match(bridge, /asCloudForgeError\(error\)\.code !== "VERSION_CONFLICT"/);
  assert.match(bridge, /if \(!concurrent \|\| concurrent\.docstatus !== 1\) throw error/);
  assert.match(bridge, /assertExistingLineage\(concurrent\.data, input\)/);
  assert.match(bridge, /assertDraftCartShape\(existing\.data, input\)/);
});

test("social cancel cannot downgrade local state before canonical cancellation succeeds", async () => {
  const api = await readFile(apiPath, "utf8");
  const canonicalCall = api.indexOf("cancelCanonicalSocialSalesOrder(db, tenantId, actor, order.cart_id, order.sales_order_name)");
  const localCancel = api.indexOf("UPDATE social_orders SET status='cancelled'");
  assert.ok(canonicalCall >= 0, "canonical cancellation call missing");
  assert.ok(localCancel > canonicalCall, "local projection must update only after canonical cancellation");
  assert.match(api, /cannot be cancelled after COD reconciliation/);
});
