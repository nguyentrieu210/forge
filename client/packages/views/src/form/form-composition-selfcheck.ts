import { strict as assert } from "node:assert";
import type { DocTypeMeta } from "@metaforge/core";
import { resolveFormComposition } from "./FormComposition.js";

const meta: DocTypeMeta = {
  name: "Order",
  label: "Đơn hàng",
  fields: [
    { fieldname: "customer", fieldtype: "Link", label: "Khách hàng", options: "Customer" },
    { fieldname: "transaction_date", fieldtype: "Date", label: "Ngày đặt" },
    { fieldname: "grand_total", fieldtype: "Currency", label: "Tổng tiền" },
    { fieldname: "warning_text", fieldtype: "Small Text", label: "Cảnh báo" },
  ],
  permissions: [],
};

const composition = resolveFormComposition({
  columns: 12,
  blocks: [
    {
      key: "order",
      type: "fields",
      span: 8,
      title: "Thông tin đơn",
      fields: ["customer", "transaction_date", "missing"],
      fieldSpans: { customer: 8, transaction_date: 4, missing: 12 },
    },
    {
      key: "total",
      type: "stats",
      span: 4,
      items: [{ field: "grand_total", label: "Phải thu", format: "currency", emphasis: "grand" }],
    },
    {
      key: "customer-context",
      type: "projection",
      span: 12,
      projection: {
        method: "sales.customer_summary",
        watch: ["customer"],
        inputs: { customer: "parent.customer", ignored: "row.customer" },
        items: [{ path: "outstanding", label: "Công nợ", format: "currency", tone: "warning" }],
      },
    },
  ],
}, meta);

assert.ok(composition);
assert.equal(composition?.columns, 12);
assert.deepEqual(composition?.blocks[0]?.type === "fields" ? composition.blocks[0].fields : [], ["customer", "transaction_date"]);
assert.equal(composition?.blocks[0]?.type === "fields" ? composition.blocks[0].fieldSpans?.customer : undefined, 8);
const projection = composition?.blocks.find((block) => block.type === "projection");
assert.ok(projection && projection.type === "projection");
if (projection?.type === "projection") {
  assert.deepEqual(projection.projection.inputs, { customer: "parent.customer" }, "client guard only accepts parent bindings");
  assert.equal(projection.projection.items[0]?.path, "outstanding");
}
assert.equal(resolveFormComposition({ blocks: [{ key: "broken", type: "fields", fields: ["missing"] }] }, meta), undefined, "malformed composition fails closed");

console.log("form composition selfcheck: 12-column fields, stats, projection and fail-closed contract PASS");
