import test from "node:test";
import assert from "node:assert/strict";
import { assertMoneyPolicy, roundVnd } from "./normalize-pilot-money.mjs";

test("locks source-backed integer VND policy", () => {
  assert.equal(assertMoneyPolicy(), true);
});

test("rounds positive half values away from zero like source Excel display", () => {
  assert.deepEqual(roundVnd("4349068.5"), {
    source_vnd: "4349068.5",
    rounded_vnd: "4349069",
    rounding_delta_vnd: "0.5",
    rule: "EXCEL_ROUND_TO_INTEGER_VND",
  });
  assert.equal(roundVnd("4680787.5").rounded_vnd, "4680788");
});

test("rounds ordinary fractional positive VND to nearest integer per row", () => {
  assert.equal(roundVnd("3130856.85").rounded_vnd, "3130857");
  assert.equal(roundVnd("13643819.2").rounded_vnd, "13643819");
  assert.equal(roundVnd("9994275.69").rounded_vnd, "9994276");
});

test("defines symmetric half-away behavior for future negative corrections", () => {
  assert.equal(roundVnd("-10.5").rounded_vnd, "-11");
  assert.equal(roundVnd("-10.49").rounded_vnd, "-10");
});

test("preserves raw source and explicit rounding delta", () => {
  const result = roundVnd("21.2");
  assert.equal(result.source_vnd, "21.2");
  assert.equal(result.rounded_vnd, "21");
  assert.equal(result.rounding_delta_vnd, "-0.2");
});

test("rejects non-decimal monetary values", () => {
  assert.throws(() => roundVnd("1,000"), /invalid VND decimal/);
  assert.throws(() => roundVnd(""), /invalid VND decimal/);
});
