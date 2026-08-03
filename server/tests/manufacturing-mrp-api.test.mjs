import assert from "node:assert/strict";
import test from "node:test";

import { routeManufacturingMrpApi } from "../dist/apps/tenant-worker/src/manufacturing-mrp-api.js";

const PREVIEW = "https://tenant.test/api/method/metaforge.manufacturing.preview_production_plan_mrp";
const CREATE = "https://tenant.test/api/method/metaforge.manufacturing.create_mrp_material_request";

function plan(docstatus = 1) {
  return {
    tenant_id: "tenant-a",
    doctype: "Production Plan",
    name: "PLAN-1",
    owner: "planner@example.com",
    docstatus,
    status: docstatus === 1 ? "Planned" : "Draft",
    version: 1,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T00:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      posting_at: "2026-08-03",
      items: [{ row_id: "P1", item_code: "FG", bom_no: "BOM-FG", planned_qty: "2", warehouse: "FG" }],
    },
  };
}

function bom() {
  return {
    tenant_id: "tenant-a",
    doctype: "Bill of Materials",
    name: "BOM-FG",
    owner: "planner@example.com",
    docstatus: 1,
    status: "Submitted",
    version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    modified_at: "2026-08-01T00:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      item: "FG",
      quantity: "1.000000",
      quantity_micros: 1_000_000,
      output_stock_qty_micros: 1_000_000,
      revision: 1,
      bom_status: "Active",
      effective_from: "2026-01-01",
      items: [{
        row_id: "R1",
        item_code: "RM",
        qty: "3.000000",
        qty_micros: 3_000_000,
        stock_qty_micros: 3_000_000,
        qty_basis: "Cố định",
        source_warehouse: "RAW",
      }],
    },
  };
}

function request(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context({ planDoc = plan(), boms = [bom()], requests = [], unreadable = new Set(), create } = {}) {
  const permissionCalls = [];
  const createCalls = [];
  return {
    permissionCalls,
    createCalls,
    value: {
      tenantId: "tenant-a",
      actor: { user_id: "planner@example.com", roles: ["Manufacturing User"] },
      traceId: "trace-mrp",
      permissions: {
        async assert(input) { permissionCalls.push(input); },
        async canReadDocument(_actor, _tenant, document) { return !unreadable.has(document.name); },
      },
      async loadProductionPlan(name) { return name === "PLAN-1" ? planDoc : null; },
      async listBomDocuments() { return boms; },
      async listMaterialRequests() { return requests; },
      async createCanonicalMaterialRequest(document) {
        createCalls.push(document);
        return create
          ? create(document)
          : new Response(JSON.stringify({ data: { name: "MR-NEW", docstatus: 0 } }), {
              status: 201,
              headers: { "content-type": "application/json", "x-d1-bookmark": "bm-mrp" },
            });
      },
    },
  };
}

async function json(response) { return response.json(); }

test("MRP preview reads one Production Plan, checks BOM visibility and returns gross requirements", async () => {
  const ctx = context();
  const response = await routeManufacturingMrpApi(
    request(PREVIEW, { production_plan: "PLAN-1" }),
    new URL(PREVIEW),
    ctx.value,
  );
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.production_plan, "PLAN-1");
  assert.equal(payload.message.netting_mode, "gross_only");
  assert.equal(payload.message.purchase_requirements[0].gross_qty, "6.000000");
  assert.equal(ctx.createCalls.length, 0);
  assert.equal(ctx.permissionCalls.some((call) => call.doctype === "Bill of Materials" && call.action === "read"), true);
});

test("MRP preview refuses to expose a BOM outside the actor read scope", async () => {
  const ctx = context({ unreadable: new Set(["BOM-FG"]) });
  await assert.rejects(
    () => routeManufacturingMrpApi(request(PREVIEW, { production_plan: "PLAN-1" }), new URL(PREVIEW), ctx.value),
    /MRP requires a BOM outside the current read scope/,
  );
});

