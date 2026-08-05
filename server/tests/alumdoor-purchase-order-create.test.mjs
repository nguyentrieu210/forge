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

function company(path, request) {
  if (request.method === "GET" && path === "/api/resource/Company/ALUMDOOR") {
    return response({ name: "ALUMDOOR", default_currency: "VND" });
  }
  return null;
}

test("inline Mua hàng derives aluminium barem and creates one canonical Purchase Order draft", async () => {
  let created;
  const env = {
    PLATFORM: {
      async fetch(request) {
        const url = new URL(request.url);
        const path = decodeURIComponent(url.pathname);
        const companyResponse = company(path, request);
        if (companyResponse) return companyResponse;
        if (request.method === "GET" && path === "/api/resource/Item/A282") {
          return response({
            item_code: "A282",
            item_name: "Nan A282",
            inventory_mode: "Nhôm cây/lá",
            measurement_profile: "Nhôm cây",
            material_specification: "SPEC-A282",
            stock_uom: "Cây",
            default_purchase_uom: "Kg",
            disabled: 0,
            is_purchase_item: 1,
            allowed_colors: [{ color: "Trắng" }, { color: "Đen" }],
          });
        }
        if (request.method === "GET" && path === "/api/resource/Material Specification/SPEC-A282") {
          return response({ theoretical_kg_per_m: 0.389 });
        }
        if (request.method === "POST" && path === "/api/resource/Purchase Order") {
          created = await request.json();
          return response({ name: "DMH-2026-0001", grand_total: created.items[0].amount });
        }
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(workerRequest({
    supplier: "TIEN-DAT",
    company: "ALUMDOOR",
    currency: "VND",
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
  assert.equal(created.apply_discount_on, "Net Total");
  assert.equal(created.additional_discount_percentage, 0);
  assert.equal(created.grand_total, undefined, "client/worker must not force authoritative grand_total");
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

test("inline Mua hàng resolves hidden company/currency and writes order discount plus canonical VAT tax row", async () => {
  let created;
  let accountFilters;
  const env = {
    PLATFORM: {
      async fetch(request) {
        const url = new URL(request.url);
        const path = decodeURIComponent(url.pathname);
        if (request.method === "GET" && path === "/api/resource/Company") {
          return response([{ name: "ALUMDOOR", default_currency: "VND" }]);
        }
        if (request.method === "GET" && path === "/api/resource/Item/PK-01") {
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
        if (request.method === "GET" && path === "/api/resource/Account") {
          accountFilters = JSON.parse(url.searchParams.get("filters"));
          return response([{ name: "VAT-MUA-ALUMDOOR" }]);
        }
        if (request.method === "POST" && path === "/api/resource/Purchase Order") {
          created = await request.json();
          return response({
            name: "DMH-2026-0002",
            discount_amount: 2000,
            total_taxes_and_charges: 1440,
            grand_total: 19440,
          });
        }
        return response({}, 404);
      },
    },
  };

  const result = await handlePurchaseOrderCreate(workerRequest({
    supplier: "NCC-01",
    transaction_date: "2026-08-05",
    additional_discount_percentage: 10,
    vat_percentage: 8,
    items: [{ item_code: "PK-01", qty: 2, rate: 10000 }],
  }), env);

  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.name, "DMH-2026-0002");
  assert.equal(payload.subtotal, 20000);
  assert.equal(payload.additional_discount_percentage, 10);
  assert.equal(payload.discount_amount, 2000);
  assert.equal(payload.vat_percentage, 8);
  assert.equal(payload.total_taxes_and_charges, 1440);
  assert.equal(payload.grand_total, 19440);

  assert.ok(created);
  assert.equal(created.company, "ALUMDOOR");
  assert.equal(created.currency, "VND");
  assert.equal(created.apply_discount_on, "Net Total");
  assert.equal(created.additional_discount_percentage, 10);
  assert.equal(created.grand_total, undefined);
  assert.deepEqual(created.taxes, [{
    row_id: "VAT",
    account: "VAT-MUA-ALUMDOOR",
    rate: 8,
    charge_type: "On Net Total",
    add_deduct_tax: "Add",
  }]);
  assert.ok(accountFilters.some((filter) => filter[1] === "account_type" && filter[3] === "Tax"));
  assert.ok(accountFilters.some((filter) => filter[1] === "root_type" && filter[3] === "Asset"));
});

test("inline Mua hàng rejects a standard item without commercial quantity before creating a document", async () => {
  let postCount = 0;
  const env = {
    PLATFORM: {
      async fetch(request) {
        const path = decodeURIComponent(new URL(request.url).pathname);
        const companyResponse = company(path, request);
        if (companyResponse) return companyResponse;
        if (request.method === "GET" && path === "/api/resource/Item/PK-01") {
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

test("inline Mua hàng rejects disabled/non-purchase items and colors outside Item metadata", async () => {
  const env = {
    PLATFORM: {
      async fetch(request) {
        const path = decodeURIComponent(new URL(request.url).pathname);
        const companyResponse = company(path, request);
        if (companyResponse) return companyResponse;
        if (request.method === "GET" && path === "/api/resource/Item/NO-BUY") {
          return response({ item_code: "NO-BUY", stock_uom: "Cái", disabled: 0, is_purchase_item: 0 });
        }
        if (request.method === "GET" && path === "/api/resource/Item/A282") {
          return response({
            item_code: "A282", inventory_mode: "Nhôm cây/lá", material_specification: "SPEC-A282",
            stock_uom: "Cây", default_purchase_uom: "Kg", disabled: 0, is_purchase_item: 1,
            allowed_colors: [{ color: "Trắng" }],
          });
        }
        return response({}, 404);
      },
    },
  };

  const nonPurchase = await handlePurchaseOrderCreate(workerRequest({
    supplier: "NCC-01", company: "ALUMDOOR", currency: "VND",
    items: [{ item_code: "NO-BUY", qty: 1, rate: 1 }],
  }), env);
  assert.equal(nonPurchase.status, 422);
  assert.match((await nonPurchase.json()).message, /không được đánh dấu là mặt hàng mua/);

  const badColor = await handlePurchaseOrderCreate(workerRequest({
    supplier: "NCC-01", company: "ALUMDOOR", currency: "VND",
    items: [{ item_code: "A282", color: "Đỏ", length_m: 8.5, qty_bar: 10, rate: 100 }],
  }), env);
  assert.equal(badColor.status, 422);
  assert.match((await badColor.json()).message, /không thuộc danh sách màu được phép/);
});
