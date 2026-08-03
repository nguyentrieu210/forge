import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-matrix-sidecar-"));
  try {
    const source = path.join(directory, "sample.json");
    const views = path.join(directory, "sample.views.json");
    await writeFile(source, JSON.stringify({
      id: "sample",
      version: "1.0.0",
      doctypes: [{ name: "Thing", fields: ["title:Data! Title"], permissions: { Operator: "rwc" } }],
    }), "utf8");
    await run({ source, views });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function matrix() {
  const source = { kind: "projection", name: "thing.matrix.read", permissionDoctype: "Thing", permissionAction: "read" };
  return {
    enabled: true,
    rowAxis: { source, keyField: "row_id", labelField: "label" },
    columnAxis: { source, keyField: "column_id", labelField: "label" },
    cell: { source, identity: { rowField: "row_id", columnField: "column_id" }, valueField: "value", editor: "Data" },
    write: { strategy: "action", action: "thing.matrix.commit", permissionDoctype: "Thing", permissionAction: "write" },
    query: { pageSize: 100, searchLimit: 50, minSearchChars: 1 },
    presentation: { stickyRowAxis: true, stickyColumnAxis: true, focusMode: "toggle", mobileMode: "step" },
    dirtyPolicy: "warn",
    conflictPolicy: "reject",
  };
}

test("view sidecar transports Matrix as canonical top-level authoring metadata", async () => {
  await fixture(async ({ source, views }) => {
    await writeFile(views, JSON.stringify({ version: "1.0.1", views: { Thing: { matrix: matrix() } } }), "utf8");
    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.1");
    assert.deepEqual(brief.doctypes[0].matrix, matrix());
    assert.equal(brief.doctypes[0].mobile, undefined);
  });
});

test("view sidecar can carry legacy Bulk and canonical Matrix together", async () => {
  await fixture(async ({ source, views }) => {
    await writeFile(views, JSON.stringify({
      views: {
        Thing: {
          bulk: { columns: ["title"], editableFields: ["title"], commitStrategy: "document_update", pageSize: 100 },
          matrix: matrix(),
        },
      },
    }), "utf8");
    const brief = await readBriefSource(source);
    assert.equal(brief.doctypes[0].mobile.bulk.enabled, true);
    assert.equal(brief.doctypes[0].matrix.write.action, "thing.matrix.commit");
  });
});

test("view sidecar rejects Matrix overwrite and non-object Matrix before canonical semantic validation", async () => {
  await fixture(async ({ source, views }) => {
    const original = JSON.parse(await (await import("node:fs/promises")).readFile(source, "utf8"));
    original.doctypes[0].matrix = matrix();
    await writeFile(source, JSON.stringify(original), "utf8");
    await writeFile(views, JSON.stringify({ views: { Thing: { matrix: matrix() } } }), "utf8");
    await assert.rejects(() => readBriefSource(source), /đã khai matrix trong brief/);
  });

  await fixture(async ({ source, views }) => {
    await writeFile(views, JSON.stringify({ views: { Thing: { matrix: "not-an-object" } } }), "utf8");
    await assert.rejects(() => readBriefSource(source), /matrix phải là object/);
  });
});
