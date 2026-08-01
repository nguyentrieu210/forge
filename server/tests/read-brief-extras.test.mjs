import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

test("brief extras append bounded metadata and may advance version", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-brief-extras-"));
  const source = path.join(dir, "factory.json");
  await writeFile(source, JSON.stringify({ version: "1.0.0", doctypes: [{ name: "Existing" }] }));
  await writeFile(path.join(dir, "factory.extras.json"), JSON.stringify({
    version: "1.1.0",
    doctypes: [{ name: "Manufacturing Cost Rate" }],
  }));

  const result = await readBriefSource(source);
  assert.equal(result.version, "1.1.0");
  assert.deepEqual(result.doctypes.map((row) => row.name), ["Existing", "Manufacturing Cost Rate"]);
});

test("brief extras reject duplicate DocType names after composition", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-brief-extras-"));
  const source = path.join(dir, "factory.json");
  await writeFile(source, JSON.stringify({ version: "1.0.0", doctypes: [{ name: "Existing" }] }));
  await writeFile(path.join(dir, "factory.extras.json"), JSON.stringify({ doctypes: [{ name: "Existing" }] }));

  await assert.rejects(
    () => readBriefSource(source),
    /DocType bị trùng/,
  );
});
