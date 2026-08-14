import test from "node:test";
import assert from "node:assert/strict";
import { allocateParentResidual } from "../dist/packages/clouderp-selling/src/sales-package-split-pricing.js";

const snapshot = {
  sales_package: "PKG-SPLIT:DOOR-FULL",
  sales_package_checksum: "test",
  selection_mode: "SELECTABLE",
  components: [{
    component_key: "LEAF",
    item_code: "DOOR-LEAF",
    uom: "m2",
    qty_basis: "AREA",
    factor: "1",
    factor_micros: 1_000_000,
    qty: "2",
    qty_micros: 2_000_000,
    required: false,
    default_selected: false,
    deduct_from_parent: true,
    deduct_from_discount_basis: true,
    inherit_color: true,
    inherit_dimensions: true,
    inherit_set_count: true,
  }],
};

test("selectable package child reduces parent gross and discount basis", () => {
  const parent = {
    row_id: "PARENT",
    item_code: "DOOR-FULL",
    qty: 10,
    qty_micros: 10_000_000,
    priced_qty_micros: 10_000_000,
    rate: 100,
    rate_minor: 100,
    discount_percentage: "10",
    discount_basis_amount: "800",
    discount_basis_amount_minor: 800,
    discount_amount: "80",
    discount_amount_minor: 80,
    adjustment_amount: "0",
    adjustment_amount_minor: 0,
  };
  const child = {
    row_id: "CHILD",
    item_code: "DOOR-LEAF",
    qty: 2,
    qty_micros: 2_000_000,
    priced_qty_micros: 2_000_000,
    rate: 100,
    rate_minor: 100,
    sales_package_parent_key: "GROUP-1",
    sales_package_component_key: "LEAF",
  };

  const result = allocateParentResidual(parent, [child], snapshot, 0);
  assert.equal(result.sales_package_full_set_amount_minor, 1_000);
  assert.equal(result.sales_package_component_deduction_minor, 200);
  assert.equal(result.rate_minor, 80);
  assert.equal(result.amount_minor, 800);
  assert.equal(result.discount_basis_amount_minor, 600);
  assert.equal(result.discount_amount_minor, 60);
  assert.equal(result.net_amount_minor, 740);
});

test("component outside discount basis only reduces the parent gross", () => {
  const parent = {
    row_id: "PARENT",
    item_code: "DOOR-FULL",
    qty: 1,
    qty_micros: 1_000_000,
    priced_qty_micros: 1_000_000,
    rate: 1_000,
    rate_minor: 1_000,
    discount_percentage: "10",
    discount_basis_amount: "800",
    discount_basis_amount_minor: 800,
    discount_amount: "80",
    discount_amount_minor: 80,
    adjustment_amount_minor: 0,
  };
  const child = {
    row_id: "CHILD",
    item_code: "DOOR-LEAF",
    qty: 2,
    qty_micros: 2_000_000,
    priced_qty_micros: 2_000_000,
    rate: 100,
    rate_minor: 100,
    sales_package_parent_key: "GROUP-1",
    sales_package_component_key: "LEAF",
  };
  const outsideBasis = {
    ...snapshot,
    components: [{ ...snapshot.components[0], deduct_from_discount_basis: false }],
  };

  const result = allocateParentResidual(parent, [child], outsideBasis, 0);
  assert.equal(result.amount_minor, 800);
  assert.equal(result.discount_basis_amount_minor, 800);
  assert.equal(result.discount_amount_minor, 80);
  assert.equal(result.net_amount_minor, 720);
});
