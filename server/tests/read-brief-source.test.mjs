import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

async function withTempBrief(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-brief-source-"));
  try {
    const source = path.join(directory, "sample.json");
    await writeFile(source, JSON.stringify({
      id: "sample",
      version: "1.0.0",
      doctypes: [{
        name: "Stock Entry",
        permissions: { "Stock User": "rwc" },
        fields: ["purpose:Data! Purpose", "note:Data Note"],
      }],
      prints: [{ name: "Existing" }],
    }), "utf8");
    await run({
      directory,
      source,
      printsSource: path.join(directory, "sample.prints.json"),
      permissionsSource: path.join(directory, "sample.permissions.json"),
      viewsSource: path.join(directory, "sample.views.json"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("readBriefSource returns an ordinary brief when no sidecar exists", async () => {
  await withTempBrief(async ({ source }) => {
    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.0");
    assert.deepEqual(brief.prints.map((entry) => entry.name), ["Existing"]);
    assert.deepEqual(brief.doctypes[0].permissions, { "Stock User": "rwc" });
  });
});

test("readBriefSource accepts file URLs used by import.meta.url call sites", async () => {
  await withTempBrief(async ({ source }) => {
    const brief = await readBriefSource(pathToFileURL(source));
    assert.equal(brief.id, "sample");
    assert.deepEqual(brief.prints.map((entry) => entry.name), ["Existing"]);
  });
});

test("readBriefSource appends sidecar prints and may advance the app version", async () => {
  await withTempBrief(async ({ source, printsSource }) => {
    await writeFile(printsSource, JSON.stringify({
      "//purpose": "Print formats live beside the business brief.",
      version: "1.0.1",
      prints: [{ name: "Sales Order", doctype: "Stock Entry", css: [], html: [] }],
    }), "utf8");

    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.1");
    assert.deepEqual(brief.prints.map((entry) => entry.name), ["Existing", "Sales Order"]);
  });
});

test("readBriefSource replaces complete DocType permission maps from a sidecar", async () => {
  await withTempBrief(async ({ source, permissionsSource }) => {
    await writeFile(permissionsSource, JSON.stringify({
      "//purpose": "RBAC changes are reviewed as a small complete role matrix.",
      version: "1.0.2",
      permissions: {
        "Stock Entry": {
          "Chủ xưởng": "rwcs",
          "Thủ kho": "rwcs",
          "Sản xuất": "rwc",
          "Kế toán": "r",
        },
      },
    }), "utf8");

    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.2");
    assert.deepEqual(brief.doctypes[0].permissions, {
      "Chủ xưởng": "rwcs",
      "Thủ kho": "rwcs",
      "Sản xuất": "rwc",
      "Kế toán": "r",
    });
  });
});

test("readBriefSource merges independently reviewable bulk view policy", async () => {
  await withTempBrief(async ({ source, viewsSource }) => {
    await writeFile(viewsSource, JSON.stringify({
      version: "1.0.3",
      views: {
        "Stock Entry": {
          bulk: {
            columns: ["purpose", "note"],
            editableFields: ["note"],
            commitStrategy: "document_update",
            allowPaste: true,
            pageSize: 100,
          },
        },
      },
    }), "utf8");

    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.3");
    assert.deepEqual(brief.doctypes[0].mobile.bulk, {
      enabled: true,
      columns: ["purpose", "note"],
      editableFields: ["note"],
      commitStrategy: "document_update",
      allowPaste: true,
      pageSize: 100,
    });
  });
});

test("readBriefSource rejects bulk editable fields outside columns", async () => {
  await withTempBrief(async ({ source, viewsSource }) => {
    await writeFile(viewsSource, JSON.stringify({
      views: { "Stock Entry": { bulk: { columns: ["purpose"], editableFields: ["note"] } } },
    }), "utf8");
    await assert.rejects(() => readBriefSource(source), /editableFields phải nằm trong columns: note/);
  });
});

test("readBriefSource rejects view overrides for missing DocTypes", async () => {
  await withTempBrief(async ({ source, viewsSource }) => {
    await writeFile(viewsSource, JSON.stringify({
      views: { Missing: { bulk: { columns: ["name"], editableFields: ["name"] } } },
    }), "utf8");
    await assert.rejects(() => readBriefSource(source), /DocType không tồn tại trong brief: Missing/);
  });
});

test("readBriefSource rejects permission overrides for missing DocTypes", async () => {
  await withTempBrief(async ({ source, permissionsSource }) => {
    await writeFile(permissionsSource, JSON.stringify({
      permissions: { Missing: { "System Manager": "rwcs" } },
    }), "utf8");
    await assert.rejects(() => readBriefSource(source), /DocType không tồn tại trong brief: Missing/);
  });
});

test("readBriefSource rejects unrelated print sidecar keys", async () => {
  await withTempBrief(async ({ source, printsSource }) => {
    await writeFile(printsSource, JSON.stringify({ prints: [{ name: "Sales Order" }], fixtures: [] }), "utf8");
    await assert.rejects(() => readBriefSource(source), /chỉ nhận version, prints/);
  });
});

test("readBriefSource rejects unrelated permission sidecar keys", async () => {
  await withTempBrief(async ({ source, permissionsSource }) => {
    await writeFile(permissionsSource, JSON.stringify({ permissions: { "Stock Entry": { "Thủ kho": "rwcs" } }, fixtures: [] }), "utf8");
    await assert.rejects(() => readBriefSource(source), /chỉ nhận version, permissions/);
  });
});

test("readBriefSource rejects unrelated view sidecar keys", async () => {
  await withTempBrief(async ({ source, viewsSource }) => {
    await writeFile(viewsSource, JSON.stringify({ views: { "Stock Entry": { bulk: { columns: ["note"], editableFields: ["note"] } } }, fixtures: [] }), "utf8");
    await assert.rejects(() => readBriefSource(source), /chỉ nhận version, views/);
  });
});
