import assert from "node:assert/strict";
import test from "node:test";

import { enrichSalesBomPreviewWithRules } from "../dist/apps-src/alumdoor-worker/src/bom-rule-sales-preview.js";

function json(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function platform({ rules, items }) {
  return async (path) => {
    if (path.startsWith("resource/BOM%20Rule?")) {
      return json(rules.map((rule) => ({ name: rule.name })));
    }
    if (path.startsWith("resource/BOM%20Rule/")) {
      const name = decodeURIComponent(path.slice("resource/BOM%20Rule/".length));
      const rule = rules.find((entry) => entry.name === name);
      return rule ? json(rule) : json(null, 404);
    }
    if (path.startsWith("resource/Item/")) {
      const code = decodeURIComponent(path.slice("resource/Item/".length));
      const item = items[code];
      return item ? json(item) : json(null, 404);
    }
    throw new Error(`Unexpected path ${path}`);
  };
}

const shaftRule = {
  name: "BR-TRUC114-2CM",
  rule_code: "BR-TRUC114-2CM",
  rule_name: "Trục 114 = Rộng PB ray + 2cm",
  result_kind: "LENGTH",
  result_uom: "Mét",
  formula_json: JSON.stringify({ base: { kind: "FIELD", field: "PB_RAY_RONG", offset: 0.02 } }),
  formula_display: "PB_RAY_RONG + 0,02",
  qty_per_set: 1,
  version: 1,
  disabled: 0,
  authority_type: "OWNER_CONFIRMED",
  source_formula_text: "RPBRAY+20CM",
  applicability: [{ scope_type: "ITEM", parent_item: "DOOR-DL", component_item: "NVL-TR114-1.8", priority: 100 }],
};

test("Sales preview applies component geometry, set count and Item UOM conversion separately", async () => {
  const call = platform({
    rules: [shaftRule],
    items: {
      "NVL-TR114-1.8": {
        item_code: "NVL-TR114-1.8",
        stock_uom: "Kg",
        uom_conversions: [{ uom: "Mét", conversion_factor: 4.4 }],
      },
    },
  });
  const result = await enrichSalesBomPreviewWithRules(call, {
    item_code: "DOOR-DL",
    width_m: 3,
    height_m: 2,
    billable_area_sqm: 12,
    set_count: 2,
  }, {
    bom_applicable: true,
    bom_no: "BOM-DL",
    components: [{ item_code: "NVL-TR114-1.8", width_m: 3, height_m: 2, set_count: 2 }],
  });

  assert.equal(result.bom_rule_status, "APPLIED");
  const component = result.components[0];
  assert.equal(component.result_per_piece, 3.02);
  assert.equal(component.qty_per_set, 1);
  assert.equal(component.parent_set_count, 2);
  assert.equal(component.consumption_qty, 6.04);
  assert.equal(component.consumption_uom, "Mét");
  assert.equal(component.stock_qty, 26.576);
  assert.equal(component.stock_uom, "Kg");
  assert.equal(component.length_m, 3.02);
  assert.equal(component.width_m, undefined);
  assert.match(component.note, /Rộng PB ray|PB_RAY_RONG|3,02|6,04/);
});

test("Sales area rules use per-set area then multiply set_count once", async () => {
  const areaRule = {
    ...shaftRule,
    name: "BR-AREA-40",
    rule_code: "BR-AREA-40",
    rule_name: "40 cái / m²",
    result_kind: "COUNT",
    result_uom: "Cái",
    formula_json: JSON.stringify({ base: { kind: "FIELD", field: "billable_area_sqm" }, multiply: 40 }),
    applicability: [{ scope_type: "ITEM", parent_item: "DOOR-DL", component_item: "FASTENER", priority: 100 }],
  };
  const call = platform({
    rules: [areaRule],
    items: { FASTENER: { item_code: "FASTENER", stock_uom: "Cái", uom_conversions: [] } },
  });
  const result = await enrichSalesBomPreviewWithRules(call, {
    item_code: "DOOR-DL",
    width_m: 3,
    height_m: 2,
    billable_area_sqm: 12,
    set_count: 2,
  }, { components: [{ item_code: "FASTENER" }] });
  const component = result.components[0];
  assert.equal(component.result_per_piece, 240);
  assert.equal(component.consumption_qty, 480);
  assert.equal(component.stock_qty, 480);
});

test("Sales preview creates a missing BOM row only when its variant and area rule match", async () => {
  const giftRule = {
    ...shaftRule,
    name: "BR-GIFT-RAIL",
    rule_code: "BR-GIFT-RAIL",
    rule_name: "Ray tặng trên 8 m²",
    result_kind: "COUNT",
    result_uom: "Bộ",
    formula_json: JSON.stringify({ base: { kind: "CONSTANT", value: 1 } }),
    applicability: [{
      scope_type: "DOOR_TYPE", door_type: "Cửa Đức", component_item: "RAY-GIFT",
      price_variant: "TANG_RAY", min_area_sqm: 8, min_area_operator: "GT", priority: 100,
    }],
  };
  const call = platform({
    rules: [giftRule],
    items: { "RAY-GIFT": { item_code: "RAY-GIFT", stock_uom: "Bộ", uom_conversions: [] } },
  });
  const matched = await enrichSalesBomPreviewWithRules(call, {
    item_code: "DOOR-DUC", door_type: "Cửa Đức", price_variant: "TANG_RAY",
    width_m: 4.001, height_m: 2, set_count: 1,
  }, { components: [] });
  assert.equal(matched.components.length, 1);
  assert.equal(matched.components[0].item_code, "RAY-GIFT");
  assert.equal(matched.components[0].auto_generated_by_bom_rule, true);
  assert.equal(matched.components[0].consumption_qty, 1);

  const exactlyEight = await enrichSalesBomPreviewWithRules(call, {
    item_code: "DOOR-DUC", door_type: "Cửa Đức", price_variant: "TANG_RAY",
    width_m: 4, height_m: 2, set_count: 1,
  }, { components: [] });
  assert.deepEqual(exactlyEight.components, [], "GT giữ biên nghiêm ngặt: đúng 8 m² chưa tặng ray");

  const notMatched = await enrichSalesBomPreviewWithRules(call, {
    item_code: "DOOR-DUC", door_type: "Cửa Đức", price_variant: "CHI_LA",
    width_m: 5, height_m: 2, set_count: 1,
  }, { components: [] });
  assert.deepEqual(notMatched.components, []);
});

test("Sales preview never guesses when two BOM Rules tie", async () => {
  const second = { ...shaftRule, name: "BR-OTHER", rule_code: "BR-OTHER" };
  const call = platform({
    rules: [shaftRule, second],
    items: { "NVL-TR114-1.8": { item_code: "NVL-TR114-1.8", stock_uom: "Kg", uom_conversions: [{ uom: "Mét", conversion_factor: 4.4 }] } },
  });
  await assert.rejects(
    () => enrichSalesBomPreviewWithRules(call, { item_code: "DOOR-DL", width_m: 3, set_count: 1 }, { components: [{ item_code: "NVL-TR114-1.8" }] }),
    /Quy tắc BOM cùng mức.*Hệ thống không tự đoán/i,
  );
});
