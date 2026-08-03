import assert from "node:assert/strict";
import test from "node:test";

import {
  MatrixSourceActionRegistry,
  routeMatrixApi,
} from "../dist/apps/tenant-worker/src/matrix-api.js";

const READ = "https://tenant.test/api/method/metaforge.matrix.read";
const ACTION = "https://tenant.test/api/method/metaforge.matrix.action";

function context(registry) {
  return { traceId: "trace-matrix", registry };
}

async function body(response) { return response.json(); }

test("Matrix registry invokes only explicitly registered sources and actions", async () => {
  const calls = [];
  const registry = new MatrixSourceActionRegistry()
    .registerSource("demo.matrix.read", async (input) => { calls.push(["read", input]); return { rows: [input.q] }; })
    .registerAction("demo.matrix.commit", async (input) => { calls.push(["action", input]); return { saved: input.id }; });

  assert.deepEqual(await registry.read("demo.matrix.read", { q: "needle" }), { rows: ["needle"] });
  assert.deepEqual(await registry.action("demo.matrix.commit", { id: "A" }), { saved: "A" });
  assert.deepEqual(calls, [["read", { q: "needle" }], ["action", { id: "A" }]]);
  await assert.rejects(() => registry.read("demo.matrix.missing", {}), /not registered/i);
  await assert.rejects(() => registry.action("demo.matrix.missing", {}), /not registered/i);
});

test("Matrix registry rejects invalid and duplicate capability names", () => {
  const registry = new MatrixSourceActionRegistry().registerSource("demo.matrix.read", async () => ({}));
  assert.throws(() => registry.registerSource("demo.matrix.read", async () => ({})), /registered more than once/i);
  assert.throws(() => registry.registerAction("Pricing Item Matrix", async () => ({})), /name is invalid/i);
});

test("Matrix read route parses bounded generic input and returns Frappe message envelope", async () => {
  const registry = new MatrixSourceActionRegistry().registerSource("demo.matrix.read", async (input) => ({ received: input }));
  const url = new URL(READ);
  url.searchParams.set("source", "demo.matrix.read");
  url.searchParams.set("input", JSON.stringify({ selected_id: "ITEM-1", search: { scope: "navigator", query: "nhom" } }));
  const response = await routeMatrixApi(new Request(url), url, context(registry));
  assert.equal(response.status, 200);
  assert.deepEqual((await body(response)).message.received, {
    selected_id: "ITEM-1",
    search: { scope: "navigator", query: "nhom" },
  });
});

test("Matrix action route rejects caller-selected tenant scope", async () => {
  const registry = new MatrixSourceActionRegistry().registerAction("demo.matrix.commit", async () => ({ ok: true }));
  const request = new Request(ACTION, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "demo.matrix.commit", input: JSON.stringify({ tenant_id: "other" }) }),
  });
  await assert.rejects(() => routeMatrixApi(request, new URL(ACTION), context(registry)), /tenant scope is controlled/i);
});

test("Matrix routes fail closed on the wrong HTTP method", async () => {
  const registry = new MatrixSourceActionRegistry();
  const readResponse = await routeMatrixApi(new Request(READ, { method: "POST" }), new URL(READ), context(registry));
  assert.equal(readResponse.status, 405);
  assert.equal(readResponse.headers.get("allow"), "GET");
  const actionResponse = await routeMatrixApi(new Request(ACTION), new URL(ACTION), context(registry));
  assert.equal(actionResponse.status, 405);
  assert.equal(actionResponse.headers.get("allow"), "POST");
});
