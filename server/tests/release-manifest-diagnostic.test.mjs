import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("release manifest matches current source tree", () => {
  const result = spawnSync("python3", ["scripts/release-manifest.py", "--verify"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.status, 0, "release manifest must match current source tree");
});
