import test from "node:test";
import assert from "node:assert/strict";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";

test("viewPolicy preserves reason-required workflow semantics", () => {
  const meta = parseDocTypeMeta({
    name: "Approval Rule",
    module: "Security",
    kind: "transaction",
    fields: [
      {
        fieldname: "workflow_state",
        label: "State",
        fieldtype: "Data",
        read_only: true,
        valueSource: "workflow",
        editMode: "readonly",
        surface: "expanded",
        serverEnforced: true,
      },
      {
        fieldname: "reason",
        label: "Reason",
        fieldtype: "Data",
        valueSource: "user",
        editMode: "editable",
        surface: "expanded",
      },
    ],
    viewPolicy: {
      list: { enabled: true, columns: ["workflow_state"] },
      form: { enabled: true, fields: ["reason"] },
      kanban: {
        enabled: true,
        stageField: "workflow_state",
        reasonRequiredOn: ["backward", "cancel"],
      },
    },
    permissions: [],
    revision: 1,
  });

  assert.deepEqual(meta.viewPolicy?.kanban?.reasonRequiredOn, ["backward", "cancel"]);
  assert.equal(meta.viewPolicy?.kanban?.stageField, "workflow_state");
});
