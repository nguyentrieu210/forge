import assert from "node:assert/strict";
import test from "node:test";

import { buildManufacturingCapacityPlan } from "../dist/packages/clouderp-erpnext/src/index.js";

function canonical(doctype, name, data, docstatus = 1) {
  return {
    tenant_id: "tenant-a", doctype, name, owner: "planner@example.com", docstatus,
    status: docstatus === 1 ? "Submitted" : "Draft", version: 1,
    created_at: "2026-08-03T00:00:00.000Z", modified_at: "2026-08-03T00:00:00.000Z", children: [], data,
  };
}

function routing(item, operations, extra = {}) {
  return canonical("Manufacturing Routing", `RT-${item}`, {
    company: "ACME", routing_name: `Routing ${item}`, item_code: item,
    effective_from: "2026-01-01", is_active: true, operations, ...extra,
  });
}

function op(sequence, operation, workstation, setup, run) {
  return { row_id: `OP-${sequence}`, sequence, operation, workstation, setup_minutes: String(setup), run_minutes_per_unit: String(run) };
}

function calendar(workstation, hours = 8, utilization = 100) {
  return canonical("Workstation Capacity Calendar", `CAL-${workstation}`, {
    company: "ACME", workstation, effective_from: "2026-01-01", utilization_percent: String(utilization),
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((weekday, index) => ({
      row_id: `D-${index + 1}`, weekday, capacity_hours: String(hours),
    })),
  });
}

function mrp({ qty = 10, due = "2026-08-05", manufacture = [] } = {}) {
  return {
    schema_version: 1,
    company: "ACME",
    production_plan: "PLAN-1",
    planning_date: "2026-08-03",
    netting_mode: "gross_only",
    planned_outputs: [{
      row_id: "P1", item_code: "FG", bom_no: "BOM-FG", bom_revision: 1,
      schedule_date: due, planned_qty: Number(qty).toFixed(6), planned_qty_micros: qty * 1_000_000,
    }],
    manufacture_requirements: manufacture,
    purchase_requirements: [],
    warnings: [],
  };
}

test("capacity plan schedules routing operations sequentially across workstation day buckets", () => {
  const result = buildManufacturingCapacityPlan({
    mrp: mrp({ qty: 10, due: "2026-08-05" }),
    through_date: "2026-08-05",
    routings: [routing("FG", [op(1, "Cut", "WS-CUT", 30, 10), op(2, "Assemble", "WS-ASM", 0, 20)])],
    calendars: [calendar("WS-CUT", 8), calendar("WS-ASM", 8)],
    downtimes: [],
  });
  assert.equal(result.operations.length, 2);
  assert.equal(result.operations[0].required_minutes, "130.000000");
  assert.equal(result.operations[0].scheduled_from, "2026-08-03");
  assert.equal(result.operations[0].scheduled_to, "2026-08-03");
  assert.equal(result.operations[1].required_minutes, "200.000000");
  assert.equal(result.operations[1].scheduled_from, "2026-08-03");
  assert.equal(result.operations[1].late, false);
});

test("capacity plan subtracts submitted downtime from available minutes", () => {
  const downtime = canonical("Manufacturing Downtime", "DT-1", {
    company: "ACME", workstation: "WS-CUT",
    from_time: "2026-08-03T08:00:00.000Z", to_time: "2026-08-03T10:00:00.000Z",
    category: "Maintenance", reason: "Preventive service",
  });
  const result = buildManufacturingCapacityPlan({
    mrp: mrp({ qty: 1 }),
    through_date: "2026-08-03",
    routings: [routing("FG", [op(1, "Cut", "WS-CUT", 0, 60)])],
    calendars: [calendar("WS-CUT", 8)],
    downtimes: [downtime],
  });
  const summary = result.workstation_summary[0];
  assert.equal(summary.downtime_minutes, "120.000000");
  assert.equal(summary.available_minutes, "360.000000");
  assert.equal(summary.allocated_minutes, "60.000000");
});

test("capacity plan applies utilization percentage before scheduling", () => {
  const result = buildManufacturingCapacityPlan({
    mrp: mrp({ qty: 4 }),
    through_date: "2026-08-03",
    routings: [routing("FG", [op(1, "Cut", "WS-CUT", 0, 60)])],
    calendars: [calendar("WS-CUT", 8, 50)],
    downtimes: [],
  });
  assert.equal(result.workstation_summary[0].available_minutes, "240.000000");
  assert.equal(result.operations[0].late, false);
});

test("capacity plan fails closed on overlapping effective routings", () => {
  assert.throws(
    () => buildManufacturingCapacityPlan({
      mrp: mrp({ qty: 1 }),
      through_date: "2026-08-05",
      routings: [routing("FG", [op(1, "Cut", "WS", 0, 1)]), routing("FG", [op(1, "Cut", "WS", 0, 2)], { routing_name: "Other" })],
      calendars: [calendar("WS")], downtimes: [],
    }),
    /More than one active Manufacturing Routing/,
  );
});

test("capacity plan never invents capacity when workstation calendar is missing", () => {
  const result = buildManufacturingCapacityPlan({
    mrp: mrp({ qty: 2 }),
    through_date: "2026-08-05",
    routings: [routing("FG", [op(1, "Cut", "WS-MISSING", 0, 60)])],
    calendars: [], downtimes: [],
  });
  assert.equal(result.operations[0].late, true);
  assert.equal(result.warnings.includes("CAPACITY_SHORTAGE:WS-MISSING:FG"), true);
});

test("capacity plan includes MRP subassembly manufacture demand", () => {
  const sub = {
    requirement_type: "Manufacture", item_code: "SUB", warehouse: "WIP", schedule_date: "2026-08-05",
    gross_qty: "3.000000", gross_qty_micros: 3_000_000, source_count: 1, sources: [],
  };
  const result = buildManufacturingCapacityPlan({
    mrp: mrp({ qty: 1, manufacture: [sub] }),
    through_date: "2026-08-05",
    routings: [
      routing("FG", [op(1, "Final", "WS-FG", 0, 10)]),
      routing("SUB", [op(1, "Sub", "WS-SUB", 0, 20)]),
    ],
    calendars: [calendar("WS-FG"), calendar("WS-SUB")], downtimes: [],
  });
  assert.equal(result.demands.length, 2);
  assert.equal(result.operations.some((row) => row.item_code === "SUB" && row.required_minutes === "60.000000"), true);
});
