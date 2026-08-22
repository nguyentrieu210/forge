import assert from "node:assert/strict";
import test from "node:test";

import { evaluateBomProjection } from "../scripts/lib/alumdoor-import-gate-bom.mjs";

test("BOM gate counts unresolved authority once and does not reject mapped runtime formulas", () => {
  const result = evaluateBomProjection({
    expected_component_count: 1279,
    component_reference_count: 1279,
    pending_value_count: 921,
    missing_component_count: 0,
    missing_item_count: 0,
    mutation_blocker_count: 0,
  }, {
    component_rows: 1279,
    rows_mapped: 636,
    rows_pending: 643,
  });

  assert.equal(result.structural_blockers, 0);
  assert.equal(result.rule_rows_pending, 643);
  assert.equal(result.source_value_pending, 921);
  assert.equal(result.projection_consistent, true);
});

test("BOM gate becomes green when every fixed and runtime row has an operational rule", () => {
  const result = evaluateBomProjection({
    expected_component_count: 1279,
    component_reference_count: 1279,
    pending_value_count: 278,
    missing_component_count: 0,
    missing_item_count: 0,
    mutation_blocker_count: 0,
  }, {
    component_rows: 1279,
    rows_mapped: 1279,
    rows_pending: 0,
  });

  assert.equal(result.structural_blockers, 0);
  assert.equal(result.rule_rows_pending, 0);
  assert.equal(result.projection_consistent, true);
});

test("BOM gate fails closed for incomplete or missing projection artifacts", () => {
  const mismatched = evaluateBomProjection({
    expected_component_count: 10,
    component_reference_count: 9,
    missing_component_count: 1,
    missing_item_count: 0,
    mutation_blocker_count: 1,
  }, { component_rows: 9, rows_mapped: 9, rows_pending: 0 });
  assert.equal(mismatched.projection_consistent, false);
  assert.equal(mismatched.structural_blockers, 3);

  const missing = evaluateBomProjection(null, null);
  assert.equal(missing.projection_consistent, false);
  assert.ok(missing.structural_blockers > 0);
  assert.equal(missing.rule_rows_pending, 1);
});
