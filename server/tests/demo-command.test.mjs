import test from "node:test";
import assert from "node:assert/strict";
import { githubOutputLines, parseDemoIssueCommand } from "../scripts/lib/demo-command.mjs";

const SHA = "c014a79547dc3b379fa80b0545f0395b95effcdc";
const valid = (overrides = {}) => `${"/forge-demo-provision"}\n${JSON.stringify({
  customer_name: "Thúy",
  slug: "thuy",
  brief: "marketplace-demo",
  admin_user: "admin",
  plan: "pro",
  provision_standard: false,
  target_sha: SHA,
  confirm: "demo",
  ...overrides,
})}`;

test("parses the exact owner-authorized demo command payload", () => {
  assert.deepEqual(parseDemoIssueCommand(valid()), {
    customer_name: "Thúy",
    slug: "thuy",
    brief: "marketplace-demo",
    admin_user: "admin",
    plan: "pro",
    provision_standard: false,
    target_sha: SHA,
    confirm: "demo",
  });
});

test("rejects a wrong command prefix or missing explicit confirmation", () => {
  assert.throws(() => parseDemoIssueCommand(valid().replace("/forge-demo-provision", "/run")), /first line/);
  assert.throws(() => parseDemoIssueCommand(valid({ confirm: "yes" })), /confirm/);
});

test("rejects unknown keys and non-exact SHA values", () => {
  const object = JSON.parse(valid().split("\n").slice(1).join("\n"));
  object.extra = true;
  assert.throws(() => parseDemoIssueCommand(`/forge-demo-provision\n${JSON.stringify(object)}`), /unsupported command key/);
  assert.throws(() => parseDemoIssueCommand(valid({ target_sha: "main" })), /40-character/);
});

test("rejects unsafe names and malformed tenant inputs", () => {
  assert.throws(() => parseDemoIssueCommand(valid({ customer_name: "Thúy\nInjected" })), /one line/);
  assert.throws(() => parseDemoIssueCommand(valid({ slug: "-thuy" })), /DNS label/);
  assert.throws(() => parseDemoIssueCommand(valid({ brief: "../marketplace" })), /brief/);
});

test("emits single-line GitHub outputs only", () => {
  const lines = githubOutputLines(parseDemoIssueCommand(valid()));
  assert.equal(lines.length, 8);
  assert.equal(lines.some((line) => /\r|\n/.test(line)), false);
  assert.ok(lines.includes(`target_sha=${SHA}`));
});
