import assert from "node:assert/strict";
import test from "node:test";

import { handleCompanyScopedDeliveryBatch } from "../dist/apps-src/alumdoor-worker/src/delivery-batch-company-scope.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function request(args) {
  return new Request("https://app.local/api/method/alumdoor.delivery_batch.preview", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://gateway.local/api",
      "x-cloudforge-tenant": "alu",
    },
    body: JSON.stringify({ args }),
  });
}

function hasFilter(url, field, value) {
  const filters = JSON.parse(url.searchParams.get("filters") ?? "[]");
  return filters.some((entry) => Array.isArray(entry) && entry[0] === field && entry[1] === "=" && entry[2] === value);
}

test("delivery batch preview scopes Sales Order and Delivery Note to Business Context company", async () => {
  const observed = [];
  const env = {
    PLATFORM: {
      async fetch(outbound) {
        const url = new URL(outbound.url);
        const path = decodeURIComponent(url.pathname).replace(/^\/api/, "");
        observed.push({ path, url });
        if (path === "/resource/Sales Order") {
          assert.ok(hasFilter(url, "docstatus", 1));
          assert.ok(hasFilter(url, "company", "ALUMDOOR"));
          return json({ data: [{ name: "SO-001", delivery_date: "2026-08-06", docstatus: 1, delivered_percentage: 0, customer: "KH-001" }] });
        }
        if (path === "/resource/Delivery Note") {
          assert.ok(hasFilter(url, "company", "ALUMDOOR"));
          return json({ data: [] });
        }
        throw new Error(`unexpected callback ${path}`);
      },
    },
  };

  const response = await handleCompanyScopedDeliveryBatch(
    request({ delivery_date: "2026-08-06", company: "ALUMDOOR" }),
    env,
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 200, body.message);
  assert.equal(body.delivery_date, "2026-08-06");
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0].sales_order, "SO-001");
  assert.equal(body.rows[0].status, "Sẵn sàng");
  assert.ok(observed.some(({ path }) => path === "/resource/Sales Order"));
  assert.ok(observed.some(({ path }) => path === "/resource/Delivery Note"));
});

test("delivery batch fails closed before any callback when company context is missing", async () => {
  let calls = 0;
  const response = await handleCompanyScopedDeliveryBatch(
    request({ delivery_date: "2026-08-06" }),
    { PLATFORM: { async fetch() { calls += 1; return json({ data: [] }); } } },
    {},
  );
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.match(body.message, /Công ty/);
  assert.equal(calls, 0);
});
