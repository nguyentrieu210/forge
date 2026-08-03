import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseAppManifestWithInputTables,
} from "../dist/packages/app-registry/src/index.js";

const CLI = path.resolve(import.meta.dirname, "..", "scripts", "pack-app.mjs");
const SOURCE = path.resolve(import.meta.dirname, "..", "apps-src", "maintenance");

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "forge-pack-input-table-"));
  const app = path.join(root, "app");
  cpSync(SOURCE, app, { recursive: true });

  const headerPath = path.join(app, "app.json");
  const header = JSON.parse(readFileSync(headerPath, "utf8"));
  header.worker = header.worker ?? "maintenance-app";
  header.actions = [
    {
      name: "bulk-close",
      label: "Đóng nhiều yêu cầu",
      permission_doctype: "Maintenance Request",
      fields: [],
      input_tables: [
        {
          fieldname: "lines",
          label: "Yêu cầu",
          columns: [
            { fieldname: "request", label: "Yêu cầu", fieldtype: "Link", options: "Maintenance Request", required: true },
            { fieldname: "note", label: "Ghi chú", fieldtype: "Data" },
          ],
          min_rows: 1,
          max_rows: 500,
          allow_paste: true,
        },
      ],
      commit: { method: "maintenance.bulk_close", label: "Đóng" },
    },
  ];
  writeFileSync(headerPath, `${JSON.stringify(header, null, 2)}\n`, "utf8");
  return { root, app };
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("pack-app accepts first-class input_tables and writes a clean source artifact", () => {
  const { root, app } = fixtureRoot();
  try {
    const target = path.join(root, "packed.json");
    const result = run([app, "--out", target]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

    const packed = JSON.parse(readFileSync(target, "utf8"));
    const action = packed.actions[0];
    assert.equal(action.input_tables.length, 1);
    assert.equal(action.input_tables[0].max_rows, 500);
    assert.equal(action.fields.length, 0, "clean package must not bake the compatibility Text field into the artifact");
    assert.equal(action.fields.some((field) => String(field.options ?? "").startsWith("BulkTransaction:")), false);

    const parsed = parseAppManifestWithInputTables(packed);
    assert.equal(parsed.actions[0].input_tables[0].fieldname, "lines");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack-app --check uses the same first-class parser view", () => {
  const { root, app } = fixtureRoot();
  try {
    const result = run([app, "--check"]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /PACK_CHECK_PASS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack-app default output no longer references an undefined root", () => {
  const { root, app } = fixtureRoot();
  try {
    const result = run([app]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const expected = path.join(app, "maintenance-1.0.0.json");
    const packed = JSON.parse(readFileSync(expected, "utf8"));
    assert.equal(packed.id, "maintenance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
