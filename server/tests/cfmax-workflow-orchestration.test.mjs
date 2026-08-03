import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCursorAdvanced,
  parseRouteIndexRebuildPage,
  parseRouteIndexRebuildParams,
  routeIndexWorkflowInstanceId,
} from "../dist/apps/workflow-worker/src/contracts.js";

test("route-index workflow request contract is deterministic and reuses control-plane page bounds", () => {
  const parsed = parseRouteIndexRebuildParams({ request_id: "rebuild-20260804" }, "trace-1");
  assert.deepEqual(parsed, {
    request_id: "rebuild-20260804",
    trace_id: "trace-1",
    page_size: 250,
    after_tenant_id: "",
  });
  assert.equal(routeIndexWorkflowInstanceId(parsed.request_id), "route-index:rebuild-20260804");
  assert.throws(() => parseRouteIndexRebuildParams({ request_id: "x", page_size: 1001 }, "trace-1"));
});

test("transport-hostile identifiers and cursors fail closed", () => {
  assert.throws(() => parseRouteIndexRebuildParams({ request_id: "bad id" }, "trace-1"));
  assert.throws(() => parseRouteIndexRebuildParams({ request_id: "ok", after_tenant_id: "a\r\nb" }, "trace-1"));
  assert.throws(() => routeIndexWorkflowInstanceId("bad id"));
});

test("control-plane page envelope is bounded and cursor must advance", () => {
  const page = parseRouteIndexRebuildPage({ rebuilt: 250, next_after_tenant_id: "tenant-250" });
  assert.deepEqual(page, { rebuilt: 250, next_after_tenant_id: "tenant-250" });
  assert.doesNotThrow(() => assertCursorAdvanced("tenant-100", page));
  assert.throws(() => assertCursorAdvanced("tenant-250", page));
  assert.throws(() => assertCursorAdvanced("tenant-100", { rebuilt: 0, next_after_tenant_id: "tenant-250" }));
  assert.throws(() => parseRouteIndexRebuildPage({ rebuilt: 1001, next_after_tenant_id: null }));
});

test("terminal page is accepted without inventing another orchestration cursor", () => {
  const page = parseRouteIndexRebuildPage({ rebuilt: 17, next_after_tenant_id: null });
  assert.doesNotThrow(() => assertCursorAdvanced("tenant-900", page));
  assert.equal(page.next_after_tenant_id, null);
});
