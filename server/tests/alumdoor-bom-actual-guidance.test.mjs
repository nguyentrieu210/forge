import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectBomActualComponents,
} from "../dist/apps-src/alumdoor-worker/src/bom-actual-components.js";
import {
  previewProductionLineBom,
} from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";

const templateDoc = {
  name: "SRC-GUIDE",
  template_code: "SRC-GUIDE",
  item_code: "TP-GUIDE",
  conditions_json: JSON.stringify({ item_code: "TP-GUIDE" }),
  required_component_keys_json: JSON.stringify(["CORE"]),
  required_actual_component_keys_json: JSON.stringify(["PULLEY", "SPRING"]),
  actual_component_allowed_items_json: JSON.stringify({
    PULLEY: ["NVL-PULLEY-34"],
    SPRING: ["NVL-SPRING-53", "NVL-SPRING-63"],
  }),
  component_rules: [{
    rule_code: "CORE",
    component_key: "CORE",
    item_code: "NVL-CORE",
    quantity_formula_json: JSON.stringify({ base: { kind: "CONSTANT", value: 1 } }),
  }],
};

const baseLine = {
  item_code: "TP-GUIDE",
  output_qty: 6,
  source_warehouse: "KHO-NVL",
  width_m: 2,
  height_m: 3,
  billable_area_sqm: 6,
  formula_snapshot: "{}",
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function makeCall(existing = []) {
  const requests = [];
  const call = async (path, init = {}) => {
    requests.push({ path, init });
    if (path.startsWith("resource/BOM%20Template?")) return response({ data: [{ name: "SRC-GUIDE" }] });
    if (path === "resource/BOM%20Template/SRC-GUIDE") return response({ data: templateDoc });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: existing });
    return response({ message: `unexpected ${path}` }, 404);
  };
  return { call, requests };
}

test("actual inspection reports every required slot, allowlist and missing state", () => {
  const inspection = inspectBomActualComponents({
    template_code: "SRC-GUIDE",
    required_actual_component_keys: ["PULLEY", "SPRING"],
    allowed_item_codes_by_key: {
      PULLEY: ["NVL-PULLEY-34"],
      SPRING: ["NVL-SPRING-53", "NVL-SPRING-63"],
    },
    actual_components: [{ component_key: "PULLEY", item_code: "NVL-PULLEY-34", qty: 2 }],
  });
  assert.equal(inspection.complete, false);
  assert.deepEqual(inspection.missing_component_keys, ["SPRING"]);
  assert.deepEqual(inspection.requirements, [
    {
      component_key: "PULLEY",
      allowed_item_codes: ["NVL-PULLEY-34"],
      provided_item_codes: ["NVL-PULLEY-34"],
      provided_rows: 1,
      missing: false,
    },
    {
      component_key: "SPRING",
      allowed_item_codes: ["NVL-SPRING-53", "NVL-SPRING-63"],
      provided_item_codes: [],
      provided_rows: 0,
      missing: true,
    },
  ]);
});

test("BOM preview returns missing actual requirements instead of creating or guessing", async () => {
  const { call, requests } = makeCall();
  const result = await previewProductionLineBom(call, { line: baseLine, company: "ALUM" });
  assert.equal(result.actual_complete, false);
  assert.deepEqual(result.missing_actual_component_keys, ["PULLEY", "SPRING"]);
  assert.equal(result.bom_no, "");
  assert.equal(result.bom_fingerprint, "");
  assert.equal(result.components.length, 1);
  assert.deepEqual(result.actual_requirements.map((row) => [row.component_key, row.allowed_item_codes]), [
    ["PULLEY", ["NVL-PULLEY-34"]],
    ["SPRING", ["NVL-SPRING-53", "NVL-SPRING-63"]],
  ]);
  assert.equal(requests.some((entry) => entry.init.method === "POST"), false);
});

test("BOM preview preserves partial actual input so UI can show exactly what remains", async () => {
  const { call } = makeCall();
  const result = await previewProductionLineBom(call, {
    line: {
      ...baseLine,
      bom_actual_components: [{ component_key: "PULLEY", item_code: "NVL-PULLEY-34", qty: 2 }],
    },
    company: "ALUM",
  });
  assert.equal(result.actual_complete, false);
  assert.deepEqual(result.missing_actual_component_keys, ["SPRING"]);
  const pulley = result.actual_requirements.find((row) => row.component_key === "PULLEY");
  assert.deepEqual(pulley.provided_item_codes, ["NVL-PULLEY-34"]);
  assert.equal(pulley.missing, false);
});

test("preview still rejects a wrong source SKU instead of merely marking the slot complete", async () => {
  const { call } = makeCall();
  await assert.rejects(
    () => previewProductionLineBom(call, {
      line: {
        ...baseLine,
        bom_actual_components: [{ component_key: "PULLEY", item_code: "NVL-WRONG", qty: 2 }],
      },
      company: "ALUM",
    }),
    /NVL-WRONG không được phép cho actual slot PULLEY/i,
  );
});

test("complete preview computes reusable fingerprint but remains read-only", async () => {
  const { call, requests } = makeCall();
  const result = await previewProductionLineBom(call, {
    line: {
      ...baseLine,
      bom_actual_components: [
        { component_key: "PULLEY", item_code: "NVL-PULLEY-34", qty: 2 },
        { component_key: "SPRING", item_code: "NVL-SPRING-53", qty: 2 },
      ],
    },
    company: "ALUM",
  });
  assert.equal(result.actual_complete, true);
  assert.deepEqual(result.missing_actual_component_keys, []);
  assert.match(result.bom_fingerprint, /^bom-v1-[0-9a-f]{8}$/);
  assert.deepEqual(result.components.map((row) => [row.component_key, row.item_code]), [
    ["CORE", "NVL-CORE"],
    ["PULLEY", "NVL-PULLEY-34"],
    ["SPRING", "NVL-SPRING-53"],
  ]);
  assert.equal(requests.some((entry) => entry.init.method === "POST"), false);
});
