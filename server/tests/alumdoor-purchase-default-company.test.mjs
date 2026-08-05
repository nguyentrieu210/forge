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

test("Mua hàng defaults hidden company to ALUMDOOR even when tenant has multiple companies", async () => {
  let companyListReads = 0;
  let created;
  const env = {
    PLATFORM: {
      async fetch(req) {
        const url = new URL(req.url);
        const path = decodeURIComponent(url.pathname);
        if (req.method === "GET" && path === "/api/resource/Company/ALUMDOOR") {
          return response({ name: "ALUMDOOR", default_currency: "VND" });
        }
        if (req.method === "GET" && path === "/api/resource/Company") {
          companyListReads += 1;
          return response([
            { name: "ALUMDOOR", default_currency: "VND" },
            { name: "CÔNG TY KHÁC", default_currency: "VND" },
          ]);
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
          return response({ name: "DMH-2026-DEFAULT-COMPANY", grand_total: created.items[0].amount });
        }
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(request({
    supplier: "NCC-01",
    items: [{ item_code: "PK-01", qty: 2, rate: 10000 }],
  }), env);

  assert.equal(result.status, 200);
  assert.equal(companyListReads, 0, "must not become ambiguous just because another Company exists");
  assert.equal(created.company, "ALUMDOOR");
  assert.equal(created.currency, "VND");
});
