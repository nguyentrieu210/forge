import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductionLineBom } from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";

const templateDoc = {
  name: "SRC-ACTUAL",
  template_code: "SRC-ACTUAL",
  item_code: "TP-ACTUAL",
  conditions_json: JSON.stringify({ item_code: "TP-ACTUAL" }),
  required_component_keys_json: JSON.stringify(["CORE"]),
  required_actual_component_keys_json: JSON.stringify(["PULLEY", "SPRING"]),
  component_rules: [{
    rule_code: "CORE",
    component_key: "CORE",
    item_code: "NVL-CORE",
    quantity_formula_json: JSON.stringify({ base: { kind: "CONSTANT", value: 1 } }),
  }],
};

const line = {
  item_code: "TP-ACTUAL",
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

function makeCall() {
  const requests = [];
  const call = async (path, init = {}) => {
    requests.push({ path, init });
    if (path.startsWith("resource/BOM%20Template?")) return response({ data: [{ name: "SRC-ACTUAL" }] });
    if (path === "resource/BOM%20Template/SRC-ACTUAL") return response({ data: templateDoc });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return response({ data: [] });
    if (path === "resource/Bill%20of%20Materials" && init.method === "POST") {
      return response({ data: { ...JSON.parse(init.body), name: "BOM-ACTUAL-1" } });
    }
    if (path === "method/frappe.client.submit") return response({ message: { ok: true } });
    return response({ message: `unexpected ${path}` }, 404);
  };
  return { call, requests };
}

test("materializer refuses an active source template when required actual slots are missing", async () => {
  const { call, requests } = makeCall();
  await assert.rejects(
    () => resolveProductionLineBom(call, { line, company: "ALUM", materialize: true }),
    /thiếu vật tư BOM thực tế cho PULLEY, SPRING.*không tự đoán/i,
  );
  assert.equal(requests.some((entry) => entry.init.method === "POST"), false);
});

test("actual components participate in fingerprint and submitted BOM items", async () => {
  const { call, requests } = makeCall();
  const actualLine = {
    ...line,
    bom_actual_components: [
      { component_key: "PULLEY", item_code: "NVL-PULLEY", qty: 2, source_row: 695 },
      { component_key: "SPRING", item_code: "NVL-SPRING-53", qty: 2, source_row: 698 },
    ],
  };
  const result = await resolveProductionLineBom(call, { line: actualLine, company: "ALUM", materialize: true });
  assert.equal(result.bom_no, "BOM-ACTUAL-1");
  assert.deepEqual(result.components.map((row) => [row.component_key, row.item_code, row.qty]), [
    ["CORE", "NVL-CORE", 1],
    ["PULLEY", "NVL-PULLEY", 2],
    ["SPRING", "NVL-SPRING-53", 2],
  ]);
  const create = requests.find((entry) => entry.path === "resource/Bill%20of%20Materials" && entry.init.method === "POST");
  assert.ok(create);
  const body = JSON.parse(create.init.body);
  assert.deepEqual(body.items.map((row) => [row.item_code, row.qty]), [
    ["NVL-CORE", 1],
    ["NVL-PULLEY", 2],
    ["NVL-SPRING-53", 2],
  ]);
});

test("changing an explicit actual quantity changes the generated BOM fingerprint", async () => {
  const first = makeCall();
  const second = makeCall();
  const baseActual = [
    { component_key: "PULLEY", item_code: "NVL-PULLEY", qty: 2 },
    { component_key: "SPRING", item_code: "NVL-SPRING-53", qty: 2 },
  ];
  const one = await resolveProductionLineBom(first.call, { line: { ...line, bom_actual_components: baseActual }, company: "ALUM", materialize: false });
  const two = await resolveProductionLineBom(second.call, { line: { ...line, bom_actual_components: [{ ...baseActual[0], qty: 3 }, baseActual[1]] }, company: "ALUM", materialize: false });
  assert.notEqual(one.bom_fingerprint, two.bom_fingerprint);
});
