import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";

const root = resolve(process.cwd(), "../..");

const guarded = new Map([
  ["packages/views/src/form/ChildGrid.tsx", [
    "Sales Order Item", "Purchase Order Item", "Purchase Receipt Item", "Quotation Item",
    "Material Specification", "Item Color", "alumdoor.",
    "derivePurchaseOrderBarem", "deriveAverageWeight", "theoretical_kg_per_m", "actual_weight_kg", "inventory_mode",
  ]],
  ["packages/views/src/form/ChildGridWithExtensions.tsx", [
    "Sales Order Item", "Purchase Order Item", "Purchase Receipt Item", "Quotation Item",
    "Material Specification", "Item Color", "alumdoor.",
  ]],
  ["packages/views/src/action/ActionChildGrid.tsx", [
    "Sales Order Item", "Purchase Order Item", "Purchase Receipt Item", "Quotation Item",
    "Material Specification", "Item Color", "alumdoor.",
  ]],
  ["packages/views/src/container/services.ts", ["Price List", "alumdoor."]],
  ["packages/views/src/form/FormView.tsx", [
    "Sales Order", "Purchase Order", "Purchase Receipt", "Material Specification", "alumdoor.",
  ]],
  ["packages/views/src/action/RichActionScreen.tsx", [
    "Sales Order", "Purchase Order", "Purchase Receipt", "Material Specification", "alumdoor.",
  ]],
]);

let checks = 0;
for (const [relative, forbidden] of guarded) {
  const source = readFileSync(resolve(root, relative), "utf8");
  for (const literal of forbidden) {
    assert.equal(
      source.includes(literal),
      false,
      `${relative} contains forbidden business-schema literal ${JSON.stringify(literal)}; move the rule to metadata/app/vertical ownership`,
    );
    checks += 1;
  }
}

console.log(`metadata intelligence architecture guard: ${checks} checks passed`);
