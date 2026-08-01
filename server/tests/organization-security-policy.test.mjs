import assert from "node:assert/strict";
import test from "node:test";
import { matchesApprovalCondition } from "../dist/packages/organization-security/src/index.js";

test("approval policy conditions support bounded equality, comparisons and set membership", () => {
  const document = { company: "Demo", grand_total: "1250000", currency: "VND", project: "" };
  assert.equal(matchesApprovalCondition({}, document), true);
  assert.equal(matchesApprovalCondition({ company: "Demo", grand_total: { $gte: 1_000_000 }, currency: { $in: ["VND", "USD"] } }, document), true);
  assert.equal(matchesApprovalCondition({ grand_total: { $lt: 1_000_000 } }, document), false);
  assert.equal(matchesApprovalCondition({ project: { $exists: false } }, document), true);
});

test("approval policy conditions compose all/any without evaluating executable expressions", () => {
  const document = { company: "Demo", department: "ACC", amount: 500 };
  assert.equal(matchesApprovalCondition({
    all: [
      { company: "Demo" },
      { any: [{ department: "ACC" }, { amount: { $gt: 1_000 } }] },
    ],
  }, document), true);
  assert.equal(matchesApprovalCondition({ any: [{ department: "HR" }, { amount: { $gt: 1_000 } }] }, document), false);
  assert.equal(matchesApprovalCondition({ amount: { $where: "return true" } }, document), false);
});
