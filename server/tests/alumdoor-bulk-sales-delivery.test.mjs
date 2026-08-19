import test from "node:test";
import assert from "node:assert/strict";

import { handleBulkSalesDelivery } from "../dist/apps-src/alumdoor-worker/src/bulk-sales-delivery.js";

function resourcePath(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/\/+$/, "");
  const resource = decoded.lastIndexOf("/resource/");
  const method = decoded.lastIndexOf("/method/");
  const index = Math.max(resource, method);
  return index >= 0 ? decoded.slice(index) : decoded;
}

function dataResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function messageResponse(message, status = 200) {
  return new Response(JSON.stringify({ message }), { status, headers: { "content-type": "application/json" } });
}

function salesOrder(name, company, date, qty, rate, rowId) {
  return {
    name, docstatus: 1, customer: "CUST-1", company, currency: "USD", transaction_date: date,
    delivery_date: "2026-08-20", install_address: "Công trình A", modified: `${date}T08:00:00.000Z`,
    items: [{ row_id: rowId, item_code: "FG-DOOR", item_name: "Cửa hoàn thiện", qty, stock_qty: qty,
      uom: "Bộ", stock_uom: "Bộ", rate, warehouse: "Stores" }],
  };
}

function createPlatform() {
  const orders = new Map([
    ["SO-1", salesOrder("SO-1", "Demo", "2026-08-01", 2, 100, "SO1-ROW")],
    ["SO-2", salesOrder("SO-2", "Demo", "2026-08-02", 3, 200, "SO2-ROW")],
    ["SO-OTHER", salesOrder("SO-OTHER", "Other Co", "2026-08-02", 1, 300, "SOO-ROW")],
    ["SO-FUTURE", salesOrder("SO-FUTURE", "Demo", "2026-08-10", 1, 400, "SOF-ROW")],
  ]);
  const submitted = new Map([["DN-OLD", {
    name: "DN-OLD", docstatus: 1, customer: "CUST-1",
    items: [{ sales_order: "SO-1", sales_order_row_id: "SO1-ROW", item_code: "FG-DOOR", qty: 1 }],
  }]]);
  const drafts = new Map();
  let creates = 0;
  let previews = 0;
  const platform = {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = resourcePath(url.pathname);
      if (path === "/resource/Sales Order") return dataResponse([...orders.keys()].map((name) => ({ name })));
      if (path.startsWith("/resource/Sales Order/")) return dataResponse(orders.get(path.slice("/resource/Sales Order/".length)) ?? {}, orders.has(path.slice("/resource/Sales Order/".length)) ? 200 : 404);
      if (path === "/resource/Delivery Note" && outbound.method === "POST") {
        const body = await outbound.json(); creates += 1;
        const doc = { ...body, name: `DN-BULK-${creates}`, docstatus: 0 };
        drafts.set(doc.name, doc);
        return dataResponse(doc);
      }
      if (path === "/resource/Delivery Note") {
        const filters = JSON.parse(url.searchParams.get("filters") ?? "[]");
        const deliveryKey = filters.find((row) => row?.[0] === "delivery_batch_key")?.[2];
        const docs = deliveryKey
          ? [...drafts.values()].filter((doc) => doc.delivery_batch_key === deliveryKey)
          : [...submitted.values()];
        return dataResponse(docs.map((doc) => ({ name: doc.name })));
      }
      if (path.startsWith("/resource/Delivery Note/")) {
        const name = path.slice("/resource/Delivery Note/".length);
        const doc = drafts.get(name) ?? submitted.get(name);
        return dataResponse(doc ?? {}, doc ? 200 : 404);
      }
      if (path === "/method/metaforge.api.preview_delivery_document") {
        previews += 1;
        const body = await outbound.json();
        return messageResponse({ kind: "delivery_note_fifo", rows: body.document.items.map((item, index) => ({
          sales_order: item.sales_order, sales_order_row: item.sales_order_row_id, item_code: item.item_code,
          warehouse: item.warehouse, inventory_layer: `FIFO-${index + 1}`, qty: item.qty, unit_cost: "10.00", cost: "10.00",
        })) });
      }
      throw new Error(`unexpected ${outbound.method} ${path} ${url.search}`);
    },
  };
  return { platform, drafts, get creates() { return creates; }, get previews() { return previews; } };
}

