import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveExactSourceBomQuantity,
  resolveExactSourceBomUomOverride,
} from "../scripts/lib/alumdoor-exact-source-bom-quantity.mjs";

const v4Tole75Cases = [
  [1115, "((RỘNG PBRAY - 30)x2) 1,312KG/M", 2],
  [1179, "(RỘNG PBRAY - 3cm) 1,312KG/M", 1],
  [1188, "(RỘNG PBRAY - 30) 1,312KG/M", 1],
  [1264, "(rpbray-30)x2xTL", 2],
];

function record(sourceRow, sourceFormulaText, overrides = {}) {
  return {
    source_row: sourceRow,
    source_sheet: "ĐM",
    source_uom: "KG",
    source_qty_or_formula: "1.312",
    source_formula_text: sourceFormulaText,
    ...overrides,
  };
}

test("exact V4 TOLE75 weight annotations resolve as meter geometry without a guessed kg-to-m conversion", () => {
  for (const [sourceRow, sourceFormulaText, multiply] of v4Tole75Cases) {
    const source = record(sourceRow, sourceFormulaText);
    const uom = resolveExactSourceBomUomOverride(source, "NVL-V4-KEM_TOLE75_STD");
    assert.deepEqual(uom, {
      runtime_uom: "Mét",
      reason: `exact_source_row_${sourceRow}_uom_anomaly`,
    });

    const quantity = resolveExactSourceBomQuantity(
      source,
      { runtime_uom: "Mét" },
      "NVL-V4-KEM_TOLE75_STD",
    );
    assert.equal(quantity?.status, "runtime_formula");
    const formula = JSON.parse(quantity.quantity_formula_json);
    assert.deepEqual(formula.base, {
      kind: "FIELD",
      field: "PB_RAY_RONG",
      offset: -0.03,
    });
    assert.equal(formula.multiply ?? 1, multiply);
  }
});

test("mesh-hook row 1108 uses source-backed width weight semantics instead of fixed 64 kg", () => {
  const source = {
    source_row: 1108,
    source_sheet: "ĐM",
    source_uom: "m2",
    source_qty_or_formula: "64.0",
    source_formula_text: "64con/M (1KG X 49 CONx16,000/KG)",
  };
  assert.deepEqual(resolveExactSourceBomUomOverride(source, "NVL-BOMV"), {
    runtime_uom: "Kg",
    reason: "exact_source_row_1108_uom_anomaly",
  });
  const quantity = resolveExactSourceBomQuantity(source, { runtime_uom: "Kg" }, "NVL-BOMV");
  assert.equal(quantity?.status, "runtime_formula");
  assert.equal(quantity?.formula_kind, "source_row_exact_mv_hook_weight_per_width_cross_evidence_1150");
  assert.deepEqual(JSON.parse(quantity.quantity_formula_json), {
    base: { kind: "FIELD", field: "PB_RAY_RONG" },
    multiply: 64 / 49,
  });
});

test("exact V4 profile UOM overrides fail closed when source evidence changes", () => {
  const source = record(1294, "(rpbray-30)x2xTL");
  assert.equal(
    resolveExactSourceBomUomOverride(
      { ...source, source_qty_or_formula: "1.313" },
      "NVL-V4_KEM_STD",
    ),
    null,
  );
  assert.equal(
    resolveExactSourceBomUomOverride(
      { ...source, source_formula_text: "(rpbray-50)x2xTL" },
      "NVL-V4_KEM_STD",
    ),
    null,
  );
  assert.equal(
    resolveExactSourceBomUomOverride(source, "NVL-V4-KEM_TOLE75_STD"),
    null,
  );
});
