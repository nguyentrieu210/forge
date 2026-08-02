import assert from "node:assert/strict";
import test from "node:test";

import { routeManufacturingBomBulkApi } from "../dist/apps/tenant-worker/src/manufacturing-bom-bulk-api.js";

const PREVIEW = "https://tenant.test/api/method/metaforge.manufacturing.preview_bulk_bom";
const CREATE = "https://tenant.test/api/method/metaforge.manufacturing.create_bulk_bom_draft";

function body() {
  return {
    company: "ACME",
    item: "FG-100",
    quantity: "1",
    revision: 2,
    effective_from: "2026-08-03",
    output_uom: "Nos",
    output_conversion_factor: "1",
    lines: [
      { item_code: "RM-A", qty: "2.5", uom: "Kg", conversion_factor: "1", source_warehouse: "RAW" },
      { item_code: "RM-B", qty: "3", source_warehouse: "RAW", qty_basis: "Theo chiều rộng" },
    ],
  };
}

function existingDraft(overrides = {}) {
  return {
    tenant_id: "tenant-a",
    doctype: "Bill of Materials",
    name: "BOM-0002",
    owner: "qa@example.com",
    docstatus: 0,
    status: "Draft",
    version: 1,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T00:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      item: "FG-100",
      quantity: "1.000000",
      revision: 2,
      bom_status: "Draft",
      effective_from: "2026-08-03",
      output_uom: "Nos",
      output_stock_uom: "Nos",
      output_conversion_factor: "1.000000",
      operating_cost: "0.00",
      items: [
        { item_code: "RM-A", qty: "2.500000", uom: "Kg", stock_uom: "Kg", conversion_factor: "1.000000", source_warehouse: "RAW", qty_basis: "Cố định" },
        { item_code: "RM-B", qty: "3.000000", uom: "Nos", stock_uom: "Nos", conversion_factor: "1.000000", source_warehouse: "RAW", qty_basis: "Theo chiều rộng" },
      ],
      ...overrides,
    },
  };
}

function request(url, payload = body()) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function context({ documents = [], create } = {}) {
  const permissionCalls = [];
  const createCalls = [];
  return {
    permissionCalls,
    createCalls,
    value: {
      tenantId: "tenant-a",
      actor: { user_id: "qa@example.com", roles: ["Manufacturing User"] },
      traceId: "trace-bom",
      permissions: {
        async assert(input) { permissionCalls.push(input); },
      },
      async listBomDocuments() { return documents; },
      async createCanonicalDraft(document) {
        createCalls.push(document);
        return create
          ? create(document)
          : new Response(JSON.stringify({ data: { name: "BOM-NEW", docstatus: 0 } }), {
              status: 201,
              headers: { "content-type": "application/json", "x-d1-bookmark": "bookmark-1" },
            });
      },
    },
  };
}

async function json(response) {
  return response.json();
}

test("bulk BOM preview is permission checked, pure and Frappe-shaped", async () => {
  const ctx = context();
  const response = await routeManufacturingBomBulkApi(request(PREVIEW), new URL(PREVIEW), ctx.value);
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.schema_version, 1);
  assert.equal(payload.message.row_count, 2);
  assert.equal(payload.message.document.bom_status, "Draft");
  assert.equal(ctx.permissionCalls.length, 1);
  assert.equal(ctx.createCalls.length, 0);
});

test("bulk BOM exact retry returns the existing canonical Draft and does not write again", async () => {
  const ctx = context({ documents: [existingDraft()] });
  const response = await routeManufacturingBomBulkApi(request(CREATE), new URL(CREATE), ctx.value);
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.name, "BOM-0002");
  assert.equal(payload.message.replayed, true);
  assert.equal(payload.message.draft, true);
  assert.equal(ctx.createCalls.length, 0);
});

test("bulk BOM conflicting payload on the same company/item/revision fails closed", async () => {
  const changed = existingDraft({ items: [
    { item_code: "RM-A", qty: "9.000000", uom: "Kg", stock_uom: "Kg", conversion_factor: "1.000000", source_warehouse: "RAW", qty_basis: "Cố định" },
    { item_code: "RM-B", qty: "3.000000", uom: "Nos", stock_uom: "Nos", conversion_factor: "1.000000", source_warehouse: "RAW", qty_basis: "Theo chiều rộng" },
  ] });
  const ctx = context({ documents: [changed] });
  await assert.rejects(
    () => routeManufacturingBomBulkApi(request(CREATE), new URL(CREATE), ctx.value),
    /already exists with a different payload or lifecycle state/,
  );
  assert.equal(ctx.createCalls.length, 0);
});

test("bulk BOM create delegates only a Draft canonical BOM and preserves the D1 bookmark", async () => {
  const ctx = context();
  const response = await routeManufacturingBomBulkApi(request(CREATE), new URL(CREATE), ctx.value);
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.name, "BOM-NEW");
  assert.equal(payload.message.replayed, false);
  assert.equal(response.headers.get("x-d1-bookmark"), "bookmark-1");
  assert.equal(ctx.createCalls.length, 1);
  assert.equal(ctx.createCalls[0].bom_status, "Draft");
  assert.equal(ctx.createCalls[0].items.length, 2);
  assert.equal("docstatus" in ctx.createCalls[0], false);
});

test("bulk BOM rejects client-selected tenant scope", async () => {
  const ctx = context();
  const payload = body();
  payload.tenant_id = "other-tenant";
  await assert.rejects(
    () => routeManufacturingBomBulkApi(request(PREVIEW, payload), new URL(PREVIEW), ctx.value),
    /tenant scope is controlled by the authenticated server context/,
  );
  assert.equal(ctx.permissionCalls.length, 0);
});
