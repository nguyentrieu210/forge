import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeBomActualComponents,
  normalizeBomActualComponents,
} from "../dist/apps-src/alumdoor-worker/src/bom-actual-components.js";

const resolved = {
  template_code: "SRC-UC-KT-4D-XN-VK",
  item_code: "TP-UC KT 4D XN-VK",
  components: [
    { component_key: "LEAF_SHEET", item_code: "NVL-TON3.8D-XN-VK", qty: 46.431, source_rule: "SRC-687-LEAF" },
  ],
  applied_rules: ["SRC-687-LEAF"],
};

const required = [
  "BOTTOM_SEAL",
  "FOAM_45CM",
  "PULLEY_34",
  "SPRING",
  "SPRING_STOP_ARM",
  "PULL_ROD",
  "SCREW_HEAD_PULLEY",
  "SCREW_2P_PULLEY",
];

const actual = [
  { component_key: "BOTTOM_SEAL", item_code: "NVL-RONDAYUC", qty: 0.028, source_row: 691 },
  { component_key: "FOAM_45CM", item_code: "NVL-XOP-N45", qty: 18, source_row: 693 },
  { component_key: "PULLEY_34", item_code: "NVL-PULYUC34", qty: 2, source_row: 695 },
  { component_key: "SPRING", item_code: "NVL-LV-6.0 x 70 x 53V", qty: 2, source_row: 698 },
  { component_key: "SPRING_STOP_ARM", item_code: "NVL-VAIHAMXO", qty: 2, source_row: 706 },
  { component_key: "PULL_ROD", item_code: "NVL-INOX", qty: 1, source_row: 707 },
  { component_key: "PULL_ROD", item_code: "NVL-NHUA", qty: 1, source_row: 707 },
  { component_key: "PULL_ROD", item_code: "NVL-MOC", qty: 1, source_row: 707 },
  { component_key: "SCREW_HEAD_PULLEY", item_code: "NVL-VISDD-BANLO", qty: 0.0064, source_row: 710 },
  { component_key: "SCREW_2P_PULLEY", item_code: "NVL-VIS-BANLO2P", qty: 0.0462, source_row: 711 },
];

test("actual BOM component rows are normalized without changing explicit quantities", () => {
  const rows = normalizeBomActualComponents(actual);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], actual[0]);
  assert.deepEqual(rows.at(-1), actual.at(-1));
});

test("all required actual slots must be present before a BOM can materialize", () => {
  assert.throws(
    () => mergeBomActualComponents({ resolved, actual_components: actual.filter((row) => row.component_key !== "SPRING"), required_actual_component_keys: required }),
    /thiếu vật tư BOM thực tế cho SPRING.*không tự đoán/i,
  );
});

test("unknown actual slots cannot inject arbitrary material into a source BOM", () => {
  assert.throws(
    () => mergeBomActualComponents({
      resolved,
      actual_components: [...actual, { component_key: "EXTRA", item_code: "NVL-RANDOM", qty: 99 }],
      required_actual_component_keys: required,
    }),
    /actual component EXTRA không được BOM Template khai báo/i,
  );
});

test("multiple actual rows may satisfy one declared source slot such as composite pull rod", () => {
  const merged = mergeBomActualComponents({ resolved, actual_components: actual, required_actual_component_keys: required });
  assert.equal(merged.components.length, 11);
  assert.equal(merged.components.filter((row) => row.component_key === "PULL_ROD").length, 3);
  assert.deepEqual(merged.components.slice(-3).map((row) => row.source_rule), [
    "ACTUAL:PULL_ROD:8",
    "ACTUAL:SCREW_HEAD_PULLEY:9",
    "ACTUAL:SCREW_2P_PULLEY:10",
  ]);
});

test("zero, negative or malformed actual quantities fail closed", () => {
  assert.throws(
    () => normalizeBomActualComponents([{ component_key: "PULLEY_34", item_code: "NVL-PULYUC34", qty: 0 }]),
    /phải là số lớn hơn 0/i,
  );
  assert.throws(
    () => normalizeBomActualComponents("PULLEY_34"),
    /phải là bảng dữ liệu/i,
  );
});
