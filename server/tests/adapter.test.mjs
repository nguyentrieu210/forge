import test from "node:test";
import assert from "node:assert/strict";
import { CloudForgeAdapter, CloudForgeApiError } from "../dist/packages/metaforge-cloudforge-adapter/src/index.js";
import { commandPayloadHash } from "../dist/packages/core/src/index.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("mutate sends the caller's command_id and a payload_hash the backend will accept", async () => {
  let sent;
  const adapter = new CloudForgeAdapter({
    baseUrl: "https://gw.test", tenantId: "demo", accessToken: "tok",
    fetchImpl: async (url, init) => { sent = { url, init }; return jsonResponse({ command_id: "cmd-1", aggregate_version: 1 }); },
  });
  await adapter.mutate({ doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null, document: { customer: "CUST-1" }, commandId: "cmd-1" });
  assert.equal(sent.url, "https://gw.test/api/v1/commands");
  assert.equal(sent.init.headers.get("authorization"), "Bearer tok");
  const command = JSON.parse(sent.init.body);
  assert.equal(command.command_id, "cmd-1");
  assert.equal("actor" in command, false);
  // The backend recomputes and compares this exact hash — parity is required.
  assert.equal(command.payload_hash, await commandPayloadHash(command));
});

test("errors are surfaced as a typed CloudForgeApiError (status, code, trace_id)", async () => {
  const adapter = new CloudForgeAdapter({
    baseUrl: "https://gw.test", tenantId: "demo",
    fetchImpl: async () => jsonResponse({ error: { code: "VERSION_CONFLICT", message: "The document changed", retryable: false }, trace_id: "trace-9" }, 409),
  });
  await assert.rejects(
    adapter.getDocument("Sales Order", "SO-1"),
    (error) => {
      assert.ok(error instanceof CloudForgeApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, "VERSION_CONFLICT");
      assert.equal(error.traceId, "trace-9");
      return true;
    },
  );
});

test("getList and getCount POST to the gateway document endpoints", async () => {
  const calls = [];
  const adapter = new CloudForgeAdapter({
    baseUrl: "https://gw.test", tenantId: "demo", accessToken: "t",
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return jsonResponse(String(url).endsWith("/count") ? { count: 3 } : { rows: [], next_cursor: null, has_more: false });
    },
  });
  const page = await adapter.getList({ doctype: "Sales Order", search: "C", limit: 10 });
  const total = await adapter.getCount({ doctype: "Sales Order", filters: [{ field: "docstatus", operator: "eq", value: 1 }] });
  assert.equal(calls[0].url, "https://gw.test/api/v1/documents/list");
  assert.equal(calls[0].method, "POST");
  assert.equal(JSON.parse(calls[0].body).doctype, "Sales Order");
  assert.equal(calls[1].url, "https://gw.test/api/v1/documents/count");
  assert.equal(total.count, 3);
  assert.equal(page.has_more, false);
});

test("whoami and reports use the right origins", async () => {
  const urls = [];
  const adapter = new CloudForgeAdapter({
    baseUrl: "https://gw.test", reportBaseUrl: "https://reports.test", tenantId: "demo",
    getToken: () => "t2",
    fetchImpl: async (url) => { urls.push(url); return jsonResponse({ ok: true }); },
  });
  await adapter.getWhoAmI();
  await adapter.runReport({ report: "Accounts Receivable", limit: 2000 });
  await adapter.getPreparedReport("job-1");
  assert.equal(urls[0], "https://gw.test/api/v1/whoami");
  assert.equal(urls[1], "https://reports.test/api/v1/reports/run");
  assert.equal(urls[2], "https://reports.test/api/v1/reports/prepared/job-1");
});

test("platform APIs use metadata, collaboration, workflow and import/export routes", async () => {
  const calls = [];
  const adapter = new CloudForgeAdapter({
    baseUrl: "https://gw.test", tenantId: "demo", accessToken: "tok",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", contentType: init.headers?.get?.("content-type"), body: init.body });
      if (String(url).endsWith("/api/v1/export/csv")) return new Response("name,subject\nDOC-1,Hello\n", { status: 200, headers: { "content-type": "text/csv" } });
      if (String(url).includes("/import/apply")) return jsonResponse({ imported: 1, failed: 0, results: [] }, 201);
      if (String(url).includes("/actions")) return jsonResponse({ state: "Open", actions: [{ action: "Approve", next_state: "Approved" }] });
      return jsonResponse({ meta: { name: "Demo", module: "Core", revision: 1, fields: [] }, workflow: null });
    },
  });
  await adapter.getMeta("Demo");
  await adapter.getWorkflowActions("Demo", "DOC-1");
  await adapter.addComment("Demo", "DOC-1", "hello");
  await adapter.shareDocument("Demo", "DOC-1", "user@example.com", { read: true });
  const imported = await adapter.applyImport("Demo", "name,subject\nDOC-1,Hello\n");
  const exported = await adapter.exportCsv({ doctype: "Demo", fields: ["name", "subject"] });
  assert.equal(imported.imported, 1);
  assert.match(exported, /DOC-1,Hello/);
  assert.deepEqual(calls.map((entry) => [entry.method, new URL(entry.url).pathname]), [
    ["GET", "/api/v1/meta/Demo"],
    ["GET", "/api/v1/workflows/Demo/actions"],
    ["POST", "/api/v1/documents/Demo/DOC-1/comments"],
    ["POST", "/api/v1/documents/Demo/DOC-1/share"],
    ["POST", "/api/v1/import/apply"],
    ["POST", "/api/v1/export/csv"],
  ]);
  assert.equal(calls[4].contentType, "text/csv");
});
