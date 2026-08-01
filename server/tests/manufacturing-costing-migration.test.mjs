import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));

test("manufacturing costing migration keeps snapshot/freeze/adjustment immutable", () => {
  const result = spawnSync("python3", ["scripts/test-manufacturing-costing-migration.py"], {
    cwd: serverRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MANUFACTURING_COSTING_MIGRATION_0037_PASS/);
});
