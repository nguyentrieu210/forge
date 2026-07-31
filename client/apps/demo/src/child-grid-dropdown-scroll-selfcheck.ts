import { strict as assert } from "node:assert";
import { canConsumeScrollDelta } from "@metaforge/ui";

assert.equal(canConsumeScrollDelta(0, 100, 300, -20), false);
assert.equal(canConsumeScrollDelta(0, 100, 300, 20), true);
assert.equal(canConsumeScrollDelta(100, 100, 300, -20), true);
assert.equal(canConsumeScrollDelta(100, 100, 300, 20), true);
assert.equal(canConsumeScrollDelta(200, 100, 300, 20), false);
assert.equal(canConsumeScrollDelta(0, 100, 100, 20), false);
assert.equal(canConsumeScrollDelta(0, 100, 300, 0), false);

console.log("  ✓ child-grid dropdown wheel boundary regression");
