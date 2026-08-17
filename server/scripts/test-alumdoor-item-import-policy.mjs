#!/usr/bin/env node
import { assertCanonicalItemPayload } from "./lib/alumdoor-item-import-policy.mjs";

const shouldPass = [
  {
    item_code: "TP-DEMO",
    item_group: "Cửa CN Đức",
    is_stock_item: true,
    is_purchase_item: false,
    stock_uom: "m2",
    default_sales_uom: "m2",
  },
  {
    item_code: "AL-DEMO",
    item_group: "Nan/lá cửa",
    is_stock_item: true,
    is_purchase_item: true,
    stock_uom: "Cây",
    default_purchase_uom: "Kg",
    default_sales_uom: "Mét",
    has_catch_weight: true,
    weight_uom: "Kg",
  },
];
for (const payload of shouldPass) assertCanonicalItemPayload(payload);

const shouldFail = [
  [{ item_code: "BAD-RATE", item_group: "Phụ kiện chung", is_stock_item: true, is_purchase_item: true, stock_uom: "KG/M", default_purchase_uom: "KG/M", default_sales_uom: "Mét" }, "tỷ lệ/định mức BOM"],
  [{ item_code: "BAD-GROUP", item_group: "Cửa cuốn", is_stock_item: true, is_purchase_item: false, stock_uom: "m2", default_sales_uom: "m2" }, "không thuộc Layer 0 canonical"],
  [{ item_code: "BAD-CONV", item_group: "Ray và trục", is_stock_item: true, is_purchase_item: true, stock_uom: "Cây", default_purchase_uom: "Kg", default_sales_uom: "Mét" }, "không có catch-weight hoặc conversion"],
];

for (const [payload, expected] of shouldFail) {
  let caught = null;
  try {
    assertCanonicalItemPayload(payload);
  } catch (error) {
    caught = error;
  }
  if (!caught) throw new Error(`${payload.item_code}: đáng lẽ phải bị chặn`);
  if (!String(caught.message).includes(expected)) throw caught;
}

console.log("ALUMDOOR_ITEM_IMPORT_POLICY_PASS");
