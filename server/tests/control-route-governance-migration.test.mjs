import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";


test("control-plane route audit migration is append-only and constrained", () => {
  const result = spawnSync("python3", ["scripts/test-control-route-governance-migration.py"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  assert.match(result.stdout, /control route governance migration: PASS/);
});
