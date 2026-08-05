import assert from "node:assert/strict";
import test from "node:test";

import { handlePurchaseOrderCreate } from "../dist/apps-src/alumdoor-worker/src/purchase-order-create.js";

function response(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function workerRequest(args) {
  return new Request("https://alumdoor-worker/api/method/alumdoor.purchase.create_order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://platform.test/api",
      "x-cloudforge-app": "alumdoor-v2",
      "x-cloudforge-identity": "identity",
      "x-cloudforge-identity-signature": "signature",
      authorization: "Bearer test",
    },
    body: JSON.stringify({ args }),
  });
}

test("inline Mua hàng derives aluminium barem and creates one canonical Purchase Order draft", async () => {
  let created;
  const env = {
    PLATFORM: {
      async fetch(request) {
        const url = new URL(request.url);
        const path = decodeURIComponent(url.pathname);
        if (request.method === "GET" && path === "/api/resource/Item/A282") {
          return response({
            item_code: "A282",
            item_name: "Nan A282",
            inventory_mode: "Nhôm cây/lá",
            measurement_profile: "Nhôm cây",
            material_specification: "SPEC-A282",
            stock_uom: "Cây",
            default_purchase_uom: "Kg",
          });
        }
        if (request.method === "GET" && path === "/api/resource/Material Specification/SPEC-A282") {
          return response({ theoretical_kg_per_m: 0.389 });
        }
        if (request.method === "POST" && path === "/api/resource/Purchase Order") {
          created = await request.json();
          return response({ name: "DMH-2026-0001", grand_total: created.grand_total });
        }
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(workerRequest({
    supplier: "TIEN-DAT",
    company: "ALUMDOOR",
    currency: "VND",
    priority: "Thường",
    transaction_date: "2026-08-05",
    schedule_date: "2026-08-15",
    items: [{
      item_code: "A282",
      color: "Trắng",
      length_m: 8.5,
      qty_bar: 10,
      rate: 100,
      is_stamped: "Không",
    }],
  }), env);

  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.doctype, "Purchase Order");
  assert.equal(payload.name, "DMH-2026-0001");
  assert.equal(payload.draft, true);
  assert.equal(payload.line_count, 1);

  assert.ok(created);
  assert.equal(created.supplier, "TIEN-DAT");
  assert.equal(created.transaction_date, "2026-08-05");
  assert.equal(created.items.length, 1);
  const line = created.items[0];
  const expectedKg = 8.5 * 0.389 * 10;
  assert.equal(line.uom, "Kg");
  assert.equal(line.qty, expectedKg);
  assert.equal(line.theoretical_kg, expectedKg);
  assert.equal(line.theoretical_kg_per_m, 0.389);
  assert.equal(line.total_length_m, 85);
  assert.equal(line.amount, expectedKg * 100);
  assert.equal(line.conversion_factor, 10 / expectedKg);
  assert.equal(line.stock_qty, 10);
});

test("inline Mua hàng rejects a standard item without commercial quantity before creating a document", async () => {
  let postCount = 0;
  const env = {
    PLATFORM: {
      async fetch(request) {
        const path = decodeURIComponent(new URL(request.url).pathname);
        if (request.method === "GET" && path === "/api/resource/Item/PK-01") {
          return response({
            item_code: "PK-01",
            item_name: "Phụ kiện",
            inventory_mode: "Hàng thường",
            stock_uom: "Cái",
            default_purchase_uom: "Cái",
          });
        }
        if (request.method === "POST") postCount += 1;
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(workerRequest({
    supplier: "NCC-01",
    company: "ALUMDOOR",
    currency: "VND",
    items: [{ item_code: "PK-01", rate: 5000 }],
  }), env);

  assert.equal(result.status, 422);
  assert.match((await result.json()).message, /Số lượng.*lớn hơn 0/);
  assert.equal(postCount, 0);
});
