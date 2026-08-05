import assert from "node:assert/strict";
import test from "node:test";

import { handleSalesOrderOperationalSummary } from "../dist/apps-src/alumdoor-worker/src/sales-order-operational-summary.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function request(args) {
  return new Request("https://app.local/api/method/alumdoor.sales.order_operational_summary", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://gateway.local/api",
      "x-cloudforge-tenant": "alu",
    },
    body: JSON.stringify({ args }),
  });
}

function filters(url) {
  return JSON.parse(url.searchParams.get("filters") ?? "[]");
}
function hasFilter(url, field, operator, value) {
  return filters(url).some((entry) => Array.isArray(entry) && entry[0] === field && entry[1] === operator && entry[2] === value);
}

function platform() {
  return {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = decodeURIComponent(url.pathname).replace(/^\/api/, "");
      if (path === "/resource/Sales Order") {
        assert.ok(hasFilter(url, "docstatus", "=", 1));
        assert.ok(hasFilter(url, "company", "=", "ALUMDOOR"));
        return json({ data: [
          { name: "SO-A", company: "ALUMDOOR", docstatus: 1, status: "To Deliver", modified: "2026-08-06T10:00:00Z" },
          { name: "SO-B", company: "ALUMDOOR", docstatus: 1, status: "To Deliver", modified: "2026-08-06T09:00:00Z" },
        ] });
      }
      if (path === "/resource/Stock Reservation") {
        assert.ok(hasFilter(url, "source_doctype", "=", "Sales Order"));
        return json({ data: [
          { name: "RES-A1", source_name: "SO-A", state: "Đang giữ", modified: "2026-08-06T10:01:00Z" },
          { name: "RES-A2", source_name: "SO-A", state: "Đang giữ", modified: "2026-08-06T10:02:00Z" },
          { name: "RES-OTHER", source_name: "SO-OTHER-COMPANY", state: "Đang giữ", modified: "2026-08-06T10:03:00Z" },
        ] });
      }
      if (path === "/resource/Production Request") {
        return json({ data: [
          { name: "PR-A", sales_order: "SO-A", request_state: "Đã phát hành", modified: "2026-08-06T11:00:00Z" },
          { name: "PR-OTHER", sales_order: "SO-OTHER-COMPANY", request_state: "Đã phát hành", modified: "2026-08-06T11:01:00Z" },
        ] });
      }
      if (path === "/resource/Cut Order") {
        assert.ok(hasFilter(url, "company", "=", "ALUMDOOR"));
        return json({ data: [
          { name: "CUT-A", so_reference: "SO-A", cut_state: "Nháp", company: "ALUMDOOR", modified: "2026-08-06T12:00:00Z" },
        ] });
      }
      throw new Error(`unexpected callback ${path}`);
    },
  };
}

test("sales operational summary derives reservation, production and cut state only for company-scoped Sales Orders", async () => {
  const response = await handleSalesOrderOperationalSummary(request({ company: "ALUMDOOR" }), { PLATFORM: platform() });
  const body = await response.json();

  assert.equal(response.status, 200, body.message);
  assert.equal(body.company, "ALUMDOOR");
  assert.equal(body.rows.length, 2);
  const a = body.rows.find((row) => row.sales_order === "SO-A");
  const b = body.rows.find((row) => row.sales_order === "SO-B");
  assert.deepEqual(a, {
    sales_order: "SO-A",
    reservation_state: "Đang giữ",
    reservation_count: 2,
    active_reservations: 2,
    used_reservations: 0,
    expired_reservations: 0,
    released_reservations: 0,
    production_request: "PR-A",
    production_state: "Đã phát hành",
    cut_order: "CUT-A",
    cut_state: "Nháp",
  });
  assert.equal(b.reservation_state, "Chưa giữ");
  assert.equal(b.production_request, null);
  assert.equal(b.cut_order, null);
  assert.equal(body.rows.some((row) => row.sales_order === "SO-OTHER-COMPANY"), false);
});

test("sales operational summary fails closed before callbacks when Company is missing", async () => {
  let calls = 0;
  const response = await handleSalesOrderOperationalSummary(request({}), {
    PLATFORM: { async fetch() { calls += 1; return json({ data: [] }); } },
  });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.match(body.message, /Công ty/);
  assert.equal(calls, 0);
});
