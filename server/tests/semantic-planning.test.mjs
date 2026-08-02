import test from "node:test";
import assert from "node:assert/strict";
import { PlanningMetricRegistry, ScenarioPlanningEngine } from "../dist/packages/semantic/src/planning.js";

const engine = new ScenarioPlanningEngine(new PlanningMetricRegistry([
  { id: "revenue_minor", label: "Revenue", value: { kind: "currency", scale: 100, exact: true, currencyDimension: "currency" } },
  { id: "units", label: "Units", value: { kind: "quantity", scale: 1, exact: true, unit: "unit" } },
  { id: "conversion", label: "Conversion", value: { kind: "percent", exact: false } },
]));

const baseline = [
  { metric: "revenue_minor", dimensions: { period: "2026-08", branch: "HCM", currency: "VND" }, value: 10_001 },
  { metric: "revenue_minor", dimensions: { period: "2026-08", branch: "HN", currency: "VND" }, value: 20_000 },
  { metric: "units", dimensions: { period: "2026-08", branch: "HCM" }, value: 10 },
  { metric: "conversion", dimensions: { period: "2026-08", branch: "HCM" }, value: 0.25 },
];

test("exact basis-point planning requires explicit rounding and never mutates baseline", () => {
  const source = structuredClone(baseline);
  const projected = engine.project(source, {
    id: "growth_case",
    label: "Growth case",
    baselineVersion: "ledger-freeze-42",
    adjustments: [
      {
        id: "hcm_revenue_plus_1pct",
        metric: "revenue_minor",
        selector: { branch: "HCM" },
        operation: "basis_points",
        value: 100,
        rounding: "half_away_from_zero",
        reason: "Commercial plan approved by finance",
      },
    ],
  });
  assert.equal(source[0].value, 10_001);
  assert.equal(projected.cells.find((cell) => cell.metric === "revenue_minor" && cell.dimensions.branch === "HCM").value, 10_101);
  assert.equal(projected.cells.find((cell) => cell.metric === "revenue_minor" && cell.dimensions.branch === "HN").value, 20_000);
  assert.deepEqual(projected.audit[0], {
    adjustmentId: "hcm_revenue_plus_1pct",
    metric: "revenue_minor",
    cellKey: 'revenue_minor|branch="HCM"|currency="VND"|period="2026-08"',
    operation: "basis_points",
    before: 10_001,
    after: 10_101,
    operand: 100,
    rounding: "half_away_from_zero",
    reason: "Commercial plan approved by finance",
  });
});

test("negative exact basis points use declared rounding semantics", () => {
  const floor = engine.project([{ metric: "units", dimensions: { period: "2026-08" }, value: 3 }], {
    id: "downside_floor", label: "Downside floor", baselineVersion: "v1",
    adjustments: [{ id: "cut", metric: "units", operation: "basis_points", value: -5000, rounding: "floor" }],
  });
  const halfAway = engine.project([{ metric: "units", dimensions: { period: "2026-08" }, value: 3 }], {
    id: "downside_half", label: "Downside half", baselineVersion: "v1",
    adjustments: [{ id: "cut", metric: "units", operation: "basis_points", value: -5000, rounding: "half_away_from_zero" }],
  });
  assert.equal(floor.cells[0].value, 1);
  assert.equal(halfAway.cells[0].value, 2);
});

test("non-exact scenario math may retain fractional values", () => {
  const projected = engine.project([{ metric: "conversion", dimensions: { period: "2026-08" }, value: 0.25 }], {
    id: "conversion_upside", label: "Conversion upside", baselineVersion: "v1",
    adjustments: [{ id: "lift", metric: "conversion", operation: "basis_points", value: 1000 }],
  });
  assert.equal(projected.cells[0].value, 0.275);
});

test("scenario projection refuses ambiguous or unsafe inputs", () => {
  assert.throws(() => engine.project(baseline, {
    id: "missing_rounding", label: "Missing rounding", baselineVersion: "v1",
    adjustments: [{ id: "bad", metric: "revenue_minor", operation: "basis_points", value: 100 }],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => engine.project(baseline, {
    id: "missing_cell", label: "Missing cell", baselineVersion: "v1",
    adjustments: [{ id: "bad", metric: "units", selector: { branch: "DN" }, operation: "delta", value: 1 }],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => engine.project([
    { metric: "units", dimensions: { period: "2026-08" }, value: 1 },
    { metric: "units", dimensions: { period: "2026-08" }, value: 2 },
  ], { id: "duplicate", label: "Duplicate", baselineVersion: "v1", adjustments: [] }), (error) => error.code === "VALIDATION_ERROR");
});
