import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeAppSourcePackage } from "../scripts/lib/canonicalize-app-source.mjs";

function packageWith(overrides = {}) {
  return {
    id: "test-app",
    name: "Test App",
    version: "1.0.0",
    requires: [],
    roles: [],
    fixtures: [],
    workflows: [],
    print_formats: [],
    nav: [],
    hooks: [],
    validators: [],
    reports: [],
    actions: [],
    screens: [],
    custom_fields: [],
    doctypes: [{
      name: "Test Document",
      module: "Test",
      is_submittable: true,
      fields: [
        { fieldname: "subject", label: "Subject", fieldtype: "Data", required: true, in_list_view: true },
        { fieldname: "owner_user", label: "Owner", fieldtype: "Link", options: "User" },
        { fieldname: "workflow_state", label: "State", fieldtype: "Data", read_only: true, in_list_view: true },
      ],
      permissions: [{ role: "System Manager", read: true, write: true, create: true }],
    }],
    ...overrides,
  };
}

test("app source is compiled to canonical Meta v1", () => {
  const compiled = canonicalizeAppSourcePackage(packageWith());
  assert.equal(compiled.metaContractVersion, 1);
  assert.deepEqual(compiled.externalDocTypes, [{ name: "User", kind: "system", app: "core" }]);

  const meta = compiled.doctypes[0];
  assert.equal(meta.kind, "transaction");
  assert.deepEqual(meta.viewPolicy.list.columns, ["subject", "workflow_state"]);
  assert.deepEqual(meta.viewPolicy.quickEntry.fields, ["subject"]);

  const subject = meta.fields.find((field) => field.fieldname === "subject");
  assert.equal(subject.valueSource, "user");
  assert.equal(subject.editMode, "immutable_after_submit");
  assert.equal(subject.surface, "quick");
  assert.equal(subject.serverEnforced, true);

  const state = meta.fields.find((field) => field.fieldname === "workflow_state");
  assert.equal(state.valueSource, "workflow");
  assert.equal(state.editMode, "readonly");
  assert.equal(state.surface, "expanded");
  assert.equal(state.serverEnforced, true);
});

test("declared view semantics survive canonical compilation", () => {
  const source = packageWith();
  source.doctypes[0].viewPolicy = {
    list: { enabled: true, columns: ["subject"] },
    form: { enabled: true },
    kanban: { enabled: true, stageField: "workflow_state", reasonRequiredOn: ["backward", "cancel"] },
  };
  const compiled = canonicalizeAppSourcePackage(source);
  assert.deepEqual(compiled.doctypes[0].viewPolicy.kanban.reasonRequiredOn, ["backward", "cancel"]);
  assert.equal(compiled.doctypes[0].viewPolicy.kanban.stageField, "workflow_state");
});

test("unknown external links fail closed unless declared", () => {
  const source = packageWith();
  source.doctypes[0].fields.push({ fieldname: "mystery", label: "Mystery", fieldtype: "Link", options: "Mystery Master" });
  assert.throws(
    () => canonicalizeAppSourcePackage(source),
    /declare it in app\.json externalDocTypes/,
  );

  source.externalDocTypes = [{ name: "Mystery Master", kind: "master", app: "partner-app" }];
  const compiled = canonicalizeAppSourcePackage(source);
  assert.ok(compiled.externalDocTypes.some((entry) => entry.name === "Mystery Master" && entry.app === "partner-app"));
});
