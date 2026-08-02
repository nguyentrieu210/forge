import assert from "node:assert/strict";
import test from "node:test";

import { handlePurchaseSupplierSettlement } from "../dist/apps-src/alumdoor-worker/src/purchase-supplier-settlement.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function platform(windowStatus = "Open") {
  const created = [];
  const submitted = [];
  const forwarded = [];
  return {
    created,
    submitted,
    forwarded,
    async fetch(outbound) {
      forwarded.push({
        authorization: outbound.headers.get("authorization"),
        app: outbound.headers.get("x-cloudforge-app"),
        identity: outbound.headers.get("x-cloudforge-identity"),
        signature: outbound.headers.get("x-cloudforge-identity-signature"),
      });
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
      "authorization": "Bearer caller-token",
      "x-cloudforge-app": "alumdoor",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://gateway.local/api",
      "x-cloudforge-identity": "user-17",
      "x-cloudforge-identity-signature": "signed-user-17",
    },
    body: JSON.stringify({ args: { queue_key: "QUEUE-1", operation, reason } }),
  });
}

test("đối soát resolves current open window and submits canonical Purchase Settlement", async () => {
  const state = platform("Open");
  const response = await handlePurchaseSupplierSettlement(request("Đối soát"), { PLATFORM: state });
  const body = await response.json();
  assert.equal(response.status, 200, body.message);
  assert.equal(body.operation, "Close");
  assert.equal(body.supplier, "Tiến Đạt");
  assert.equal(body.window_id, "WIN-1");
  assert.equal(body.name, "PS-1");
  assert.deepEqual(state.created, [{ operation: "Close", queue_key: "QUEUE-1", window_id: "WIN-1", reason: "Đối soát giao cuối" }]);
  assert.equal(state.submitted.length, 1);
  assert.ok(state.forwarded.length >= 4);
  for (const headers of state.forwarded) {
    assert.equal(headers.authorization, "Bearer caller-token");
    assert.equal(headers.app, "alumdoor");
    assert.equal(headers.identity, "user-17");
    assert.equal(headers.signature, "signed-user-17");
  }
});

test("đảo đối soát resolves settled window and reason is mandatory", async () => {
  const state = platform("Settled");
  const response = await handlePurchaseSupplierSettlement(request("Đảo đối soát", "Sai phiếu cân"), { PLATFORM: state });
  assert.equal(response.status, 200, await response.text());
  assert.equal(state.created[0].operation, "Reverse");

  const rejected = await handlePurchaseSupplierSettlement(request("Đảo đối soát", ""), { PLATFORM: state });
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json()).message, /Lý do/);
});

test("đối soát refuses a settled window instead of creating another settlement", async () => {
  const state = platform("Settled");
  const response = await handlePurchaseSupplierSettlement(request("Đối soát"), { PLATFORM: state });
  assert.equal(response.status, 422);
  assert.match((await response.json()).message, /không có kỳ giao hàng đang mở/i);
  assert.equal(state.created.length, 0);
});
