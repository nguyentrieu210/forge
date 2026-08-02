import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";


test("user session registry migration preserves identity and one-way revocation", () => {
  const result = spawnSync("python3", ["scripts/test-user-session-registry-migration.py"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  assert.match(result.stdout, /user session registry migration: PASS/);
});
