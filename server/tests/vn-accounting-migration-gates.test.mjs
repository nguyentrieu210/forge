import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const script of [
  "scripts/test-vn-accounting-period-hardening.py",
  "scripts/test-vn-accounting-integrity-closure.py",
]) {
  test(`critical accounting migration gate: ${script}`, () => {
    const result = spawnSync("python3", [script], { encoding: "utf8" });
    assert.equal(result.status, 0, `${script}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /VN_ACCOUNTING_.*_PASS/);
  });
}
