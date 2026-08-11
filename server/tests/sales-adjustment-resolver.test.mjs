import test from "node:test";
import assert from "node:assert/strict";
import {
  SALES_ADJUSTMENT_RULE_DOCTYPE,
  resolveSalesAdjustments,
} from "../dist/packages/clouderp-selling/src/index.js";

function context(rows, { omitDocuments = false } = {}) {
  return {
    command: { tenant_id: "tenant-a" },
    reader: {
      async listMasterRecordData(tenantId, doctype) {
        assert.equal(tenantId, "tenant-a");
        assert.equal(doctype, SALES_ADJUSTMENT_RULE_DOCTYPE);
        // Match the real MasterDataReader contract: list returns only name + data.
        return rows.map(({ name, data }) => ({ name, data }));
      },
      async getDocument(tenantId, doctype, name) {
        assert.equal(tenantId, "tenant-a");
        assert.equal(doctype, SALES_ADJUSTMENT_RULE_DOCTYPE);
        if (omitDocuments) return null;
        const row = rows.find((candidate) => candidate.name === name);
        if (!row) return null;
        return {
          tenant_id: tenantId,
          doctype,
          name,
          owner: "Administrator",
          docstatus: 0,
          status: "Draft",
          version: row.version,
          created_at: "2026-08-11T00:00:00.000Z",
          modified_at: "2026-08-11T00:00:00.000Z",
          data: row.data,
          children: [],
        };
      },
    },
  };
}

test("resolver reads rule amount and condition from master data and snapshots canonical source revision", async () => {
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

test("money-changing rule fails closed when it is not backed by a canonical document", async () => {
  await assert.rejects(
    resolveSalesAdjustments(context([
      {
        name: "SAR-SEED-ONLY",
        version: 1,
        data: {
          code: "SEED_ONLY",
          currency: "VND",
          basis: "FIXED",
          rate: 1000,
        },
      },
    ], { omitDocuments: true }), {
      postingDate: "2026-08-11",
      currency: "VND",
      currencyScale: 0,
      facts: {},
    }),
    (error) => error instanceof Error && /must be a canonical active document/.test(error.message),
  );
});