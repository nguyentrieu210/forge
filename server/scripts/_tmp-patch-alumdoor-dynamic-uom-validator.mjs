#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, "..");
const indexPath = path.join(serverRoot, "apps-src", "alumdoor-worker", "src", "index.ts");
const testPath = path.join(serverRoot, "tests", "alumdoor-item-validator.test.mjs");

let source = fs.readFileSync(indexPath, "utf8");
const masterOld = `const dynamicSquareMetreToSet = mode === "Thành phẩm theo m2"\n      && ["m2", "m²", "sqm"].includes(normalizedUom(uom))\n      && ["bộ", "bo", "set"].includes(normalizedUom(stockUom));`;
const masterNew = `const dynamicSquareMetreToSet = profileName === "Thành phẩm theo m2"\n      && ["m2", "m²", "sqm"].includes(normalizedUom(uom))\n      && ["bộ", "bo", "set"].includes(normalizedUom(stockUom));`;
if (!source.includes(masterOld)) throw new Error("master dynamic-UOM anchor missing");
source = source.replace(masterOld, masterNew);

const transactionMode = `const mode = String(item.inventory_mode ?? "Hàng thường");\n    const linearBasis = side === "sales" ? deriveLinearSalesBasis(item) : undefined;`;
const transactionModeNew = `const mode = String(item.inventory_mode ?? "Hàng thường");\n    const measurementProfile = String(item.measurement_profile ?? "").trim();\n    const linearBasis = side === "sales" ? deriveLinearSalesBasis(item) : undefined;`;
if (!source.includes(transactionMode)) throw new Error("transaction measurement-profile anchor missing");
source = source.replace(transactionMode, transactionModeNew);

const txOld = `const dynamicSquareMetreToSet = mode === "Thành phẩm theo m2"\n      && SALES_AREA_UOMS.has(selected)\n      && SALES_SET_UOMS.has(normalizedUom(stockUom));`;
const txNew = `const dynamicSquareMetreToSet = measurementProfile === "Thành phẩm theo m2"\n      && SALES_AREA_UOMS.has(selected)\n      && SALES_SET_UOMS.has(normalizedUom(stockUom));`;
if (!source.includes(txOld)) throw new Error("transaction dynamic-UOM anchor missing");
source = source.replace(txOld, txNew);
const stale = (source.match(/mode === "Thành phẩm theo m2"/g) || []).length;
if (stale !== 0) throw new Error(`stale inventory_mode dynamic-UOM checks remain=${stale}`);
fs.writeFileSync(indexPath, source, "utf8");

let tests = fs.readFileSync(testPath, "utf8");
if (!tests.includes('test("Item catalog invariants merge partial saves before checking purchase eligibility"')) {
  throw new Error("item-validator test anchor missing");
}
if (!tests.includes("Item validator accepts canonical finished-door m2 sales UOM without static conversion")) {
  tests += `\n\nfunction canonicalFinishedDoor() {\n  return {\n    item_code: "FG-M2-SET",\n    item_group: "Thành phẩm",\n    item_nature: "Hàng tồn kho",\n    material_stage: "Thành phẩm",\n    supply_type: "Tự sản xuất",\n    is_stock_item: 1,\n    is_purchase_item: 0,\n    is_sales_item: 1,\n    is_fixed_asset: 0,\n    include_item_in_manufacturing: 1,\n    is_sub_contracted_item: 0,\n    inventory_mode: "Hàng thường",\n    measurement_profile: "Thành phẩm theo m2",\n    stock_uom: "Bộ",\n    default_purchase_uom: "",\n    default_sales_uom: "m2",\n    uom_conversions: [],\n  };\n}\n\nasync function validateDocument(doctype, payload, masters = {}) {\n  const request = new Request("https://alumdoor.test/hooks/validate", {\n    method: "POST",\n    headers: {\n      "content-type": "application/json",\n      "x-cloudforge-tenant": "alu",\n      "x-cloudforge-callback": "https://platform.test/",\n    },\n    body: JSON.stringify({ doctype, name: doctype + "-TEST", action: "create", payload }),\n  });\n  return worker.fetch(\n    request,\n    { PLATFORM: platformFetcher(masters) },\n    { waitUntil() {}, passThroughOnException() {} },\n  );\n}\n\ntest("Item validator accepts canonical finished-door m2 sales UOM without static conversion", async () => {\n  const response = await validateItem(canonicalFinishedDoor(), {\n    masters: {\n      "Item Group:Thành phẩm": { item_group_name: "Thành phẩm", is_group: 0 },\n    },\n  });\n  assert.equal(response.status, 200, await message(response));\n});\n\ntest("Sales transaction accepts m2 commercial UOM for canonical set-stock finished door without static conversion", async () => {\n  const item = canonicalFinishedDoor();\n  const response = await validateDocument("Sales Order", {\n    company: "ALUMDOOR",\n    customer: "KH-TEST",\n    items: [{ item_code: item.item_code, qty: 2, uom: "m2" }],\n  }, {\n    ["Item:" + item.item_code]: item,\n  });\n  assert.equal(response.status, 200, await message(response));\n});\n`;
  fs.writeFileSync(testPath, tests, "utf8");
}

console.log("ALUMDOOR_DYNAMIC_UOM_PATCH_STAGED master=measurement_profile transaction=measurement_profile tests=2");
