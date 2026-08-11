import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../apps-src/alumdoor-worker/src/index.ts", import.meta.url), "utf8");

test("app worker does not directly consume Stock Reservation records", () => {
  assert.equal(source.includes("consumeReservationsForCut"), false);
  assert.equal(source.includes('reservation_consumption: "derived-from-cut-order-stock-ledger"'), true);
  assert.equal(source.includes('idempotent: cut.cut_state === "\u0110\u00e3 c\u1eaft"'), true);
  assert.equal(source.includes('cut.cut_state === "???? c???t"'), false);
});
