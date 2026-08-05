import assert from "node:assert/strict";
import test from "node:test";

import { handleCompanyScopedPurchaseSupplierDashboard } from "../dist/apps-src/alumdoor-worker/src/purchase-supplier-dashboard-company-scope.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function request(args) {
  return new Request("https://app.local/api/method/alumdoor.purchase.supplier_delivery_dashboard", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://gateway.local/api",
    },
    body: JSON.stringify({ args }),
  });
}

function scopedPlatform(observed) {
  return {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = decodeURIComponent(url.pathname).replace(/^\/api/, "");
      observed.push({ path, url });

      if (["/resource/Purchase Order", "/resource/Purchase Receipt", "/resource/Purchase Invoice"].includes(path)) {
        const filters = JSON.parse(url.searchParams.get("filters") ?? "[]");
        assert.ok(filters.some((entry) => Array.isArray(entry) && entry[0] === "supplier" && entry[1] === "=" && entry[2] === "Tiến Đạt"));
        assert.ok(filters.some((entry) => Array.isArray(entry) && entry[0] === "docstatus" && entry[1] === "=" && entry[2] === 1));
        assert.ok(filters.some((entry) => Array.isArray(entry) && entry[0] === "company" && entry[1] === "=" && entry[2] === "ALUMDOOR"));
        return json({ data: [] });
      }

      if (path === "/method/frappe.desk.query_report.run") {
        assert.equal(url.searchParams.get("report_name"), "Debt Summary");
        const filters = JSON.parse(url.searchParams.get("filters") ?? "{}");
        assert.equal(filters.party, "Tiến Đạt");
        assert.equal(filters.account_type, "Payable");
        assert.equal(filters.company, "ALUMDOOR");
        return json({ message: { result: [] } });
      }

      throw new Error(`unexpected callback ${path}`);
    },
  };
}

test("supplier dashboard scopes PO, receipt, invoice and Payment Ledger to Business Context company", async () => {
  const observed = [];
  const response = await handleCompanyScopedPurchaseSupplierDashboard(
    request({ supplier: "Tiến Đạt", company: "ALUMDOOR" }),
    { PLATFORM: scopedPlatform(observed) },
  );
  const body = await response.json();

  assert.equal(response.status, 200, body.message);
  assert.equal(body.supplier, "Tiến Đạt");
  assert.equal(body.summary.purchase_order_count, 0);
  assert.ok(observed.some(({ path }) => path === "/resource/Purchase Order"));
  assert.ok(observed.some(({ path }) => path === "/resource/Purchase Receipt"));
  assert.ok(observed.some(({ path }) => path === "/resource/Purchase Invoice"));
  assert.ok(observed.some(({ path }) => path === "/method/frappe.desk.query_report.run"));
});

test("supplier dashboard fails closed before any callback when company context is missing", async () => {
  let calls = 0;
  const response = await handleCompanyScopedPurchaseSupplierDashboard(
    request({ supplier: "Tiến Đạt" }),
    { PLATFORM: { async fetch() { calls += 1; return json({ data: [] }); } } },
  );
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.match(body.message, /Công ty/);
  assert.equal(calls, 0);
});
