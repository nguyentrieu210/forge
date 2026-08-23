import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("purchase runtime reads Measurement Profile and Material Specification as separate authorities", () => {
  const source = read("server/apps-src/alumdoor-worker/src/purchase-item-runtime.ts");
  assert.match(source, /readResource\(call, "Measurement Profile"/);
  assert.match(source, /readResource\(call, "Material Specification"/);
  assert.match(source, /require_color/);
  assert.match(source, /require_condition/);
  assert.match(source, /require_length/);
  assert.match(source, /require_width/);
  assert.match(source, /require_piece_qty/);
  assert.match(source, /track_bundle_qty/);
  assert.match(source, /theoretical_kg_per_m/);
  assert.match(source, /standard_length_m/);
  assert.match(source, /has_catch_weight/);
  assert.doesNotMatch(source, /===\s*["']Nhôm cây\/lá["']/);
  assert.doesNotMatch(source, /Geometry Profile|PB_RAY_RONG|PB_NHUA_RONG|CAT_LA_RONG/);
});

test("ui child preview routes Purchase through runtime while Sales stays on preserved implementation", () => {
  const router = read("server/apps-src/alumdoor-worker/src/ui-child-preview.ts");
  const purchase = read("server/apps-src/alumdoor-worker/src/purchase-child-preview.ts");
  assert.match(router, /previewPurchaseChildRow/);
  assert.match(router, /previewLegacyChildRow/);
  assert.match(purchase, /readPurchaseItemRuntime/);
  assert.match(purchase, /purchase_runtime: runtime/);
  assert.match(purchase, /sequence: entry\.sequence/);
  assert.match(purchase, /source: entry\.source/);
  assert.match(purchase, /material\?\.standard_length_m/);
  assert.match(purchase, /changed === "item_code"/);
  assert.match(purchase, /HIDDEN_RUNTIME_PERSISTED_FIELDS/);
  assert.match(purchase, /!entry\.visible && !HIDDEN_RUNTIME_PERSISTED_FIELDS\.has/);
  assert.match(purchase, /changed === "item_code" \? preferredUom/);
  assert.match(purchase, /runtimeField\(runtime, "length_m"\)\?\.visible \? positive/);
  assert.match(purchase, /runtimeField\(runtime, "qty_bar"\)\?\.visible \? positive/);
  assert.doesNotMatch(purchase, /Nhôm cây\/lá|Tấm\/Kính|Thành phẩm theo m2|Hàng thường/);
});

test("purchase order grid treats server overrides as structural schema and catch-weight identity", () => {
  const source = read("client/packages/vertical-alumdoor/src/AlumdoorPurchaseOrderItemsGrid.tsx");
  const visibleStart = source.indexOf("export function purchaseFieldVisible");
  const visibleEnd = source.indexOf("\n}\n", visibleStart);
  const visibleFn = source.slice(visibleStart, visibleEnd + 2);
  assert.match(visibleFn, /purchaseFieldOverride/);
  assert.doesNotMatch(visibleFn, /_inventoryMode|inventory_mode|line\[fieldname\]|Nhôm|Ống/);
  const catchStart = source.indexOf("export function isAluminumPurchaseLine");
  const catchEnd = source.indexOf("\n}\n", catchStart);
  const catchFn = source.slice(catchStart, catchEnd + 2);
  assert.match(catchFn, /qtyHidden && qtyReadonly/);
  assert.doesNotMatch(catchFn, /theoretical_kg|inventory_mode|Nhôm/);
  assert.match(source, /sequence/);
  assert.match(source, /"condition"/);
  assert.match(source, /"width_m"/);
});

test("receipt table uses the same overrides for common purchase fields", () => {
  const source = read("client/packages/vertical-alumdoor/src/purchase-receipt-fifo/ReceiptLinesTable.tsx");
  assert.match(source, /lineFieldVisible\(line, "length_m", false\)/);
  assert.match(source, /lineFieldVisible\(line, "width_m", false\)/);
  assert.match(source, /lineFieldVisible\(line, "condition", false\)/);
  assert.match(source, /lineFieldVisible\(line, "color", false\)/);
  assert.match(source, /lineFieldVisible\(line, "qty_bar", false\)/);
  assert.match(source, /lineFieldVisible\(line, "actual_weight_kg", false\)/);
  assert.match(source, /13 \+ variableColumns \+ \(showActualWeight \? 2 : 0\)/);
  assert.doesNotMatch(source, /Nhôm cây\/lá|Ống\/trục/);
});

test("purchase master registry has dedicated Measurement and Material workbenches", () => {
  const registry = read("client/packages/vertical-alumdoor/src/master-workspaces/registry.tsx");
  const measurement = read("client/packages/vertical-alumdoor/src/master-workspaces/MeasurementProfileWorkbench.tsx");
  const material = read("client/packages/vertical-alumdoor/src/master-workspaces/MaterialSpecificationWorkbench.tsx");
  const item = read("client/packages/vertical-alumdoor/src/master-workspaces/ItemMasterWorkbench.tsx");
  assert.match(registry, /doctype === "Measurement Profile"/);
  assert.match(registry, /doctype === "Material Specification"/);
  assert.match(measurement, /Purchase Order/);
  assert.match(measurement, /Purchase Receipt/);
  assert.match(material, /theoretical_kg_per_m/);
  assert.match(material, /standard_length_m/);
  assert.match(material, /chỉ là gợi ý đầu vào/);
  assert.match(item, /Runtime summary/);
  assert.match(item, /Catch-weight chỉ làm động trục/);
});
