import assert from "node:assert/strict";
import test from "node:test";

import {
  explodeProductionPlanMrp,
  materialRequestDraftsFromMrp,
} from "../dist/packages/clouderp-erpnext/src/index.js";

function bom(name, item, revision, items, extra = {}) {
  return {
    tenant_id: "tenant-a",
    doctype: "Bill of Materials",
    name,
    owner: "planner@example.com",
    docstatus: 1,
    status: "Submitted",
    version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    modified_at: `2026-08-0${revision}T00:00:00.000Z`,
    children: [],
    data: {
      company: "ACME",
      item,
      quantity: "1.000000",
      quantity_micros: 1_000_000,
      output_stock_qty_micros: 1_000_000,
      revision,
      bom_status: "Active",
      effective_from: "2026-01-01",
      items,
      ...extra,
    },
  };
}

function row(id, item, qty, warehouse = "RAW", extra = {}) {
  return {
    row_id: id,
    item_code: item,
    qty: String(qty),
    qty_micros: Math.round(Number(qty) * 1_000_000),
    stock_qty_micros: Math.round(Number(qty) * 1_000_000),
    stock_uom: "Nos",
    uom: "Nos",
    conversion_factor_micros: 1_000_000,
    qty_basis: "Cố định",
    source_warehouse: warehouse,
    ...extra,
  };
}

function plan(items) {
  return {
    company: "ACME",
    posting_at: "2026-08-03",
    items,
  };
}

test("MRP explodes multi-level BOM and separates manufacture from purchase requirements", () => {
  const boms = [
    bom("BOM-FG-1", "FG", 1, [row("A", "SUB", 2, "WIP"), row("B", "RM-1", 3)]),
    bom("BOM-SUB-1", "SUB", 1, [row("C", "RM-2", 4)]),
  ];
  const result = explodeProductionPlanMrp("PLAN-1", plan([
    { row_id: "P1", item_code: "FG", bom_no: "BOM-FG-1", planned_qty: "5", warehouse: "FG", schedule_date: "2026-08-10" },
  ]), boms);

  assert.equal(result.netting_mode, "gross_only");
  assert.equal(result.planned_outputs[0].planned_qty, "5.000000");
  assert.deepEqual(result.manufacture_requirements.map((r) => [r.item_code, r.gross_qty, r.warehouse]), [
    ["SUB", "10.000000", "WIP"],
  ]);
  assert.deepEqual(result.purchase_requirements.map((r) => [r.item_code, r.gross_qty]), [
    ["RM-1", "15.000000"],
    ["RM-2", "40.000000"],
  ]);
  assert.equal(result.purchase_requirements.find((r) => r.item_code === "RM-2").sources[0].path.join(" > "), "FG > SUB > RM-2");
});

test("MRP treats *_micros as already scaled and does not scale them a second time", () => {
  const boms = [bom("BOM-FG", "FG", 1, [row("A", "RM", 3)])];
  const result = explodeProductionPlanMrp("PLAN-MICROS", plan([
    { row_id: "P", item_code: "FG", bom_no: "BOM-FG", planned_qty: "999", planned_qty_micros: 2_000_000 },
  ]), boms);
  assert.equal(result.planned_outputs[0].planned_qty, "2.000000");
  assert.equal(result.purchase_requirements[0].gross_qty, "6.000000");
});

test("MRP aggregates repeated leaf requirements across roots while retaining source count", () => {
  const boms = [
    bom("BOM-A", "FG-A", 1, [row("A", "RM", 2)]),
    bom("BOM-B", "FG-B", 1, [row("B", "RM", 3)]),
  ];
  const result = explodeProductionPlanMrp("PLAN-2", plan([
    { row_id: "A", item_code: "FG-A", bom_no: "BOM-A", planned_qty: "2", warehouse: "FG" },
    { row_id: "B", item_code: "FG-B", bom_no: "BOM-B", planned_qty: "4", warehouse: "FG" },
  ]), boms);
  assert.equal(result.purchase_requirements.length, 1);
  assert.equal(result.purchase_requirements[0].gross_qty, "16.000000");
  assert.equal(result.purchase_requirements[0].source_count, 2);
});

