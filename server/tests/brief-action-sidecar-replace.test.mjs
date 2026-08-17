import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

async function withBrief(base, sidecar, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-action-sidecar-"));
  try {
    const source = path.join(directory, "sample.json");
    await writeFile(source, `${JSON.stringify(base, null, 2)}\n`, "utf8");
    await writeFile(path.join(directory, "sample.actions.json"), `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
    await run(source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("action sidecar can replace one named base action in place and strips transport metadata", async () => {
  await withBrief(
    { id: "sample", name: "Sample", version: "1.0.0", actions: [
      { name: "release", label: "Release", fields: ["reason:Small Text! Reason"], commit: "sample.release | Release" },
      { name: "keep", label: "Keep", fields: [], commit: "sample.keep | Keep" },
    ] },
    { actions: [{ replace: true, name: "release", label: "Release", fields: ["reason:Link(Reason)! Reason"], commit: "sample.release | Release" }] },
    async (source) => {
      const brief = await readBriefSource(source);
      assert.deepEqual(brief.actions.map((action) => action.name), ["release", "keep"]);
      assert.equal(brief.actions[0].fields[0], "reason:Link(Reason)! Reason");
      assert.equal("replace" in brief.actions[0], false);
    },
  );
});

test("action sidecar replacement is fail-closed for a missing target", async () => {
  await withBrief(
    { id: "sample", name: "Sample", actions: [{ name: "keep", label: "Keep", fields: [], commit: "sample.keep | Keep" }] },
    { actions: [{ replace: true, name: "missing", label: "Missing", fields: [], commit: "sample.missing | Missing" }] },
    async (source) => {
      await assert.rejects(() => readBriefSource(source), /action replace không tồn tại trong brief gốc: missing/);
    },
  );
});
