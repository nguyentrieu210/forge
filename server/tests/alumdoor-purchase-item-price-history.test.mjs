import assert from "node:assert/strict";
import test from "node:test";

import { buildPurchaseItemPriceHistory } from "../dist/apps-src/alumdoor-worker/src/purchase-item-price-history.js";

function response(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fixtureCall() {
  return async (path) => {
    const url = new URL(`https://platform.test/api/${path}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/api/resource/Purchase Order Item") {
      assert.deepEqual(JSON.parse(url.searchParams.get("filters")), [["item_code", "=", "ITEM-01"]]);
      return response([
        { name: "POI-1", parent: "PO-001", item_code: "ITEM-01", rate: 100, modified: "2026-08-01 09:00:00" },
        { name: "POI-2", parent: "PO-DRAFT", item_code: "ITEM-01", rate: 999, modified: "2026-08-04 09:00:00" },
        { name: "POI-3", parent: "PO-OTHER", item_code: "ITEM-01", rate: 300, modified: "2026-08-03 09:00:00" },
      ]);
    }
    if (pathname === "/api/resource/Purchase Receipt Item") {
      return response([
        { name: "PRI-LINKED", parent: "PR-001", item_code: "ITEM-01", rate: 105, purchase_order: "PO-001", modified: "2026-08-02 09:00:00" },
        { name: "PRI-DIRECT", parent: "PR-002", item_code: "ITEM-01", rate: 120, purchase_order: "", modified: "2026-08-05 09:00:00" },
      ]);
    }
    if (pathname === "/api/resource/Purchase Order/PO-001") {
      return response({ name: "PO-001", supplier: "NCC-A", company: "ALUMDOOR", transaction_date: "2026-08-01", docstatus: 1 });
    }
    if (pathname === "/api/resource/Purchase Order/PO-DRAFT") {
      return response({ name: "PO-DRAFT", supplier: "NCC-A", company: "ALUMDOOR", transaction_date: "2026-08-04", docstatus: 0 });
    }
    if (pathname === "/api/resource/Purchase Order/PO-OTHER") {
      return response({ name: "PO-OTHER", supplier: "NCC-B", company: "ALUMDOOR", transaction_date: "2026-08-03", docstatus: 1 });
    }
    if (pathname === "/api/resource/Purchase Receipt/PR-002") {
      return response({ name: "PR-002", supplier: "NCC-A", company: "ALUMDOOR", posting_at: "2026-08-05 08:30:00", docstatus: 1 });
    }
    return response({}, 404);
  };
}

test("purchase item price history keeps submitted PO plus direct receipt without double-counting linked receipt", async () => {
  const result = await buildPurchaseItemPriceHistory(fixtureCall(), {
    item_code: "ITEM-01",
    company: "ALUMDOOR",
    limit: 50,
  });

  assert.deepEqual(result.rows, [
    { date: "2026-08-05", supplier: "NCC-A", rate: 120 },
    { date: "2026-08-03", supplier: "NCC-B", rate: 300 },
    { date: "2026-08-01", supplier: "NCC-A", rate: 100 },
  ]);
  assert.deepEqual(result.latest, { date: "2026-08-05", supplier: "NCC-A", rate: 120 });
});

test("purchase item price history resolves latest price for the exact supplier", async () => {
  const result = await buildPurchaseItemPriceHistory(fixtureCall(), {
    item_code: "ITEM-01",
    company: "ALUMDOOR",
    supplier: "NCC-A",
    limit: 1,
  });

  assert.deepEqual(result.rows, [{ date: "2026-08-05", supplier: "NCC-A", rate: 120 }]);
  assert.deepEqual(result.latest, { date: "2026-08-05", supplier: "NCC-A", rate: 120 });
});

test("purchase item price history is company scoped", async () => {
  const result = await buildPurchaseItemPriceHistory(fixtureCall(), {
    item_code: "ITEM-01",
    company: "OTHER-COMPANY",
    supplier: "NCC-A",
  });

  assert.deepEqual(result.rows, []);
  assert.equal(result.latest, null);
});
