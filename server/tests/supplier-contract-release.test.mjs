import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePurchaseOrderSupplierContract,
} from "../dist/packages/clouderp-core/src/index.js";

function contract(overrides = {}) {
  return {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    contract_reference: "CONTRACT-1",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    maximum_qty: "100",
    maximum_qty_micros: 100_000_000,
    maximum_value: "1000.00",
    maximum_value_minor: 100_000,
    quantity_uom: "Kg",
    ...overrides,
  };
}

function po(name, qty, totalMinor, options = {}) {
  return {
    tenant_id: "demo",
    doctype: "Purchase Order",
    name,
    owner: "buyer@example.com",
    docstatus: options.docstatus ?? 1,
    status: options.docstatus === 2 ? "Cancelled" : "To Receive and Bill",
    version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    modified_at: "2026-08-01T00:00:00.000Z",
    children: [],
    data: {
      supplier: options.supplier ?? "SUP-A",
      company: options.company ?? "ACME",
      currency: options.currency ?? "USD",
      transaction_date: options.date ?? "2026-08-03",
      supplier_contract: options.contract ?? "CONTRACT-1",
      grand_total_minor: totalMinor,
      items: [{
        row_id: "ROW-1",
        item_code: "ITEM-A",
        qty,
        qty_micros: Math.round(qty * 1_000_000),
        uom: options.uom ?? "Kg",
        rate: 5,
      }],
    },
  };
}

test("supplier contract release sums submitted prior POs and returns remaining ceilings", () => {
  const current = po("PO-3", 20, 20_000);
  const result = evaluatePurchaseOrderSupplierContract(
    "PO-3",
    current.data,
    "CONTRACT-1",
    contract(),
    [po("PO-1", 30, 25_000), po("PO-2", 40, 30_000), current],
  );
  assert.equal(result.released_qty_before_micros, 70_000_000);
  assert.equal(result.released_qty_after_micros, 90_000_000);
  assert.equal(result.remaining_qty_micros, 10_000_000);
  assert.equal(result.released_value_before_minor, 55_000);
  assert.equal(result.released_value_after_minor, 75_000);
  assert.equal(result.remaining_value_minor, 25_000);
});

test("cancelled prior PO does not consume supplier contract ceiling", () => {
  const current = po("PO-2", 60, 50_000);
  const result = evaluatePurchaseOrderSupplierContract(
    "PO-2",
    current.data,
    "CONTRACT-1",
    contract(),
    [po("PO-CANCEL", 80, 80_000, { docstatus: 2 }), current],
  );
  assert.equal(result.released_qty_before_micros, 0);
  assert.equal(result.released_value_before_minor, 0);
});

test("supplier contract release rejects cumulative quantity or value overflow", () => {
  const current = po("PO-2", 30, 40_000);
  assert.throws(
    () => evaluatePurchaseOrderSupplierContract(
      "PO-2",
      current.data,
      "CONTRACT-1",
      contract(),
      [po("PO-1", 80, 30_000), current],
    ),
    /quantity ceiling/,
  );
  assert.throws(
    () => evaluatePurchaseOrderSupplierContract(
      "PO-2",
      current.data,
      "CONTRACT-1",
      contract({ maximum_qty_micros: 1_000_000_000 }),
      [po("PO-1", 10, 70_000), current],
    ),
    /value ceiling/,
  );
});

test("quantity ceiling refuses mixed or wrong UOM", () => {
  const current = po("PO-UOM", 10, 10_000, { uom: "Cái" });
  assert.throws(
    () => evaluatePurchaseOrderSupplierContract(
      "PO-UOM",
      current.data,
      "CONTRACT-1",
      contract(),
      [current],
    ),
    /must use contract UOM Kg/,
  );
});

test("supplier contract release rejects wrong commercial context or date", () => {
  const wrongSupplier = po("PO-WRONG", 10, 10_000, { supplier: "SUP-B" });
  assert.throws(
    () => evaluatePurchaseOrderSupplierContract(
      "PO-WRONG",
      wrongSupplier.data,
      "CONTRACT-1",
      contract(),
      [wrongSupplier],
    ),
    /does not match Supplier Contract/,
  );
  const expired = po("PO-LATE", 10, 10_000, { date: "2027-01-01" });
  assert.throws(
    () => evaluatePurchaseOrderSupplierContract(
      "PO-LATE",
      expired.data,
      "CONTRACT-1",
      contract(),
      [expired],
    ),
    /outside Supplier Contract/,
  );
});
