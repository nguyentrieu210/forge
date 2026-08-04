import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveInventoryScan,
} from "../dist/packages/clouderp-stock/src/inventory-scan-resolution.js";
import {
  routeInventoryScanApi,
} from "../dist/apps/tenant-worker/src/inventory-scan-api.js";

const actor = { user_id: "stock@example.test", roles: ["Stock User"] };

function lookup(records) {
  return {
    async findCandidates(tenantId, value, expectedDoctype) {
      assert.equal(tenantId, "tenant-a");
      return records.filter((record) => !expectedDoctype || record.doctype === expectedDoctype);
    },
  };
}

function allow(readable = () => true) {
  return {
    async canRead(_actor, tenantId, candidate) {
      assert.equal(tenantId, "tenant-a");
      return readable(candidate);
    },
  };
}

test("inventory scan resolves one permission-visible canonical master without creating stock authority", async () => {
  const result = await resolveInventoryScan(
    actor,
    "tenant-a",
    { scan: { raw: "  SN-001  ", symbology: "QR", scanned_at: "2026-08-04T01:02:03Z" } },
    lookup([{ doctype: "Serial No", name: "SN-001", data: { item_code: "ITEM-1", warehouse: "WH-A", serial_no: "SN-001" } }]),
    allow(),
  );
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.scan, { value: "SN-001", symbology: "QR", scanned_at: "2026-08-04T01:02:03.000Z" });
  assert.deepEqual(result.candidate, {
    doctype: "Serial No",
    name: "SN-001",
    item_code: "ITEM-1",
    warehouse: "WH-A",
    serial_no: "SN-001",
  });
  assert.equal("stock_entries" in result, false);
  assert.equal("reservation" in result, false);
});

test("inventory scan never guesses when one code resolves to multiple visible entities", async () => {
  const result = await resolveInventoryScan(
    actor,
    "tenant-a",
    { scan: { raw: "CODE-1" } },
    lookup([
      { doctype: "Item", name: "CODE-1", data: { item_code: "CODE-1" } },
      { doctype: "Batch", name: "CODE-1", data: { item_code: "ITEM-2", batch_no: "CODE-1" } },
    ]),
    allow(),
  );
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates?.map((candidate) => candidate.doctype), ["Batch", "Item"]);
  assert.equal(result.candidate, undefined);
});

test("expected doctype and permission filter resolve only the authorized entity", async () => {
  const result = await resolveInventoryScan(
    actor,
    "tenant-a",
    { scan: { raw: "CODE-1" }, expected_doctype: "Item" },
    lookup([
      { doctype: "Item", name: "CODE-1", data: { item_code: "CODE-1" } },
      { doctype: "Batch", name: "CODE-1", data: { item_code: "ITEM-2" } },
    ]),
    allow((candidate) => candidate.doctype === "Item"),
  );
  assert.equal(result.status, "resolved");
  assert.equal(result.candidate?.doctype, "Item");
});

test("company and warehouse context fail closed for mismatched or group warehouse candidates", async () => {
  const records = [
    { doctype: "Serial No", name: "SN-A", data: { company: "COMP-B", item_code: "ITEM-1", warehouse: "WH-A" } },
    { doctype: "Warehouse", name: "WH-A", data: { company: "COMP-A", is_group: 1 } },
  ];
  const serial = await resolveInventoryScan(
    actor,
    "tenant-a",
    { scan: { raw: "SN-A" }, company: "COMP-A", warehouse: "WH-A" },
    lookup(records),
    allow(),
  );
  assert.equal(serial.status, "not_found");

  const warehouse = await resolveInventoryScan(
    actor,
    "tenant-a",
    { scan: { raw: "WH-A" }, expected_doctype: "Warehouse" },
    lookup(records),
    allow(),
  );
  assert.equal(warehouse.status, "not_found");
});

test("permission-invisible matches do not leak through ambiguity or not-found shape", async () => {
  const records = [
    { doctype: "Item", name: "CODE-2", data: { item_code: "CODE-2" } },
    { doctype: "Serial No", name: "CODE-2", data: { item_code: "SECRET" } },
  ];
  const result = await resolveInventoryScan(
    actor,
    "tenant-a",
    { scan: { raw: "CODE-2" } },
    lookup(records),
    allow((candidate) => candidate.doctype === "Item"),
  );
  assert.equal(result.status, "resolved");
  assert.equal(result.candidate?.doctype, "Item");
  assert.equal(result.candidates, undefined);
});

test("scanner resolver rejects an unbounded lookup result", async () => {
  const records = Array.from({ length: 33 }, (_, index) => ({
    doctype: "Item",
    name: `ITEM-${index}`,
    data: { item_code: `ITEM-${index}` },
  }));
  await assert.rejects(
    () => resolveInventoryScan(actor, "tenant-a", { scan: { raw: "X" } }, lookup(records), allow()),
    /bounded candidate budget/,
  );
});

test("inventory scan API rejects client tenant selectors before lookup", async () => {
  const request = new Request("https://tenant.example/api/v1/inventory/scan/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: "ITEM-1", tenant_id: "other-tenant" }),
  });
  await assert.rejects(
    () => routeInventoryScanApi(request, new URL(request.url), apiContext(), {
      lookup: lookup([]),
      access: allow(),
    }),
    /tenant scope is controlled by the authenticated server context/,
  );
});

test("inventory scan API rejects unsupported symbology before lookup", async () => {
  const request = new Request("https://tenant.example/api/v1/inventory/scan/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: "ITEM-1", symbology: "PDF417" }),
  });
  await assert.rejects(
    () => routeInventoryScanApi(request, new URL(request.url), apiContext(), {
      lookup: lookup([]),
      access: allow(),
    }),
    /Unsupported scan symbology PDF417/,
  );
});

test("inventory scan API returns native and Frappe envelopes from the same permission-aware resolver", async () => {
  const records = [{ doctype: "Item", name: "ITEM-1", data: { item_code: "ITEM-1" } }];
  const nativeRequest = new Request("https://tenant.example/api/v1/inventory/scan/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: "ITEM-1", expected_doctype: "Item" }),
  });
  const nativeResponse = await routeInventoryScanApi(nativeRequest, new URL(nativeRequest.url), apiContext(), {
    lookup: lookup(records),
    access: allow(),
  });
  assert.equal(nativeResponse?.status, 200);
  assert.equal(nativeResponse?.headers.get("cache-control"), "no-store");
  const nativeBody = await nativeResponse.json();
  assert.equal(nativeBody.status, "resolved");
  assert.equal(nativeBody.candidate.name, "ITEM-1");

  const frappeRequest = new Request("https://tenant.example/api/method/metaforge.inventory.resolve_scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args: JSON.stringify({ raw: "ITEM-1" }) }),
  });
  const frappeResponse = await routeInventoryScanApi(frappeRequest, new URL(frappeRequest.url), apiContext(), {
    lookup: lookup(records),
    access: allow(),
  });
  const frappeBody = await frappeResponse.json();
  assert.equal(frappeBody.message.status, "resolved");
  assert.equal(frappeBody.message.candidate.name, "ITEM-1");
});

function apiContext() {
  return {
    db: {},
    tenantId: "tenant-a",
    actor,
    permissions: { async assert() {} },
    traceId: "trace-a12",
  };
}
