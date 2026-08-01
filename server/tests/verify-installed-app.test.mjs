import assert from "node:assert/strict";
import test from "node:test";
import { verifyInstalledApp } from "../scripts/lib/verify-installed-app.mjs";

const manifest = {
  id: "alumdoor",
  version: "2.1.0",
  doctypes: [{
    name: "Stock Reconciliation",
    viewPolicy: {
      quickEntry: { enabled: true, fields: ["warehouse", "counted_by"] },
      form: { enabled: true, fields: ["warehouse", "counted_by", "note"] },
    },
    fields: [
      { fieldname: "warehouse", fieldtype: "Link", options: "Warehouse", surface: "quick", editMode: "editable", valueSource: "user" },
      { fieldname: "counted_by", fieldtype: "Link", options: "User", surface: "quick", editMode: "editable", valueSource: "user" },
      { fieldname: "note", fieldtype: "Small Text", surface: "expanded", editMode: "editable", valueSource: "user" },
    ],
  }],
  charts: [{
    name: "Inventory by warehouse",
    label: "Tồn theo kho",
    source: "Stock Balance by Warehouse",
    dimensions: ["warehouse"],
    measures: ["qty"],
    roles: ["Stock Manager"],
    drilldown: { route: "/report/Stock%20Balance%20by%20Warehouse" },
    emptyFallback: "table",
  }],
};

function successfulCall(overrides = {}) {
  return async (method) => {
    if (overrides[method]) return overrides[method];
    if (method === "frappe.desk.form.load.getdoctype") return {
      docs: [{
        name: "Stock Reconciliation",
        viewPolicy: manifest.doctypes[0].viewPolicy,
        fields: manifest.doctypes[0].fields,
      }],
    };
    if (method === "frappe.desk.search.search_link") return [{ value: "admin", label: "Admin" }];
    if (method === "metaforge.api.get_boot") return { user: "admin", roles: ["Stock Manager"] };
    if (method === "metaforge.api.get_overview") return { charts: [{
      label: "Tồn theo kho",
      route: "/report/Stock%20Balance%20by%20Warehouse",
      emptyFallback: "table",
    }] };
    if (method === "frappe.desk.query_report.run") return {
      columns: [{ fieldname: "warehouse" }, { fieldname: "qty" }],
      result: [],
    };
    throw new Error(`unexpected method ${method}`);
  };
}

test("verifies quick/full form, User Link and report-backed overview chart without writes", async () => {
  const result = await verifyInstalledApp({
    manifest,
    clientManifest: { version: "2.1.0" },
    call: successfulCall(),
    adminUser: "admin",
  });
  assert.deepEqual(result, {
    version: "2.1.0",
    form: "Stock Reconciliation",
    userLink: "Stock Reconciliation.counted_by",
    charts: 1,
    reports: 1,
  });
});

test("fails when the installed quick form no longer matches the package", async () => {
  await assert.rejects(
    verifyInstalledApp({
      manifest,
      clientManifest: { version: "2.1.0" },
      call: successfulCall({
        "frappe.desk.form.load.getdoctype": {
          docs: [{
            name: "Stock Reconciliation",
            viewPolicy: {
              quickEntry: { enabled: true, fields: ["warehouse"] },
              form: manifest.doctypes[0].viewPolicy.form,
            },
            fields: manifest.doctypes[0].fields,
          }],
        },
      }),
      adminUser: "admin",
    }),
    /quick form differs after install/,
  );
});

test("honours chart roles while still requiring the overview response to match", async () => {
  const result = await verifyInstalledApp({
    manifest,
    clientManifest: { version: "2.1.0" },
    call: successfulCall({
      "metaforge.api.get_boot": { user: "accountant", roles: ["Accounts User"] },
      "metaforge.api.get_overview": { charts: [] },
    }),
    adminUser: "admin",
  });
  assert.equal(result.charts, 0);
  assert.equal(result.reports, 0);
});
