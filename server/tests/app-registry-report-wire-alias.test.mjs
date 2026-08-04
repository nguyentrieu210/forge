import assert from "node:assert/strict";
import test from "node:test";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

function manifest(chartMeasures) {
  return {
    id: "chart-wire",
    name: "Chart Wire",
    version: "1.0.0",
    roles: [{ role: "Sales" }],
    doctypes: [{
      name: "Sales Order",
      module: "Selling",
      fields: [
        { fieldname: "customer", label: "Customer", fieldtype: "Data" },
        { fieldname: "grand_total", label: "Grand Total", fieldtype: "Currency" },
      ],
      permissions: [{ role: "Sales", read: true }],
      revision: 1,
    }],
    nav: [
      { key: "Sales Order", label: "Sales Order", kind: "doctype" },
      { key: "report:Orders by Customer", label: "Orders", kind: "route", route: "/report/Orders%20by%20Customer", permission_doctype: "Sales Order" },
    ],
    reports: [{
      name: "Orders by Customer",
      label: "Orders by Customer",
      doctype: "Sales Order",
      columns: [
        { field: "customer", label: "Customer", type: "Data" },
        { field: "name", label: "Count", type: "Int", aggregate: "count" },
        { field: "grand_total", label: "Total", type: "Currency", aggregate: "sum" },
      ],
      group_by: "customer",
      filters: [],
      limit: 50,
    }],
    charts: [{
      name: "Revenue by Customer",
      source: "Orders by Customer",
      type: "Bar",
      dimensions: ["customer"],
      measures: chartMeasures,
      roles: ["Sales"],
      drilldown: { route: "/report/Orders%20by%20Customer" },
      emptyFallback: "table",
    }],
  };
}

test("app registry accepts aggregate report wire aliases used by chart rows", () => {
  const parsed = parseAppManifest(manifest(["sum_grand_total", "count_name"]));
  assert.deepEqual(parsed.charts[0].measures, ["sum_grand_total", "count_name"]);
});

test("app registry refuses aggregate source fields that never appear on the report wire", () => {
  assert.throws(() => parseAppManifest(manifest(["grand_total"])), /aggregated report column/);
  assert.throws(() => parseAppManifest(manifest(["name"])), /aggregated report column/);
});
