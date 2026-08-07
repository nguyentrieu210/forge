import test from "node:test";
import assert from "node:assert/strict";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";
import { toFrappeDocType } from "../dist/packages/frappe-api/src/index.js";

function definition() {
  return {
    name: "Order",
    module: "Test",
    kind: "transaction",
    fields: [
      { fieldname: "customer", label: "Customer", fieldtype: "Data", required: true },
      { fieldname: "transaction_date", label: "Date", fieldtype: "Date", required: true },
      { fieldname: "grand_total", label: "Total", fieldtype: "Currency", read_only: true },
      { fieldname: "warning_text", label: "Warning", fieldtype: "Small Text", read_only: true },
    ],
    viewPolicy: {
      list: { enabled: true, columns: ["customer", "grand_total"] },
      form: { enabled: true, fields: ["customer", "transaction_date", "grand_total", "warning_text"] },
      operational: {
        form: {
          presentation: "workspace",
          composition: {
            columns: 12,
            blocks: [
              {
                key: "order",
                type: "fields",
                span: 8,
                title: "Order",
                fields: ["customer", "transaction_date"],
                fieldSpans: { customer: 8, transaction_date: 4 },
              },
              {
                key: "totals",
                type: "stats",
                span: 4,
                items: [{ field: "grand_total", label: "Total", format: "currency", emphasis: "grand" }],
              },
              {
                key: "warning",
                type: "alert",
                span: 12,
                field: "warning_text",
                when: "warning_text",
              },
              {
                key: "customer_context",
                type: "projection",
                span: 12,
                projection: {
                  method: "sales.customer_summary",
                  watch: ["customer"],
                  inputs: { customer: "parent.customer" },
                  constants: { include_history: true },
                  items: [
                    { path: "outstanding", label: "Outstanding", format: "currency", tone: "warning" },
                    { path: "order_count", label: "Orders", format: "number" },
                  ],
                  debounceMs: 150,
                },
              },
            ],
          },
        },
      },
    },
    permissions: [],
    revision: 1,
  };
}

test("MetaForm 4.1 form composition survives canonical parse and getdoctype transport", () => {
  const parsed = parseDocTypeMeta(definition());
  const composition = parsed.viewPolicy?.operational?.form?.composition;
  assert.equal(composition?.columns, 12);
  assert.equal(composition?.blocks?.[0]?.fieldSpans?.customer, 8);
  assert.equal(composition?.blocks?.[3]?.projection?.inputs?.customer, "parent.customer");
  assert.equal(composition?.blocks?.[3]?.projection?.items?.[0]?.path, "outstanding");

  const frappe = toFrappeDocType(parsed, null);
  assert.equal(frappe.viewPolicy.operational.form.composition.blocks[1].type, "stats");
  assert.equal(frappe.viewPolicy.operational.form.composition.blocks[3].projection.method, "sales.customer_summary");
});

test("MetaForm 4.1 composition refuses unknown fields, invalid spans and row bindings", () => {
  const unknown = definition();
  unknown.viewPolicy.operational.form.composition.blocks[0].fields.push("missing");
  assert.throws(() => parseDocTypeMeta(unknown), /unknown field: missing/);

  const span = definition();
  span.viewPolicy.operational.form.composition.blocks[0].fieldSpans.customer = 13;
  assert.throws(() => parseDocTypeMeta(span), /integer from 1 to 12/);

  const rowBinding = definition();
  rowBinding.viewPolicy.operational.form.composition.blocks[3].projection.inputs.customer = "row.customer";
  assert.throws(() => parseDocTypeMeta(rowBinding), /must bind parent\.<field>/);
});
