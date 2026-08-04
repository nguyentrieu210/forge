import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUomConversion,
  purchaseAllocationQtyMicros,
  stockQtyMicros,
} from "../dist/packages/clouderp-core/src/index.js";

function uomContext(master) {
  return {
    command: { tenant_id: "demo" },
    reader: {
      async getMasterRecordData(_tenantId, doctype, name) {
        assert.equal(doctype, "Item");
        assert.equal(name, "PACKED-ITEM");
        return master;
      },
    },
  };
}

test("purchase allocation quantity can use a declarative physical measure without changing stock quantity", () => {
  const line = {
    item_code: "STEEL-COIL-PACK",
    qty: "120",
    stock_qty_micros: 120_000_000,
    pallet_count: "3",
    purchase_allocation_qty_field: "pallet_count",
    purchase_allocation_uom: "Pallet",
  };

  assert.equal(stockQtyMicros(line), 120_000_000);
  assert.equal(purchaseAllocationQtyMicros(line), 3_000_000);
});

test("purchase allocation falls back to canonical stock quantity when no separate axis is declared", () => {
  const line = {
    item_code: "NORMAL-ITEM",
    qty: "12",
    stock_qty_micros: 12_000_000,
  };

  assert.equal(purchaseAllocationQtyMicros(line), 12_000_000);
});

test("purchase normalization can snapshot an exact observed stock quantity instead of rounded conversion output", async () => {
  const clientLine = {
    item_code: "PACKED-ITEM",
    qty: "644.184",
    uom: "Kg",
    piece_count: "230",
    conversion_factor: "0.357041",
    purchase_stock_qty_field: "qty",
  };
  const [normalized] = await applyUomConversion(
    uomContext({
      stock_uom: "Cây",
      default_purchase_uom: "Kg",
      purchase_stock_qty_field: "piece_count",
    }),
    [clientLine],
    { transactionKind: "purchase" },
  );

  assert.equal(normalized.purchase_stock_qty_field, "piece_count");
  assert.equal(normalized.stock_qty, "230");
  assert.equal(stockQtyMicros(normalized), 230_000_000);
  assert.equal(purchaseAllocationQtyMicros(normalized), 230_000_000);
});

test("purchase normalization overwrites client quantity-axis claims from Item master", async () => {
  const clientLine = {
    item_code: "PACKED-ITEM",
    qty: "10",
    uom: "Kg",
    package_count: "2",
    purchase_stock_qty_field: "package_count",
    purchase_allocation_qty_field: "qty",
    purchase_allocation_uom: "Kg",
  };

  const [withoutAxis] = await applyUomConversion(
    uomContext({ stock_uom: "Kg", default_purchase_uom: "Kg" }),
    [clientLine],
    { transactionKind: "purchase" },
  );
  assert.equal(withoutAxis.purchase_stock_qty_field, undefined);
  assert.equal(withoutAxis.purchase_allocation_qty_field, undefined);
  assert.equal(withoutAxis.purchase_allocation_uom, undefined);
  assert.equal(purchaseAllocationQtyMicros(withoutAxis), 10_000_000);

  const [withAxis] = await applyUomConversion(
    uomContext({
      stock_uom: "Kg",
      default_purchase_uom: "Kg",
      purchase_allocation_qty_field: "package_count",
      purchase_allocation_uom: "Case",
    }),
    [clientLine],
    { transactionKind: "purchase" },
  );
  assert.equal(withAxis.purchase_stock_qty_field, undefined);
  assert.equal(withAxis.purchase_allocation_qty_field, "package_count");
  assert.equal(withAxis.purchase_allocation_uom, "Case");
  assert.equal(stockQtyMicros(withAxis), 10_000_000);
  assert.equal(purchaseAllocationQtyMicros(withAxis), 2_000_000);
});

test("declared quantity axes fail closed on incomplete, invalid or inconsistent metadata", async () => {
  assert.throws(
    () => purchaseAllocationQtyMicros({
      item_code: "PACKED-1", qty: "10", pack_count: 2,
      purchase_allocation_qty_field: "pack_count",
    }),
    /thiếu đơn vị/i,
  );
  assert.throws(
    () => purchaseAllocationQtyMicros({
      item_code: "PACKED-2", qty: "10", "pack.count": 2,
      purchase_allocation_qty_field: "pack.count", purchase_allocation_uom: "Pack",
    }),
    /khai trường không hợp lệ/i,
  );
  assert.throws(
    () => purchaseAllocationQtyMicros({
      item_code: "PACKED-3", qty: "10", pack_count: 0,
      purchase_allocation_qty_field: "pack_count", purchase_allocation_uom: "Pack",
    }),
    /phải lớn hơn 0/i,
  );
  await assert.rejects(
    applyUomConversion(
      uomContext({
        stock_uom: "Kg",
        default_purchase_uom: "Kg",
        purchase_allocation_qty_field: "package_count",
      }),
      [{ item_code: "PACKED-ITEM", qty: "10", uom: "Kg", package_count: "2" }],
      { transactionKind: "purchase" },
    ),
    /phải được khai cùng nhau/i,
  );
  await assert.rejects(
    applyUomConversion(
      uomContext({
        stock_uom: "Cây",
        default_purchase_uom: "Kg",
        purchase_stock_qty_field: "piece_count",
      }),
      [{
        item_code: "PACKED-ITEM", qty: "100", uom: "Kg", piece_count: "10", conversion_factor: "0.2",
      }],
      { transactionKind: "purchase" },
    ),
    /hệ số quy đổi không khớp/i,
  );
});
