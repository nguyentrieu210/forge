import assert from "node:assert/strict";
import test from "node:test";

import {
  bomRuleFormulaDisplay,
  evaluateBomRuleMaster,
  resolveBomRuleMaster,
} from "../dist/apps-src/alumdoor-worker/src/bom-rule-core.js";

function rule(code, patch = {}) {
  return {
    rule_code: code,
    rule_name: code,
    result_kind: "LENGTH",
    result_uom: "Mét",
    source_field: "PB_RAY_RONG",
    source_field_offset: 0,
    source_field_2: "PB_CAO",
    source_field_2_offset: 0,
    operator: "COPY",
    operand: 0,
    multiply: 1,
    divide: 1,
    final_add: 0,
    qty_per_set: 1,
    version: 1,
    disabled: 0,
    authority_type: "SOURCE",
    applicability: [],
    ...patch,
  };
}

test("Trục 114 owner rule resolves Rộng PB ray + 2cm", () => {
  const current = rule("BR-TRUC114-2CM", {
    operator: "ADD",
    operand: 0.02,
    authority_type: "OWNER_CONFIRMED",
    source_formula_text: "RPBRAY+20CM",
  });
  const result = evaluateBomRuleMaster(current, { PB_RAY_RONG: 3 });
  assert.equal(result.result_per_piece, 3.02);
  assert.equal(result.consumption_qty, 3.02);
  assert.equal(result.formula_display, "PB_RAY_RONG + 0,02");
  assert.match(result.formula_snapshot, /RPBRAY\+20CM/);
});

test("shared V4 formula calculates two lengths after 3cm deduction", () => {
  const current = rule("BR-V4-2X", {
    operator: "SUBTRACT",
    operand: 0.03,
    multiply: 2,
  });
  const result = evaluateBomRuleMaster(current, { PB_RAY_RONG: 3 });
  assert.equal(result.result_per_piece, 5.94);
  assert.equal(result.consumption_qty, 5.94);
});

test("count density width x7 returns 21 pieces", () => {
  const current = rule("BR-WIDTH-X7", {
    result_kind: "COUNT",
    result_uom: "Cái",
    operator: "MULTIPLY",
    operand: 7,
  });
  const result = evaluateBomRuleMaster(current, { PB_RAY_RONG: 3 });
  assert.equal(result.result_per_piece, 21);
  assert.equal(result.consumption_qty, 21);
});

test("area density x40 returns 240 pieces", () => {
  const current = rule("BR-AREA-X40", {
    result_kind: "COUNT",
    result_uom: "Cái",
    source_field: "billable_area_sqm",
    operator: "MULTIPLY",
    operand: 40,
  });
  const result = evaluateBomRuleMaster(current, { billable_area_sqm: 6 });
  assert.equal(result.result_per_piece, 240);
});

test("set_count remains separate from per-piece geometry", () => {
  const current = rule("BR-TRUC114-2CM", { operator: "ADD", operand: 0.02, qty_per_set: 1 });
  const result = evaluateBomRuleMaster(current, { PB_RAY_RONG: 3 }, { set_count: 2 });
  assert.equal(result.result_per_piece, 3.02);
  assert.equal(result.consumption_qty, 6.04);
  assert.equal(Number((result.consumption_qty * 4.4).toFixed(6)), 26.576);
});

test("PRODUCT supports two parent geometry fields", () => {
  const current = rule("BR-AREA-PRODUCT", {
    result_kind: "AREA",
    result_uom: "m2",
    operator: "PRODUCT",
    source_field: "PB_RAY_RONG",
    source_field_offset: -0.03,
    source_field_2: "PB_CAO",
  });
  const result = evaluateBomRuleMaster(current, { PB_RAY_RONG: 3, PB_CAO: 2 });
  assert.equal(result.result_per_piece, 5.94);
  assert.equal(result.formula_display, "PB_RAY_RONG - 0,03 × PB_CAO");
});

test("QUOTIENT supports two parent geometry fields", () => {
  const current = rule("BR-RATIO", {
    operator: "QUOTIENT",
    source_field: "PB_RAY_RONG",
    source_field_2: "PB_CAO",
  });
  const result = evaluateBomRuleMaster(current, { PB_RAY_RONG: 3, PB_CAO: 2 });
  assert.equal(result.result_per_piece, 1.5);
});

test("one reusable rule can serve three parent Items", () => {
  const shared = rule("BR-SHARED", {
    operator: "SUBTRACT",
    operand: 0.03,
    applicability: [
      { scope_type: "ITEM", parent_item: "DOOR-6D", component_item: "V4", priority: 100 },
      { scope_type: "ITEM", parent_item: "DOOR-8D", component_item: "V4", priority: 100 },
      { scope_type: "ITEM", parent_item: "DOOR-1LY", component_item: "V4", priority: 100 },
    ],
  });
  for (const parent of ["DOOR-6D", "DOOR-8D", "DOOR-1LY"]) {
    assert.equal(resolveBomRuleMaster([shared], { parent_item: parent, component_item: "V4" })?.rule_code, "BR-SHARED");
  }
});

test("a rule without applicability is not accidentally global", () => {
  assert.equal(resolveBomRuleMaster([rule("UNWIRED")], { parent_item: "DOOR", component_item: "V4" }), null);
});

test("BOM scope wins over Item scope", () => {
  const byItem = rule("ITEM", { applicability: [{ scope_type: "ITEM", parent_item: "DOOR", component_item: "V4", priority: 100 }] });
  const byBom = rule("BOM", { applicability: [{ scope_type: "BOM", bom: "BOM-001", component_item: "V4", priority: 0 }] });
  assert.equal(resolveBomRuleMaster([byItem, byBom], { bom: "BOM-001", parent_item: "DOOR", component_item: "V4" })?.rule_code, "BOM");
});

test("same scope and priority conflict fails closed even if versions differ", () => {
  const a = rule("A", { version: 1, applicability: [{ scope_type: "ITEM", parent_item: "DOOR", component_item: "V4", priority: 100 }] });
  const b = rule("B", { version: 2, applicability: [{ scope_type: "ITEM", parent_item: "DOOR", component_item: "V4", priority: 100 }] });
  assert.throws(() => resolveBomRuleMaster([a, b], { parent_item: "DOOR", component_item: "V4" }), /Quy tắc BOM cùng mức.*Hệ thống không tự đoán/i);
});

test("formula display remains readable and not raw JSON", () => {
  assert.equal(bomRuleFormulaDisplay(rule("DISPLAY", { operator: "SUBTRACT", operand: 0.05, multiply: 2 })), "(PB_RAY_RONG - 0,05) × 2");
});
