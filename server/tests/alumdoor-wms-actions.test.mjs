import assert from "node:assert/strict";
import test from "node:test";

import {
  handleBuildPickWaves,
  handlePlanPicking,
  handlePlanPutaway,
  handleValidatePacking,
} from "../dist/apps-src/alumdoor-worker/src/wms-actions.js";
import { routeWmsPlanningApi } from "../dist/apps/tenant-worker/src/wms-planning-api.js";

function response(data, status = 200) {
  return Response.json({ data }, { status });
}

function request(args) {
  return new Request("https://alumdoor.local/api/method/alumdoor.wms.plan_picking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://platform.local/api",
      "x-cloudforge-identity": "signed-user",
    },
    body: JSON.stringify({ args }),
  });
}

function platformFor(item = null, reports = {}) {
  return {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = decodeURIComponent(url.pathname).replace(/^\/api\//, "");
      if (item && path === `resource/Item/${item.item_code}`) return response(item);
      if (path === "method/frappe.desk.query_report.run") {
        const body = await outbound.json();
        return Response.json({ message: { result: reports[body.report_name] ?? [] } });
      }
      if (path === "method/metaforge.inventory.wms_plan") {
        return await routeWmsPlanningApi(outbound, url, { traceId: "test-wms" });
      }
      throw new Error(`unexpected callback ${path}`);
    },
  };
}

const planningEnv = { PLATFORM: platformFor() };

test("WMS picking uses the earliest positive Stock Ledger receipt for batch FIFO", async () => {
  const env = { PLATFORM: platformFor(
    { item_code: "AL71", has_batch_no: 1, has_serial_no: 0 },
    {
      "Batch Stock Balance": [
        { batch_no: "B-NEW", warehouse: "Kho NVL", actual_qty: 5 },
        { batch_no: "B-OLD", warehouse: "Kho NVL", actual_qty: 3 },
      ],
      "Stock Ledger": [
        { batch_no: "B-NEW", warehouse: "Kho NVL", actual_qty: 5, posting_at: "2026-08-20T08:00:00Z" },
        { batch_no: "B-OLD", warehouse: "Kho NVL", actual_qty: 3, posting_at: "2026-08-01T08:00:00Z" },
      ],
    },
  ) };
  const result = await handlePlanPicking(request({ item_code: "AL71", warehouse: "Kho NVL", qty: 4 }), env);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.equal(body.candidate_source, "batch_stock_balance");
  assert.deepEqual(body.allocations.map((row) => [row.batch_no, row.qty]), [["B-OLD", 3], ["B-NEW", 1]]);
});

test("WMS serial picking keeps each serial atomic and preserves its batch identity", async () => {
  const env = { PLATFORM: platformFor(
    { item_code: "MOTOR", has_batch_no: 1, has_serial_no: 1 },
    {
      "Serial Number Status": [
        { serial_no: "SN-2", actual_qty: 1, status: "Available", last_inward_warehouse: "Kho TP", last_posting_at: "2026-08-20" },
        { serial_no: "SN-1", actual_qty: 1, status: "Available", last_inward_warehouse: "Kho TP", last_posting_at: "2026-08-01" },
      ],
      "Stock Ledger": [
        { serial_no: "SN-1", batch_no: "LOT-1", warehouse: "Kho TP", actual_qty: 1, posting_at: "2026-08-01" },
        { serial_no: "SN-2", batch_no: "LOT-2", warehouse: "Kho TP", actual_qty: 1, posting_at: "2026-08-20" },
      ],
    },
  ) };
  const result = await handlePlanPicking(request({ item_code: "MOTOR", warehouse: "Kho TP", qty: 1 }), env);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.equal(body.candidate_source, "serial_number_status");
  assert.deepEqual(body.allocations.map((row) => [row.serial_no, row.batch_no, row.qty]), [["SN-1", "LOT-1", 1]]);
});

test("WMS packing rejects stock that was not picked", async () => {
  const result = await handleValidatePacking(new Request("https://alumdoor.local/api/method/alumdoor.wms.validate_packing", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://platform.local/api",
      "x-cloudforge-identity": "signed-user",
    },
    body: JSON.stringify({ args: {
      picked: [{ item_code: "AL71", warehouse: "Kho NVL", picked_qty_micros: 1_000_000, batch_no: "B-1" }],
      packages: [{ package_id: "PK-1", lines: [{ item_code: "AL71", warehouse: "Kho NVL", packed_qty_micros: 1_000_000, batch_no: "B-2" }] }],
    } }),
  }), planningEnv);
  const body = await result.json();
  assert.equal(result.status, 422);
  assert.match(body.message, /was not picked/i);
});

test("WMS packing accepts the flat rows used by the action screen", async () => {
  const result = await handleValidatePacking(new Request("https://alumdoor.local/api/method/alumdoor.wms.validate_packing", {
    method: "POST", headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://platform.local/api",
      "x-cloudforge-identity": "signed-user",
    },
    body: JSON.stringify({ args: {
      picked: [{ item_code: "AL71", warehouse: "Kho NVL", picked_qty: 2, batch_no: "B-1" }],
      package_rows: [
        { package_id: "PK-1", item_code: "AL71", warehouse: "Kho NVL", packed_qty: 1, batch_no: "B-1" },
        { package_id: "PK-2", item_code: "AL71", warehouse: "Kho NVL", packed_qty: 1, batch_no: "B-1" },
      ],
    } }),
  }), planningEnv);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.equal(body.complete, true);
  assert.equal(body.package_count, 2);
});

test("WMS putaway and pick-wave routes accept human quantities and return readable quantities", async () => {
  const putaway = await handlePlanPutaway(new Request("https://alumdoor.local/api/method/alumdoor.wms.plan_putaway", {
    method: "POST", headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://platform.local/api",
      "x-cloudforge-identity": "signed-user",
    },
    body: JSON.stringify({ args: { qty: 7, candidates: [
      { warehouse: "A", priority: 1, capacity_qty: 5, current_qty: 2 },
      { warehouse: "B", priority: 2, capacity_qty: 10, current_qty: 4 },
    ] } }),
  }), planningEnv);
  const putawayBody = await putaway.json();
  assert.equal(putaway.status, 200, putawayBody.message);
  assert.deepEqual(putawayBody.allocations.map((row) => [row.warehouse, row.qty]), [["A", 3], ["B", 4]]);

  const waves = await handleBuildPickWaves(new Request("https://alumdoor.local/api/method/alumdoor.wms.build_pick_waves", {
    method: "POST", headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://platform.local/api",
      "x-cloudforge-identity": "signed-user",
    },
    body: JSON.stringify({ args: { max_lines_per_wave: 1, lines: [
      { line_id: "L-2", group_key: "ZONE-A", sequence: 2, qty: 3 },
      { line_id: "L-1", group_key: "ZONE-A", sequence: 1, qty: 2 },
    ] } }),
  }), planningEnv);
  const waveBody = await waves.json();
  assert.equal(waves.status, 200, waveBody.message);
  assert.deepEqual(waveBody.waves.map((wave) => [wave.wave_key, wave.total_qty]), [["ZONE-A#001", 2], ["ZONE-A#002", 3]]);
});
