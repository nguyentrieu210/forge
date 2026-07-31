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
