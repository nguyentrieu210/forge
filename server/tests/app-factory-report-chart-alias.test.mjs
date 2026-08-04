import assert from "node:assert/strict";
import test from "node:test";
import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";

test("App Factory charts consume the aggregate field names returned by app reports", () => {
  const pkg = compileBrief({
    id: "chart-alias",
    name: "Chart Alias",
    roles: ["Sales"],
    doctypes: [{
      name: "Sales Order",
      fields: [
        "customer:Data! Customer",
        "grand_total:Currency Total",
      ],
      permissions: { Sales: "r" },
    }],
    reports: [{
      name: "Orders by Customer",
      doctype: "Sales Order",
      columns: [
        "customer:Data Customer",
        "count(name):Int Order Count",
        "sum(grand_total):Currency Total Value",
      ],
      groupBy: "customer",
    }],
    charts: [{
      name: "Revenue by Customer",
      source: "Orders by Customer",
      type: "Bar",
      dimensions: ["customer"],
      measures: ["grand_total", "name"],
      roles: ["Sales"],
    }],
  });

  assert.deepEqual(
    pkg.reports[0].columns.map(({ field, aggregate }) => ({ field, aggregate })),
    [
      { field: "customer", aggregate: undefined },
      { field: "name", aggregate: "count" },
      { field: "grand_total", aggregate: "sum" },
    ],
    "report metadata keeps the canonical source fields plus aggregate operators",
  );
  assert.deepEqual(pkg.charts[0].dimensions, ["customer"]);
  assert.deepEqual(pkg.charts[0].measures, ["sum_grand_total", "count_name"]);
});

test("App Factory refuses an ambiguous chart projection of the same source field", () => {
  assert.throws(() => compileBrief({
    id: "chart-ambiguous",
    name: "Chart Ambiguous",
    roles: ["Sales"],
    doctypes: [{
      name: "Sales Order",
      fields: ["grand_total:Currency Total"],
      permissions: { Sales: "r" },
    }],
    reports: [{
      name: "Totals",
      doctype: "Sales Order",
      columns: [
        "grand_total:Currency Raw Total",
        "sum(grand_total):Currency Summed Total",
      ],
    }],
    charts: [{
      name: "Totals",
      source: "Totals",
      type: "Bar",
      dimensions: ["grand_total"],
      measures: ["grand_total"],
    }],
  }), /ambiguous report field/);
});
