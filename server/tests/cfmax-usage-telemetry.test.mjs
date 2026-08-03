import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUsageDataPoint,
  operationClassForMethod,
  recordUsageEvent,
  routeFamilyFor,
  statusClassFor,
  USAGE_BLOB_SLOTS,
  USAGE_DOUBLE_SLOTS,
  USAGE_TELEMETRY_SCHEMA_VERSION,
} from "../dist/packages/usage-telemetry/src/index.js";

test("usage telemetry keeps one tenant index and fixed Analytics Engine slots", () => {
  const point = buildUsageDataPoint({
    tenantId: "tenant-a",
    eventFamily: "request",
    service: "gateway-worker",
    plan: "pro",
    routeFamily: "api.resource",
    operationClass: "read",
    statusClass: "2xx",
    latencyMs: 12.5,
    requestBytes: 100,
    responseBytes: 250,
    statusCode: 200,
  });

  assert.deepEqual(point.indexes, ["tenant-a"]);
  assert.equal(point.blobs.length, 20);
  assert.equal(point.doubles.length, 20);
  assert.equal(USAGE_BLOB_SLOTS.length, 20);
  assert.equal(USAGE_DOUBLE_SLOTS.length, 20);
  assert.equal(point.blobs[0], USAGE_TELEMETRY_SCHEMA_VERSION);
  assert.equal(point.blobs[1], "request");
  assert.equal(point.blobs[4], "api.resource");
  assert.equal(point.doubles[0], 12.5);
  assert.equal(point.doubles[12], 200);
});

test("request classifiers stay low-cardinality and never expose raw document paths", () => {
  assert.equal(routeFamilyFor("/api/resource/Sales%20Invoice/INV-2026-000012"), "api.resource");
  assert.equal(routeFamilyFor("/api/method/frappe.client.get_list"), "api.method");
  assert.equal(routeFamilyFor("/shop/customer-private-sku-123"), "client.shop");
  assert.equal(operationClassForMethod("GET"), "read");
  assert.equal(operationClassForMethod("POST"), "command");
  assert.equal(statusClassFor(503), "5xx");
});

test("telemetry rejects an Analytics Engine index that can alias by truncation", () => {
  assert.throws(() => buildUsageDataPoint({
    tenantId: "x".repeat(97),
    eventFamily: "request",
    service: "gateway-worker",
  }), /96-byte index limit/);
});

test("telemetry failure never becomes a customer request failure", () => {
  const writer = { writeDataPoint() { throw new Error("provider unavailable"); } };
  assert.equal(recordUsageEvent(writer, {
    tenantId: "tenant-a",
    eventFamily: "request",
    service: "gateway-worker",
  }), false);
  assert.equal(recordUsageEvent(undefined, {
    tenantId: "tenant-a",
    eventFamily: "request",
    service: "gateway-worker",
  }), false);
});
