import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseDocTypeMeta } from "../dist/packages/frappe-model/src/index.js";
import { toFrappeDocType } from "../dist/packages/frappe-api/src/index.js";
import { applyOperationalProfileSidecar } from "../scripts/lib/operational-profile-sidecar.mjs";

function operationalDefinition() {
  return {
    name: "Operational Line",
    module: "Test",
    kind: "child_table",
    fields: [
      { fieldname: "item_code", label: "Item", fieldtype: "Data", required: true, length: 32, set_only_once: true, not_nullable: true },
      { fieldname: "qty", label: "Qty", fieldtype: "Float", required: true, non_negative: true },
      { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
    ],
    viewPolicy: {
      list: { enabled: true, columns: ["item_code", "qty", "amount"] },
      form: { enabled: true, fields: ["item_code", "qty", "amount"] },
      operational: {
        fieldRoles: { item_code: "operator_input", amount: "money" },
        grid: {
          density: "compact",
          headerTone: "brand",
          autoBorders: true,
          stripe: "alternating",
          stripeScope: "record",
          frozenColumns: 1,
          columnGroups: [
            { key: "input", label: "INPUT", tone: "input", fields: ["item_code", "qty"] },
            { key: "result", label: "RESULT", tone: "result", fields: ["amount"] },
          ],
          secondaryRow: { fields: ["amount"] },
          projections: [
            {
              key: "preview",
              method: "test.line.preview",
              watch: ["item_code", "qty"],
              inputs: { item_code: "row.item_code", qty: "row.qty" },
              outputs: { amount: "amount" },
              debounceMs: 120,
            },
          ],
        },
      },
    },
    permissions: [],
    revision: 1,
  };
}

test("MetaForm 4 operational policy survives canonical parse and getdoctype transport", () => {
  const parsed = parseDocTypeMeta(operationalDefinition());
  assert.equal(parsed.viewPolicy?.operational?.grid?.density, "compact");
  assert.equal(parsed.viewPolicy?.operational?.grid?.columnGroups?.[0]?.label, "INPUT");
  assert.equal(parsed.fields.find((field) => field.fieldname === "item_code")?.cellRole, "operator_input");
  assert.equal(parsed.fields.find((field) => field.fieldname === "amount")?.cellRole, "money");

  const frappe = toFrappeDocType(parsed, null);
  assert.equal(frappe.viewPolicy.operational.grid.headerTone, "brand");
  assert.equal(frappe.fields.find((field) => field.fieldname === "amount").cellRole, "money");
  const item = frappe.fields.find((field) => field.fieldname === "item_code");
  const qty = frappe.fields.find((field) => field.fieldname === "qty");
  assert.equal(item.length, 32, "length must reach the form runtime");
  assert.equal(item.set_only_once, 1, "set-only-once must reach the form runtime");
  assert.equal(item.not_nullable, 1, "not-null must reach the form runtime");
  assert.equal(qty.non_negative, 1, "non-negative must reach the form runtime");
});

test("MetaForm 4 refuses unknown field roles and unsafe projection bindings", () => {
  const unknownRoleField = operationalDefinition();
  unknownRoleField.viewPolicy.operational.fieldRoles.missing = "money";
  assert.throws(() => parseDocTypeMeta(unknownRoleField), /fieldRoles\.missing.*unknown field/);

  const badBinding = operationalDefinition();
  badBinding.viewPolicy.operational.grid.projections[0].inputs.qty = "row.missing";
  assert.throws(() => parseDocTypeMeta(badBinding), /inputs\.qty.*unknown field/);
});

test("operational sidecar only overlays presentation and sheet columns without changing package identity", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "metaform4-"));
  try {
    const briefPath = path.join(dir, "app.json");
    await writeFile(briefPath, JSON.stringify({
      id: "test",
      version: "1.0.0",
      doctypes: [
        { name: "Order", list: ["customer"], fields: ["customer:Data! Customer", "total:Currency~ Total"] },
        { name: "Order Item", child: true, list: ["item_code"], fields: ["item_code:Data! Item", "qty:Float! Qty"] },
      ],
    }));
    await writeFile(path.join(dir, "app.operational.json"), JSON.stringify({
      version: "1.1.0",
      doctypes: {
        Order: { form: { presentation: "workspace", fullWidth: true } },
        "Order Item": {
          listColumns: ["item_code", "qty"],
          grid: { density: "compact" },
          fieldRoles: { item_code: "operator_input" },
        },
      },
    }));

    const brief = JSON.parse(await (await import("node:fs/promises")).readFile(briefPath, "utf8"));
    const merged = await applyOperationalProfileSidecar(brief, briefPath);
    assert.equal(merged.version, "1.0.0", "presentation profile version must not replace canonical package version");
    assert.deepEqual(merged.doctypes.find((entry) => entry.name === "Order Item").list, ["item_code", "qty"]);
    assert.equal(merged.doctypes.find((entry) => entry.name === "Order").operational.form.presentation, "workspace");
    assert.equal(merged.doctypes.find((entry) => entry.name === "Order Item").operational.fieldRoles.item_code, "operator_input");
    assert.equal(merged.doctypes.find((entry) => entry.name === "Order").fields[0], "customer:Data! Customer", "business fields are untouched");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
