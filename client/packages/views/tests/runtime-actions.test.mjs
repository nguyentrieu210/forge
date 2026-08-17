import test from "node:test";
import assert from "node:assert/strict";
import { actionAllowedByCapability, actionSupportsSelection } from "../dist/list/runtime-actions.js";

const NO_CAPS = {
  read: false,
  create: false,
  write: false,
  delete: false,
  submit: false,
  cancel: false,
  amend: false,
  print: false,
  email: false,
  export: false,
  import: false,
};

function action(requiredCapability, selection = "any") {
  return {
    id: `test-${requiredCapability}`,
    label: "Test",
    requiredCapability,
    selection,
    run() {},
  };
}

test("list runtime actions fail closed without the required server capability", () => {
  const writeAction = action("write");
  assert.equal(actionAllowedByCapability(writeAction, NO_CAPS), false);
  assert.equal(actionAllowedByCapability(writeAction, { ...NO_CAPS, write: true }), true);
  assert.equal(actionAllowedByCapability(action("delete"), { ...NO_CAPS, write: true }), false);
});

test("selection semantics remain independent from capability gating", () => {
  assert.equal(actionSupportsSelection(action("read", "single"), 0), false);
  assert.equal(actionSupportsSelection(action("read", "single"), 1), true);
  assert.equal(actionSupportsSelection(action("read", "single"), 2), false);
  assert.equal(actionSupportsSelection(action("read", "multiple"), 0), false);
  assert.equal(actionSupportsSelection(action("read", "multiple"), 2), true);
  assert.equal(actionSupportsSelection(action("read", "any"), 0), true);
});
