import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

test("first-party App Factory metadata packs through the canonical manifest parser", async () => {
  const source = path.resolve(import.meta.dirname, "..", "apps-src", "app-factory");
  const pkg = await readAppSource(source);
  const manifest = parseAppManifest(pkg);
  assert.equal(manifest.id, "app-factory");
  assert.equal(manifest.doctypes.length, 1);
  const definition = manifest.doctypes[0];
  assert.equal(definition.name, "App Factory Definition");
  assert.equal(definition.fields.find((field) => field.fieldname === "definition_json")?.fieldtype, "JSON");
  assert.equal(definition.fields.find((field) => field.fieldname === "target_doctype")?.options, "DocType");
  assert.ok(manifest.externalDocTypes.some((entry) => entry.name === "DocType" && entry.kind === "system"));
  assert.ok(manifest.roles.some((entry) => entry.role === "App Factory Manager"));
});

test("App Factory definition permissions remain server-visible, not merely a sidebar role hint", async () => {
  const pkg = await readAppSource(path.resolve(import.meta.dirname, "..", "apps-src", "app-factory"));
  const manifest = parseAppManifest(pkg);
  const definition = manifest.doctypes.find((entry) => entry.name === "App Factory Definition");
  const manager = definition.permissions.find((entry) => entry.role === "App Factory Manager");
  assert.equal(manager.read, true);
  assert.equal(manager.write, true);
  assert.equal(manager.create, true);
});
