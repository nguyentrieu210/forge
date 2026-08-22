import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBomQuantity,
  resolveBomTemplate,
} from "../dist/apps-src/alumdoor-worker/src/bom-template-core.js";
import { parseBomTemplateRecord } from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";
import {
  BOM_TEMPLATE_SOURCE_CATALOG,
  bomSourceFixtureRows,
} from "../scripts/lib/alumdoor-bom-template-source-catalog.mjs";

const source4d = BOM_TEMPLATE_SOURCE_CATALOG.find((entry) => entry.name === "SRC-UC-KT-4D-XN-VK");

const family46 = [
  {
    name: "SRC-UC-KT-46D-XN-VK",
    item_code: "TP-UC-KT-4.6D-XN-VK",
    product_row: 732,
    leaf_item: "NVL-TOLE0.42x598-XN-VK",
  },
  {
    name: "SRC-UC-KT-46D-XR-CF",
    item_code: "TP-UC-KT-4.6D-XR-CF",
    product_row: 757,
    leaf_item: "NVL-TOLE0.42x598-XR-CF",
  },
  {
    name: "SRC-UC-KT-46D-TR-XLC",
    item_code: "TP-UC-KT-4.6D-TRẮNG-XLC",
    product_row: 782,
    leaf_item: "NVL-TOLE0.42x598-TR-XLC",
  },
  {
    name: "SRC-UC-KT-46D-KU-GU",
    item_code: "TP-UC-KT-4.6D-KU-GU",
    product_row: 807,
    leaf_item: "NVL-TOLE0.42x598-KU-GU",
  },
];

function parsedTemplate(source) {
  assert.ok(source);
  return parseBomTemplateRecord({ name: source.name, ...source.data });
}

function classifiedRows(source) {
  const implemented = new Set(source.data.component_rules.map((rule) => Number(rule.source_row)));
  const deferred = JSON.parse(source.data.deferred_components_json);
  const deferredRows = new Set(deferred.flatMap((entry) => entry.source_rows ?? [entry.source_row]).map(Number));
  return {
    implemented,
    deferredRows,
    classified: new Set([...implemented, ...deferredRows]),
  };
}

test("source catalog preserves exact ĐM row coverage for CỬA ÚC KT 4D XN-VK", () => {
  assert.ok(source4d);
  assert.deepEqual(source4d.source, {
    document: "MS LIÊN BS.xlsx",
    sheet: "ĐM",
    product_row: 687,
    component_rows: [688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 706, 707, 708, 709, 710, 711, 712],
  });
  assert.equal(source4d.data.item_code, "CUA-UC-KT-4D");
  assert.equal(source4d.data.source_status, "READY_WITH_ACTUALS");
  assert.equal(source4d.data.disabled, false);
});

test("4D source rows are all classified as deterministic or explicit actual", () => {
  assert.ok(source4d);
  const { implemented, deferredRows, classified } = classifiedRows(source4d);
  assert.deepEqual([...classified].sort((a, b) => a - b), source4d.source.component_rows);
  assert.deepEqual([...implemented].sort((a, b) => a - b), [688, 689, 690, 691, 693, 695, 706, 709, 710]);
  assert.deepEqual([...deferredRows].sort((a, b) => a - b), [692, 694, 696, 697, 698, 699, 700, 701, 702, 703, 704, 707, 708, 711, 712]);
});

test("implemented 4D source formulas reproduce ĐM semantics for one configured set", () => {
  const template = parsedTemplate(source4d);
  const rules = new Map(template.component_rules.map((rule) => [rule.rule_code, rule]));
  const values = {
    PB_CAO: 3.85,
    PB_RAY_RONG: 3.65,
    billable_area_sqm: 14.0525,
  };
  const qty = (code) => evaluateBomQuantity(rules.get(code).quantity, values, code);

  assert.equal(qty("SRC-688-LEAF"), 50.1732);
  assert.equal(qty("SRC-689-GIA-T"), 1);
  assert.equal(qty("SRC-690-PULY-GAI"), 1.770615);
  assert.equal(qty("SRC-691-V-DAY"), 2.172);
  assert.equal(qty("SRC-693-RAY-U70"), 13.35);
  assert.equal(qty("SRC-695-TRUC-34"), 6.885);
  assert.equal(qty("SRC-706-CUM-HAM"), 2);
  assert.equal(qty("SRC-709-GOI-SAT"), 2);
  assert.equal(qty("SRC-710-BAT-KHOA"), 0.77);
});

