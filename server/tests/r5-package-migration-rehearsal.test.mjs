import test from "node:test";
import assert from "node:assert/strict";
import { satisfiesVersion } from "../dist/packages/app-registry/src/index.js";

test("R5-06: plain minimum package versions remain monotonic", () => {
  assert.equal(satisfiesVersion("1.3.0", "1.3.0"), true);
  assert.equal(satisfiesVersion("1.8.0", "1.3.0"), true);
  assert.equal(satisfiesVersion("1.2.9", "1.3.0"), false);
});

test("R5-06: first-party >= dependency syntax must enforce the declared minimum", () => {
  // vn-accounting currently declares hrm as >=1.3.0. A tenant with hrm@1.2.9 must
  // fail closed. This regression intentionally stays red until R5-01 owns and fixes
  // the canonical package-version contract; R5-06 must not create a second resolver.
  assert.equal(
    satisfiesVersion("1.2.9", ">=1.3.0"),
    false,
    "hrm@1.2.9 must not satisfy vn-accounting's >=1.3.0 dependency",
  );
  assert.equal(satisfiesVersion("1.3.0", ">=1.3.0"), true);
  assert.equal(satisfiesVersion("1.8.0", ">=1.3.0"), true);
});
