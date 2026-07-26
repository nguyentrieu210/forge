import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

/**
 * The packaging CLI's OUTPUT, not just its exit code.
 *
 * This suite exists because the CLI once emitted a structurally valid bundle whose
 * every nested object had been stripped to a bare `name`: DocTypes with no fields or
 * permissions, print formats with no html, workflows with no transitions, `nav` and
 * `roles` entries reduced to `{}`. `JSON.stringify(manifest, keys.sort(), 2)` looks
 * like "emit with sorted keys", but an array in that position is a REPLACER — a
 * property allowlist applied at every level of the tree.
 *
 * Three checks were green while that shipped, and each was green for its own reason:
 * `--check` exits before serialising and only counts objects; the determinism check
 * compared two packs of the same source, and empty is perfectly deterministic; and
 * the install tests build a manifest in memory rather than reading a packed file.
 * So the artifact this CLI exists to produce was unusable and nothing said so.
 *
 * The lesson these tests encode: assert the CONTENT that survives a round trip, not
 * the shape and not the exit code.
 */
const CLI = path.resolve(import.meta.dirname, "..", "scripts", "pack-app.mjs");
const APP = path.resolve(import.meta.dirname, "..", "apps-src", "maintenance");

function packTo(directory, name = "out.json") {
  const target = path.join(directory, name);
  const result = spawnSync(process.execPath, [CLI, APP, "--out", target], { encoding: "utf8" });
  assert.equal(result.status, 0, `pack failed: ${result.stdout}${result.stderr}`);
  return { target, text: readFileSync(target, "utf8") };
}

function withTempDir(work) {
  const directory = mkdtempSync(path.join(tmpdir(), "forge-pack-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a packed bundle keeps the content of every nested object", () => {
  withTempDir((directory) => {
    const manifest = JSON.parse(packTo(directory).text);

    const doctype = manifest.doctypes[0];
    assert.equal(doctype.name, "Maintenance Request");
    // The exact loss that went unnoticed: a DocType that installs with no fields is
    // a table with no columns, and the Desk renders it as an empty ID-only list.
    assert.ok(doctype.fields.length >= 8, `fields were stripped: ${JSON.stringify(doctype)}`);
    assert.ok(doctype.permissions.length >= 3, "permissions were stripped");
    // `fieldtype` never appears at the top level, so an allowlist replacer drops it.
    assert.equal(doctype.fields.find((field) => field.fieldname === "summary").fieldtype, "Data");
    assert.equal(doctype.fields.find((field) => field.fieldname === "parts_note").mandatory_depends_on, "eval:doc.needs_parts == 1");

    const workflow = manifest.workflows[0];
    assert.equal(workflow.states.length, 4);
    assert.equal(workflow.transitions.length, 3);
    assert.equal(workflow.state_field, "workflow_state");

    const print = manifest.print_formats[0];
    assert.ok(print.html.includes("{{ doc.name }}"), "print html was stripped");
    assert.ok(print.css.length > 0, "print css was stripped");

    // Objects whose keys share NOTHING with the top level collapsed to `{}` entirely.
    assert.equal(manifest.nav[0].kind, "doctype");
    assert.equal(manifest.roles[0].desk_access, true);
    assert.equal(manifest.fixtures[0].data.response_hours, 4);
  });
});

test("the packed bundle is what the server itself will accept", () => {
  // Round trip through the real parser rather than eyeballing the JSON: a bundle that
  // looks complete but fails to parse would fail on a customer's tenant, not here.
  withTempDir((directory) => {
    const parsed = parseAppManifest(JSON.parse(packTo(directory).text));
    assert.equal(parsed.id, "maintenance");
    assert.equal(parsed.doctypes[0].fields.length >= 8, true);
    assert.equal(parsed.workflows[0].transitions.length, 3);
  });
});

test("two packs of the same source are byte-identical, and keys are sorted throughout", () => {
  withTempDir((directory) => {
    const first = packTo(directory, "a.json").text;
    const second = packTo(directory, "b.json").text;
    // Determinism is what makes a reinstall of the same package a genuine no-op —
    // the content hash must not move when nothing changed.
    assert.equal(first, second);

    // Sorted at EVERY level, not just the top: that is the property the broken
    // replacer was reaching for, and the reason a hand-rolled canonicaliser exists.
    const manifest = JSON.parse(first);
    const nested = Object.keys(manifest.doctypes[0]);
    assert.deepEqual(nested, [...nested].sort(), `nested keys are unsorted: ${nested.join(",")}`);
    const top = Object.keys(manifest);
    assert.deepEqual(top, [...top].sort());
  });
});
