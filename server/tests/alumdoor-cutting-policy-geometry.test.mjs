import assert from "node:assert/strict";
import test from "node:test";

import {
  CUTTING_POLICIES,
  assertCuttingPolicyCatalog,
  cuttingPolicyByName,
  cuttingPolicyFixtureData,
} from "../scripts/lib/alumdoor-cutting-policy-catalog.mjs";
import { GEOMETRY_PROFILES } from "../scripts/lib/alumdoor-geometry-catalog.mjs";
import { evaluateGeometryRules } from "../dist/apps-src/alumdoor-worker/src/geometry-policy.js";

function profile(code) {
  const value = GEOMETRY_PROFILES.find((entry) => entry.code === code);
  assert.ok(value, `missing geometry profile ${code}`);
  return value;
}

function run(policyName, inputs, context = {}) {
  const policy = cuttingPolicyByName(policyName);
  assert.ok(policy, `missing policy ${policyName}`);
  return evaluateGeometryRules({
    policy_name: policy.name,
    geometry_profile: policy.geometryProfile,
    profile_fields: profile(policy.geometryProfile).fields,
    rules: cuttingPolicyFixtureData(policy).geometry_rules,
    inputs,
    context,
    required_targets: policy.requiredTargets,
  });
}

test("canonical Cutting Policy catalog only targets fields in its Geometry Profile", () => {
  assert.equal(assertCuttingPolicyCatalog(), true);
  assert.equal(CUTTING_POLICIES.length, 6);
  assert.equal(CUTTING_POLICIES.reduce((sum, policy) => sum + policy.rules.length, 0), 18);
});

test("Cửa Đức separates PB nhựa dealer and PB ray retail without guessing", () => {
  const dealer = run("Cửa Đức — công thức chuẩn", { PB_CAO: 3, PB_NHUA_RONG: 4 }, { customer_group: "Đại lý" });
  assert.equal(dealer.values.CAT_LA_RONG, 3.98);
  assert.equal(dealer.applied_rules[0].rule_code, "DUC-RCL-DL");

  const retail = run("Cửa Đức — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }, { customer_group: "Lẻ" });
  assert.equal(retail.values.CAT_LA_RONG, 3.92);
  assert.equal(retail.applied_rules[0].rule_code, "DUC-RCL-LE");

  assert.throws(
    () => run("Cửa Đức — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }),
    /chưa có quy tắc phù hợp.*CAT_LA_RONG/i,
  );
});

test("Cửa Úc computes RCL -0.03 and only computes U70 ray length when ray context exists", () => {
  const base = run("Cửa Úc — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 });
  assert.equal(base.values.CAT_LA_RONG, 3.97);
  assert.equal(base.values.RAY_DAI, undefined);

  const u70 = run("Cửa Úc — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }, { ray_type: "Ray sắt U70" });
  assert.equal(u70.values.CAT_LA_RONG, 3.97);
  assert.equal(u70.values.RAY_DAI, 2.9);
});

test("Cửa tấm liền Úc refuses missing ray type and uses the two proven AL70 deductions", () => {
  assert.throws(
    () => run("Cửa tấm liền Úc — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }),
    /chưa có quy tắc phù hợp.*CAT_LA_RONG/i,
  );
  assert.equal(
    run("Cửa tấm liền Úc — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }, { ray_type: "Ray sắt U70" }).values.CAT_LA_RONG,
    3.95,
  );
  assert.equal(
    run("Cửa tấm liền Úc — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }, { ray_type: "Ray hộp/đơn U76" }).values.CAT_LA_RONG,
    3.92,
  );
});

test("butterfly rule wins by specificity for Lưới and Đài Loan", () => {
  const normal = run("Cửa Lưới — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 });
  const butterfly = run("Cửa Lưới — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }, { has_butterfly_bracket: true });
  assert.equal(normal.values.CAT_LA_RONG, 3.97);
  assert.equal(butterfly.values.CAT_LA_RONG, 3.965);
  assert.equal(butterfly.values.RAY_DAI, 2.9);
  assert.equal(butterfly.values.V4_DAI, 3.97);
  assert.equal(butterfly.values.TRUC_DAI, 3.95);

  const dl = run("Cửa Đài Loan — công thức chuẩn", { PB_CAO: 3, PB_RAY_RONG: 4 }, { has_butterfly_bracket: true });
  assert.equal(dl.values.CAT_LA_RONG, 3.965);
  assert.equal(dl.values.RAY_DAI, 2.9);
  assert.equal(dl.values.V4_DAI, 3.97);
  assert.equal(dl.values.TRUC_DAI, 3.95);
});

test("equal top rules are rejected instead of guessed", () => {
  assert.throws(() => evaluateGeometryRules({
    policy_name: "tie",
    geometry_profile: "GP-CUA-SIEU-TRUONG",
    profile_fields: profile("GP-CUA-SIEU-TRUONG").fields,
    inputs: { PB_CAO: 3, PB_RAY_RONG: 4 },
    required_targets: ["CAT_LA_RONG"],
    rules: [
      { rule_code: "A", target_field: "CAT_LA_RONG", source_field: "PB_RAY_RONG", operator: "SUBTRACT", operand_m: 0.03, priority: 0 },
      { rule_code: "B", target_field: "CAT_LA_RONG", source_field: "PB_RAY_RONG", operator: "SUBTRACT", operand_m: 0.04, priority: 0 },
    ],
  }), /Hệ thống không đoán/);
});

test("Cutting Policy does not contain BOM quantity or pricing formulas", () => {
  const serialized = JSON.stringify(CUTTING_POLICIES).toLocaleLowerCase("vi");
  for (const forbidden of ["đơn giá", "giá bán", "xốp", "ron đáy", "kg/m2", "quantity", "bom"]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden cross-layer concern: ${forbidden}`);
  }
});
