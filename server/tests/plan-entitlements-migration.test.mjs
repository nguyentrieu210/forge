import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";


test("plan entitlement governance schema enforces typed rules and immutable audit", () => {
  const result = spawnSync("python3", ["scripts/test-plan-entitlements-migration.py"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  assert.match(result.stdout, /plan entitlement governance migration: PASS/);
});