test("MRP honors explicit alternate BOM selected on the Production Plan root", () => {
  const boms = [
    bom("BOM-FG-A", "FG", 1, [row("A", "RM-A", 1)]),
    bom("BOM-FG-B", "FG", 2, [row("B", "RM-B", 1)], { effective_from: "2026-07-01" }),
  ];
  const result = explodeProductionPlanMrp("PLAN-3", plan([
    { row_id: "P", item_code: "FG", bom_no: "BOM-FG-A", planned_qty: "1" },
  ]), boms);
  assert.deepEqual(result.purchase_requirements.map((r) => r.item_code), ["RM-A"]);
});

test("MRP fails closed when more than one effective BOM exists for an implicitly selected item", () => {
  const boms = [
    bom("BOM-FG-A", "FG", 1, [row("A", "RM-A", 1)]),
    bom("BOM-FG-B", "FG", 2, [row("B", "RM-B", 1)]),
  ];
  assert.throws(
    () => explodeProductionPlanMrp("PLAN-4", plan([{ row_id: "P", item_code: "FG", planned_qty: "1" }]), boms),
    /More than one Active BOM/,
  );
});

test("MRP applies top-level dimensional quantity bases with fixed-point math", () => {
  const boms = [bom("BOM-DIM", "FG", 1, [
    row("W", "RM-W", 2, "RAW", { qty_basis: "Theo chiều rộng" }),
    row("A", "RM-A", 3, "RAW", { qty_basis: "Theo diện tích" }),
  ])];
  const result = explodeProductionPlanMrp("PLAN-5", plan([
    { row_id: "P", item_code: "FG", bom_no: "BOM-DIM", planned_qty: "2", width_m: "1.5", height_m: "2" },
  ]), boms);
  assert.equal(result.purchase_requirements.find((r) => r.item_code === "RM-W").gross_qty, "6.000000");
  assert.equal(result.purchase_requirements.find((r) => r.item_code === "RM-A").gross_qty, "18.000000");
});

test("MRP rejects non-fixed subassembly BOM without an explicit dimension mapping contract", () => {
  const boms = [
    bom("BOM-FG", "FG", 1, [row("S", "SUB", 1)]),
    bom("BOM-SUB", "SUB", 1, [row("X", "RM", 1, "RAW", { qty_basis: "Theo chiều rộng" })]),
  ];
  assert.throws(
    () => explodeProductionPlanMrp("PLAN-6", plan([{ row_id: "P", item_code: "FG", bom_no: "BOM-FG", planned_qty: "1", width_m: "2" }]), boms),
    /requires explicit dimensions for non-fixed BOM BOM-SUB/,
  );
});

test("MRP warns when a requirement has no source warehouse instead of inventing one", () => {
  const boms = [bom("BOM-FG", "FG", 1, [row("A", "RM", 1, undefined)])];
  delete boms[0].data.items[0].source_warehouse;
  const result = explodeProductionPlanMrp("PLAN-7", plan([{ row_id: "P", item_code: "FG", bom_no: "BOM-FG", planned_qty: "1" }]), boms);
  assert.deepEqual(result.warnings, ["UNALLOCATED_WAREHOUSE:RM"]);
  assert.equal("warehouse" in result.purchase_requirements[0], false);
});

test("MRP Material Request drafts are canonical demand documents, not stock or GL mutations", () => {
  const result = explodeProductionPlanMrp("PLAN-8", plan([{ row_id: "P", item_code: "FG", bom_no: "BOM-FG", planned_qty: "2" }]), [
    bom("BOM-FG", "FG", 1, [row("A", "SUB", 1, "WIP"), row("B", "RM", 2, "RAW")]),
    bom("BOM-SUB", "SUB", 1, [row("C", "RM2", 1, "RAW")]),
  ]);
  const drafts = materialRequestDraftsFromMrp(result, "planner@example.com");
  assert.deepEqual(drafts.map((d) => d.material_request_type), ["Purchase", "Manufacture"]);
  assert.equal(drafts[0].mrp_source_name, "PLAN-8");
  assert.equal(drafts[0].mrp_netting_mode, "gross_only");
  assert.equal(drafts[0].requested_by, "planner@example.com");
  assert.equal(drafts[0].items.length, 2);
});

