import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CUTTING_POLICIES,
  assertCuttingPolicyCatalog,
} from "../scripts/lib/alumdoor-cutting-policy-catalog.mjs";

const SOURCE = new URL("../briefs/alumdoor.json", import.meta.url);
const POLICY_NAME = "Cửa tấm liền Úc — công thức chuẩn";

async function sourceFixture() {
  const brief = JSON.parse(await readFile(SOURCE, "utf8"));
  return brief.fixtures.find((entry) => entry.type === "Cutting Policy" && entry.name === POLICY_NAME);
}

test("tấm liền Úc source fixture preserves the evidence-backed commercial and leaf contract", async () => {
  const fixture = await sourceFixture();
  assert.ok(fixture, `missing source fixture ${POLICY_NAME}`);
  assert.equal(fixture.data.policy_name, POLICY_NAME);
  assert.equal(fixture.data.door_type, "Cửa tấm liền Úc");
  assert.equal(fixture.data.dealer_width_basis, "Phủ bì ray");
  assert.equal(fixture.data.retail_width_basis, "Phủ bì ray");
  assert.equal(fixture.data.dealer_split_sales_basis, "Phủ bì ray");
  assert.equal(fixture.data.dealer_full_sales_basis, "Phủ bì ray");
  assert.equal(fixture.data.retail_sales_basis, "Phủ bì ray");
  assert.equal(fixture.data.purchase_formula, "Kg thực tế");
  assert.equal(fixture.data.leaf_formula, "Kiểu tấm liền Úc");
  assert.equal(fixture.data.leaf_height_deduction_m, 0.13);
  assert.equal(fixture.data.leaf_divisor_source, "Hằng số của chính sách");
  assert.equal(fixture.data.leaf_divisor_const, 0.068);
  assert.equal(fixture.data.leaf_rounding, "Làm tròn xuống");
  assert.equal(fixture.data.ray_type, undefined, "ray type is a per-line choice, not a fixed policy default");
});

test("tấm liền Úc live geometry stays ray-specific in the canonical catalog", () => {
  assert.equal(assertCuttingPolicyCatalog(), true);
  const policy = CUTTING_POLICIES.find((entry) => entry.name === POLICY_NAME);
  assert.ok(policy, `missing canonical policy ${POLICY_NAME}`);
  assert.equal(policy.code, "CP-CUA-TAM-LIEN-UC");
  assert.equal(policy.geometryProfile, "GP-CUA-UC");

  const u70 = policy.rules.find((entry) => entry.code === "TLUC-RCL-U70");
  const u76 = policy.rules.find((entry) => entry.code === "TLUC-RCL-U76");
  assert.deepEqual(
    { target: u70?.targetField, source: u70?.sourceField, operator: u70?.operator, operand: u70?.operandM, ray: u70?.conditions.ray_type },
    { target: "CAT_LA_RONG", source: "PB_RAY_RONG", operator: "SUBTRACT", operand: 0.05, ray: "Ray sắt U70" },
  );
  assert.deepEqual(
    { target: u76?.targetField, source: u76?.sourceField, operator: u76?.operator, operand: u76?.operandM, ray: u76?.conditions.ray_type },
    { target: "CAT_LA_RONG", source: "PB_RAY_RONG", operator: "SUBTRACT", operand: 0.08, ray: "Ray hộp/đơn U76" },
  );
});
