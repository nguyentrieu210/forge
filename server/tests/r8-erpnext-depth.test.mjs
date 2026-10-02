import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

test("R8 ERPNext baseline and denominator are fail-closed", async () => {
  const lock = await readJson(path.join(serverRoot, "source-lock.json"));
  const ledger = await readJson(path.join(serverRoot, "docs/spec/source-exact/erpnext-artifact-resolution-ledger.json"));
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const source = lock.sources.find((x) => x.app === "erpnext");

  assert.equal(source.tag, matrix.upstream.tag);
  assert.equal(source.full_sha, matrix.upstream.full_sha);
  assert.equal(ledger.baseline.tag, matrix.upstream.tag);
  assert.equal(ledger.baseline.commit, matrix.upstream.full_sha);
  assert.equal(ledger.entries.length, 109);
  assert.equal(matrix.module_depth.length, 11);
  assert.equal(matrix.flow_depth.length, 18);

  const canonical = ledger.entries.map((x) => x.resolution_id).sort();
  const covered = matrix.module_depth.flatMap((x) => x.artifact_resolution_ids).sort();
  assert.deepEqual(covered, canonical);
  assert.equal(new Set(matrix.flow_depth.map((x) => x.flow_id)).size, 18);
});

test("R8 starts conservatively instead of fabricating ERPNext parity", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const o2c = matrix.flow_depth.find((x) => x.flow_id === "R8-F01-O2C");
  assert.equal(o2c.classification, "PARTIAL");
  assert.ok(matrix.module_depth.every((x) => x.classification === "UNRESOLVED"));
  assert.ok(matrix.flow_depth.filter((x) => x.flow_id !== "R8-F01-O2C").every((x) => x.classification === "UNRESOLVED"));
});
