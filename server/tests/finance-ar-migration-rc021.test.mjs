import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("RC-021 AR migration guards and reconciliation projection pass", () => {
  const result = spawnSync("python3", ["scripts/test-finance-ar-reconciliation.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /FINANCE_AR_RECONCILIATION_0111_PASS/);
});
