import assert from "node:assert/strict";
import test from "node:test";

import { handlePurchaseSupplierSettlement } from "../dist/apps-src/alumdoor-worker/src/purchase-supplier-settlement.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function platform(windowStatus = "Open") {
  const created = [];
  const submitted = [];
  return {
    created,
    submitted,
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = decodeURIComponent(url.pathname).replace(/^\/api/, "");
      if (path === "/resource/Purchase Order") return json({ data: [{ name: "PO-1" }] });
      if (path === "/method/metaforge.api.get_purchase_allocation_timeline") {
        return json({ message: {
          name: "PO-1",
          supplier_debt_reports: [{ rows: [{
            queue_key: "QUEUE-1",
            window_id: "WIN-1",
            window_sequence: 1,
            window_status: windowStatus,
            supplier: "Tiến Đạt",
          }] }],
        } });
      }
      if (path === "/resource/Purchase Settlement" && outbound.method === "POST") {
        const body = await outbound.json();
        created.push(body);
        return json({ data: { doctype: "Purchase Settlement", name: "PS-1", docstatus: 0, ...body } });
      }
      if (path === "/method/frappe.client.submit" && outbound.method === "POST") {
        const body = await outbound.json();
        const doc = JSON.parse(body.doc);
        submitted.push(doc);
        return json({ data: { ...doc, docstatus: 1 } });
      }
      throw new Error(`unexpected ${outbound.method} ${path}`);
    },
  };
}

function request(operation, reason = "Đối soát giao cuối") {
  return new Request("https://app.local/api/method/alumdoor.purchase.supplier_delivery_settlement", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://gateway.local/api",
    },
    body: JSON.stringify({ args: { queue_key: "QUEUE-1", operation, reason } }),
  });
}

test("workspace close resolves current open window and submits Purchase Settlement", async () => {
  const state = platform("Open");
  const response = await handlePurchaseSupplierSettlement(request("Close"), { PLATFORM: state });
  const body = await response.json();
  assert.equal(response.status, 200, body.message);
  assert.equal(body.supplier, "Tiến Đạt");
  assert.equal(body.window_id, "WIN-1");
  assert.equal(body.name, "PS-1");
  assert.deepEqual(state.created, [{ operation: "Close", queue_key: "QUEUE-1", window_id: "WIN-1", reason: "Đối soát giao cuối" }]);
  assert.equal(state.submitted.length, 1);
});

test("workspace reverse resolves settled window and reason is mandatory", async () => {
  const state = platform("Settled");
  const response = await handlePurchaseSupplierSettlement(request("Reverse", "Sai phiếu cân"), { PLATFORM: state });
  assert.equal(response.status, 200, await response.text());
  assert.equal(state.created[0].operation, "Reverse");

  const rejected = await handlePurchaseSupplierSettlement(request("Reverse", ""), { PLATFORM: state });
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json()).message, /Lý do/);
});
