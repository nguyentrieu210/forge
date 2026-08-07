import test from "node:test";
import assert from "node:assert/strict";
import { toFrappeDocField } from "../dist/packages/frappe-api/src/meta-shape.js";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/validate.js";

function meta(fetchIfEmpty) {
  return parseDocTypeMeta({
    name: "Reference Draft",
    module: "Custom",
    fields: [
      { fieldname: "source_type", fieldtype: "Data", label: "Source Type" },
      { fieldname: "source", fieldtype: "Dynamic Link", label: "Source", options: "source_type" },
      {
        fieldname: "source_label",
        fieldtype: "Data",
        label: "Source Label",
        fetch_from: "source.title",
        ...(fetchIfEmpty === undefined ? {} : { fetch_if_empty: fetchIfEmpty }),
      },
    ],
    permissions: [],
    revision: 1,
  });
}

test("fetch_if_empty is parsed as a canonical boolean instead of presentation text", () => {
  assert.equal(meta(true).fields[2].fetch_if_empty, true);
  assert.equal(meta(false).fields[2].fetch_if_empty, false);
  assert.equal(meta(undefined).fields[2].fetch_if_empty, false);
});

test("Frappe metadata transport emits fetch_if_empty as the required 0/1 flag", () => {
  assert.equal(toFrappeDocField(meta(true).fields[2]).fetch_if_empty, 1);
  assert.equal(toFrappeDocField(meta(false).fields[2]).fetch_if_empty, 0);
});
