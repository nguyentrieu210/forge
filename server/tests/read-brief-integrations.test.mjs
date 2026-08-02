import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

async function withBrief(base, integration, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-brief-integrations-"));
  const source = path.join(directory, "sample.json");
  const integrationsSource = path.join(directory, "sample.integrations.json");
  try {
    await writeFile(source, JSON.stringify(base), "utf8");
    await writeFile(integrationsSource, JSON.stringify(integration), "utf8");
    await run(source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const baseBrief = {
  id: "sample",
  name: "Sample",
  version: "1.0.0",
  requires: [{ id: "hrm", version: "1.0.0" }],
  externalDocTypes: [{ name: "Account", kind: "tree", app: "erpnext" }],
  doctypes: [{ name: "Sample Record", fields: ["title:Data! Title"], permissions: { User: "rwc" } }],
};

test("integration sidecar appends dependencies and external DocTypes without replacing existing declarations", async () => {
  await withBrief(baseBrief, {
    version: "1.1.0",
    requires: [{ id: "vn-accounting", version: "1.1.0" }],
    externalDocTypes: [
      { name: "Warehouse Cash Voucher", kind: "transaction", app: "vn-accounting", version: "1.1.0" },
      { name: "Warehouse Cash Fund", kind: "master", app: "vn-accounting", version: "1.1.0" },
    ],
  }, async (source) => {
    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.1.0");
    assert.deepEqual(brief.requires.map((entry) => entry.id), ["hrm", "vn-accounting"]);
    assert.deepEqual(brief.externalDocTypes.map((entry) => entry.name), ["Account", "Warehouse Cash Voucher", "Warehouse Cash Fund"]);
  });
});

test("integration sidecar rejects duplicate dependency ownership", async () => {
  await withBrief(baseBrief, {
    requires: [{ id: "hrm", version: "2.0.0" }],
  }, async (source) => {
    await assert.rejects(() => readBriefSource(source), /dependency trùng id: hrm/);
  });
});

test("integration sidecar rejects duplicate external DocType ownership", async () => {
  await withBrief(baseBrief, {
    externalDocTypes: [{ name: "Account", kind: "tree", app: "erpnext" }],
  }, async (source) => {
    await assert.rejects(() => readBriefSource(source), /external DocType trùng tên: Account/);
  });
});

test("integration sidecar rejects unrelated keys", async () => {
  await withBrief(baseBrief, {
    requires: [{ id: "vn-accounting", version: "1.1.0" }],
    nav: [],
  }, async (source) => {
    await assert.rejects(() => readBriefSource(source), /chỉ nhận version, requires, externalDocTypes/);
  });
});
