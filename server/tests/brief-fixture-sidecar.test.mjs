import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

async function withBrief(base, sidecar, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-fixture-sidecar-"));
  try {
    const source = path.join(directory, "sample.json");
    await writeFile(source, `${JSON.stringify(base, null, 2)}\n`, "utf8");
    if (sidecar !== undefined) {
      await writeFile(path.join(directory, "sample.fixtures.json"), `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
    }
    await run(source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("fixture sidecar appends canonical master fixtures without changing package version", async () => {
  await withBrief(
    { id: "sample", name: "Sample", version: "1.2.3", fixtures: [{ type: "Existing", name: "A", data: { value: 1 } }] },
    { fixtures: [{ type: "Reason", name: "R1", data: { reason_name: "Reason 1" } }] },
    async (source) => {
      const brief = await readBriefSource(source);
      assert.equal(brief.version, "1.2.3");
      assert.deepEqual(brief.fixtures.map(({ type, name }) => [type, name]), [["Existing", "A"], ["Reason", "R1"]]);
    },
  );
});

test("fixture sidecar rejects duplicate type/name identities and unsupported keys", async () => {
  await withBrief(
    { id: "sample", name: "Sample", fixtures: [{ type: "Reason", name: "R1", data: {} }] },
    { fixtures: [{ type: "Reason", name: "R1", data: {} }] },
    async (source) => {
      await assert.rejects(() => readBriefSource(source), /fixture trùng Reason\/R1/);
    },
  );
  await withBrief(
    { id: "sample", name: "Sample" },
    { version: "9.9.9", fixtures: [{ type: "Reason", name: "R1", data: {} }] },
    async (source) => {
      await assert.rejects(() => readBriefSource(source), /chỉ nhận fixtures.*version/);
    },
  );
});
