import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEnterpriseImplementationChecklist,
  evaluateImplementationReadiness,
} from "../dist/packages/migration/src/public.js";

test("implementation checklist includes only explicitly enabled domains", () => {
  const checklist = buildEnterpriseImplementationChecklist({
    domains: ["finance", "stock"],
    data_migration: true,
    production: true,
  });
  const keys = checklist.map((item) => item.key);
  assert.deepEqual(keys, [
    "company-setup",
    "accounting-setup",
    "warehouse-setup",
    "master-data-migration",
    "opening-data-migration",
    "post-migration-reconciliation",
    "key-user-training",
    "production-safety-preflight",
    "go-live-approval",
  ]);
  assert.equal(keys.includes("hr-setup"), false);
  assert.equal(keys.includes("tax-localization-setup"), false);
  const safety = checklist.find((item) => item.key === "production-safety-preflight");
  assert.deepEqual(safety.depends_on, ["post-migration-reconciliation", "key-user-training"]);
  const goLive = checklist.find((item) => item.key === "go-live-approval");
  assert.deepEqual(goLive.depends_on, ["production-safety-preflight"]);
});

test("non-production greenfield setup does not invent migration or safety gates", () => {
  const checklist = buildEnterpriseImplementationChecklist({
    domains: ["stock"],
    data_migration: false,
    production: false,
  });
  assert.deepEqual(checklist.map((item) => item.key), [
    "company-setup",
    "warehouse-setup",
    "key-user-training",
    "go-live-approval",
  ]);
  const goLive = checklist.find((item) => item.key === "go-live-approval");
  assert.deepEqual(goLive.depends_on, ["company-setup", "warehouse-setup", "key-user-training"]);
});

test("generated checklist becomes go-live ready only after required tasks complete", () => {
  const pending = buildEnterpriseImplementationChecklist({
    domains: ["finance", "tax"],
    data_migration: true,
    production: false,
  });
  assert.equal(evaluateImplementationReadiness(pending).ready_for_go_live, false);
  const completed = pending.map((item) => ({ ...item, status: "done", evidence: [`evidence:${item.key}`] }));
  const readiness = evaluateImplementationReadiness(completed);
  assert.equal(readiness.ready_for_go_live, true);
  assert.equal(readiness.required_open.length, 0);
});
