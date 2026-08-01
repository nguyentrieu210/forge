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
    await writeFile(source, JSON.stringify({ id: "sample", version: "1.0.0", doctypes: [], prints: [{ name: "Existing" }] }), "utf8");
    await run({ directory, source, printsSource: path.join(directory, "sample.prints.json") });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("readBriefSource returns an ordinary brief when no print sidecar exists", async () => {
  await withTempBrief(async ({ source }) => {
    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.0");
    assert.deepEqual(brief.prints.map((entry) => entry.name), ["Existing"]);
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
      prints: [{ name: "Sales Order", doctype: "Sales Order", css: [], html: [] }],
    }), "utf8");

    const brief = await readBriefSource(source);
    assert.equal(brief.version, "1.0.1");
    assert.deepEqual(brief.prints.map((entry) => entry.name), ["Existing", "Sales Order"]);
  });
});

test("readBriefSource rejects unrelated sidecar keys", async () => {
  await withTempBrief(async ({ source, printsSource }) => {
    await writeFile(printsSource, JSON.stringify({ prints: [{ name: "Sales Order" }], fixtures: [] }), "utf8");
    await assert.rejects(() => readBriefSource(source), /chỉ nhận version, prints/);
  });
});
