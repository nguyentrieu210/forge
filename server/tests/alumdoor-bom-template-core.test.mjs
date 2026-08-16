import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBomQuantity,
  resolveBomTemplate,
} from "../dist/apps-src/alumdoor-worker/src/bom-template-core.js";

function component(rule_code, item_code, quantity, extra = {}) {
  return { rule_code, item_code, quantity, ...extra };
}

const fixed = (value) => ({ base: { kind: "CONSTANT", value } });

const leafCount = {
  base: {
    kind: "QUOTIENT",
    numerator: { field: "PB_CAO", offset: -0.13 },
    denominator: { field: "leaf_pitch_m" },
  },
  add: -1,
  rounding: "FLOOR",
  precision: 0,
};

test("BOM Template selection prefers the most specific matching template", () => {
  const result = resolveBomTemplate({
    context: { product_group: "Cửa Đức", customer_group: "Đại lý" },
    templates: [
      {
        template_code: "DUC-BASE",
        item_code: "CUA-DUC",
        conditions: { product_group: "Cửa Đức" },
        component_rules: [component("BASE", "AL-BASE", fixed(1))],
      },
      {
        template_code: "DUC-DEALER",
        item_code: "CUA-DUC",
        conditions: { product_group: "Cửa Đức", customer_group: "Đại lý" },
        component_rules: [component("DEALER", "AL-DEALER", fixed(1))],
      },
    ],
  });

  assert.equal(result.template_code, "DUC-DEALER");
  assert.deepEqual(result.applied_rules, ["DEALER"]);
});

test("equal top BOM Templates fail closed instead of guessing", () => {
  assert.throws(() => resolveBomTemplate({
    context: { product_group: "Cửa Úc" },
    templates: [
      { template_code: "A", item_code: "CUA-UC", conditions: { product_group: "Cửa Úc" }, component_rules: [] },
      { template_code: "B", item_code: "CUA-UC", conditions: { product_group: "Cửa Úc" }, component_rules: [] },
    ],
  }), /BOM Template cùng mức.*Hệ thống không đoán/i);
});

test("required BOM context fails closed before component generation", () => {
  assert.throws(() => resolveBomTemplate({
    context: { product_group: "Cửa Đài Loan" },
    templates: [{
      template_code: "DL-CONFIG",
      item_code: "CUA-DL",
      conditions: { product_group: "Cửa Đài Loan" },
      required_context_fields: ["bundle_mode"],
      component_rules: [],
    }],
  }), /thiếu ngữ cảnh bắt buộc bundle_mode.*không tự đoán/i);
});

test("bundle mode controls component scope without mixing it into pricing", () => {
  const templates = [
    {
      template_code: "DL-FULL-KIT",
      item_code: "CUA-DL",
      conditions: { product_group: "Cửa Đài Loan", bundle_mode: "TRỌN BỘ" },
      required_component_keys: ["LEAF", "RAY", "V4", "SHAFT"],
      component_rules: [
        component("DL-LEAF", "AL-LEAF", leafCount, { component_key: "LEAF", sequence: 10 }),
        component("DL-RAY", "RAY-U70", fixed(2), { component_key: "RAY", sequence: 20 }),
        component("DL-V4", "V4", fixed(1), { component_key: "V4", sequence: 30 }),
        component("DL-SHAFT", "TRUC-114", fixed(1), { component_key: "SHAFT", sequence: 40 }),
      ],
    },
    {
      template_code: "DL-LEAF-ONLY",
      item_code: "CUA-DL",
      conditions: { product_group: "Cửa Đài Loan", bundle_mode: "CHỈ LÁ" },
      required_component_keys: ["LEAF"],
      component_rules: [component("DL-LEAF", "AL-LEAF", leafCount, { component_key: "LEAF" })],
    },
  ];

  const full = resolveBomTemplate({
    templates,
    context: { product_group: "Cửa Đài Loan", bundle_mode: "TRỌN BỘ" },
    values: { PB_CAO: 3, leaf_pitch_m: 0.055 },
  });
  assert.equal(full.components.find((row) => row.component_key === "LEAF").qty, 51);
  assert.deepEqual(full.components.map((row) => row.component_key), ["LEAF", "RAY", "V4", "SHAFT"]);

  const leafOnly = resolveBomTemplate({
    templates,
    context: { product_group: "Cửa Đài Loan", bundle_mode: "CHỈ LÁ" },
    values: { PB_CAO: 3, leaf_pitch_m: 0.055 },
  });
  assert.deepEqual(leafOnly.components.map((row) => row.component_key), ["LEAF"]);
});

