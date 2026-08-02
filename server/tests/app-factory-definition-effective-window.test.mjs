import test from "node:test";
import assert from "node:assert/strict";
import { AppFactoryDefinitionController } from "../dist/packages/app-registry/src/index.js";

const metadata = {
  async getDocType(_tenantId, doctype) {
    return doctype === "Purchase Order"
      ? { name: doctype, module: "Buying", fields: [{ fieldname: "grand_total", label: "Total", fieldtype: "Currency" }], permissions: [], revision: 1 }
      : null;
  },
};

const definition = {
  definition_key: "purchase-approval",
  definition_kind: "Decision Rules",
  target_doctype: "Purchase Order",
  version_no: 1,
  definition_json: {
    schema_version: 1,
    rules: [{
      key: "high-value",
      when: { op: "gte", left: { kind: "field", field: "grand_total" }, right: { kind: "value", value: "1000000", value_type: "decimal" } },
      outcome: { route: "director" },
    }],
  },
  effective_from: "2026-08-01",
  effective_to: "2026-12-31",
  status: "Active",
  status_reason: "published",
};

function existing() {
  return {
    tenant_id: "t", doctype: "App Factory Definition", name: "APP-DEF-1",
    owner: "admin@example.com", docstatus: 0, status: "Active", version: 1,
    created_at: "2026-08-01T00:00:00Z", modified_at: "2026-08-01T00:00:00Z",
    data: structuredClone(definition), children: [],
  };
}

function context(document) {
  return {
    command: {
      schema_version: 1, command_id: "cmd-1", tenant_id: "t",
      aggregate: { doctype: "App Factory Definition", name: "APP-DEF-1" },
      action: "save", expected_version: 1, payload_hash: "x".repeat(64),
      actor: { user_id: "admin@example.com", roles: ["App Factory Manager"] },
      document,
    },
    existing: existing(),
    now: "2026-08-03T00:00:00Z",
    nextVersion: 2,
    reader: { async listDocumentsByDoctype() { return [existing()]; } },
  };
}

test("Active definition cannot move effective_from in place", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  await assert.rejects(
    () => controller.buildPlan(context({ ...definition, effective_from: "2026-08-15" })),
    /active effective window/,
  );
});

test("Active definition cannot extend effective_to in place", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  await assert.rejects(
    () => controller.buildPlan(context({ ...definition, effective_to: "2027-01-31" })),
    /active effective window/,
  );
});

test("unchanged effective window remains saveable", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  const plan = await controller.buildPlan(context(structuredClone(definition)));
  assert.equal(plan.document.data.effective_from, "2026-08-01");
  assert.equal(plan.document.data.effective_to, "2026-12-31");
});
