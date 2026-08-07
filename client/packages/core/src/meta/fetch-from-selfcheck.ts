import { strict as assert } from "node:assert";
import type { DocTypeMeta } from "../types/meta.js";
import { shouldApplyAutomaticValue } from "./intelligence.js";
import { collectFetchFrom, fetchRuleAllowsCurrentValue, resolveFetchSourceDoctype } from "./fetch-from.js";
import { resolveField } from "./resolver.js";

const meta: DocTypeMeta = {
  name: "Reference Draft",
  fields: [
    { fieldname: "source_type", fieldtype: "Data" },
    { fieldname: "source", fieldtype: "Dynamic Link", options: "source_type" },
    { fieldname: "owned_label", fieldtype: "Data", fetch_from: "source.title" },
    { fieldname: "optional_label", fieldtype: "Data", fetch_from: "source.title", fetch_if_empty: 1 },
  ],
  permissions: [{ role: "Operator", permlevel: 0, read: 1, write: 1 }],
};

const rules = collectFetchFrom(meta);
assert.equal(rules.length, 2);
assert.equal(rules[0]?.sourceDoctype, undefined);
assert.equal(rules[0]?.sourceDoctypeField, "source_type");
assert.equal(resolveFetchSourceDoctype(rules[0]!, { source_type: "Customer" }), "Customer");
assert.equal(rules[1]?.fetchIfEmpty, true);
assert.equal(fetchRuleAllowsCurrentValue(rules[1]!, "manual"), false);
assert.equal(fetchRuleAllowsCurrentValue(rules[1]!, ""), true);

assert.equal(shouldApplyAutomaticValue(meta.fields[2]!, "manual-before-link", "user"), true, "ordinary fetch_from is source-owned and replaces stale local provenance");
assert.equal(shouldApplyAutomaticValue(meta.fields[3]!, "manual", "user"), false, "fetch_if_empty preserves an operator-owned value");

const doc = { source_type: "Customer", source: "CUS-001", owned_label: "Auto", optional_label: "Manual" };
assert.equal(resolveField(meta.fields[2]!, meta, { doc, roles: ["Operator"] }).readOnly, true, "ordinary fetch_from target is source-owned while Link is selected");
assert.equal(resolveField(meta.fields[3]!, meta, { doc, roles: ["Operator"] }).readOnly, false, "fetch_if_empty target remains editable");
assert.equal(resolveField(meta.fields[2]!, meta, { doc: { ...doc, source: "" }, roles: ["Operator"] }).readOnly, false, "clearing source Link unlocks ordinary fetch target");

console.log("fetch-from selfcheck OK — dynamic source + fetch_if_empty + ownership + editability");
