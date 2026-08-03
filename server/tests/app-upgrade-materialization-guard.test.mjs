import test from "node:test";
import assert from "node:assert/strict";
import { assertAppUpgradeMaterializationCompatible } from "../dist/packages/app-registry/src/app-upgrade-guard.js";

function manifest(overrides = {}) {
  return {
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    requires: [],
    doctypes: [{ name: "Thing" }],
    workflows: [{ name: "Thing Approval" }],
    print_formats: [{ name: "Thing Print" }],
    roles: [],
    fixtures: [{ record_type: "Company", name: "Demo Company", data: {} }],
    custom_fields: [{ dt: "Item", name: "Item-demo_code" }],
    nav: [],
    hooks: [],
    validators: [],
    reports: [],
    charts: [],
    actions: [],
    screens: [],
    externalDocTypes: [],
    ...overrides,
  };
}

test("upgrade may add materialized declarations and change presentation surfaces", () => {
  const current = manifest();
  const next = manifest({
    version: "1.1.0",
    doctypes: [...current.doctypes, { name: "Thing Line" }],
    nav: [{ key: "thing", label: "Things", kind: "doctype" }],
  });
  assert.doesNotThrow(() => assertAppUpgradeMaterializationCompatible(current, next));
});

test("upgrade refuses every materialized declaration class when the new package drops it", () => {
  const current = manifest();
  const removals = [
    ["DocType", { doctypes: [] }],
    ["Workflow", { workflows: [] }],
    ["Print Format", { print_formats: [] }],
    ["Fixture", { fixtures: [] }],
    ["Custom Field", { custom_fields: [] }],
  ];

  for (const [kind, override] of removals) {
    assert.throws(
      () => assertAppUpgradeMaterializationCompatible(current, manifest({ version: "2.0.0", ...override })),
      (error) => error?.code === "VALIDATION_ERROR"
        && error.message.includes(kind)
        && error.message.includes("explicit reverse migration or uninstall contract"),
      `${kind} removal must fail closed`,
    );
  }
});

test("upgrade guard cannot be used to replace one app with another id", () => {
  assert.throws(
    () => assertAppUpgradeMaterializationCompatible(manifest(), manifest({ id: "other", version: "2.0.0" })),
    (error) => error?.code === "VALIDATION_ERROR" && /Cannot upgrade demo with package other/.test(error.message),
  );
});
