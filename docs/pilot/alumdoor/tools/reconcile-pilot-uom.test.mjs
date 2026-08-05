import test from "node:test";
import assert from "node:assert/strict";

import { assertUomPolicy, reconcilePilotQuantity } from "./reconcile-pilot-uom.mjs";

test("locks Pilot-01 UOM scope at 21 reviewed / 19 resolved / 2 blocked", () => {
  assert.equal(assertUomPolicy(), true);
});

test("reconciles ray quantity from structured length and piece count", () => {
  assert.deepEqual(reconcilePilotQuantity({
    source_code: "NVL-TOLE1.2x190-CORON",
    business_context: "sales",
    structured: { length_m: "3.5", piece_qty: "4" },
  }), {
    source_item_code: "NVL-TOLE1.2x190-CORON",
    target_item_code: "TP-RS7P (CÓ RON)",
    quantity: "14",
    uom: "Mét",
    evidence_kind: "derived-from-structured-length-piece-fields",
  });
});

test("reconciles trục quantity from structured length and piece count", () => {
  const row = reconcilePilotQuantity({
    source_code: "NVL-TRUC114_2.4LY",
    business_context: "sales",
    structured: { length_m: "6", piece_qty: "4" },
  });
  assert.equal(row.target_item_code, "TP-TRUC140");
  assert.equal(row.quantity, "24");
  assert.equal(row.uom, "Mét");
});

test("context-splits overloaded Đài Loan tôn identity between raw stock Kg and sales m2", () => {
  const stock = reconcilePilotQuantity({
    source_code: "NVL-TON-DL7.2Dx124-XNXLC",
    business_context: "opening_stock",
    source_quantity: "552",
    source_uom: "KG",
  });
  assert.equal(stock.target_item_code, "NVL-TON-DL7.2Dx124-XNXLC");
  assert.equal(stock.quantity, "552");
  assert.equal(stock.uom, "Kg");
  assert.equal(stock.context_split, true);

  const sales = reconcilePilotQuantity({
    source_code: "NVL-TON-DL7.2Dx124-XNXLC",
    business_context: "sales",
    structured: { height_m: "3.5", width_m: "1.91", set_qty: "3", source_area_m2: "20.055" },
  });
  assert.equal(sales.target_item_code, "TP-TOLEKEM124_6D");
  assert.equal(sales.quantity, "20.055");
  assert.equal(sales.uom, "m2");
  assert.equal(sales.context_split, true);
});

test("derives commercial m2 only from structured fields when source area is absent", () => {
  const result = reconcilePilotQuantity({
    source_code: "NVL-TOLE0.42x598-TR-XLC",
    business_context: "sales",
    structured: { height_m: "3.2", width_m: "2.89", set_qty: "1" },
  });
  assert.equal(result.target_item_code, "TP-UC KT 4.6D");
  assert.equal(result.quantity, "9.248");
  assert.equal(result.uom, "m2");
  assert.equal(result.evidence_kind, "derived-from-structured-dimensions");
});

test("preserves direct source stock quantity and canonical unit", () => {
  const result = reconcilePilotQuantity({
    source_code: "TẨY NHÔM",
    business_context: "purchase",
    source_quantity: "25.5",
    source_uom: "KG",
  });
  assert.equal(result.quantity, "25.5");
  assert.equal(result.uom, "Kg");
});

test("services remain non-stock and never acquire stock_uom", () => {
  const result = reconcilePilotQuantity({
    source_code: "PHUTHU-UC<7m²",
    business_context: "sales",
    source_quantity: "2",
  });
  assert.equal(result.uom, "Bộ");
  assert.equal(result.stock_uom, null);
  assert.equal(result.evidence_kind, "service-non-stock");
});

test("fails closed for missing structured ray quantity fields", () => {
  assert.throws(() => reconcilePilotQuantity({
    source_code: "NVL-TOLE1.2x190-CORON",
    business_context: "sales",
    structured: {},
  }), /length_m/);
});

test("fails closed for source-authority conflicts on VIS stock unit", () => {
  assert.throws(() => reconcilePilotQuantity({
    source_code: "NVL-VIS-BANLO2P",
    business_context: "sales",
    source_quantity: "1",
    source_uom: "KG",
  }), /conversion is not proven/);
});

test("fails closed for the two unresolved stock UOM identities", () => {
  assert.throws(() => reconcilePilotQuantity({
    source_code: "NVL-AL595-GS",
    business_context: "opening_stock",
    source_quantity: "504",
  }), /UOM_BLOCKED/);
  assert.throws(() => reconcilePilotQuantity({
    source_code: "NVL-BO1VIS AL71",
    business_context: "purchase",
    source_quantity: "159",
  }), /UOM_BLOCKED/);
});

test("fails closed when an overloaded identity has no business context", () => {
  assert.throws(() => reconcilePilotQuantity({
    source_code: "NVL-TON-DL7.2Dx124-XNXLC",
    source_quantity: "552",
  }), /business_context/);
});
