import assert from "node:assert/strict";
import test from "node:test";

import { buildManufacturingCostEvidence } from "../dist/packages/clouderp-erpnext/src/index.js";

function canonical(doctype, name, data, docstatus = 1) {
  return {
    tenant_id: "tenant-a",
    doctype,
    name,
    owner: "planner@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : "Draft",
    version: 1,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T00:00:00.000Z",
    children: [],
    data,
  };
}

function wo(overrides = {}) {
  return canonical("Work Order", "WO-1", {
    company: "ACME",
    production_item: "FG",
    bom_no: "BOM-FG",
    bom_checksum: "abc",
    bom_revision: 2,
    qty: "10",
    qty_micros: 10_000_000,
    ...overrides,
  });
}

function bom(overrides = {}) {
  return canonical("Bill of Materials", "BOM-FG", {
    company: "ACME",
    item: "FG",
    quantity: "1",
    quantity_micros: 1_000_000,
    revision: 2,
    bom_checksum: "abc",
    currency: "VND",
    currency_scale: 0,
    raw_material_cost_minor: 100,
    operating_cost_minor: 20,
    ...overrides,
  });
}

function movement(role, item, qty, value) {
  return {
    stock_entry: "STE-1",
    stock_entry_version: 1,
    purpose: "Manufacture",
    posting_at: "2026-08-03T01:00:00Z",
    role,
    direction: role === "Consumption" ? "Outward" : "Inward",
    item_code: item,
    warehouse: role === "Consumption" ? "RAW" : "FG",
    qty: Number(qty).toFixed(6),
    qty_micros: qty * 1_000_000,
    stock_value_difference_minor: value,
    valuation_rate_minor: 0,
  };
}

function genealogy({ consumption = 220, finished = 260, recovery = 10, produced = 2, warnings = [] } = {}) {
  return {
    schema_version: 1,
    work_order: "WO-1",
    company: "ACME",
    production_item: "FG",
    bom_no: "BOM-FG",
    bom_checksum: "abc",
    target_qty: "10.000000",
    target_qty_micros: 10_000_000,
    effective_stock_entry_count: 1,
    cancelled_stock_entries: [],
    material_transfers: [],
    consumptions: consumption ? [movement("Consumption", "RM", 2, -consumption)] : [],
    finished_goods: produced ? [movement("Finished Good", "FG", produced, finished)] : [],
    recoveries: recovery ? [movement("Scrap", "SCRAP", 1, recovery)] : [],
    input_lots: [],
    output_lots: [],
    trace_scope: "WORK_ORDER_GROUP",
    warnings,
  };
}

test("cost evidence reconciles recovery credit across material and implied operation variance", () => {
  const result = buildManufacturingCostEvidence(wo(), bom(), genealogy());
  assert.equal(result.evidence_scope, "READ_ONLY_CANONICAL_LEDGER");
  assert.equal(result.posting_status, "NOT_POSTED");
  assert.equal(result.produced_qty, "2.000000");
  assert.equal(result.completion_pct, "20.000000");
  assert.equal(result.standard_material_cost_minor, 200);
  assert.equal(result.standard_operating_cost_minor, 40);
  assert.equal(result.standard_total_cost_minor, 240);
  assert.equal(result.actual_consumption_value_minor, 220);
  assert.equal(result.actual_recovery_value_minor, 10);
  assert.equal(result.actual_net_material_cost_minor, 210);
  assert.equal(result.actual_finished_good_value_minor, 260);
  assert.equal(result.actual_accounted_output_value_minor, 270);
  assert.equal(result.implied_operating_cost_minor, 50);
  assert.equal(result.material_variance_minor, 10);
  assert.equal(result.operation_variance_minor, 10);
  assert.equal(result.total_variance_minor, 20);
  assert.equal(result.material_variance_minor + result.operation_variance_minor, result.total_variance_minor);
});

test("cost evidence requires the exact BOM checksum captured by Work Order", () => {
  assert.throws(
    () => buildManufacturingCostEvidence(wo(), bom({ bom_checksum: "changed" }), genealogy()),
    /checksum does not match/,
  );
});

test("cost evidence reports no-operation source when no FG has posted", () => {
  const result = buildManufacturingCostEvidence(
    wo(),
    bom(),
    genealogy({ produced: 0, finished: 0, consumption: 0, recovery: 0 }),
  );
  assert.equal(result.actual_operation_cost_source, "NOT_AVAILABLE");
  assert.equal(result.warnings.includes("NO_FINISHED_GOOD_COST_EVIDENCE"), true);
  assert.equal(result.actual_net_material_cost_minor, 0);
  assert.equal(result.total_variance_minor, 0);
});

test("cost evidence surfaces traceability warnings without changing valuation evidence", () => {
  const result = buildManufacturingCostEvidence(
    wo(),
    bom(),
    genealogy({ warnings: ["UNTRACKED_INPUT_MATERIALS_PRESENT", "UNTRACKED_FINISHED_GOODS_PRESENT"] }),
  );
  assert.deepEqual(result.warnings, ["INPUT_TRACEABILITY_INCOMPLETE", "OUTPUT_TRACEABILITY_INCOMPLETE"]);
});

test("cost evidence warns when recovery value exceeds consumed material value", () => {
  const result = buildManufacturingCostEvidence(
    wo(),
    bom(),
    genealogy({ produced: 1, finished: 20, consumption: 50, recovery: 60 }),
  );
  assert.equal(result.actual_net_material_cost_minor, -10);
  assert.equal(result.implied_operating_cost_minor, 30);
  assert.equal(result.warnings.includes("RECOVERY_EXCEEDS_CONSUMPTION_VALUE"), true);
  assert.equal(result.material_variance_minor + result.operation_variance_minor, result.total_variance_minor);
});

test("cost evidence fails if canonical FG genealogy exceeds Work Order target", () => {
  assert.throws(
    () => buildManufacturingCostEvidence(wo(), bom(), genealogy({ produced: 11, finished: 1320 })),
    /exceeds Work Order target/,
  );
});
