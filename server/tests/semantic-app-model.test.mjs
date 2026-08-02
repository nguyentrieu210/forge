import test from "node:test";
import assert from "node:assert/strict";
import { parseAppSemanticModels } from "../dist/packages/semantic/src/app-model.js";
import { SemanticQueryCompiler, SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";

const context = {
  appId: "school",
  doctypes: [
    { name: "Enrollment", fields: ["class_group", "student", "fee_minor", "currency"] },
    { name: "Class Group", fields: ["title"] },
  ],
};

const valid = [{
  id: "school.enrollment",
  label: "Enrollment",
  description: "Submitted enrollment metrics",
  doctype: "Enrollment",
  state: "submitted",
  grain: "one submitted enrollment",
  dimensions: [
    { id: "class_group", label: "Class", field: "class_group", kind: "link", options: "Class Group" },
    { id: "currency", label: "Currency", field: "currency", kind: "currency" },
  ],
  metrics: [
    { id: "enrollment_count", label: "Enrollments", aggregation: "count", value: { kind: "integer", exact: true }, additive: "full" },
    { id: "fee_total", label: "Fee total", aggregation: "sum", field: "fee_minor", value: { kind: "currency", scale: 100, exact: true, currencyDimension: "currency" }, additive: "full" },
  ],
  maxRows: 500,
}];

test("app semantic parser produces a doctype-only permission-bound model", () => {
  const [model] = parseAppSemanticModels(valid, context);
  assert.deepEqual(model.source, { kind: "doctype", doctype: "Enrollment", state: "submitted" });
  assert.deepEqual(model.permission, { doctype: "Enrollment", action: "report" });

  const compiled = new SemanticQueryCompiler(new SemanticModelRegistry([model])).compile({
    model: "school.enrollment",
    tenant_id: "tenant-a",
    dimensions: ["class_group", "currency"],
    metrics: ["fee_total"],
  });
  assert.match(compiled.sql, /FROM documents WHERE tenant_id=\?1 AND doctype=\?2 AND docstatus=1/);
  assert.deepEqual(compiled.params.slice(0, 2), ["tenant-a", "Enrollment"]);
});

test("app package cannot name SQL views or unsupported manifest keys", () => {
  assert.throws(() => parseAppSemanticModels([{
    ...valid[0],
    source: { kind: "view", name: "gl_entries" },
  }], context), (error) => error.code === "VALIDATION_ERROR");
});

test("app package cannot model another app doctype or forge permission gate", () => {
  assert.throws(() => parseAppSemanticModels([{
    ...valid[0],
    id: "school.payroll",
    doctype: "Salary Slip",
  }], context), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => parseAppSemanticModels([{
    ...valid[0],
    id: "finance.enrollment",
  }], context), (error) => error.code === "VALIDATION_ERROR");
});

test("semantic fields must exist on the app-owned doctype", () => {
  assert.throws(() => parseAppSemanticModels([{
    ...valid[0],
    dimensions: [{ id: "secret", label: "Secret", field: "password_hash", kind: "category" }],
  }], context), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => parseAppSemanticModels([{
    ...valid[0],
    metrics: [{ id: "raw", label: "Raw", aggregation: "sum", field: "hidden_amount", value: { kind: "number" } }],
  }], context), (error) => error.code === "VALIDATION_ERROR");
});

test("app semantic state and exact scaled money are mandatory contracts", () => {
  const withoutState = structuredClone(valid[0]);
  delete withoutState.state;
  assert.throws(() => parseAppSemanticModels([withoutState], context), (error) => error.code === "VALIDATION_ERROR");

  const notExact = structuredClone(valid[0]);
  notExact.metrics[1].value.exact = false;
  assert.throws(() => parseAppSemanticModels([notExact], context), (error) => error.code === "VALIDATION_ERROR");
});
