import assert from "node:assert/strict";
import test from "node:test";

import {
  bomContextFromProductionLine,
  bomFingerprint,
  parseBomTemplateRecord,
  resolveProductionLineBom,
} from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";

const templateDoc = {
  name: "BT-DUC-01",
  template_code: "DUC-01",
  item_code: "CUA-DUC",
  conditions_json: JSON.stringify({ door_type: "Cửa Đức" }),
  priority: 10,
  required_context_fields_json: JSON.stringify(["door_type"]),
  required_component_keys_json: JSON.stringify(["LEAF", "RAY"]),
  component_rules: [
    {
      rule_code: "LEAF",
      component_key: "LEAF",
      item_code: "AL-LEAF",
      sequence: 10,
      quantity_formula_json: JSON.stringify({ base: { kind: "FIELD", field: "leaf_count" } }),
    },
    {
      rule_code: "RAY-U75",
      component_key: "RAY",
      item_code: "RAY-U75",
      conditions_json: JSON.stringify({ ray_type: "U75" }),
      sequence: 20,
      quantity_formula_json: JSON.stringify({ base: { kind: "CONSTANT", value: 2 } }),
    },
  ],
};

const productionLine = {
  item_code: "CUA-DUC",
  item_group: "Cửa Đức",
  door_type: "Cửa Đức",
  sales_mode: "Trọn bộ",
  output_qty: 6,
  source_warehouse: "KHO-NVL",
  width_m: 2,
  height_m: 3,
  cut_width_m: 1.9,
  billable_area_sqm: 6,
  leaf_count: 51,
  formula_snapshot: JSON.stringify({ customer_group: "Đại lý", ray_type: "U75" }),
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function makeCall({ existing = [] } = {}) {
  const requests = [];
  const call = async (path, init = {}) => {
    requests.push({ path, init });
    if (path.startsWith("resource/BOM%20Template?")) return jsonResponse({ data: [{ name: "BT-DUC-01" }] });
    if (path === "resource/BOM%20Template/BT-DUC-01") return jsonResponse({ data: templateDoc });
    if (path.startsWith("resource/Bill%20of%20Materials?")) {
      const url = new URL(`https://local/${path}`);
      const filters = JSON.parse(url.searchParams.get("filters") || "[]");
      if (filters.some((row) => row[0] === "bom_fingerprint")) return jsonResponse({ data: existing });
      if (filters.some((row) => row[0] === "item")) return jsonResponse({ data: [{ name: "BOM-OLD", item: "CUA-DUC", revision: 4 }] });
      return jsonResponse({ data: [] });
    }
    if (path === "resource/Bill%20of%20Materials" && init.method === "POST") {
      return jsonResponse({ data: { ...JSON.parse(init.body), name: "BOM-AUTO-0001" } });
    }
    if (path === "method/frappe.client.submit" && init.method === "POST") return jsonResponse({ message: { ok: true } });
    return jsonResponse({ message: `unexpected ${path}` }, 404);
  };
  return { call, requests };
}

test("BOM Template storage parser rejects malformed condition JSON", () => {
  assert.throws(
    () => parseBomTemplateRecord({ ...templateDoc, conditions_json: "{" }),
    /conditions_json: JSON không hợp lệ/i,
  );
});

test("production line exposes geometry aliases without inventing missing values", () => {
  const { context, values } = bomContextFromProductionLine(productionLine);
  assert.equal(context.customer_group, "Đại lý");
  assert.equal(context.ray_type, "U75");
  assert.equal(values.PB_CAO, 3);
  assert.equal(values.PB_RONG, 2);
  assert.equal(values.CAT_LA_RONG, 1.9);
  assert.equal(values.leaf_count, 51);
  assert.equal("mesh_height_m" in values, false);
});

test("BOM fingerprint is stable for equivalent resolved material lists", () => {
  const resolved = {
    template_code: "DUC-01",
    item_code: "CUA-DUC",
    components: [
      { component_key: "LEAF", item_code: "AL-LEAF", qty: 51, source_rule: "LEAF" },
      { component_key: "RAY", item_code: "RAY-U75", qty: 2, source_rule: "RAY-U75" },
    ],
    applied_rules: ["LEAF", "RAY-U75"],
  };
  const first = bomFingerprint({ company: "ALUM", source_warehouse: "KHO-NVL", output_qty: 6, resolved });
  const second = bomFingerprint({ company: "ALUM", source_warehouse: "KHO-NVL", output_qty: 6, resolved: structuredClone(resolved) });
  assert.equal(first, second);
  assert.match(first, /^bom-v1-[0-9a-f]{8}$/);
});

test("preview resolves BOM Template but does not create or submit a BOM", async () => {
  const { call, requests } = makeCall();
  const result = await resolveProductionLineBom(call, { line: productionLine, company: "ALUM", materialize: false });
  assert.equal(result.bom_no, "");
  assert.equal(result.bom_template, "BT-DUC-01");
  assert.equal(result.bom_template_code, "DUC-01");
  assert.deepEqual(result.components.map((row) => [row.item_code, row.qty]), [["AL-LEAF", 51], ["RAY-U75", 2]]);
  assert.equal(requests.some((entry) => entry.init.method === "POST"), false);
  const templateList = requests.find((entry) => entry.path.startsWith("resource/BOM%20Template?"));
  assert.ok(templateList);
  const filters = JSON.parse(new URL(`https://local/${templateList.path}`).searchParams.get("filters"));
  assert.deepEqual(filters, [["item_code", "=", "CUA-DUC"]]);
});

test("materialization creates revisioned Bill of Materials and submits it before Work Order use", async () => {
  const { call, requests } = makeCall();
  const result = await resolveProductionLineBom(call, { line: productionLine, company: "ALUM", materialize: true });
  assert.equal(result.bom_no, "BOM-AUTO-0001");
  assert.equal(result.materialized, true);

  const create = requests.find((entry) => entry.path === "resource/Bill%20of%20Materials" && entry.init.method === "POST");
  assert.ok(create);
  const body = JSON.parse(create.init.body);
  assert.equal(body.item, "CUA-DUC");
  assert.equal(body.company, "ALUM");
  assert.equal(body.quantity, 6);
  assert.equal(body.revision, 5);
  assert.equal(body.generated_by_configurator, 1);
  assert.equal(body.bom_template, "BT-DUC-01");
  assert.equal(body.bom_template_code, "DUC-01");
  assert.match(body.bom_fingerprint, /^bom-v1-/);
  assert.deepEqual(body.items, [
    { row_id: "ROW-1", item_code: "AL-LEAF", qty: 51, source_warehouse: "KHO-NVL" },
    { row_id: "ROW-2", item_code: "RAY-U75", qty: 2, source_warehouse: "KHO-NVL" },
  ]);

  const submit = requests.find((entry) => entry.path === "method/frappe.client.submit");
  assert.ok(submit);
  assert.deepEqual(JSON.parse(submit.init.body), { doctype: "Bill of Materials", name: "BOM-AUTO-0001" });
  assert.ok(requests.indexOf(create) < requests.indexOf(submit));
});

test("matching submitted generated BOM is reused and never duplicated", async () => {
  const probe = makeCall();
  const preview = await resolveProductionLineBom(probe.call, { line: productionLine, company: "ALUM", materialize: false });
  const { call, requests } = makeCall({
    existing: [{
      name: "BOM-AUTO-EXISTING",
      docstatus: 1,
      bom_fingerprint: preview.bom_fingerprint,
      generated_by_configurator: 1,
    }],
  });
  const result = await resolveProductionLineBom(call, { line: productionLine, company: "ALUM", materialize: true });
  assert.equal(result.bom_no, "BOM-AUTO-EXISTING");
  assert.equal(result.materialized, false);
  assert.equal(requests.some((entry) => entry.path === "resource/Bill%20of%20Materials" && entry.init.method === "POST"), false);
  assert.equal(requests.some((entry) => entry.path === "method/frappe.client.submit"), false);
});

test("missing BOM Template fails closed when static BOM fallback is unavailable", async () => {
  const requests = [];
  const call = async (path, init = {}) => {
    requests.push({ path, init });
    if (path.startsWith("resource/BOM%20Template?")) return jsonResponse({ data: [] });
    return jsonResponse({ data: [] });
  };
  await assert.rejects(
    () => resolveProductionLineBom(call, { line: productionLine, company: "ALUM", materialize: true }),
    /chưa có BOM tĩnh và chưa cấu hình BOM Template/i,
  );
  assert.equal(requests.some((entry) => entry.init.method === "POST"), false);
});
