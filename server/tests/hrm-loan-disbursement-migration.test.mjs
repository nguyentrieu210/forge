import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("HRM loan disbursement SQLite migration regression passes", () => {
  const result = spawnSync("python3", ["scripts/test-hrm-loan-disbursement-migration.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `loan-disbursement migration regression failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.match(result.stdout, /HRM loan disbursement migration regression: PASS/);
});