test("MRP Material Request commit requires a submitted Production Plan", async () => {
  const ctx = context({ planDoc: plan(0) });
  await assert.rejects(
    () => routeManufacturingMrpApi(
      request(CREATE, { production_plan: "PLAN-1", material_request_type: "Purchase" }),
      new URL(CREATE),
      ctx.value,
    ),
    /Production Plan must be submitted/,
  );
  assert.equal(ctx.createCalls.length, 0);
});

test("MRP commit creates exactly one requested Material Request type through canonical create", async () => {
  const ctx = context();
  const response = await routeManufacturingMrpApi(
    request(CREATE, { production_plan: "PLAN-1", material_request_type: "Purchase" }),
    new URL(CREATE),
    ctx.value,
  );
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.name, "MR-NEW");
  assert.equal(payload.message.created, true);
  assert.equal(payload.message.material_request_type, "Purchase");
  assert.equal(response.headers.get("x-d1-bookmark"), "bm-mrp");
  assert.equal(ctx.createCalls.length, 1);
  assert.equal(ctx.createCalls[0].material_request_type, "Purchase");
  assert.equal(ctx.createCalls[0].mrp_source_name, "PLAN-1");
  assert.match(ctx.createCalls[0].mrp_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(ctx.createCalls[0].items[0].qty, "6.000000");
});

test("MRP exact sequential retry returns the existing request without a second write", async () => {
  const first = context();
  const firstResponse = await routeManufacturingMrpApi(
    request(CREATE, { production_plan: "PLAN-1", material_request_type: "Purchase" }),
    new URL(CREATE),
    first.value,
  );
  const firstPayload = await json(firstResponse);
  const draft = first.createCalls[0];
  const existing = {
    tenant_id: "tenant-a", doctype: "Material Request", name: "MR-OLD", owner: "planner@example.com",
    docstatus: 0, status: "Draft", version: 1, created_at: "2026-08-03T00:00:00.000Z", modified_at: "2026-08-03T00:00:00.000Z", children: [],
    data: draft,
  };
  const retry = context({ requests: [existing] });
  const response = await routeManufacturingMrpApi(
    request(CREATE, { production_plan: "PLAN-1", material_request_type: "Purchase" }),
    new URL(CREATE),
    retry.value,
  );
  const payload = await json(response);
  assert.equal(firstPayload.message.created, true);
  assert.equal(payload.message.name, "MR-OLD");
  assert.equal(payload.message.replayed, true);
  assert.equal(retry.createCalls.length, 0);
});

test("MRP changed planning fingerprint conflicts with an existing active generated request", async () => {
  const existing = {
    tenant_id: "tenant-a", doctype: "Material Request", name: "MR-OLD", owner: "planner@example.com",
    docstatus: 1, status: "Pending", version: 1, created_at: "2026-08-03T00:00:00.000Z", modified_at: "2026-08-03T00:00:00.000Z", children: [],
    data: {
      company: "ACME", material_request_type: "Purchase", transaction_date: "2026-08-03", items: [],
      mrp_source_doctype: "Production Plan", mrp_source_name: "PLAN-1", mrp_fingerprint: "different",
    },
  };
  const ctx = context({ requests: [existing] });
  await assert.rejects(
    () => routeManufacturingMrpApi(
      request(CREATE, { production_plan: "PLAN-1", material_request_type: "Purchase" }),
      new URL(CREATE),
      ctx.value,
    ),
    /different planning fingerprint/,
  );
});

test("MRP tenant scope is server-controlled", async () => {
  const ctx = context();
  await assert.rejects(
    () => routeManufacturingMrpApi(
      request(PREVIEW, { production_plan: "PLAN-1", tenant_id: "other" }),
      new URL(PREVIEW),
      ctx.value,
    ),
    /tenant scope is controlled/,
  );
});
