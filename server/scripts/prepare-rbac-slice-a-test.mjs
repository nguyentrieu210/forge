import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../tests/rbac-contract.test.mjs", import.meta.url);
let source = readFileSync(path, "utf8");
let changed = false;

function replaceOptional(oldValue, newValue) {
  const count = source.split(oldValue).length - 1;
  if (count > 1) throw new Error(`RBAC harness pattern is ambiguous: ${oldValue.slice(0, 80)}`);
  if (count === 1) {
    source = source.replace(oldValue, newValue);
    changed = true;
  }
}

replaceOptional(
  "async function callMethod(method, params, context) {",
  "async function callMethod(method, params, context, httpMethod = \"GET\") {",
);
replaceOptional(
  "  const response = await routeFrappeApi(new Request(url), url, context);",
  "  const response = await routeFrappeApi(new Request(url, { method: httpMethod }), url, context);",
);
replaceOptional(
  `  const added = await callMethod("metaforge.api.add_user_permission", {
    user: USER.user_id,
    allow: "Warehouse",
    for_value: "KHO-1",
  }, fixture.context);`,
  `  const added = await callMethod("metaforge.api.add_user_permission", {
    user: USER.user_id,
    allow: "Warehouse",
    for_value: "KHO-1",
  }, fixture.context, "POST");`,
);
replaceOptional(
  "  const removed = await callMethod(\"metaforge.api.remove_user_permission\", { id }, fixture.context);",
  "  const removed = await callMethod(\"metaforge.api.remove_user_permission\", { id }, fixture.context, \"POST\");",
);

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Prepared generated RBAC Slice A integration harness.");
} else {
  console.log("RBAC Slice A integration harness did not require preparation.");
}
