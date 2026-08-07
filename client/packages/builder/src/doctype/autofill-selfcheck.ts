import { strict as assert } from "node:assert";
import type { DocTypeMeta } from "@metaforge/core";
import { openDraft } from "./validate.js";
import { serializeDocTypeForSave } from "./apply.js";
import { validateDraft } from "./validate.js";

const base: DocTypeMeta = {
  name: "Reference Draft",
  fields: [
    { fieldname: "customer", fieldtype: "Link", options: "Customer" },
    { fieldname: "customer_name", fieldtype: "Data", fetch_from: "customer.customer_name", fetch_if_empty: 1 },
  ],
  permissions: [],
};
assert.equal(validateDraft(base).ok, true);

const missingSource = validateDraft({
  ...base,
  fields: [{ fieldname: "customer_name", fieldtype: "Data", fetch_from: "ghost.customer_name" }],
});
assert.equal(missingSource.ok, false);
assert.ok(missingSource.issues.some((issue) => issue.code === "fetch_from_source_missing"));

const wrongSource = validateDraft({
  ...base,
  fields: [
    { fieldname: "customer", fieldtype: "Data" },
    { fieldname: "customer_name", fieldtype: "Data", fetch_from: "customer.customer_name" },
  ],
});
assert.ok(wrongSource.issues.some((issue) => issue.code === "fetch_from_source_type"));

const orphanFlag = validateDraft({
  ...base,
  fields: [{ fieldname: "customer_name", fieldtype: "Data", fetch_if_empty: 1 }],
});
assert.ok(orphanFlag.issues.some((issue) => issue.code === "fetch_if_empty_without_source"));

const payload = serializeDocTypeForSave(openDraft(base));
assert.equal(payload.fields[1]?.fetch_from, "customer.customer_name");
assert.equal(payload.fields[1]?.fetch_if_empty, 1, "Builder round-trip must not drop fetch_if_empty");

console.log("builder autofill selfcheck OK — authoring validation + serializer roundtrip");
