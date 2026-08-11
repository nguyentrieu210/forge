import test from "node:test";
import assert from "node:assert/strict";
import {
  SALES_ADJUSTMENT_RULE_DOCTYPE,
  resolveSalesAdjustments,
} from "../dist/packages/clouderp-selling/src/index.js";

function context(rows) {
  return {
    command: { tenant_id: "tenant-a" },
    reader: {
      async listMasterRecordData(tenantId, doctype) {
        assert.equal(tenantId, "tenant-a");
        assert.equal(doctype, SALES_ADJUSTMENT_RULE_DOCTYPE);
        return rows;
      },
    },
  };
}

test("resolver reads rule amount and condition from master data and returns source revision", async () => {
  const resolved = await resolveSalesAdjustments(context([
    {
      name: "SAR-001",
      version: 9,
      data: {
        code: "AREA_FINISH",
        description: "Area finish",
        currency: "VND",
        basis: "AREA_SQM",
        rate: 250000,
        conditions: [{ field: "finish_type", operator: "eq", value: "PREMIUM" }],
      },
    },
  ]), {
    postingDate: "2026-08-11",
    currency: "VND",
    currencyScale: 0,
    facts: { finish_type: "PREMIUM" },
    area_sqm: 4.25,
  });

  assert.equal(resolved.applied.length, 1);
  assert.equal(resolved.applied[0].amount_minor, 1062500);
  assert.equal(resolved.applied[0].rule_name, "SAR-001");
  assert.equal(resolved.applied[0].rule_version, 9);
});

test("resolver returns no adjustment when persisted conditions do not match", async () => {
  const resolved = await resolveSalesAdjustments(context([
    {
      name: "SAR-002",
      version: 1,
      data: {
        code: "FIXED_OPTION",
        currency: "VND",
        basis: "FIXED",
        rate: 300000,
        conditions: [{ field: "option", operator: "eq", value: "YES" }],
      },
    },
  ]), {
    postingDate: "2026-08-11",
    currency: "VND",
    currencyScale: 0,
    facts: { option: "NO" },
  });

  assert.deepEqual(resolved.applied, []);
  assert.deepEqual(resolved.unresolved_rules, []);
});
