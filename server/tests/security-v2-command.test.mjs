import test from "node:test";
import assert from "node:assert/strict";
import { parseSecurityV2IssueCommand, securityV2GithubOutputLines } from "../scripts/lib/security-v2-command.mjs";

const SHA = "a".repeat(40);

test("parses exact security-v2 bootstrap command", () => {
  const command = parseSecurityV2IssueCommand(`/forge-security-v2-bootstrap\n{"target_sha":"${SHA}","confirm":"security-v2"}`);
  assert.deepEqual(command, { target_sha: SHA, confirm: "security-v2" });
  assert.deepEqual(securityV2GithubOutputLines(command), [`target_sha=${SHA}`, "confirm=security-v2"]);
});

test("rejects wrong prefix, confirmation, sha and unknown keys", () => {
  assert.throws(() => parseSecurityV2IssueCommand(`/forge-security-v2\n{"target_sha":"${SHA}","confirm":"security-v2"}`), /first line/);
  assert.throws(() => parseSecurityV2IssueCommand(`/forge-security-v2-bootstrap\n{"target_sha":"${SHA}","confirm":"yes"}`), /confirm/);
  assert.throws(() => parseSecurityV2IssueCommand(`/forge-security-v2-bootstrap\n{"target_sha":"main","confirm":"security-v2"}`), /target_sha/);
  assert.throws(() => parseSecurityV2IssueCommand(`/forge-security-v2-bootstrap\n{"target_sha":"${SHA}","confirm":"security-v2","shell":"rm -rf"}`), /unknown/);
});
