import test from "node:test";
import assert from "node:assert/strict";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

function ownedDoctype() {
  return {
    name: "Local Document",
    module: "Test",
    fields: [{ fieldname: "title", label: "Title", fieldtype: "Data", required: true }],
    permissions: [{ role: "Operator", read: true, write: true, create: true }],
    revision: 1,
  };
}

function packageWithExternalAction(overrides = {}) {
  return {
    id: "external-action-test",
    name: "External Action Test",
    version: "1.0.0",
    roles: [{ role: "Operator" }],
    doctypes: [ownedDoctype()],
    nav: [{ key: "Local Document", label: "Local", kind: "doctype" }],
    worker: "external-action-test-worker",
    externalDocTypes: [
      { name: "Company", kind: "master", app: "erpnext" },
      { name: "Currency", kind: "master", app: "erpnext" },
    ],
    actions: [{
      name: "create-external-order",
      label: "Create",
      permission_doctype: "Local Document",
      fields: [
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", required: true },
        { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", required: true },
      ],
      commit: { method: "external.action.create", label: "Create" },
    }],
    ...overrides,
  };
}

test("AppAction Link fields may target explicitly declared external DocTypes", () => {
  const parsed = parseAppManifest(packageWithExternalAction());
  assert.equal(parsed.actions[0].fields[0].options, "Company");
  assert.equal(parsed.actions[0].fields[1].options, "Currency");
});

test("AppAction permission gate may target an explicitly declared external DocType", () => {
  const source = packageWithExternalAction();
  source.actions[0].permission_doctype = "Company";
  const parsed = parseAppManifest(source);
  assert.equal(parsed.actions[0].permission_doctype, "Company");
});

test("AppAction still rejects undeclared external Link targets", () => {
  const source = packageWithExternalAction({ externalDocTypes: [] });
  assert.throws(() => parseAppManifest(source), /neither defines nor declares external/);
});
