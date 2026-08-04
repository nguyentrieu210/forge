import test from "node:test";
import assert from "node:assert/strict";
import {
  purchaseAllocationQtyMicros,
  stockQtyMicros,
} from "../dist/packages/clouderp-core/src/index.js";

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

test("declared allocation axis fails closed on missing unit, invalid field or non-positive quantity", () => {
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
    /trường số lượng phân bổ mua không hợp lệ/i,
  );
  assert.throws(
    () => purchaseAllocationQtyMicros({
      item_code: "PACKED-3", qty: "10", pack_count: 0,
      purchase_allocation_qty_field: "pack_count", purchase_allocation_uom: "Pack",
    }),
    /phải lớn hơn 0/i,
  );
});