test("MRP selects explicit nested BOMs per root without changing other roots", () => {
  const boms = [
    bom("ROOT", "FG", 1, [row("S", "SUB", 2, "WIP")]),
    bom("SUB-A", "SUB", 1, [row("A", "RM-A", 3)]),
    bom("SUB-B", "SUB", 2, [row("B", "NESTED", 4)]),
    bom("NESTED", "NESTED", 1, [row("N", "RM-B", 5)]),
  ];
  const result = explodeProductionPlanMrp("NESTED-CHOICES", plan([
    { row_id: "A", item_code: "FG", bom_no: "ROOT", planned_qty: "2", subassembly_boms: [{ item_code: "SUB", bom_no: "SUB-A" }] },
    { row_id: "B", item_code: "FG", bom_no: "ROOT", planned_qty: "1", subassembly_boms: [{ item_code: "SUB", bom_no: "SUB-B" }, { item_code: "NESTED", bom_no: "NESTED" }] },
  ]), boms);
  assert.deepEqual(result.purchase_requirements.map(r => [r.item_code, r.gross_qty]), [["RM-A", "12.000000"], ["RM-B", "40.000000"]]);
  assert.deepEqual(result.manufacture_requirements.map(r => [r.item_code, r.gross_qty]), [["NESTED", "8.000000"], ["SUB", "6.000000"]]);
  const source = result.purchase_requirements.find(r => r.item_code === "RM-A").sources[0];
  assert.equal(source.bom_no, "SUB-A");
  assert.equal(source.root_row_id, "A");
  assert.equal(result.netting_mode, "gross_only");
  const draft = materialRequestDraftsFromMrp(result).find(r => r.material_request_type === "Purchase");
  assert.deepEqual(draft.items.map(r => [r.item_code, r.qty]), [["RM-A", "12.000000"], ["RM-B", "40.000000"]]);
});

test("MRP explicit subassembly choices reject unsubmitted, inactive, out-of-date and foreign BOMs", () => {
  const root = bom("ROOT", "FG", 1, [row("S", "SUB", 1)]);
  const input = plan([{ row_id: "P", item_code: "FG", bom_no: "ROOT", planned_qty: "1", subassembly_boms: [{ item_code: "SUB", bom_no: "SELECTED" }] }]);
  for (const change of [
    b => { b.docstatus = 0; },
    b => { b.docstatus = 2; },
    b => { b.data.bom_status = "Inactive"; },
    b => { b.data.effective_from = "2026-08-04"; },
    b => { b.data.effective_to = "2026-08-02"; },
    b => { b.data.company = "OTHER"; },
    b => { b.data.item = "WRONG"; },
  ]) {
    const selected = bom("SELECTED", "SUB", 1, [row("R", "RM", 1)]);
    change(selected);
    assert.throws(() => explodeProductionPlanMrp("INVALID-CHOICE", input, [root, selected]), /not submitted\/Active\/effective|does not match/);
  }
});

test("MRP rejects malformed, duplicate, root-replacing or unused subassembly choices", () => {
  const boms = [bom("ROOT", "FG", 1, [row("S", "SUB", 1)]), bom("SUB", "SUB", 1, [row("R", "RM", 1)]), bom("UNUSED", "UNUSED", 1, [row("U", "RM", 1)])];
  for (const choices of [
    null,
    {},
    [null],
    [{ item_code: "SUB" }],
    [{ item_code: "SUB", bom_no: "SUB" }, { item_code: " SUB ", bom_no: "SUB" }],
    [{ item_code: "FG", bom_no: "ROOT" }],
    [{ item_code: "UNUSED", bom_no: "UNUSED" }],
  ]) {
    assert.throws(() => explodeProductionPlanMrp("BAD-CHOICES", plan([{ row_id: "P", item_code: "FG", bom_no: "ROOT", planned_qty: "1", subassembly_boms: choices }]), boms));
  }
});

test("MRP explicit subassembly choice preserves cycle and dimension guards", () => {
  const input = plan([{ row_id: "P", item_code: "FG", bom_no: "ROOT", planned_qty: "1", width_m: "2", subassembly_boms: [{ item_code: "SUB", bom_no: "SUB" }] }]);
  const root = bom("ROOT", "FG", 1, [row("S", "SUB", 1)]);
  assert.throws(() => explodeProductionPlanMrp("CYCLE-CHOICE", input, [root, bom("SUB", "SUB", 1, [row("F", "FG", 1)])]), /circular BOM path/);
  assert.throws(() => explodeProductionPlanMrp("DIM-CHOICE", input, [root, bom("SUB", "SUB", 1, [row("R", "RM", 1, "RAW", { qty_basis: "Theo chiều rộng" })])]), /requires explicit dimensions/);
});
