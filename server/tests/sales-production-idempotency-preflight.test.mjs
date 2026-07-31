import assert from "node:assert/strict";
import test from "node:test";

import {
  createSalesProduction,
  failClosedDuplicateReads,
  syncPaintJobsFromCut,
} from "../dist/apps-src/alumdoor-worker/src/sales-production.js";

function dataResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function preflightCall({ productionRequestStatus = 200, workOrderStatus = 200, paintJobStatus = 200 } = {}) {
  const writes = [];
  const paths = [];
  const call = Object.assign(async (path, init = {}) => {
    paths.push(path);
    const method = init.method ?? "GET";
    if (method !== "GET") {
      writes.push({ path, method });
      return dataResponse({ name: "UNEXPECTED-WRITE" }, 201);
    }
    if (path.startsWith("resource/Production%20Request?")) {
      return dataResponse([], productionRequestStatus);
    }
    if (path.startsWith("resource/Work%20Order?")) {
      return dataResponse([], workOrderStatus);
    }
    if (path.startsWith("resource/Paint%20Job?")) {
      return dataResponse([], paintJobStatus);
    }
    throw new Error(`unexpected platform path after preflight: ${path}`);
  }, { via: "test" });
  return { call, paths, writes };
}

test("Production Request duplicate probe fails closed before any write", async () => {
  const platform = preflightCall({ productionRequestStatus: 503 });
  const response = await createSalesProduction(platform.call, {
    sales_order: "DH-PREFLIGHT",
    source_warehouse: "K-NVL",
    target_warehouse: "K-TP",
  });

  assert.equal(response.status, 422);
  assert.match((await response.json()).message, /Không đọc được danh sách Production Request \(HTTP 503\)/);
  assert.equal(platform.writes.length, 0);
  assert.equal(platform.paths.some((path) => path.startsWith("resource/Work%20Order?")), false);
});

test("Work Order duplicate probe fails closed before creating a Production Request", async () => {
  const platform = preflightCall({ workOrderStatus: 503 });
  const response = await createSalesProduction(platform.call, {
    sales_order: "DH-PREFLIGHT",
    source_warehouse: "K-NVL",
    target_warehouse: "K-TP",
  });

  assert.equal(response.status, 422);
  assert.match((await response.json()).message, /Không đọc được danh sách Work Order \(HTTP 503\)/);
  assert.equal(platform.writes.length, 0);
});

test("Paint Job duplicate probe fails closed before reading or creating paint jobs", async () => {
  const platform = preflightCall({ paintJobStatus: 503 });

  await assert.rejects(
    syncPaintJobsFromCut(platform.call, "CUT-PREFLIGHT", 1),
    /Không đọc được danh sách Paint Job \(HTTP 503\)/,
  );
  assert.equal(platform.writes.length, 0);
  assert.equal(platform.paths.some((path) => path.startsWith("resource/Cut%20Order/")), false);
});

test("a duplicate-list outage after a successful read still blocks the next write", async () => {
  let duplicateReads = 0;
  const writes = [];
  const call = Object.assign(async (path, init = {}) => {
    const method = init.method ?? "GET";
    if (method !== "GET") {
      writes.push({ path, method });
      return dataResponse({ name: "SHOULD-NOT-WRITE" }, 201);
    }
    if (path.startsWith("resource/Production%20Request?")) {
      duplicateReads += 1;
      return dataResponse([], duplicateReads === 1 ? 200 : 503);
    }
    throw new Error(`unexpected platform path: ${path}`);
  }, { via: "test" });
  const guarded = failClosedDuplicateReads(call);

  assert.equal((await guarded("resource/Production%20Request?fields=[]")).status, 200);
  assert.equal((await guarded("resource/Production%20Request?fields=[]")).status, 503);
  await assert.rejects(
    guarded("resource/Production%20Request", { method: "POST", body: "{}" }),
    /Không đọc được danh sách Production Request \(HTTP 503\)/,
  );
  assert.equal(writes.length, 0);
});

test("successful duplicate-list reads do not block a later write", async () => {
  const writes = [];
  const call = Object.assign(async (path, init = {}) => {
    const method = init.method ?? "GET";
    if (method !== "GET") {
      writes.push({ path, method });
      return dataResponse({ name: "PR-OK" }, 201);
    }
    if (path.startsWith("resource/Work%20Order?")) return dataResponse([]);
    throw new Error(`unexpected platform path: ${path}`);
  }, { via: "test" });
  const guarded = failClosedDuplicateReads(call);

  assert.equal((await guarded("resource/Work%20Order?fields=[]")).status, 200);
  const writeResponse = await guarded("resource/Production%20Request", { method: "POST", body: "{}" });
  assert.equal(writeResponse.status, 201);
  assert.equal(writes.length, 1);
});

test("paint retry keeps completed batches and creates only the missing THÔ batch", async () => {
  const writes = [];
  const paths = [];
  const call = Object.assign(async (path, init = {}) => {
    paths.push(path);
    const method = String(init.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      const body = JSON.parse(init.body ?? "{}");
      writes.push({ path, method, body });
      return dataResponse({ ...body, name: "PAINT-BATCH-2" }, 201);
    }
    if (path.startsWith("resource/Paint%20Job?")) {
      return dataResponse([{ name: "PAINT-BATCH-1", batch_no: "BATCH-1", state: "Chờ sơn" }]);
    }
    if (path === "resource/Cut%20Order/CUT-RETRY") {
      return dataResponse({
        name: "CUT-RETRY",
        work_order: "WO-1",
        target_color: "Ghi sần",
        items: [{ item_code: "AL548", serial_and_batch_bundle: "BUNDLE-1" }],
      });
    }
    if (path === "resource/Work%20Order/WO-1") {
      return dataResponse({
        name: "WO-1",
        production_request: "PR-1",
        production_request_line_key: "ROW-1-SET-1",
      });
    }
    if (path === "resource/Serial%20and%20Batch%20Bundle/BUNDLE-1") {
      return dataResponse({
        entries: [
          { batch_no: "BATCH-1", qty: 1 },
          { batch_no: "BATCH-2", qty: 2 },
          { batch_no: "BATCH-2", qty: 3 },
        ],
      });
    }
    if (path === "resource/Batch/BATCH-1") {
      return dataResponse({ name: "BATCH-1", item_code: "AL548", condition: "THÔ", color: "THÔ" });
    }
    if (path === "resource/Batch/BATCH-2") {
      return dataResponse({ name: "BATCH-2", item_code: "AL548", condition: "THÔ", color: "THÔ" });
    }
    throw new Error(`unexpected platform path: ${path}`);
  }, { via: "test" });

  const result = await syncPaintJobsFromCut(call, "CUT-RETRY", 1);

  assert.deepEqual(result.existing, ["PAINT-BATCH-1"]);
  assert.deepEqual(result.created, ["PAINT-BATCH-2"]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "resource/Paint%20Job");
  assert.equal(writes[0].body.batch_no, "BATCH-2");
  assert.equal(writes[0].body.qty, 5);
  assert.equal(paths.filter((path) => path === "resource/Batch/BATCH-2").length, 1);
});
