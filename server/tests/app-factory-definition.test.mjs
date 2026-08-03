import test from "node:test";
import assert from "node:assert/strict";
import { AppFactoryDefinitionController } from "../dist/packages/app-registry/src/index.js";

const metadata = {
  async getDocType(_tenantId, doctype) {
    if (doctype !== "Purchase Order") return null;
    return {
      name: "Purchase Order",
      module: "Buying",
      fields: [
        { fieldname: "supplier", label: "Supplier", fieldtype: "Data" },
        { fieldname: "grand_total", label: "Grand Total", fieldtype: "Currency" },
      ],
      permissions: [], revision: 1,
    };
  },
};

function command(document, action = "create", name = "APP-DEF-1") {
  return {
    schema_version: 1,
    command_id: `cmd-${name}-${action}`,
    tenant_id: "t",
    aggregate: { doctype: "App Factory Definition", name },
    action,
    expected_version: action === "create" ? null : 1,
    payload_hash: "x".repeat(64),
    actor: { user_id: "admin@example.com", roles: ["App Factory Manager"] },
    document,
  };
}

function canonical(name, data, version = 1) {
  return {
    tenant_id: "t", doctype: "App Factory Definition", name,
    owner: "admin@example.com", docstatus: 0, status: data.status,
    version, created_at: "2026-08-03T00:00:00.000Z", modified_at: "2026-08-03T00:00:00.000Z",
    data, children: [],
  };
}

function context(document, { existing = null, siblings = [], action = "create", name = "APP-DEF-1", nextVersion = 1 } = {}) {
  return {
    command: command(document, action, name),
    existing,
    now: "2026-08-03T01:00:00.000Z",
    nextVersion,
    reader: {
      async listDocumentsByDoctype() { return siblings; },
    },
  };
}

function processDefinition() {
  return {
    approval_plan: {
      stages: [{ key: "finance", mode: "quorum", quorum: 2, approvers: [{ role: "Finance Manager" }] }],
    },
    timer_plan: {
      stages: [{ stage_key: "finance", due_after_minutes: 60, escalations: [{ key: "notify-director", after_minutes: 120 }] }],
    },
    trigger_set: {
      event_triggers: [{
        key: "large-order",
        event: "purchase_order.*",
        action: "review-large-order",
        when: { op: "gte", left: { kind: "field", field: "grand_total" }, right: { kind: "value", value: 1000000 } },
      }],
    },
  };
}

function draft(kind = "Process", definition = processDefinition()) {
  return {
    definition_key: "purchase-approval",
    definition_kind: kind,
    target_doctype: "Purchase Order",
    definition_json: definition,
    effective_from: "2026-08-01",
    status: "Draft",
  };
}

test("process definition is normalized, versioned by server and emits audit event", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  const older = canonical("APP-DEF-OLD", { ...draft(), version_no: 3, status: "Retired" });
  const plan = await controller.buildPlan(context(draft(), { siblings: [older] }));
  assert.equal(plan.document.data.version_no, 4);
  assert.equal(plan.document.data.definition_json.approval_plan.stages[0].mode, "quorum");
  assert.equal(plan.events[0].event_type, "app_factory_definition.created");
  assert.equal(plan.events[0].payload.version_no, 4);
});

test("JSON TextArea string input normalizes before active immutability comparison", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  const normalized = (await controller.buildPlan(context(draft()))).document.data;
  const existing = canonical("APP-DEF-1", { ...normalized, status: "Active", status_reason: "published" });
  const plan = await controller.buildPlan(context({
    ...existing.data,
    definition_json: JSON.stringify(existing.data.definition_json),
  }, { existing, action: "save", nextVersion: 2 }));
  assert.equal(plan.document.data.status, "Active");
  assert.deepEqual(plan.document.data.definition_json, existing.data.definition_json);
});

test("activation requires a reason and refuses a second active sibling", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  const initial = (await controller.buildPlan(context(draft()))).document.data;
  const existing = canonical("APP-DEF-1", initial);
  await assert.rejects(
    () => controller.buildPlan(context({ ...initial, status: "Active" }, { existing, action: "save", nextVersion: 2 })),
    /status_reason is required/,
  );

  const activeSibling = canonical("APP-DEF-OLD", { ...initial, version_no: 1, status: "Active" });
  await assert.rejects(
    () => controller.buildPlan(context({ ...initial, status: "Active", status_reason: "activate" }, { existing, siblings: [activeSibling], action: "save", nextVersion: 2 })),
    /Retire the active/,
  );
});

test("active definition JSON is immutable and lifecycle is Draft -> Active -> Retired", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  const initial = (await controller.buildPlan(context(draft()))).document.data;
  const active = canonical("APP-DEF-1", { ...initial, status: "Active", status_reason: "published" }, 2);
  await assert.rejects(
    () => controller.buildPlan(context({
      ...active.data,
      definition_json: { ...active.data.definition_json, approval_plan: { stages: [{ key: "changed", approvers: [{ role: "X" }] }] } },
    }, { existing: active, action: "save", nextVersion: 3 })),
    /Retire\/replace/,
  );
  const retired = await controller.buildPlan(context({ ...active.data, status: "Retired", status_reason: "superseded" }, { existing: active, action: "save", nextVersion: 3 }));
  assert.equal(retired.document.data.status, "Retired");
  assert.equal(retired.events[0].event_type, "app_factory_definition.retired");
  await assert.rejects(
    () => controller.buildPlan(context({ ...retired.document.data, status: "Draft", status_reason: "undo" }, { existing: retired.document, action: "save", nextVersion: 4 })),
    /cannot change Retired -> Draft/,
  );
});

test("Decision Rules and Formula Rules reuse target field validation", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  const rulePlan = await controller.buildPlan(context(draft("Decision Rules", {
    rules: [{
      key: "high-value",
      when: { op: "gte", left: { kind: "field", field: "grand_total" }, right: { kind: "value", value: 1000000 } },
      outcome: { route: "director" },
    }],
  }), { name: "RULE-1" }));
  assert.equal(rulePlan.document.data.definition_kind, "Decision Rules");

  const formulaPlan = await controller.buildPlan(context(draft("Formula Rules", {
    formulas: [{ key: "tax", scale: 2, expression: { op: "mul", args: [{ op: "field", field: "grand_total" }, { op: "const", value: "0.10" }] } }],
  }), { name: "FORMULA-1" }));
  assert.equal(formulaPlan.document.data.definition_kind, "Formula Rules");

  await assert.rejects(
    () => controller.buildPlan(context(draft("Formula Rules", {
      formulas: [{ key: "bad", expression: { op: "field", field: "ghost" } }],
    }), { name: "FORMULA-BAD" })),
    /unknown field ghost/,
  );
});

test("target DocType and server-assigned version are authoritative", async () => {
  const controller = new AppFactoryDefinitionController(metadata);
  await assert.rejects(
    () => controller.buildPlan(context({ ...draft(), target_doctype: "Ghost" })),
    /target DocType is not active/,
  );
  await assert.rejects(
    () => controller.buildPlan(context({ ...draft(), version_no: 99 })),
    /server-assigned/,
  );
});
