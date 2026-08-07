import test from "node:test";
import assert from "node:assert/strict";
import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";

test("operational workspace and SmartGrid override inherited quick-entry policy", () => {
  const pkg = compileBrief({
    id: "metaform-precedence",
    name: "MetaForm precedence",
    version: "1.0.0",
    doctypes: [
      {
        name: "Order",
        fields: ["customer:Data! Customer"],
        permissions: { Operator: "rwc" },
        operational: {
          form: { presentation: "workspace", fullWidth: true },
        },
      },
      {
        name: "Order Item",
        child: true,
        list: ["item_code", "qty"],
        fields: ["item_code:Data! Item", "qty:Float! Qty"],
        permissions: { Operator: "rwc" },
        operational: {
          grid: { density: "compact" },
        },
      },
    ],
  });

  const order = pkg.doctypes.find((entry) => entry.name === "Order");
  const line = pkg.doctypes.find((entry) => entry.name === "Order Item");

  assert.equal(order.viewPolicy.operational.form.presentation, "workspace");
  assert.equal(line.viewPolicy.operational.grid.density, "compact");
  assert.equal(order.viewPolicy.quickEntry, undefined, "workspace create must not fall back to a quick-entry modal");
  assert.equal(line.viewPolicy.quickEntry, undefined, "SmartGrid must not collapse to the child quick-field subset");
});
