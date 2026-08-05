import assert from "node:assert/strict";
import test from "node:test";

import { handlePurchaseOrderCreate } from "../dist/apps-src/alumdoor-worker/src/purchase-order-create.js";

function response(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function request(args) {
  return new Request("https://alumdoor-worker/api/method/alumdoor.purchase.create_order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://platform.test/api",
      "x-cloudforge-app": "alumdoor",
      "x-cloudforge-identity": "identity",
      "x-cloudforge-identity-signature": "signature",
      authorization: "Bearer test",
    },
    body: JSON.stringify({ args }),
  });
}

test("Mua hàng fails closed when Company is missing", async () => {
  let companyReads = 0;
  const env = {
    PLATFORM: {
      async fetch(req) {
        const path = decodeURIComponent(new URL(req.url).pathname);
        if (path.startsWith("/api/resource/Company")) companyReads += 1;
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(request({
    supplier: "NCC-01",
    items: [{ item_code: "PK-01", qty: 2, rate: 10000 }],
  }), env);

  assert.equal(result.status, 422);
  assert.equal(companyReads, 0, "worker must not guess or enumerate Company when context is missing");
  const body = await result.json();
  assert.match(String(body.message), /chọn Công ty/i);
});

test("Mua hàng uses the explicit Business Context Company and derives its currency", async () => {
  let created;
  const env = {
    PLATFORM: {
      async fetch(req) {
        const url = new URL(req.url);
        const path = decodeURIComponent(url.pathname);
        if (req.method === "GET" && path === "/api/resource/Company/CÔNG TY B") {
          return response({ name: "CÔNG TY B", default_currency: "USD" });
        }
        if (req.method === "GET" && path === "/api/resource/Item/PK-01") {
          return response({
            item_code: "PK-01",
            item_name: "Phụ kiện",
            inventory_mode: "Hàng thường",
            stock_uom: "Cái",
            default_purchase_uom: "Cái",
            disabled: 0,
            is_purchase_item: 1,
          });
        }
        if (req.method === "POST" && path === "/api/resource/Purchase Order") {
          created = await req.json();
          return response({ name: "DMH-2026-CONTEXT", grand_total: created.items[0].amount });
        }
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(request({
    company: "CÔNG TY B",
    supplier: "NCC-01",
    items: [{ item_code: "PK-01", qty: 2, rate: 10000 }],
  }), env);

  assert.equal(result.status, 200);
  assert.equal(created.company, "CÔNG TY B");
  assert.equal(created.currency, "USD");
});
