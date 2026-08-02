import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";


test("TOTP MFA migration enforces encrypted-factor and recovery-code lifecycle", () => {
  const result = spawnSync("python3", ["scripts/test-user-mfa-totp-migration.py"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  assert.match(result.stdout, /user MFA TOTP migration: PASS/);
});
