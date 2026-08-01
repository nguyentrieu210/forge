import assert from "node:assert/strict";
import type { DocTypeMeta } from "../types/meta.js";
import { resolveBulkRenderPolicy } from "./bulk-policy.js";

const base: DocTypeMeta = {
  name: "Item Price",
  label: "Đơn giá theo bảng giá",
  kind: "master",
  fields: [
    { fieldname: "item_code", label: "Mặt hàng", fieldtype: "Link", options: "Item", editMode: "editable", surface: "expanded" },
    { fieldname: "rate", label: "Đơn giá", fieldtype: "Currency", editMode: "editable", surface: "expanded" },
    { fieldname: "server_total", label: "Tổng máy tính", fieldtype: "Currency", read_only: 1, editMode: "readonly", surface: "internal", serverEnforced: true },
  ],
  permissions: [],
  viewPolicy: {
    list: { enabled: true, columns: ["item_code", "rate"] },
    form: { enabled: true, fields: ["item_code", "rate"] },
    bulk: {
      enabled: true,
      columns: ["item_code", "rate", "server_total"],
      editableFields: ["rate", "server_total"],
      commitStrategy: "document_update",
      allowPaste: true,
      pageSize: 120,
    },
  },
};

const safe = resolveBulkRenderPolicy(base);
assert.equal(safe.enabled, true);
assert.deepEqual(safe.columns.map((field) => field.fieldname), ["item_code", "rate"]);
assert.deepEqual([...safe.editable], ["rate"]);
assert.equal(safe.allowPaste, true);
assert.equal(safe.pageSize, 120);

const transaction = resolveBulkRenderPolicy({ ...base, name: "Stock Entry", kind: "transaction", is_submittable: 1 });
assert.equal(transaction.enabled, false, "generic bulk editor must fail closed for transactions/submittable documents");

const compatibility: DocTypeMeta = {
  ...base,
  viewPolicy: {
    list: { enabled: true, columns: ["item_code", "rate"] },
    form: { enabled: true, fields: ["item_code", "rate"] },
    mobile: {
      bulk: {
        enabled: true,
        columns: ["item_code", "rate"],
        editableFields: ["rate"],
        commitStrategy: "document_update",
      },
    },
  },
};
assert.equal(resolveBulkRenderPolicy(compatibility).enabled, true, "brief sidecar compatibility path must resolve");

const unsupported = resolveBulkRenderPolicy({
  ...base,
  viewPolicy: {
    list: { enabled: true, columns: ["item_code", "rate"] },
    form: { enabled: true, fields: ["item_code", "rate"] },
    bulk: { enabled: true, columns: ["rate"], editableFields: ["rate"], commitStrategy: "method" as never },
  },
});
assert.equal(unsupported.enabled, false, "unknown commit strategy must fail closed");

console.log("bulk-policy-selfcheck PASS");
