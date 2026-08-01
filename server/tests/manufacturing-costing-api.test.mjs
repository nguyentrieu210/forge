import test from "node:test";
import assert from "node:assert/strict";
import {
  isManufacturingCostingApiPath,
  isManufacturingCostingFrappePath,
  routeManufacturingCostingApi,
} from "../dist/apps/tenant-worker/src/manufacturing-costing-api.js";

function makeRequest(path, body, method = "POST") {
  return new Request(`https://tenant.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function makeContext(actor) {
  return {
    db: {},
    tenantId: "tenant-from-server",
    actor,
    traceId: "trace-manufacturing-cost-test",
  };
}

function service(overrides = {}) {
  return {
    async preview() { throw new Error("unexpected preview"); },
    async generate() { throw new Error("unexpected generate"); },
    async read() { throw new Error("unexpected read"); },
    async freeze() { throw new Error("unexpected freeze"); },
    async adjust() { throw new Error("unexpected adjust"); },
    ...overrides,
  };
}

test("manufacturing costing route classification covers REST and Frappe contracts", () => {
  assert.equal(isManufacturingCostingApiPath("/api/v1/manufacturing-costing/preview"), true);
  assert.equal(isManufacturingCostingApiPath("/api/v1/reports/manufacturing-cost-sheet"), true);
  assert.equal(isManufacturingCostingFrappePath("/api/method/metaforge.manufacturing.cost_sheet"), true);
  assert.equal(isManufacturingCostingApiPath("/api/resource/Work Order"), false);
});

test("manufacturing costing tenant scope comes only from authenticated server context", async () => {
  let seenTenant = "";
  const fake = service({
    async generate(tenantId, _actor, workOrder) {
      seenTenant = tenantId;
      assert.equal(workOrder, "WO-1");
      return { snapshot_id: "MCS-1", work_order: workOrder, source_fingerprint: "a".repeat(64), existing: false, frozen: false };
    },
  });
  const actor = { user_id: "accountant@example.test", roles: ["Kế toán tổng hợp"] };
  const request = makeRequest("/api/v1/manufacturing-costing/generate", { work_order: "WO-1" });
  const response = await routeManufacturingCostingApi(request, new URL(request.url), makeContext(actor), { service: fake });
  assert.equal(response?.status, 200);
  assert.equal(seenTenant, "tenant-from-server");

  const injected = makeRequest("/api/v1/manufacturing-costing/generate", { tenant_id: "other", work_order: "WO-1" });
  await assert.rejects(
    () => routeManufacturingCostingApi(injected, new URL(injected.url), makeContext(actor), { service: fake }),
    (error) => error?.code === "VALIDATION_ERROR" && /server context/i.test(error.message),
  );
});

test("manufacturing cost Frappe report unwraps args and wraps result", async () => {
  const fake = service({
    async read(tenantId, actor, snapshotId) {
      assert.equal(tenantId, "tenant-from-server");
      assert.equal(actor.user_id, "chief@example.test");
      assert.equal(snapshotId, "MCS-42");
      return { snapshot_id: snapshotId, adjusted_actual_total_cost_minor: 1234 };
    },
  });
  const actor = { user_id: "chief@example.test", roles: ["Kế toán trưởng"] };
  const request = makeRequest("/api/method/metaforge.manufacturing.cost_sheet", {
    args: JSON.stringify({ snapshot_id: "MCS-42" }),
  });
  const response = await routeManufacturingCostingApi(request, new URL(request.url), makeContext(actor), { service: fake });
  assert.equal(response?.status, 200);
  assert.deepEqual(await response.json(), { message: { snapshot_id: "MCS-42", adjusted_actual_total_cost_minor: 1234 } });
});

test("manufacturing costing adjustment validates the append-only contract at the API boundary", async () => {
  let seen;
  const fake = service({
    async adjust(_tenantId, _actor, input) {
      seen = input;
      return { adjustment_id: input.adjustment_id, existing: false };
    },
  });
  const actor = { user_id: "chief@example.test", roles: ["Kế toán trưởng"] };
  const request = makeRequest("/api/v1/manufacturing-costing/adjust", {
    adjustment_id: "MCA-1",
    snapshot_id: "MCS-1",
    category: "Overhead",
    delta_amount_minor: 50000,
    reason: "Bổ sung hóa đơn điện cuối kỳ",
    details: { invoice: "HD-01" },
  });
  const response = await routeManufacturingCostingApi(request, new URL(request.url), makeContext(actor), { service: fake });
  assert.equal(response?.status, 200);
  assert.equal(seen.category, "Overhead");
  assert.equal(seen.delta_amount_minor, 50000);
});

test("manufacturing costing endpoints reject non-POST methods", async () => {
  const actor = { user_id: "workshop@example.test", roles: ["Chủ xưởng"] };
  const request = makeRequest("/api/v1/manufacturing-costing/preview", undefined, "GET");
  const response = await routeManufacturingCostingApi(request, new URL(request.url), makeContext(actor), { service: service() });
  assert.equal(response?.status, 405);
  assert.equal(response?.headers.get("allow"), "POST");
});