function request(salesOrders = [], overrides = {}) {
  return new Request("https://app.local/api/method/alumdoor.sales.bulk_delivery", {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-cloudforge-tenant": "demo", "x-cloudforge-callback": "https://gateway.local/internal/callback",
      authorization: "Bearer qa", "x-cloudforge-app": "alumdoor", "x-cloudforge-identity": "qa", "x-cloudforge-identity-signature": "signed",
    },
    body: JSON.stringify({ args: { customer: "CUST-1", warehouse: "Stores", posting_at: "2026-08-03T10:00:00.000Z", sales_orders: salesOrders, ...overrides } }),
  });
}

test("source picker shows outstanding quantities and disables incompatible orders after selection", async () => {
  const state = createPlatform();
  const initial = await handleBulkSalesDelivery(request(), state.platform, false);
  const initialBody = await initial.json();
  assert.equal(initial.status, 200, initialBody.message);
  assert.equal(initialBody.source_documents.length, 4);
  assert.equal(initialBody.source_documents.find((row) => row.sales_order === "SO-FUTURE").disabled_reason, "Ngày đơn sau ngày giao");
  assert.equal(initialBody.source_lines.find((row) => row.sales_order === "SO-1").outstanding_qty, 1);
  assert.equal(initialBody.items.length, 0);

  const selected = await handleBulkSalesDelivery(request(["SO-1"]), state.platform, false);
  const body = await selected.json();
  assert.equal(selected.status, 200, body.message);
  assert.equal(body.source_documents.find((row) => row.sales_order === "SO-OTHER").disabled_reason, "Khác công ty với đơn đã chọn");
  assert.equal(body.items.length, 1);
  assert.equal(body.inventory_preview.rows[0].sales_order, "SO-1");
});

test("bulk delivery creates one idempotent draft for many Sales Orders", async () => {
  const state = createPlatform();
  const first = await handleBulkSalesDelivery(request(["SO-1", "SO-2"]), state.platform, true);
  const body = await first.json();
  assert.equal(first.status, 200, body.message);
  assert.equal(body.delivery_note, "DN-BULK-1");
  assert.equal(body.draft, true);
  assert.equal(body.replayed, false);
  assert.equal(state.creates, 1);
  assert.equal(state.previews, 1);
  const stored = state.drafts.get("DN-BULK-1");
  assert.deepEqual(stored.source_sales_orders, ["SO-1", "SO-2"]);
  assert.deepEqual(stored.items.map((row) => [row.sales_order, row.sales_order_row_id, row.qty, row.rate]), [
    ["SO-1", "SO1-ROW", 1, 100],
    ["SO-2", "SO2-ROW", 3, 200],
  ]);

  const retry = await handleBulkSalesDelivery(request(["SO-1", "SO-2"]), state.platform, true);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200, retryBody.message);
  assert.equal(retryBody.delivery_note, "DN-BULK-1");
  assert.equal(retryBody.replayed, true);
  assert.equal(state.creates, 1);
});

test("bulk delivery rejects mixed companies and a source dated after the delivery", async () => {
  const state = createPlatform();
  const mixed = await handleBulkSalesDelivery(request(["SO-1", "SO-OTHER"]), state.platform, false);
  assert.equal(mixed.status, 422);
  assert.match((await mixed.json()).message, /nhiều Công ty/);
  const future = await handleBulkSalesDelivery(request(["SO-FUTURE"]), state.platform, false);
  assert.equal(future.status, 422);
  assert.match((await future.json()).message, /ngày sau ngày Phiếu giao/);
  assert.equal(state.creates, 0);
});