test("component variants use specificity and reject equal top rules", () => {
  const baseTemplate = {
    template_code: "DUC-RAY",
    item_code: "CUA-DUC",
    conditions: { product_group: "Cửa Đức" },
    required_component_keys: ["RAY"],
    component_rules: [
      component("RAY-U75", "RAY-U75", fixed(2), { component_key: "RAY", conditions: { ray_type: "U75" } }),
      component("RAY-U100", "RAY-U100", fixed(2), { component_key: "RAY", conditions: { ray_type: "U100" } }),
    ],
  };

  const u100 = resolveBomTemplate({ templates: [baseTemplate], context: { product_group: "Cửa Đức", ray_type: "U100" } });
  assert.equal(u100.components[0].item_code, "RAY-U100");

  assert.throws(() => resolveBomTemplate({
    templates: [{
      ...baseTemplate,
      component_rules: [
        ...baseTemplate.component_rules,
        component("RAY-U100-B", "RAY-U100-B", fixed(2), { component_key: "RAY", conditions: { ray_type: "U100" } }),
      ],
    }],
    context: { product_group: "Cửa Đức", ray_type: "U100" },
  }), /BOM Component Rule cùng mức.*RAY.*Hệ thống không đoán/i);
});

test("missing quantity inputs and missing required component slots never become zero", () => {
  assert.throws(() => evaluateBomQuantity({ base: { kind: "FIELD", field: "PB_CAO" } }, {}), /thiếu PB_CAO.*không tự điền 0/i);

  assert.throws(() => resolveBomTemplate({
    context: { product_group: "Cửa Úc", bundle_mode: "TRỌN BỘ" },
    templates: [{
      template_code: "UC-FULL",
      item_code: "CUA-UC",
      conditions: { product_group: "Cửa Úc", bundle_mode: "TRỌN BỘ" },
      required_component_keys: ["LEAF", "RAY"],
      component_rules: [component("UC-LEAF", "AL-LEAF", fixed(1), { component_key: "LEAF" })],
    }],
  }), /thiếu BOM Component Rule phù hợp cho RAY.*không tự bỏ vật tư bắt buộc/i);
});

test("quantity DSL supports area and refuses non-positive material quantities", () => {
  assert.equal(evaluateBomQuantity({
    base: {
      kind: "PRODUCT",
      left: { field: "PB_CAO" },
      right: { field: "CAT_LA_RONG" },
    },
    multiply: 1.05,
    rounding: "ROUND",
    precision: 3,
  }, { PB_CAO: 3, CAT_LA_RONG: 4 }), 12.6);

  assert.throws(() => evaluateBomQuantity(fixed(0), {}), /phải lớn hơn 0/i);
});

test("disabled BOM Templates never participate in selection", () => {
  const result = resolveBomTemplate({
    context: { product_group: "Cửa Siêu Trường" },
    templates: [
      { template_code: "OLD", item_code: "OLD", disabled: true, conditions: { product_group: "Cửa Siêu Trường" }, component_rules: [] },
      { template_code: "ACTIVE", item_code: "ACTIVE", conditions: { product_group: "Cửa Siêu Trường" }, component_rules: [] },
    ],
  });
  assert.equal(result.template_code, "ACTIVE");
});
