import test from "node:test";
import assert from "node:assert/strict";
import { resolveContextDimensionValue } from "../dist/packages/frappe-api/src/index.js";

test("an allowed optional business-context selection is preserved", () => {
  assert.equal(
    resolveContextDimensionValue("K36", ["K12", "K36"], { required: false, locked: false }),
    "K36",
  );
});

test("clearing an optional business-context dimension keeps the all option", () => {
  assert.equal(
    resolveContextDimensionValue(undefined, ["K12", "K36"], { required: false, locked: false }),
    undefined,
  );
});

test("an invalid stored selection cannot escape the permitted option set", () => {
  assert.equal(
    resolveContextDimensionValue("OTHER-TENANT-WAREHOUSE", ["K12", "K36"], { required: false, locked: false }),
    undefined,
  );
});

test("required and permission-locked dimensions still resolve safely", () => {
  assert.equal(
    resolveContextDimensionValue(undefined, ["Company A", "Company B"], {
      required: true,
      locked: false,
      defaultValue: "Company B",
    }),
    "Company B",
  );
  assert.equal(
    resolveContextDimensionValue(undefined, ["K36"], { required: false, locked: true }),
    "K36",
  );
});
