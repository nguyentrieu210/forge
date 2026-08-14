import test from "node:test";
import assert from "node:assert/strict";

import { isCanonicalProductionObligationRow } from "../dist/apps-src/alumdoor-worker/src/sales-production-core.js";

test("SELECTABLE package children are commercial-only production projections", () => {
  const parent = { item_code: "DOOR-FULL", sales_mode: "Tách món", sales_package_group_key: "PKG-ROW-1" };
  const selectedChildren = [
    { item_code: "MOTOR", sales_package_parent_key: "PKG-ROW-1", sales_package_component_key: "motor" },
    { item_code: "SLAT", sales_package_parent_key: "PKG-ROW-1", sales_package_component_key: "slat" },
  ];
  assert.deepEqual([parent, ...selectedChildren].filter(isCanonicalProductionObligationRow), [parent]);
});

test("legacy direct split rows remain valid physical production sources", () => {
  assert.equal(isCanonicalProductionObligationRow({ item_code: "DOOR", sales_mode: "Tách món" }), true);
});