test("4D source pilot resolves deterministic core and declares actual slots", () => {
  const template = parsedTemplate(source4d);
  const resolved = resolveBomTemplate({
    templates: [template],
    context: { item_code: "CUA-UC-KT-4D" },
    values: { PB_CAO: 3.85, PB_RAY_RONG: 3.65, billable_area_sqm: 14.0525 },
  });
  assert.equal(resolved.components.length, 9);
  assert.deepEqual(template.required_actual_component_keys, ["BOTTOM_SEAL", "FOAM_45CM", "PULLEY_34", "SPRING", "SPRING_STOP_ARM", "PULL_ROD", "SCREW_HEAD_PULLEY", "SCREW_2P_PULLEY"]);
});

test("KT 4.6D factory maps four contiguous source blocks and exact product/leaf SKUs", () => {
  assert.equal(BOM_TEMPLATE_SOURCE_CATALOG.length, 5);
  for (const expected of family46) {
    const source = BOM_TEMPLATE_SOURCE_CATALOG.find((entry) => entry.name === expected.name);
    assert.ok(source, expected.name);
    assert.equal(source.data.item_code, expected.item_code);
    assert.equal(source.source.product_row, expected.product_row);
    assert.deepEqual(source.source.component_rows, Array.from({ length: 24 }, (_, index) => expected.product_row + index + 1));
    const allow = JSON.parse(source.data.actual_component_allowed_items_json);
    assert.deepEqual(allow.LEAF_SHEET, [expected.leaf_item]);
    assert.equal(source.data.disabled, false);
    assert.equal(source.data.source_status, "READY_WITH_ACTUALS");
  }
});

test("each KT 4.6D source block classifies all 24 component rows without inheriting blank formulas", () => {
  for (const expected of family46) {
    const source = BOM_TEMPLATE_SOURCE_CATALOG.find((entry) => entry.name === expected.name);
    assert.ok(source, expected.name);
    const { implemented, deferredRows, classified } = classifiedRows(source);
    assert.deepEqual([...classified].sort((a, b) => a - b), source.source.component_rows, expected.name);
    assert.deepEqual(
      [...implemented].sort((a, b) => a - b),
      [2, 5, 18, 21, 22].map((offset) => expected.product_row + offset),
      `${expected.name}: deterministic rows`,
    );
    assert.deepEqual(
      [...deferredRows].sort((a, b) => a - b),
      source.source.component_rows.filter((row) => ![2, 5, 18, 21, 22].map((offset) => expected.product_row + offset).includes(row)),
      `${expected.name}: actual rows`,
    );
  }
});

test("KT 4.6D factory only auto-calculates source-explicit quantities", () => {
  for (const expected of family46) {
    const source = BOM_TEMPLATE_SOURCE_CATALOG.find((entry) => entry.name === expected.name);
    const template = parsedTemplate(source);
    const resolved = resolveBomTemplate({
      templates: [template],
      context: { item_code: expected.item_code },
      values: { PB_RAY_RONG: 4.23 },
    });
    assert.deepEqual(
      resolved.components.map((row) => [row.component_key, row.qty]),
      [
        ["T_BRACKET", 1],
        ["BOTTOM_SEAL", 0.032571],
        ["PLASTIC_STOP_CLAMP", 2],
        ["STEEL_BEARING", 2],
        ["FLOOR_LOCK_BRACKET_WEIGHT", 0.77],
      ],
      expected.name,
    );
    assert.equal(template.required_actual_component_keys.length, 12);
  }
});

test("source family actual allowlists pin fixed slots to source SKUs and allow only source spring/pull-rod choices", () => {
  for (const expected of family46) {
    const source = BOM_TEMPLATE_SOURCE_CATALOG.find((entry) => entry.name === expected.name);
    const allow = JSON.parse(source.data.actual_component_allowed_items_json);
    assert.deepEqual(allow.LEAF_SHEET, [expected.leaf_item]);
    assert.deepEqual(allow.PULLEY_34, ["NVL-PULYUC34"]);
    assert.deepEqual(allow.PULL_ROD, ["NVL-INOX", "NVL-NHUA", "NVL-MOC"]);
    assert.deepEqual(allow.SPRING, [
      "NVL-LX-5.5 x 70 x 46V",
      "NVL-LX-5.5 x 70 x 50V",
      "NVL-LV-6.0 x 70 x 53V",
      "NVL-LV-6.5 x 80 x 63V",
      "NVL-LV-6.5 x 80 x 68V",
      "NVL-LV-7.0 x 90 x 65V",
      "NVL-LV-7.0 x 90 x 73V",
      "NVL-LV-7.0 x 90 x 83V",
    ]);
  }
});

test("fixture export is deterministic for the full five-template source catalog", () => {
  const rows = bomSourceFixtureRows();
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((row) => row.name), BOM_TEMPLATE_SOURCE_CATALOG.map((entry) => entry.name));
  for (const row of rows) {
    assert.equal(row.type, "BOM Template");
    assert.equal(row.data.disabled, false);
    assert.equal(row.data.source_status, "READY_WITH_ACTUALS");
  }
});
